# Scholomance V13

Scholomance is a ritual-themed language combat universe where words are weapons. This repository contains the full V13 monorepo: the React/Vite IDE game client, the Fastify backend and CODEx linguistic engines, the Godot runtime world, a portfolio of AI subsystems (NLP chatbot, literary GPT, DivTube pipeline), and the **Vaelrix Cortex ForceField** — a deterministic, multi-brain agent routing and safety layer used by coding agents.

## What Is Scholomance?

Players craft scrolls (verses) scored by phoneme density, rhyme quality, syllabic stress, and eight literary heuristics across competing schools of magic. The same codebase also serves as a testbed for deterministic AI orchestration, multi-agent collaboration, and self-diagnosing runtime health.

## Core Systems

### Game Client
- **Read** — IDE-style grimoire editor with Truesight phoneme analysis, rhyme diagramming, and real-time heuristic scoring.
- **Listen** — Ambient audio station featuring the live Ambience Mixer, school-themed atmospheres, unlock progression, and local track uploads.
- **Watch** — Video-focused landing interface.
- **Combat** — Turn-based verse combat with live resource HUDs (Health, Mana, AP, MP) and predictive pathfinding, resolved by the CODEx engine and the Judiciary.

### Linguistic & AI Engines
- **CODEx Engine** — Tokenization, phoneme mapping, syllable/stress extraction, 8-heuristic scoring, and combat resolution.
- **Hidden Harkov Model** — Deterministic token state machine that infers linguistic hidden states (stress anchors, terminal anchors, function gates) and feeds stage weights into the Judiciary.
- **Rhyme Astrology** — Constellation-based rhyme relationship mapping across the lexicon (feature-flagged).
- **Scholomance Dictionary** — Offline SQLite lexicon built from CMU Pronouncing Dictionary + Open English WordNet.
- **Super Corpus** — FTS5-indexed literary corpus built from curated verse, Project Gutenberg, and WordNet examples.

### Agent & Runtime Infrastructure
- **PixelBrain & SCDL Compiler** (`codex/core/pixelbrain/`) — Declarative vector and material transmutation pipeline for generating Phaser, Aseprite, and UI assets dynamically.
- **Vaelrix Cortex ForceField** (`steamdeck_brain/vaelrix_forcefield/`) — Deterministic routing layer for coding agents.
  - Multi-brain Amplifier registry (CODE, TEST, RISK, ARCHITECTURE, UI, LORE, DETERMINISM, etc.).
  - Search Governor and Tool Governor to prevent redundant or unsafe tool use.
  - TurboQuant chunk dispatch with brain-specific lenses.
  - PixelBrain Router — converts brain bytecodes into `BytecodeHealth` signals.
  - Determinism Auditor — verifies reproducibility, stable ordering, and banned tools.
  - Personality-aware brain weighting — scales brain influence by task classification and priority.
  - SQLite persistence with migration-tracked schema.
- **Scholomance Collab Control Plane** — MCP-compatible multi-agent task board, locks, bug reports, and diagnostic memory.
- **Immunity / Stasis QA** — Pre-commit and CI rituals that freeze UI bytecode, run lint/typecheck/security audits, and reject regressions.
- **Godot Runtime** — Procedural world scenes (`VoidmetalCaveWorld`, `SurfaceWorld`, `QbitWorld`) and golden combat tests.

### Satellite Subsystems
- **DivTube Downloader** — YouTube analysis, title/tag/thumbnail engines, content research, and Shorts repurposing.
- **NLP Chatbot** — FastAPI-based conversational agent with local Python backend.
- **Literary GPT** — Fine-tuned verse generation and criticism pipeline.
- **OrChat** — Local-first chat runtime.

## Schools of Magic

Five base schools gate progression, each with vowel family affinities:

| School | Element | Vowel Affinities |
|---|---|---|
| SONIC | Sound/vibration | A, AO |
| PSYCHIC | Mind/perception | IH, EY |
| ALCHEMY | Transformation | AE, UW |
| WILL | Force/intent | OW |
| VOID | Absence/entropy | IY |

