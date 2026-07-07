# 🧠 SteamDeck Brain — Brain-Boosting Microchip Architecture

**Turn a 1B parameter model into a 175B-class knowledge system** using an external memory substrate. Runs entirely on Steam Deck.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Your Query                          │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  🧠 MOTHERBOARD (steamdeck_brain.py)                │
│  ┌──────────────┐   ┌───────────────────────────┐   │
│  │ PromptBuilder│──→│   1B Model (via Ollama)    │   │
│  │ (context     │   │   phi3:mini / qwen2.5:1.5b │   │
│  │  injection)  │   │   ~30-50 tok/s on Deck     │   │
│  └──────┬───────┘   └───────────────────────────┘   │
│         │                                            │
│         ▼                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ SUBSTRATE (substrate_engine.py)               │   │
│  │ SQLite + 4-bit Turboquant compression         │   │
│  │ Stores: knowledge, personality, memories      │   │
│  │ Retrieval: cosine similarity on quantized vecs│   │
│  │ 100K docs × 384 dim × 4-bit = ~9.6MB         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
             Response with
             augmented knowledge
```

Created steamdeck_brain/launch-brain-stack.sh.

What it does:
1. Kills anything on ports 11434 (Ollama) and 9090 (brain daemon)
2. Starts ollama serve in the background → /tmp/ollama.log
3. Waits for Ollama to be ready
4. Starts brain_daemon.py in the background → /tmp/brain_daemon.log
5. Waits for the brain daemon to be ready
Run it:
./steamdeck_brain/launch-brain-stack.sh
With custom args (passed through to brain_daemon.py):
./steamdeck_brain/launch-brain-stack.sh --model qwen2.5-coder:7b --port 9090
Watch logs:
tail -f /tmp/ollama.log /tmp/brain_daemon.log


## The "Brain Boosting Microchip" Concept

| Component | What it is | Analogy |
|-----------|-----------|---------|
| **Substrate** | 4-bit quantized vector memory bank (SQLite) | Hard drive — stores compressed knowledge |
| **Motherboard** | Orchestration layer — retrieves + injects context | RAM bus — routes data to processor |
| **1B Model** | Small language model (phi3:mini, qwen2.5:1.5b) | CPU — fast processor, small cache |
| **Turboquant** | 32-bit → 4-bit compression (8× savings) | Data compression for storage efficiency |

**Why this works:** The 1B model doesn't memorize facts in its weights. It memorizes *retrieval strategies*. Knowledge lives in the substrate, pulled in at inference time. This lets a tiny model punch far above its weight class.

## Files

| File | Purpose |
|------|---------|
| `substrate_engine.py` | Memory bank — 4-bit quantized vector storage, cosine search, SQLite persistence |
| `steamdeck_brain.py` | Motherboard — wires substrate → Ollama model, context injection pipeline |
| `chip_boot.sh` | Bootstrap — installs deps, pulls model, seeds knowledge, launches brain |
| `ingest_knowledge.py` | Ingestion tool — files, directories, personality profiles, direct text |
| `knowledge/` | Sample lore and personality data to seed the substrate |
| `brain_daemon.py` | Always-on HTTP daemon — keeps Cortex + Ollama warm on `127.0.0.1:9090` |
| `systemd/` | `--user` service units + `install.sh` to keep the daemon on at all times |

## Quick Start

```bash
# Full bootstrap (one command)
./chip_boot.sh

# Or manually:
# 1. Install Ollama to a big drive (if not present) — never to /usr/local,
#    that lives on the small system SSD. The bootstrap script handles this
#    automatically; this is the explicit version for documentation:
curl -fSL https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst \
    | tar --zstd -x -C /run/media/deck/<DRIVE>/
export OLLAMA_BIN=/run/media/deck/<DRIVE>/ollama/bin/ollama
export OLLAMA_MODELS=/run/media/deck/<DRIVE>/ollama/models

# 2. Start Ollama
ollama serve &

# 3. Pull a 1B model
ollama pull phi3:mini

# 4. Seed the substrate
python3 substrate_engine.py ingest --file knowledge/scholomance_lore.txt
python3 ingest_knowledge.py personality --name "Vaelrix" --traits "wise,cryptic,ancient" --role "archmage"

# 5. Launch
python3 steamdeck_brain.py --model phi3:mini
```

## Always-On Daemon (recommended)

`brain_daemon.py` runs the Cortex + Ollama bridge as a persistent HTTP server on
`127.0.0.1:9090`. The DivTube TUI connects to it over HTTP — it does **not** own
the daemon's lifecycle, so the brain stays up even when DivTube is closed.

To keep it (and Ollama) running at all times — across crashes, logouts, and
reboots — install the `systemd --user` services:

```bash
# Detects your Python/Ollama paths, renders the units, enables linger, starts them
./systemd/install.sh

# Manage it
systemctl --user status scholomance-brain.service
journalctl --user -u scholomance-brain.service -f
curl -s http://127.0.0.1:9090/health

