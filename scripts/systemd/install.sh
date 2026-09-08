#!/usr/bin/env bash
# Install (or refresh) the Project1 user timers.
#
# These are *user* units, so they run only while your user session is active.
# For them to keep running when logged out:  loginctl enable-linger "$USER"
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$DEST"

for f in "$SRC"/*.service "$SRC"/*.timer; do
  install -m 644 "$f" "$DEST/$(basename "$f")"
  echo "installed $(basename "$f")"
done

systemctl --user daemon-reload
systemctl --user enable --now project1-healthcheck.timer project1-keepalive.timer
echo
systemctl --user list-timers 'project1-*' --no-pager
