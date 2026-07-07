# DivTube Cockpit (TUI)

A beautiful, polished, highly usable terminal interface for the DivTube Downloader.
It transforms the CLI tool into a modern AI agent dashboard!

## Architecture

- `tui/ui/app.py` — main `DivTubeApp` entrypoint
- `tui/ui/layout.py` + screens/widgets — dynamic panel layout
- 12+ service bridges (`TurboQuantService`, `CleriBridge`, `BytecodeHealthBridge`, `ArchiveBridge`, `Scd64Service`, …)
- Command parser + skill system in `tui/core/`
- Live TUI inspector via the `tui_inspect` tool (returns current widget tree)

## How to run

1. Install requirements:
`pip install textual rich`

2. Launch the TUI:
`python3 -m tui.ui.app`

## TurboQuant SEO Plugin (spec v1.0)

Zero-GPU local semantic SEO intelligence. The cockpit spawns the Node.js
microservice `turboquant_plugin.js` over stdio (JSON-lines) and scores
titles/tags against your saved **Golden Curves** in sub-millisecond time.
Everything runs locally — no cloud, no API costs. Requires Node ≥ 18; if
Node is missing the cockpit still launches and these commands report offline.

**Health & Determinism**
- `health_emit` / `health_verify` — BytecodeHealth green-path signals (PB-OK-v1)
- `immunity_scan` / `immunity_status` — Scholomance immune system checks
- `diagnostic_scan` — full codebase diagnostic across all layers

**Vectorizer (best first):**
1. **Turbovec** (`turbovec1`) — bespoke, domain-adapted. Mean-pools GloVe but
   weights each token by **domain salience** (IDF damps boilerplate like
   "official/video/music"; nichepack power-words get boosted) and resolves
   **OOV** terms (artist names, slang) via vectors synthesized from your own
   corpus. Build with `python3 embeddings/build_turbovec.py` (learns from your
   goldenpacks, registry, analysis JSON, and nichepacks — re-run as you ingest).
2. **GloVe** (`glove50`) — generic mean-pooled embeddings; synonyms cluster.
3. **Hashing** (`hash512`) — lexical fallback if no pack is present.

Curves are tagged with the embedder that built them and **auto-re-indexed**
from their saved text when you upgrade between embedders (e.g. importing a
GloVe-built pack while Turbovec is active).

| Command | Description | Example |
|---|---|---|
| `/register-golden` | Store text/video as a named Golden Curve | `/register-golden speedrun-god "insane glitchless any% world record"` |
| `/list-curves` | List saved Golden Curves | `/list-curves` |
| `/delete-curve` | Delete a Golden Curve | `/delete-curve speedrun-god` |
| `/score-title` | Score a single title vs a curve (0-100%) | `/score-title "My New Title" --curve speedrun-god` |
| `/test-titles` | A/B rank multiple titles vs a curve | `/test-titles --curve speedrun-god "Title A" "Title B"` |
| `/analyze-gaps` | Surface missing semantic concepts | `/analyze-gaps --target speedrun-god "my draft title"` |
| `/search-similar` | k-NN search across all curves | `/search-similar "draft description" -k 5` |
| `/export-pack` | Export curves to a portable `.goldenpack` | `/export-pack gaming-niche` |
| `/import-pack` | Import curves from a `.goldenpack` | `/import-pack gaming-niche` |

**Scholomance Commands**
- `/cleri-scan`, `/raid-query`, `/law-audit`
- Memory & archive commands (`memory_get`, `memory_set`, `archive_search`)
- SCD64 checksum commands (`scd64_decode`, `scd64_scan`)

Registry writes are atomic (temp + rename) so a power loss never corrupts
your Golden Curves. Run the round-trip harness with:
`python3 -m pytest tests/test_turboquant.py`

## Troubleshooting & Runtime Notes

- Node.js ≥ 18 required for `turboquant_plugin.js`
- Atomic registry writes prevent corruption on power loss
- Offline mode: TUI still launches; TurboQuant commands report "offline"
- Common issues: missing embeddings, stale `.goldenpack` files, Node not in PATH
- Rebuild Turbovec after ingesting new nichepacks: `python3 embeddings/build_turbovec.py`

## Key Files

| File | Purpose |
|------|---------|
| `tui/ui/app.py` | Main TUI entrypoint |
| `tui/services/turboquant_service.py` | TurboQuant bridge |
| `tui/core/command_parser.py` | Command + skill routing |
| `turboquant_plugin.js` | Node.js microservice |
| `embeddings/build_turbovec.py` | Domain vectorizer builder |
