#!/usr/bin/env bash
# launch-brain-stack.sh — Start the Brain daemon (no-llm by default).
#
# Default mode: model-free. The daemon serves the full ForceField + SCDNA
# pipeline (brains, routing, arbiter, health signals) WITHOUT loading or
# calling Ollama. No 7B model is touched, no extra RAM is pinned, and the
# system stays responsive.
#
# To opt back into the Ollama-backed LLM bridge (loads qwen2.5-coder:7b):
#   SCHOLOMANCE_WITH_OLLAMA=1 ./launch-brain-stack.sh
#
# Usage: ./launch-brain-stack.sh [extra brain_daemon args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

OLLAMA_PORT=11434
BRAIN_PORT=9090
WITH_OLLAMA="${SCHOLOMANCE_WITH_OLLAMA:-0}"

kill_port() {
    local port="$1"
    local pids
    pids=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
    for pid in $pids; do
        if [[ -n "$pid" ]]; then
            echo "Killing process on port $port (PID $pid)..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
}

wait_for_port() {
    local port="$1" label="$2" timeout="${3:-30}"
    echo "Waiting for $label on port $port..."
    for ((i=0; i<timeout; i++)); do
        if ss -ltn 2>/dev/null | grep -q ":$port "; then
            echo "✓ $label is ready on port $port"
            return 0
        fi
        sleep 1
    done
    echo "✗ $label did not start on port $port within ${timeout}s"
    return 1
}

echo "🧹 Clearing old Brain daemon (and Ollama, if any) processes..."
kill_port "$BRAIN_PORT"
if [[ "$WITH_OLLAMA" == "1" ]]; then
    kill_port "$OLLAMA_PORT"
else
    # Free the ~5GB that Ollama pins, even if it was left running.
    if ss -ltn 2>/dev/null | grep -q ":$OLLAMA_PORT "; then
        echo "   (Ollama is running but not needed in no-llm mode — leaving it untouched.)"
        echo "   To stop it:  pkill -x ollama"
    fi
fi
sleep 1

if [[ "$WITH_OLLAMA" == "1" ]]; then
    echo "🦙 Starting Ollama (LLM mode)..."
    export OLLAMA_IGPU_ENABLE="${OLLAMA_IGPU_ENABLE:-1}"
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    wait_for_port "$OLLAMA_PORT" "Ollama" 60
    DAEMON_ARGS=(--llm "$@")
else
    echo "⚡ No-LLM mode: ForceField + SCDNA only, no model will be loaded."
    DAEMON_ARGS=(--no-llm "$@")
fi

echo "🧠 Starting Brain daemon..."
cd "$SCRIPT_DIR"
nohup ../.venv-align/bin/python3 brain_daemon.py "${DAEMON_ARGS[@]}" > /tmp/brain_daemon.log 2>&1 &
wait_for_port "$BRAIN_PORT" "Brain daemon" 30

echo ""
echo "Brain daemon is up (no-llm mode):"
echo "  Brain HTTP:  http://127.0.0.1:$BRAIN_PORT/health"
echo "  MCP Brain:   steamdeck_brain/mcp_brain_bridge.py  (stdio MCP for CLI agents)"
if [[ "$WITH_OLLAMA" == "1" ]]; then
    echo "  Ollama:      http://127.0.0.1:$OLLAMA_PORT  (7B model will be loaded on first ask)"
fi
echo ""
echo "CLI agents (opencode, Claude, Cursor, Gemini, Grok, Codex) connect via:"
echo "  • MCP server 'scholomance-brain' (configure in mcp.json / opencode.json)"
echo "  • Direct:  python -m vaelrix_forcefield.scdna.inject --prompt \"...\" --agent <name>"
echo ""
echo "  Brain logs:  tail -f /tmp/brain_daemon.log"
if [[ "$WITH_OLLAMA" == "1" ]]; then
    echo "  Ollama logs: tail -f /tmp/ollama.log"
fi
echo ""
echo "To make daemon always available to CLI agents:"
echo "  ./systemd/install.sh   # installs user service"