Three unlockable schools (Divination, Necromancy, Abjuration) extend the system.

## Tech Stack

- **Frontend**: React 18, React Router, Vite 7, Framer Motion, CSS custom properties for school theming.
- **Backend**: Fastify 5, Zod validation, better-sqlite3, Redis (production sessions).
- **Game Runtime**: Godot 4.6+ (native and Proton workflows).
- **Analysis**: PhonemeEngine (CMU dict), DeepRhyme engine, 8-heuristic scoring, Hidden Harkov Model.
- **Agent Layer**: Python 3.10+, Vaelrix ForceField, SQLite persistence, MCP bridge.
- **Storage**: SQLite (user, collab, dictionary, corpus, ForceField DBs), persistent disk in production.
- **Testing**: Vitest + Testing Library, Playwright visual regression, Python `unittest`.

## Repository Map

```text
src/pages/                    Route pages (Watch, Listen, Read, Auth, Collab)
src/components/               Shared UI (AmbientOrb, Navigation, VowelFamilyPanel, etc.)
src/lib/                      Client engines (phonology, deepRhyme, syntax, Harkov model, PLS)
src/hooks/                    React hooks (progression, scoring, predictor, ambient player)
src/data/                     Static data (schools, palettes, vowel mappings)
codex/core/                   Domain logic (schemas, scoring, heuristics, combat, trie)
codex/runtime/                Runtime orchestration (pipelines, cache, event bus)
codex/services/               Adapter layer (dictionary, transport, persistence)
codex/server/                 Fastify server, auth, API routes, adapters, collab services
codex/cli/                    CLI tools (scholo-immune, diagnostics)
steamdeck_brain/              Vaelrix Cortex ForceField and substrate engine
godot_project/                Godot scenes, scripts, and world assets
divtube_downloader/           YouTube analysis and content pipeline
nlp_chatbot/                  Conversational AI backend and terminal client
literary_gpt/                 Verse generation and criticism tooling
OrChat/                       Local-first chat runtime
tests/                        Unit, integration, accessibility, visual, e2e tests
scripts/                      Build scripts (dictionary, corpus, security, Godot exports)
security/                     Security policy and QA artifacts
public/                       Static assets, corpus.json, ritual_dataset.jsonl
```

## Quick Start

### Prerequisites

- Node.js 20.20.2+ and npm 10.8.2+ (Volta/pnpm 10.33.4 supported)
- Python 3.10+ (for dictionary/corpus builds and the ForceField)
- Godot 4.6+ (for native Godot workflows; Proton path available)
- Redis (production sessions; optional locally)
- git-lfs (for LFS-tracked assets and hooks)

### Local Development

```bash
npm ci
cp .env.example .env        # or Copy-Item .env.example .env on PowerShell
npm run dev:full             # starts backend + Vite frontend
```

Open `http://localhost:5173`. Vite proxies `/api`, `/auth`, `/collab`, and `/audio` to `localhost:8080`.

### Vaelrix ForceField (Python)

```bash
cd steamdeck_brain
PYTHONPATH=. python -m unittest discover -s vaelrix_forcefield/tests -v
```

You can also use the ForceField directly from Python:

```python
from vaelrix_forcefield import BrainBridge

bridge = BrainBridge()
result = bridge.ask(
    "Refactor the search governor to use deterministic ordering",
    classification="structural",
    priority="safety",
    persist=True,
)
print(result["next_action"])
print(result["personality_weights"])
print(result["health_signals"])
```

### Production

```bash
npm run build
npm start                    # runs ritual-init.js then Fastify server
```

