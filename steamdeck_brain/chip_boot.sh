#!/usr/bin/env bash
# ============================================================================
# chip_boot.sh — Brain-Boosting Microchip Bootstrap
# ============================================================================
# One-shot setup for the SteamDeck Brain architecture.
#
# What this does:
#   1. Checks/installs Python dependencies (none for substrate, optional for FAISS)
#   2. Installs Ollama if missing
#   3. Pulls a 1B-parameter model (phi3:mini or qwen2.5:1.5b)
#   4. Starts Ollama server
#   5. Seeds the substrate with built-in knowledge
#   6. Opens interactive brain session
#
# Usage:
#   ./chip_boot.sh                  # Interactive setup
#   ./chip_boot.sh --model qwen2.5:1.5b  # Use different model
#   ./chip_boot.sh --seed-only      # Only seed knowledge, don't start session
#   ./chip_boot.sh --quick          # Skip model pull if already present
# ============================================================================

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
MODEL="${MODEL:-phi3:mini}"
SUBSTRATE_DIR="${HOME}/.substrate"
SUBSTRATE_DB="${SUBSTRATE_DIR}/memory.sqlite"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KNOWLEDGE_DIR="${SCRIPT_DIR}/knowledge"

# Big-drive Ollama layout. Mirrors install.sh's resolution order so this
# bootstrap and the systemd path stay aligned.
#   1. OLLAMA_BIN env override (e.g. /run/media/deck/<DRIVE>/ollama/bin/ollama)
#   2. $HOME/.config/scholomance-brain.env OLLAMA_BIN= line
#   3. First writable big-drive mount under /run/media/deck/*/ollama/bin/ollama
#   4. $HOME/ollama/bin/ollama (last-resort big-ish location)
OLLAMA_TARBALL_URL="https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst"

