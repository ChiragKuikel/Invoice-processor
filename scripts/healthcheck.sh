#!/usr/bin/env bash
# Check that n8n is up; alert Slack when that changes.
#
# Replaces the build plan's UptimeRobot item. An external prober cannot tell
# "n8n crashed" from "laptop asleep" or "different wifi", so on a laptop it
# reports mostly false alarms. This runs locally: it only sees the machine
# when the machine is on, which is exactly the failure it can act on.
#
# Alerts fire on transitions only (up->down, down->up), never on every tick,
# so a long outage produces one message rather than one per run.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/project1-healthcheck.state"
HEALTH_URL="${N8N_HEALTH_URL:-http://localhost:5678/healthz}"
CONTAINER="${N8N_CONTAINER:-n8n-n8n-1}"

# Read KEY=value from a .env file, tolerating inline "# comment" suffixes and
# surrounding quotes. A plain `cut -d=` swallows a trailing comment into the
# value, which silently produced 401s from Supabase.
get() {
  sed -nE "s/^$1=[[:space:]]*//p" "$2" 2>/dev/null \
    | head -1 \
    | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/[[:space:]]+$//'
}

SLACK_URL="$(get SLACK_WEBHOOK_URL "$REPO_ROOT/n8n/.env")"

notify() {
  [ -n "$SLACK_URL" ] || return 0
  curl -sS -m 15 -X POST -H 'Content-Type: application/json' \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$1")" \
    "$SLACK_URL" >/dev/null || true
}

mkdir -p "$(dirname "$STATE_FILE")"
prev="$(cat "$STATE_FILE" 2>/dev/null || echo unknown)"

if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$HEALTH_URL" 2>/dev/null)" = "200" ]; then
  now=up
else
  now=down
fi

if [ "$now" != "$prev" ]; then
  if [ "$now" = down ]; then
    # Include why, so the alert is actionable without opening a terminal.
    state="$(docker inspect -f '{{.State.Status}} (exit {{.State.ExitCode}})' "$CONTAINER" 2>/dev/null || echo 'container not found')"
    tail_log="$(docker logs --tail 5 "$CONTAINER" 2>&1 | tr -d '\r' || true)"
    notify ":red_circle: Project1 — n8n is DOWN
container: ${state}
recent log:
${tail_log}"
  elif [ "$prev" != unknown ]; then
    notify ":large_green_circle: Project1 — n8n is back up"
  fi
  printf '%s\n' "$now" > "$STATE_FILE"
fi

[ "$now" = up ]