`ritual-init.js` automatically builds the dictionary and corpus on first boot if missing from persistent storage. When `ENABLE_RHYME_ASTROLOGY=true`, it also builds the rhyme-astrology artifact bundle into the resolved output directory before Fastify starts.

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_SECRET` | Production | generated in dev | Session signing secret (32+ chars). |
| `NODE_ENV` | No | `development` | Runtime mode. |
| `PORT` | No | `8080` | Fastify port. |
| `HOST` | No | `0.0.0.0` | Fastify bind host. |
| `TRUST_PROXY` | No | `false` | Fastify `trustProxy` setting. |
| `REDIS_URL` | Production | `redis://localhost:6379` | Redis connection for sessions. |
| `USER_DB_PATH` | No | `./scholomance_user.sqlite` | User/progression/scrolls database. |
| `COLLAB_DB_PATH` | No | `./scholomance_collab.sqlite` | Collaboration state database. |
| `SCHOLOMANCE_DICT_PATH` | No | unset | Path to `scholomance_dict.sqlite` for lexicon routes. |
| `SCHOLOMANCE_CORPUS_PATH` | No | unset | Path to `scholomance_corpus.sqlite` for corpus routes. |
| `AUDIO_STORAGE_PATH` | No | `./public/audio` | Uploaded audio file directory. |
| `AUDIO_ADMIN_TOKEN` | Production | unset | Admin token for audio upload routes. |
| `ENABLE_DEV_AUTH` | No | `false` | Dev-only auth bypass. |
| `ENABLE_COLLAB_API` | No | `true` dev / `false` prod | Enables authenticated `/collab/*` and `/mcp` routes. |
| `ENABLE_RHYME_ASTROLOGY` | No | `false` | Enables `/api/rhyme-astrology/*` routes. |
| `RHYME_ASTROLOGY_OUTPUT_DIR` | No | `./dict_data/rhyme-astrology` locally, `/var/data/rhyme-astrology` in production | Directory holding rhyme-astrology artifacts. |
| `ENABLE_REDIS_SESSIONS` | No | `false` | Force Redis sessions in dev. |
| `VITE_USE_CODEX_PIPELINE` | No | `true` | Client CODEx pipeline toggle. |
| `VITE_USE_SERVER_PANEL_ANALYSIS` | No | `true` | Client panel analysis toggle. |
| `VAELRIX_FORCEFIELD_DB` | No | `./vaelrix_forcefield.sqlite` | ForceField SQLite persistence path. |

## NPM Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (frontend only). |
| `npm run dev:full` | Backend + Vite frontend together. |
| `npm start` | Production: ritual-init + Fastify server. |
| `npm run build` | Production frontend bundle. |
| `npm test` | Vitest suite. |
| `npm run lint` | ESLint (zero warnings). |
| `npm run typecheck` | TypeScript check across all tsconfigs. |
| `npm run test:visual` | Playwright visual regression (Chromium). |
| `npm run test:qa` | Vitest QA suite. |
| `npm run test:qa:stasis` | UI stasis bytecode QA test. |
| `npm run security:qa` | Security QA checks. |
| `npm run security:audit` | Dependency audit. |
| `npm run immune:scan:all` | Full immunity pre-commit scan. |
| `npm run diagnostic:scan` | Run PixelBrain diagnostic scan. |
| `npm run build:rhyme-astrology:index` | Build Rhyme Astrology artifacts. |
| `npm run db:setup` | Reset and seed local user DB. |
| `npm run godot:native` | Launch Godot native editor. |
| `npm run godot:world` | Launch VoidmetalCaveWorld scene. |
| `npm run vaelrix` | Launch the Vaelrix agent daemon. |
| `npm run chatbot` | Start the NLP chatbot API. |

## API Routes

