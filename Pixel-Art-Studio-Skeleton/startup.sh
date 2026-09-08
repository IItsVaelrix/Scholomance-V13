#!/bin/sh
set -eu
# `/workspace` was the Grok App Builder sandbox's fixed container path — this
# app now also runs standalone from wherever this repo checks it out, so
# resolve the real script directory instead of assuming a hardcoded path.
cd "$(dirname "$0")"
# :8091 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8090/; then
  npm run dev >>/tmp/app-startup.log 2>&1 &
fi

# The sandbox runs this headless on revive, but a human can also double-click
# this file as a local launcher — that gives no visible feedback otherwise
# (server just starts in the background). Wait for it to answer, then open
# the default browser. No DISPLAY / no xdg-open (sandbox, CI) => silent no-op,
# and this is backgrounded so the script itself still returns immediately.
(
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8090/; then
      command -v xdg-open >/dev/null 2>&1 && xdg-open http://127.0.0.1:8090/ >/dev/null 2>&1 || true
      break
    fi
    i=$((i + 1))
    sleep 1
  done
) &
