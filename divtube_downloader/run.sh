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

# Move to the script directory
cd "$SCRIPT_DIR"

# Load environment variables from .env file securely (if it exists)
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Create a virtual environment if it doesn't exist to avoid OS package conflicts
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate the virtual environment
source .venv/bin/activate

# Ensure Python UI and backend dependencies are installed inside the venv
if ! python3 -c "import textual, yt_dlp, PIL, anthropic, openai" &> /dev/null; then
    echo "Installing dependencies (textual, rich, yt-dlp, Pillow, anthropic, openai)..."
    python3 -m pip install textual rich yt-dlp Pillow anthropic openai
fi

# Resolve a JDK dynamically — hard-coding the VSCode-extension path breaks every
# time the Java extension auto-updates (e.g. 1.54.0 -> 1.55.0). Pick the newest
# bundled/system JDK, falling back to whatever java is already on PATH.
if [ -z "$JAVA_HOME" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
    for candidate in \
        "$HOME"/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-*/jre/* \
        "$HOME"/.vscode/extensions/redhat.java-*/jre/* \
        "$HOME"/.vscode-server/extensions/redhat.java-*/jre/* \
        /usr/lib/jvm/*; do
        [ -x "$candidate/bin/java" ] && JAVA_HOME="$candidate"
    done
fi
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    export JAVA_HOME
    export PATH="$JAVA_HOME/bin:$PATH"
elif ! command -v java &> /dev/null; then
    echo "WARNING: No JDK found — /download and /analyze need Java 17+ (set JAVA_HOME)."
fi

# Run the new Python TUI App
if ! python3 -m tui.ui.app; then
    echo ""
    echo "======================================"
    echo "CRASH DETECTED"
    echo "======================================"
    echo "The application failed to launch or crashed."
    echo ""
    if [ -s error.log ]; then
        echo "----- last captured crash (tail of error.log) -----"
        tail -n 40 error.log
        echo "---------------------------------------------------"
        echo "(full history in error.log and crash-*.log)"
        echo ""
    fi
    echo "Dropping into a rescue shell so you can read the error."
    echo "Type 'exit' to close this window."
    bash
fi
