#!/usr/bin/env bash
# Export all n8n workflows from the running container into n8n/workflows/.
# Filenames follow the repo's semantic names, not n8n's workflow IDs, so diffs
# stay readable across re-exports.
set -euo pipefail

CONTAINER="${N8N_CONTAINER:-n8n-n8n-1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/n8n/workflows"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1; then
  echo "error: container '$CONTAINER' is not running" >&2
  exit 1
fi

docker exec "$CONTAINER" sh -c \
  'rm -rf /tmp/wfx && mkdir -p /tmp/wfx && n8n export:workflow --all --separate --output=/tmp/wfx' \
  >/dev/null 2>&1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
docker cp "$CONTAINER:/tmp/wfx/." "$TMP/" >/dev/null

python3 - "$TMP" "$OUT_DIR" <<'PY'
import json, pathlib, re, sys

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)

# Repo filenames predate the workflow names; keep them stable.
NAME_MAP = {
    "Invoice Ingestion":      "ingestion.json",
    "Invoice Extraction":     "extraction.json",
    "Invoice Categorization": "categorization.json",
    "Ingestion Error Handler": "error-handler.json",
}

def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + ".json"

changed = []
for f in sorted(src.glob("*.json")):
    wf = json.loads(f.read_text())
    name = wf.get("name", f.stem)
    # Drop fields n8n regenerates on every export; they churn the diff without
    # representing a real change to workflow logic.
    for k in ("updatedAt", "createdAt", "versionId", "triggerCount",
              "id", "meta", "tags", "pinData", "staticData", "active"):
        wf.pop(k, None)
    target = dst / NAME_MAP.get(name, slug(name))
    # Stable formatting so re-exports produce empty diffs when nothing changed.
    new = json.dumps(wf, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    old = target.read_text() if target.exists() else None
    if new != old:
        target.write_text(new)
        changed.append(f"{'updated' if old else 'new    '} {target.name}  ({name})")

print("\n".join(changed) if changed else "no changes — exports already current")
PY
