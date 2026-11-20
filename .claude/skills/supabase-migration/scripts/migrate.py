#!/usr/bin/env python3
# migrate.py NEW_REF — apply every file in supabase/migrations/ in order through the management API
# (recorded in the new project's migration history). Resumable: done files are listed in .applied-<ref>.
import json, os, subprocess, sys, glob
ref = sys.argv[1]; here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, "../../../../supabase/migrations"); state = f".applied-{ref}"
done = set(open(state).read().split()) if os.path.exists(state) else set()
for f in sorted(glob.glob(root + "/*.sql")):
    base = os.path.basename(f)
    if base in done: continue
    body = {"query": open(f).read(), "name": base[:-4].split("_", 1)[1] if "_" in base else base[:-4]}
    open(".mbody", "w").write(json.dumps(body))
    r = subprocess.run([os.path.join(here, "api.sh"), "POST", f"/v1/projects/{ref}/database/migrations", ".mbody"], capture_output=True, text=True)
    out = r.stdout.strip()
    if r.returncode or ('"message"' in out and "error" in out.lower()):
        print("FAIL", base, out[:700]); sys.exit(1)
    open(state, "a").write(base + "\n"); print("ok", base, flush=True)
os.remove(".mbody") if os.path.exists(".mbody") else None
