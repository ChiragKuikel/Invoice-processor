#!/usr/bin/env bash
# Touch Supabase so the free-tier project does not idle-pause.
#
# Free projects pause after ~7 days without activity, and restoring one is
# manual. A cheap read on a schedule keeps the clock reset.
#
# Uses PostgREST rather than psql so the only dependency is curl, and alerts
# Slack if the ping fails — a failure here means the project is unreachable
# or the key is stale, both of which break the whole pipeline silently.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Read KEY=value from a .env file, tolerating inline "# comment" suffixes and
# surrounding quotes. A plain `cut -d=` swallows a trailing comment into the
# value, which silently produced 401s from Supabase.
get() {
  sed -nE "s/^$1=[[:space:]]*//p" "$2" 2>/dev/null \
    | head -1 \
    | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/[[:space:]]+$//'
}

SUPABASE_URL="$(get SUPABASE_URL "$REPO_ROOT/.env")"
SUPABASE_KEY="$(get SUPABASE_SECRET_KEY "$REPO_ROOT/.env")"
SLACK_URL="$(get SLACK_WEBHOOK_URL "$REPO_ROOT/n8n/.env")"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "error: SUPABASE_URL / SUPABASE_SECRET_KEY missing from $REPO_ROOT/.env" >&2
  exit 1
fi

code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  "${SUPABASE_URL}/rest/v1/invoices?select=id&limit=1" 2>/dev/null)"

if [ "$code" = "200" ]; then
  echo "$(date -Is) keepalive ok"
  exit 0
fi

echo "$(date -Is) keepalive FAILED (http $code)" >&2
if [ -n "$SLACK_URL" ]; then
  curl -sS -m 15 -X POST -H 'Content-Type: application/json' \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' \
      ":warning: Project1 — Supabase keepalive failed (HTTP ${code}). Project may be paused or the service key is stale.")" \
    "$SLACK_URL" >/dev/null || true
fi
exit 1
