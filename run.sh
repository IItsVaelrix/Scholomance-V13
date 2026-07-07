#!/usr/bin/env bash

# Find the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Keep window open on any error so user can read it
trap 'if [ $? -ne 0 ]; then echo "Script failed!"; read -p "Press Enter to exit..."; fi' EXIT

# Re-launch in a terminal if double-clicked (not running inside a terminal)
if [ ! -t 0 ]; then
    if command -v konsole &> /dev/null; then
        exec konsole -e "$0" "$@"
    elif command -v xterm &> /dev/null; then
        exec xterm -e "$0" "$@"
    elif command -v gnome-terminal &> /dev/null; then
        exec gnome-terminal -- "$0" "$@"
    fi
fi

# The TUI app lives in the divtube_downloader/ subproject, which has its own
# launcher handling the venv, dependencies, and `python3 -m tui.ui.app`.
# This root launcher just delegates there so the correct working directory and
# virtual environment are used (running `-m tui.ui.app` from the repo root fails
# with "No module named 'tui'" because the package lives under divtube_downloader/).
exec "$SCRIPT_DIR/divtube_downloader/run.sh" "$@"
