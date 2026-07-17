#!/usr/bin/env bash
# launch-brain-stack.sh — Start Ollama + Brain daemon together.
# Usage: ./launch-brain-stack.sh [brain_daemon args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

OLLAMA_PORT=11434
BRAIN_PORT=9090

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

echo "🧹 Clearing old Ollama + Brain daemon processes..."
kill_port "$OLLAMA_PORT"
kill_port "$BRAIN_PORT"
sleep 1

echo "🦙 Starting Ollama..."
nohup ollama serve > /tmp/ollama.log 2>&1 &
wait_for_port "$OLLAMA_PORT" "Ollama" 60

echo "🧠 Starting Brain daemon..."
cd "$SCRIPT_DIR"
nohup python3 brain_daemon.py "$@" > /tmp/brain_daemon.log 2>&1 &
wait_for_port "$BRAIN_PORT" "Brain daemon" 30

echo ""
echo "Both services are up:"
echo "  Ollama:      http://127.0.0.1:$OLLAMA_PORT"
echo "  Brain:       http://127.0.0.1:$BRAIN_PORT/health"
echo "  Ollama logs: tail -f /tmp/ollama.log"
echo "  Brain logs:  tail -f /tmp/brain_daemon.log"
