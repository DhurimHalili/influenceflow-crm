#!/bin/bash
# api.sh METHOD PATH [json-body-file] — Supabase management API with the owner's personal access token.
# The token lives in $PAT_FILE (default ~/.supabase-pat, chmod 600) and is never echoed or committed.
# Uses api.supabase.io (the .com host's session-proxy token belongs to another account → 401).
T=${PAT_FILE:-$HOME/.supabase-pat}; M=$1; P=$2
if [ -n "$3" ]; then curl -sS -m 300 -X "$M" "https://api.supabase.io$P" -H "Authorization: Bearer $(cat "$T")" -H "Content-Type: application/json" --data-binary @"$3"
else curl -sS -m 300 -X "$M" "https://api.supabase.io$P" -H "Authorization: Bearer $(cat "$T")"; fi
