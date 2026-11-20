#!/usr/bin/env python3
# q.py <ref> <sqlfile|-> : run SQL on a project through the management API, print the JSON rows.
import json, os, sys, urllib.request
ref = sys.argv[1]; sql = sys.stdin.read() if sys.argv[2] == "-" else open(sys.argv[2]).read()
tok = open(os.environ.get("PAT_FILE") or os.path.expanduser("~/.supabase-pat")).read().strip()
req = urllib.request.Request(f"https://api.supabase.io/v1/projects/{ref}/database/query", data=json.dumps({"query": sql}).encode(),
                             headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "User-Agent": "curl/8.5.0"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=300) as r: sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    sys.stdout.write(e.read().decode()); sys.exit(1)
