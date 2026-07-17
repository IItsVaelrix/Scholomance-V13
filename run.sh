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
if ! python3 -c "import textual, yt_dlp, PIL, anthropic" &> /dev/null; then
    echo "Installing dependencies (textual, rich, yt-dlp, Pillow, anthropic)..."
    python3 -m pip install textual rich yt-dlp Pillow anthropic
fi

# Set up Java 21 path (from the VSCode extension)
export JAVA_HOME="$HOME/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-1.54.0-linux-x64/jre/21.0.10-linux-x86_64"
export PATH="$JAVA_HOME/bin:$PATH"

# Run the new Python TUI App
if ! python3 -m tui.ui.app; then
    echo ""
    echo "======================================"
    echo "CRASH DETECTED"
    echo "======================================"
    echo "The application failed to launch or crashed."
    echo "Dropping into a rescue shell so you can read the error."
    echo "Type 'exit' to close this window."
    bash
fi
