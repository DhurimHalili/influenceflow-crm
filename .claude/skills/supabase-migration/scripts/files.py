#!/usr/bin/env python3
# files.py OLD_REF NEW_REF — copy every Storage object (avatars, kits…) with the same bucket/path, keep owners,
# then compare counts + total bytes per bucket. Service keys are read through the management API, never printed.
import json, os, subprocess, sys, urllib.request, urllib.parse
OLD, NEW = sys.argv[1], sys.argv[2]; here = os.path.dirname(os.path.abspath(__file__))
def q(ref, sql): return json.loads(subprocess.run([os.path.join(here, "q.py"), ref, "-"], input=sql, capture_output=True, text=True).stdout)
def srk(ref):
    ks = json.loads(subprocess.run([os.path.join(here, "api.sh"), "GET", f"/v1/projects/{ref}/api-keys?reveal=true"], capture_output=True, text=True).stdout)
    return [k["api_key"] for k in ks if k.get("name") == "service_role"][0]
ko, kn = srk(OLD), srk(NEW)
objs = q(OLD, "select bucket_id, name, owner, owner_id, metadata->>'mimetype' mime, (metadata->>'size')::bigint size from storage.objects order by bucket_id, name")
def http(method, url, key, data=None, headers=None):
    h = {"Authorization": "Bearer " + key, "apikey": key, "User-Agent": "curl/8.5.0"}; h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=120)
ok = 0
for o in objs:
    path = urllib.parse.quote(o["name"])
    body = http("GET", f"https://{OLD}.supabase.co/storage/v1/object/{o['bucket_id']}/{path}", ko).read()
    http("POST", f"https://{NEW}.supabase.co/storage/v1/object/{o['bucket_id']}/{path}", kn, body, {"Content-Type": o["mime"] or "application/octet-stream", "x-upsert": "true"}).read()
    ok += len(body) == o["size"]
print("files copied:", len(objs), "size matches:", ok)
lit = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
if objs:
    vals = ",".join(f"({lit(o['bucket_id'])},{lit(o['name'])},{lit(o['owner'])}::uuid,{lit(o['owner_id'])})" for o in objs)
    q(NEW, f"update storage.objects s set owner=v.owner, owner_id=v.owner_id from (values {vals}) v(bucket_id,name,owner,owner_id) where s.bucket_id=v.bucket_id and s.name=v.name")
a = q(OLD, "select bucket_id, count(*) n, sum((metadata->>'size')::bigint) b, count(owner) o from storage.objects group by 1 order by 1")
b = q(NEW, "select bucket_id, count(*) n, sum((metadata->>'size')::bigint) b, count(owner) o from storage.objects group by 1 order by 1")
print("old", a); print("new", b); print("MATCH" if a == b else "DIFFER")
