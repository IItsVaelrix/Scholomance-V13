#!/bin/sh
set -eu
# `/workspace` was the Grok App Builder sandbox's fixed container path — this
# app now also runs standalone from wherever this repo checks it out, so
# resolve the real script directory instead of assuming a hardcoded path.
cd "$(dirname "$0")"
# :8091 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8090/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