### Health
- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`

### Auth
- `POST /auth/register`, `/auth/login`, `/auth/logout`
- `GET /auth/csrf-token`, `/auth/me`

### Progression & Scrolls (auth required)
- `GET|POST|DELETE /api/progression`
- `GET /api/scrolls`, `POST|DELETE /api/scrolls/:id`

### Lexicon (session required)
- `GET /api/lexicon/lookup/:word`, `/api/lexicon/search`, `/api/lexicon/suggest`
- `POST /api/lexicon/lookup-batch`, `/api/lexicon/validate-batch`

### Corpus
- `GET /api/corpus/search?q=`, `/api/corpus/context/:id`

### Analysis
- `POST /api/analysis/panels` — unified scoring, rhyme, vowel, literary device analysis
- `GET /api/word-lookup/:word`, `POST /api/word-lookup/batch`
- `GET /api/rhymes/:word`

### Rhyme Astrology (feature-flagged)
- `GET /api/rhyme-astrology/query?text=&mode=word|line`

### Audio (admin token required in production)
- `GET /api/audio-files`, `POST /api/upload`, `DELETE|PATCH /api/audio-files/:filename`

### Collab (auth required when enabled)
- `/collab/*` — Task board, agent registry, bug reports, diagnostics, locks, memory, messaging.
- `/mcp` — Model Context Protocol bridge endpoint.

## Testing

### JavaScript / TypeScript
```bash
npm test -- --run                              # unit + integration
npm run test:qa                                # QA gate
npm run test:visual                            # visual regression (Chromium)
npm run test:visual:full                       # full browser matrix
npm run lint
npm run typecheck
npm run security:qa
```

### Python
```bash
cd steamdeck_brain
PYTHONPATH=. python -m unittest discover -s vaelrix_forcefield/tests -v
```

### Godot
```bash
npm run godot:test:combat-golden
npm run godot:world:check
```

## Deployment

### Render

`render.yaml` defines a Docker web service with a 500GB persistent disk at `/var/data`. Set `REDIS_URL` and `SESSION_SECRET` in Render dashboard. When rhyme astrology is enabled, point `RHYME_ASTROLOGY_OUTPUT_DIR` at `/var/data/rhyme-astrology`. Health checks use `/health/ready`.

### Docker

```bash
docker build -t scholomance .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e SESSION_SECRET="<32+ chars>" \
  -e AUDIO_ADMIN_TOKEN="<token>" \
  -e REDIS_URL="redis://host:6379" \
  -e SCHOLOMANCE_DICT_PATH="/var/data/scholomance_dict.sqlite" \
  -e SCHOLOMANCE_CORPUS_PATH="/var/data/scholomance_corpus.sqlite" \
  -e USER_DB_PATH="/var/data/scholomance_user.sqlite" \
  -v scholomance-data:/var/data \
  scholomance
```

## Vaelrix ForceField Architecture

The ForceField is a Python subsystem for deterministic agent execution. Key modules:

| Module | Purpose |
|---|---|
| `brain_bridge.py` | High-level `BrainBridge.ask()` pipeline entrypoint. |
| `amplifier_registry.py` | Declarative registry of AmplifierBrains. |
| `amplifier_router.py` | Selects active brains from query signals. |
| `amplifier_executor.py` | Runs active brains concurrently. |
| `council_arbiter.py` | Merges, deduplicates, and ranks brain findings. |
| `personality_weighting.py` | Task-personality brain weight computation. |
| `tool_governor.py` | Gates `read_file`, `replace_file_content`, `run_tests`, etc. |
| `search_governor.py` | Prevents redundant or reasonless searches. |
| `determinism_auditor.py` | Audits reproducibility and tool safety. |
| `turboquant/` | Chunk dispatch and brain-specific lenses. |
| `pixelbrain/router.py` | Routes brain bytecodes to BytecodeHealth. |
| `persistence.py` | SQLite save/load for ForceField sessions. |

## Documentation

- `AGENTS.md` — Active AI agent contract and read order.
- `SHARED_PREAMBLE.md` — Repository-wide behavioral preamble.
- `VAELRIX_LAW.md` — Determinism, documentation, and escalation laws.
- `SCHEMA_CONTRACT.md` — Data/schema contracts.
- `CLAUDE.md` — AI agent context and ownership boundaries.
- `AI_ARCHITECTURE_V2.md` — Multi-agent architecture and CODEx layer contracts.
- `codex/README.md` — CODEx module details.
- `docs/operations/DEPLOY_RENDER.md` — Render deployment guide.
- `docs/operations/DICT_BUILD.md` — Offline dictionary build workflow.
- `docs/scholomance-encyclopedia/PDR-archive/vaelrix-upgrade.pdr.md` — ForceField implementation PDR.
- `docs/architecture/` — Unlockable schools, dictionary proxy, PLS integration.

## License

All rights reserved. Scholomance and Vaelrix are original properties of the project author.