# Remove
./systemd/install.sh --uninstall
```

Two units are installed: `scholomance-ollama.service` (supervises `ollama serve`,
the brain's only runtime dependency) and `scholomance-brain.service`
(`brain_daemon.py`, `Restart=always`, waits for Ollama before launching).
`loginctl enable-linger` lets them run without an active login session.

Override defaults without editing the units by dropping `KEY=VALUE` lines into
`~/.config/scholomance-brain.env` (`BRAIN_MODEL`, `BRAIN_PORT`, `BRAIN_DB`,
`BRAIN_EXTRA_ARGS`, e.g. `BRAIN_EXTRA_ARGS=--personality Vaelrix`).

Or run the daemon manually (foreground):

```bash
python3 brain_daemon.py --model qwen3.5:9b --port 9090
```

## MCP Server for CLI Agents (opencode, Grok, Claude, Cursor, Gemini, Codex, etc.)

The brain network is exposed as a stdio MCP server so any MCP-compatible CLI agent can use it as a tool server.

1. Start the daemon (so the HTTP backend is up):
   ```bash
   ./launch-brain-stack.sh
   ```

2. Configure your agent to use the MCP server defined in the project root:

   - `mcp.json` (standard for many clients)
   - `opencode.json` (for opencode.ai / compatible)

   The entry:
   ```json
   "scholomance-brain": {
     "command": "python3",
     "args": ["steamdeck_brain/mcp_brain_bridge.py"],
     "cwd": "/full/path/to/Scholomance-V12-main",
     "env": { "PYTHONPATH": "steamdeck_brain" }
   }
   ```

3. Tools available via the MCP:
   - `ask_brain` — query the full brain + genes (main entrypoint)
   - `get_brain_health`
   - `get_scdna_genes`
   - `list_available_brains`

This is how the daemon becomes available to *all* CLI agents.

See `steamdeck_brain/mcp_brain_bridge.py` for the implementation.
## Usage Examples

```bash
# Interactive session
python3 steamdeck_brain.py

# Single query with brain boost
python3 steamdeck_brain.py -q "what is soulfire?"

# Show what context is being injected
python3 steamdeck_brain.py -q "explain the crucible" --show-context

# Compare with/without substrate
python3 steamdeck_brain.py -q "tell me about the school" --compare

# Use a different model
python3 steamdeck_brain.py --model qwen2.5:1.5b

# Ingest more knowledge
python3 ingest_knowledge.py file ~/my_knowledge.txt --tag lore
python3 ingest_knowledge.py memo "The secret password is STARLIGHT" --tag secret
```

## 🏛️ Scholomance Expert Mode

Turn your SteamDeck Brain into a **true Scholomance expert** by ingesting the full encyclopedia — laws, white papers, PDR archives, bug reports, verdicts, architecture docs, and more.

```bash
# Full encyclopedia seed (~8.7MB of text, 300+ documents)
python3 seed_scholomance.py

# Quick seed (LAW + White Papers + Personality only — ~3MB)
python3 seed_scholomance.py --quick

# Rebuild from scratch (if you want a clean slate)
python3 seed_scholomance.py --force
```

After seeding, the substrate knows:
- **19 Vaelrix Laws** — the source of truth for determinism, bug documentation, escalation
- **Resonance Law** — compile perception into deterministic memory
- **Schema Contract** — all TypeScript schemas
- **Agent roles** — Claude (UI), Gemini (Backend), Cursor (Nexus), Codex (Architecture)
- **Engineering Rulebook** — mandatory quality gates
- **Clerical RAID** — 50+ seeded bug patterns with confidence scoring
- **BytecodeHealth** — green-path signal protocol
- **SCD64** — checksum architecture for mutation detection
- **Turboquant** — 4-bit compression service manual
- **Truesight** — overlay integrity contract
- **All PDRs** — 120+ product decision records
- **All PIRs** — 50+ post-implementation reviews
- **All bug reports & verdicts** — every incident and its resolution

```bash
# Launch with full Scholomance expertise
python3 steamdeck_brain.py --model phi3:mini

# Ask anything about the codebase
> What is Vaelrix LAW #5?
> Explain the Clerical RAID pattern matching system
> How does SCD64 detect mutations?
> What's the difference between Innate and Adaptive immune layers?
> Show me the Turboquant compression algorithm
> What was BUG-2026-04-03 about?
```

The model retrieves relevant context from the substrate for every query,
making a 1B model feel like a Scholomance-trained archmage.

## Performance on Steam Deck

| Model | Size (4-bit) | RAM | Tok/s | Quality |
|-------|-------------|-----|-------|---------|
| phi3:mini | ~1.3 GB | ~700 MB | 30-50 | Strong for 1B |
| qwen2.5:1.5b | ~1.5 GB | ~800 MB | 25-40 | Best-in-class 1.5B |
| tinyllama:1.1b | ~700 MB | ~500 MB | 50-70 | Fast, weaker |

All models run entirely on Steam Deck's CPU/GPU with ~1GB RAM overhead.

> **GPU offload:** The Deck's APU (RADV VANGOGH) is an *integrated* GPU, which
> Ollama skips by default — so models silently run on CPU. The stack sets
> `OLLAMA_IGPU_ENABLE=1` (systemd EnvironmentFile + launch scripts) to offload to
> the iGPU over Vulkan. Verify with `ollama ps` — `PROCESSOR` should read `100% GPU`.
Substrate adds ~20MB for 100K documents.

## How to Make It Actually Smart

The default embedding provider uses hash-based vectors (zero deps, but dumb).
For real semantic understanding, install a proper embedding model:

```bash
pip install sentence-transformers numpy

# Then create a real embedding provider:
python3 -c "
from substrate_engine import Substrate, EmbeddingProvider

class RealEmbed(EmbeddingProvider):
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        super().__init__(dim=384)
    
    def encode(self, text):
        return self.model.encode(text).tolist()

sub = Substrate(embedding_provider=RealEmbed())
print('Real embeddings active!')
"
```

## Memory Persistence

All memories persist in `~/.substrate/memory.sqlite`. The substrate survives
between sessions — knowledge you ingest today is available tomorrow.

```bash
# Check stats
python3 substrate_engine.py stats

# Interactive substrate shell
python3 substrate_engine.py --interactive

# Clear all memories
python3 substrate_engine.py clear
```

## License

This is a proof-of-concept for the Scholomance project.
Build on it, break it, make it your own.
