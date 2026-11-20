#!/usr/bin/env python3
"""Put back one member's rows that a cascade deleted on the new project, from the frozen old project.
Only rows missing on the new side are inserted (ON CONFLICT DO NOTHING); nothing existing is changed,
except creator_brands rows rebuilt since: the member's own verdict / manual flag is copied onto them.
usage: restore.py OLD_REF NEW_REF USER_ID [--dry]"""
import json, sys
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from copydata import sql, columns, keyorder, tag, q as qi  # noqa: E402

OLD, NEW, U = sys.argv[1], sys.argv[2], sys.argv[3]
DRY = "--dry" in sys.argv
TABLES = ["followups", "creator_files", "autosend_queue", "creator_content", "brand_intel", "creator_videos", "creator_brands"]


def keyexpr(cols):
    return " || '|' || ".join(f'{qi(c)}::text' for c in cols)


def lit(s):
    return "'" + s.replace("'", "''") + "'"


for t in TABLES:
    table = f"public.{t}"
    natural = ["user_id", "creator_id", "brand_key"] if t == "creator_brands" else keyorder(OLD, table)
    k = keyexpr(natural)
    have = {r["k"] for r in sql(NEW, f"select {k} k from {table} where user_id = {lit(U)}")}
    old = [r["k"] for r in sql(OLD, f"select {k} k from {table} where user_id = {lit(U)}")]
    missing = [x for x in old if x not in have]
    cols = [c for c, _ in columns(OLD, table) if c in dict(columns(NEW, table))]
    sel = ", ".join(qi(c) for c in cols)
    added = 0
    for i in range(0, len(missing), 150):
        part = missing[i:i + 150]
        rows = sql(OLD, f"select coalesce(json_agg(x), '[]'::json) j from (select {sel} from {table} where user_id = {lit(U)} and ({k}) in ({','.join(lit(p) for p in part)})) x")[0]["j"]
        if not rows or DRY:
            added += len(rows or [])
            continue
        tg = tag()
        res = sql(NEW, f"set session_replication_role = replica; with ins as (insert into {table} ({sel}) select {sel} from json_populate_recordset(null::{table}, ${tg}${json.dumps(rows, ensure_ascii=False)}${tg}$) on conflict do nothing returning 1) select count(*)::int n from ins")
        added += res[-1]["n"] if res else 0
    msg = f"{t}: missing {len(missing)} → {'would add' if DRY else 'added'} {added}"
    if t == "creator_brands":
        # His own calls on deals (Yes / No, added by hand) onto the rows the scanner rebuilt since.
        verdicts = sql(OLD, f"select creator_id, brand_key, verdict, verdict_kind, verdict_at, manual from {table} where user_id = {lit(U)} and (verdict is not null and verdict <> '' or manual = true)")
        if verdicts and not DRY:
            tg = tag()
            res = sql(NEW, f"""with v as (select * from json_to_recordset(${tg}${json.dumps(verdicts)}${tg}$) as x(creator_id uuid, brand_key text, verdict text, verdict_kind text, verdict_at timestamptz, manual boolean)),
              up as (update {table} b set verdict = coalesce(nullif(b.verdict, ''), v.verdict), verdict_kind = coalesce(b.verdict_kind, v.verdict_kind), verdict_at = coalesce(b.verdict_at, v.verdict_at), manual = b.manual or coalesce(v.manual, false)
                     from v where b.user_id = {lit(U)} and b.creator_id = v.creator_id and b.brand_key = v.brand_key returning 1) select count(*)::int n from up""")
            msg += f" · verdicts re-applied {res[-1]['n']}"
        else:
            msg += f" · verdicts on file {len(verdicts)}"
    print(msg, flush=True)