resolve_ollama_bin() {
    if [[ -n "${OLLAMA_BIN:-}" ]] && [ -x "$OLLAMA_BIN" ]; then
        echo "$OLLAMA_BIN"; return
    fi
    if [[ -f "$HOME/.config/scholomance-brain.env" ]]; then
        local from_env
        from_env="$(sed -n 's/^OLLAMA_BIN=//p' "$HOME/.config/scholomance-brain.env" | tail -1)"
        if [[ -n "$from_env" ]] && [ -x "$from_env" ]; then
            echo "$from_env"; return
        fi
    fi
    if [[ -d /run/media/deck ]]; then
        local mnt
        for mnt in /run/media/deck/*/ollama/bin/ollama; do
            [ -x "$mnt" ] && { echo "$mnt"; return; }
        done
    fi
    if [ -x "$HOME/ollama/bin/ollama" ]; then
        echo "$HOME/ollama/bin/ollama"
    fi
}

bootstrap_ollama() {
    # Pick a writable prefix on a non-system drive.
    local prefix=""
    if [[ -d /run/media/deck ]]; then
        local mnt
        for mnt in /run/media/deck/*; do
            [ -d "$mnt" ] && [ -w "$mnt" ] && { prefix="$mnt/ollama"; break; }
        done
    fi
    if [[ -z "$prefix" ]] && [ -w "$HOME" ]; then
        prefix="$HOME/ollama"
    fi
    if [[ -z "$prefix" ]]; then
        echo -e "${RED}  No writable big-drive mount or \$HOME; cannot install Ollama.${NC}" >&2
        return 1
    fi

    mkdir -p "$prefix"
    local tarball
    tarball="$(mktemp "${TMPDIR:-/tmp}/ollama-XXXXXX.tar.zst")"
    echo -e "${YELLOW}  Downloading $OLLAMA_TARBALL_URL into $prefix ...${NC}"
    if ! curl -fSL --max-time 120 "$OLLAMA_TARBALL_URL" -o "$tarball"; then
        echo -e "${RED}  Download failed. Check network.${NC}" >&2
        rm -f "$tarball"
        return 1
    fi
    if tar --help 2>/dev/null | grep -q -- --zstd; then
        tar --zstd -xf "$tarball" -C "$prefix"
    else
        zstd -dc "$tarball" | tar -x -C "$prefix"
    fi
    rm -f "$tarball"

    export OLLAMA_BIN="$prefix/bin/ollama"
    mkdir -p "$(dirname "$HOME/.config/scholomance-brain.env")"
    if [[ -f "$HOME/.config/scholomance-brain.env" ]] && grep -q '^OLLAMA_BIN=' "$HOME/.config/scholomance-brain.env"; then
        sed -i "s|^OLLAMA_BIN=.*|OLLAMA_BIN=$OLLAMA_BIN|" "$HOME/.config/scholomance-brain.env"
    else
        echo "OLLAMA_BIN=$OLLAMA_BIN" >> "$HOME/.config/scholomance-brain.env"
    fi
    if ! { [[ -f "$HOME/.config/scholomance-brain.env" ]] && grep -q '^OLLAMA_MODELS=' "$HOME/.config/scholomance-brain.env"; }; then
        echo "OLLAMA_MODELS=$prefix/models" >> "$HOME/.config/scholomance-brain.env"
    fi
    export OLLAMA_MODELS="$prefix/models"
    PATH="$prefix/bin:$PATH"
}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Parse args ──────────────────────────────────────────────────────────────
SEED_ONLY=false
QUICK=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --model) MODEL="$2"; shift 2 ;;
        --seed-only) SEED_ONLY=true; shift ;;
        --quick) QUICK=true; shift ;;
        --help) 
            echo "Usage: ./chip_boot.sh [--model <name>] [--seed-only] [--quick]"
            exit 0
            ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🧠  SteamDeck Brain — Chip Bootstrap Sequence          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Check Python ───────────────────────────────────────────────────
echo -e "${YELLOW}[1/6]${NC} Checking Python..."
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error: python3 required.${NC}"
    exit 1
fi
echo "  Python $(python3 --version) ✓"

# ─── Step 2: Check/Install Ollama ───────────────────────────────────────────
echo -e "${YELLOW}[2/6]${NC} Checking Ollama..."
RESOLVED_BIN="$(resolve_ollama_bin || true)"
if [[ -n "$RESOLVED_BIN" ]] && [ -x "$RESOLVED_BIN" ]; then
    export OLLAMA_BIN="$RESOLVED_BIN"
    PATH="$(dirname "$RESOLVED_BIN"):$PATH"
    echo -e "${GREEN}  Ollama $("$RESOLVED_BIN" --version 2>/dev/null) at $RESOLVED_BIN ✓${NC}"
else
    echo -e "${YELLOW}  Ollama not found. Installing to big drive...${NC}"
    if ! bootstrap_ollama; then
        echo -e "${RED}  Ollama install failed.${NC}"
        exit 1
    fi
    echo -e "${GREEN}  Ollama $("$OLLAMA_BIN" --version 2>/dev/null) installed to $OLLAMA_BIN ✓${NC}"
fi

# ─── Step 3: Start Ollama Server ────────────────────────────────────────────
echo -e "${YELLOW}[3/6]${NC} Starting Ollama server..."
if ! pgrep -x ollama >/dev/null; then
    ollama serve &>/tmp/ollama.log &
    OLLAMA_PID=$!
    echo "  Ollama server starting (PID: $OLLAMA_PID)..."
    
    # Wait for it to be ready
    for i in $(seq 1 30); do
        if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
            echo -e "${GREEN}  Ollama server ready ✓${NC}"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo -e "${RED}  Ollama server failed to start. Check /tmp/ollama.log${NC}"
            exit 1
        fi
        sleep 1
    done
else
    echo -e "${GREEN}  Ollama already running ✓${NC}"
fi

# ─── Step 4: Pull Model ─────────────────────────────────────────────────────
echo -e "${YELLOW}[4/6]${NC} Ensuring model ${MODEL}..."
if $QUICK && ollama list 2>/dev/null | grep -q "${MODEL%:*}"; then
    echo -e "${GREEN}  Model ${MODEL} already present (--quick) ✓${NC}"
else
    echo "  Pulling ${MODEL} (this may take a few minutes)..."
    ollama pull "$MODEL"
    echo -e "${GREEN}  Model ${MODEL} ready ✓${NC}"
fi

# ─── Step 5: Seed Knowledge ──────────────────────────────────────────────────
echo -e "${YELLOW}[5/6]${NC} Seeding substrate knowledge..."
mkdir -p "$KNOWLEDGE_DIR"

# Create sample knowledge file
KNOWLEDGE_FILE="${KNOWLEDGE_DIR}/scholomance_knowledge.txt"
if [ ! -f "$KNOWLEDGE_FILE" ]; then
    cat > "$KNOWLEDGE_FILE" << 'EOF'
The Scholomance is a divinity school for wizards and mages.
The school is hidden in a secret pocket dimension.
The school teaches various magical disciplines including soulfire, void magic, and chronomancy.
Soulfire is a magical flame that burns the soul rather than the body.
Void magic draws power from the empty spaces between worlds.
The school is protected by ancient wards and enchantments.
The headmaster is a powerful archmage known as Vaelrix.
Students must pass the Crucible to graduate.
The school library contains forbidden grimoires sealed behind magical locks.
The school's motto is "Per Ardua ad Astra" — Through Adversity to the Stars.
EOF
fi

# Ingest into substrate
python3 "$SCRIPT_DIR/substrate_engine.py" --db "$SUBSTRATE_DB" ingest --file "$KNOWLEDGE_FILE" 2>/dev/null || echo "  (first run creating DB)"

echo -e "${GREEN}  Substrate seeded with knowledge from ${KNOWLEDGE_FILE} ✓${NC}"

# Try ingesting any .txt or .jsonl files in knowledge dir
for f in "$KNOWLEDGE_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    echo "  Ingesting $f..."
    python3 "$SCRIPT_DIR/substrate_engine.py" --db "$SUBSTRATE_DB" ingest --file "$f" --format jsonl 2>/dev/null
done

# Show substrate stats
python3 "$SCRIPT_DIR/substrate_engine.py" --db "$SUBSTRATE_DB" stats 2>/dev/null || echo "  (run stats manually)"

# ─── Step 6: Launch ─────────────────────────────────────────────────────────
if $SEED_ONLY; then
    echo ""
    echo -e "${GREEN}✅ Substrate seeded. Start the brain manually:${NC}"
    echo "   python3 ${SCRIPT_DIR}/steamdeck_brain.py --model ${MODEL}"
else
    echo -e "${YELLOW}[6/6]${NC} Launching brain..."
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     🧠  Brain Boost Active — Substrate + ${MODEL}         ║${NC}"
    echo -e "${GREEN}║     Type queries or /help for commands                     ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    exec python3 "$SCRIPT_DIR/steamdeck_brain.py" --model "$MODEL" --db "$SUBSTRATE_DB"
fi
