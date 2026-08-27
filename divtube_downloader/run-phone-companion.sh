#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# The phone companion is private-LAN only. The most capable V1 mode includes
# read-only agent chat plus downloads that still require explicit confirmation.
export DIVTUBE_REMOTE_COMPANION_ENABLED=true
export DIVTUBE_REMOTE_COMPANION_LAN_ENABLED=true
export DIVTUBE_REMOTE_COMPANION_MODE=downloads_confirmed
# Every prior gateway restart got a random OS-assigned high port
# (33715, 44159, 35571); a plain HTTP server on a fixed low port (8765)
# worked from the phone on the same network every time. Pinning a fixed
# port here removes "did this port change get blocked" as a variable
# across restarts while that's diagnosed.
export DIVTUBE_REMOTE_COMPANION_PORT=8766

LAUNCH_TARGET="${DIVTUBE_LAUNCH_TARGET:-$SCRIPT_DIR/run.sh}"
if [[ ! -x "$LAUNCH_TARGET" ]]; then
    printf 'DivTube launch target is not executable: %s\n' "$LAUNCH_TARGET" >&2
    exit 1
fi

exec "$LAUNCH_TARGET" "$@"
