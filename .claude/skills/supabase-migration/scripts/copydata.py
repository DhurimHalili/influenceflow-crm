#!/usr/bin/env python3
"""Copy every row of the CRM from one Supabase project to another through the management SQL API.

usage: copydata.py SRC_REF DST_REF [--verify-only] [--only table,table]

- auth.users + auth.identities (+ mfa factors) keep their ids and password hashes, so everyone signs in
  with the same password; sessions are NOT copied (the new project signs its own tokens).
- every table in `public` (empty legacy ones too), columns both sides have, generated columns skipped.
- the target is emptied first, rows are written with triggers + FK checks off (session_replication_role
  = replica) so order doesn't matter and no trigger re-stamps updated_at, then sequences are set.
- verify: row count + an order-independent checksum of every row's jsonb on both sides.
Nothing is printed except table names, counts and checksums — never row contents.
"""
import json, sys, time, random, string, urllib.request
from concurrent.futures import ThreadPoolExecutor

import os
TOKEN = open(os.environ.get("PAT_FILE") or os.path.expanduser("~/.supabase-pat")).read().strip()  # never in the repo
CHUNK_BYTES = 1_200_000
AUTH_TABLES = ["auth.users", "auth.identities", "auth.mfa_factors"]


def sql(ref, q, tries=8):
    body = json.dumps({"query": q}).encode()
    for i in range(tries):
        req = urllib.request.Request(f"https://api.supabase.io/v1/projects/{ref}/database/query", data=body,
                                     headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "User-Agent": "curl/8.5.0"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read().decode() or "[]")
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(min(20, 2 + 3 * i)); continue
            raise RuntimeError(f"{ref}: HTTP {e.code}: {msg}")
        except Exception:
            if i < tries - 1: time.sleep(min(20, 2 + 3 * i)); continue
            raise


def tag():
    return "q" + "".join(random.choice(string.ascii_lowercase) for _ in range(12))


def public_tables(ref):
    rows = sql(ref, "select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by 1")
    return ["public." + r["t"] for r in rows]


def columns(ref, table):
    s, t = table.split(".")
    rows = sql(ref, f"""select a.attname n, a.attidentity id from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='{s}' and c.relname='{t}' and a.attnum>0 and not a.attisdropped and a.attgenerated='' order by a.attnum""")
    return [(r["n"], r["id"]) for r in rows]


def keyorder(ref, table):
    s, t = table.split(".")
    rows = sql(ref, f"""select a.attname n from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum = any(i.indkey) where i.indisprimary and n.nspname='{s}' and c.relname='{t}' order by array_position(i.indkey::int[], a.attnum::int)""")
    return [r["n"] for r in rows]


def q(n):
    return '"' + n.replace('"', '""') + '"'


def checksum(ref, table, cols):
    sel = ", ".join(q(c) for c in cols)
    r = sql(ref, f"select count(*)::int n, coalesce(md5(string_agg(h, '' order by h)), '') s from (select md5(to_jsonb(x)::text) h from (select {sel} from {table}) x) y")
    return r[0]["n"], r[0]["s"]


def copy_table(src, dst, table):
    sc = columns(src, table)
    dc = dict(columns(dst, table))
    cols = [c for c, _ in sc if c in dc]
    missing = [c for c, _ in sc if c not in dc]
    if missing:
        print(f"  ! {table}: columns only in source (not copied): {missing}")
    if not cols:
        return 0
    over = " overriding system value" if any(dc.get(c) == "a" for c in cols) else ""
    order = ", ".join(q(c) for c in (keyorder(src, table) or cols[:1]))
    sel = ", ".join(q(c) for c in cols)
    total = sql(src, f"select count(*)::int n, coalesce(avg(pg_column_size(t.*)),0)::int b from {table} t")[0]
    n, avg = total["n"], max(1, total["b"])
    step = max(1, min(5000, CHUNK_BYTES // (avg * 2)))
    offsets = list(range(0, n, step))

    def one(off, size):
        rows = sql(src, f"select coalesce(json_agg(x), '[]'::json) j from (select {sel} from {table} order by {order} offset {off} limit {size}) x")[0]["j"]
        if not rows:
            return 0
        data = json.dumps(rows, ensure_ascii=False)
        if len(data) > 1_800_000 and size > 1:  # a fat chunk: split it
            half = size // 2
            return one(off, half) + one(off + half, size - half)
        t = tag()
        sql(dst, f"set session_replication_role = replica; insert into {table} ({sel}){over} select {sel} from json_populate_recordset(null::{table}, ${t}${data}${t}$); set session_replication_role = origin;")
        return len(rows)

    with ThreadPoolExecutor(max_workers=6) as pool:
        done = sum(pool.map(lambda o: one(o, step), offsets))
    return done


def main():
    src, dst = sys.argv[1], sys.argv[2]
    verify_only = "--verify-only" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    tables = AUTH_TABLES + public_tables(src)
    if only:
        tables = [t for t in tables if t in only or t.split(".")[1] in only]
    dst_tables = set(public_tables(dst)) | set(AUTH_TABLES)
    gone = [t for t in tables if t not in dst_tables]
    if gone:
        print("! tables missing on target:", gone); tables = [t for t in tables if t in dst_tables]
    if not verify_only:
        pub = [t for t in tables if t.startswith("public.")]
        if pub:
            if only:  # never let a partial copy empty other tables through FK cascades
                sql(dst, "set session_replication_role = replica; " + " ".join(f"delete from {t};" for t in pub) + " set session_replication_role = origin;")
            else:
                sql(dst, "set session_replication_role = replica; truncate " + ", ".join(pub) + " restart identity cascade; set session_replication_role = origin;")
        if any(t.startswith("auth.") for t in tables):
            sql(dst, "set session_replication_role = replica; delete from auth.mfa_factors; delete from auth.identities; delete from auth.sessions; delete from auth.refresh_tokens; delete from auth.users; set session_replication_role = origin;")
        def run(t):
            t0 = time.time()
            n = copy_table(src, dst, t)
            print(f"  copied {t}: {n} rows ({time.time() - t0:.1f}s)", flush=True)
        auth = [t for t in tables if t.startswith("auth.")]
        for t in auth:
            run(t)  # users before identities (FK checks are off, but keep it tidy)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(run, [t for t in tables if not t.startswith("auth.")]))
        # sequences follow the copied rows
        for r in sql(dst, "select schemaname||'.'||sequencename s from pg_sequences where schemaname='public'"):
            seq = r["s"]
            own = sql(dst, f"select d.refobjid::regclass::text t, a.attname c from pg_depend d join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid where d.objid='{seq}'::regclass and d.deptype in ('a','i')")
            if own:
                sql(dst, f"select setval('{seq}', greatest(1, (select coalesce(max({q(own[0]['c'])}),0) from {own[0]['t']})), true)")
    def check(t):
        cols = [c for c, _ in columns(src, t) if c in dict(columns(dst, t))]
        a, b = checksum(src, t, cols), checksum(dst, t, cols)
        ok = a == b
        print(f"  {'ok ' if ok else 'BAD'} {t}: source {a[0]} rows / target {b[0]} rows{'' if ok else '  (checksum differs)'}", flush=True)
        return not ok
    with ThreadPoolExecutor(max_workers=6) as pool:
        bad = sum(pool.map(check, tables))
    print("ALL MATCH" if not bad else f"{bad} TABLES DIFFER")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
