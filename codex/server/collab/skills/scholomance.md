---
name: scholomance
description: Master Scholomance data download — invoke at session start for complete world law, architecture, and subsystem knowledge. Covers CODEx, schools, ScholoTime, PixelBrain, G2P, music video, MCP, and all agent laws.
---

# Scholomance Master Knowledge Base

Invoke this skill once per session before doing any Scholomance work. Everything an AI agent needs to operate as a professional on this system is below.

---

## Fast Context

**World soul:** Scholomance is a ritual-themed text-combat MUD where syntax is a living physics. Words have mass (phoneme density = damage weight). Rhyme keys are resonance frequencies. Alliteration is kinetic force. The editor is the arena. Every design decision must feel like opening a spellbook.

**Repository:** `github.com/IItsVaelrix/scholomance-V11` / local at `/home/deck/Downloads/Scholomance-V12-main`

**Stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React SPA (Vite) — `src/` |
| Backend | Fastify — `codex/server/` |
| Storage | SQLite (`abyss.sqlite`) + Redis cache |
| Engine | CODEx — 4 strict layers: Core → Services → Runtime → Server |
| Dictionary | WordNet (OEWN) primary, GCIDE secondary, Datamuse fallback |
| Video | Remotion v4.0.477 — `src/video/` |
| Tests | Vitest — `tests/` only (not `src/__tests__/`) |

**CODEx Layer Law (no layer may skip):**
1. **Core** — Pure functions: schemas, tokenization, phoneme analysis, scoring heuristics, combat rules
2. **Services** — Adapters: dictionary, persistence, transport (normalize external sources)
3. **Runtime** — Orchestration: caching, rate limits, dedupe, event emission
4. **Server** — Authority: auth, database, combat resolution, XP awards

**Three immutable rules every agent must know:**
1. **Server is truth.** `COMBAT_PREVIEW` is decorative. `COMBAT_RESOLVED` is law. Never make a client authoritative over a game mechanic outcome.
2. **Pure analysis never touches effects.** Scoring/phoneme/combat logic = zero DOM, zero GSAP, zero audio. If a logic function touches the render layer it is in the wrong layer.
3. **Sovereign Editor.** Unsaved scroll content lives only in browser memory. Never auto-save to server. No telemetry. No AI scanning of user content. Violation is a critical architecture bug.

---

## Section 1: Schools of Magic

Eight schools. Each maps to phoneme families (vowels), has a color, a glyph, an atmosphere profile, and an XP unlock gate.

| School | Color | Glyph | Unlock XP | Atmosphere |
|--------|-------|-------|-----------|-----------|
| SONIC | `#1ab4a8` (teal) | ♩ | 0 | High aurora (0.9), zero scanlines |
| PSYCHIC | `#3b82f6` (blue) | ◬ | 250 | High aurora (0.8) |
| VOID | `#94a3b8` (zinc) | ∅ | 1,500 | Near-zero aurora (0.15), heavy vignette (0.92), faint scanlines |
| ALCHEMY | `#ec4899` (pink) | ⚗ | 8,000 | Highest aurora (1.1), hyper-saturation (105) |
| WILL | `#ef4444` (red) | ⚡ | 25,000 | High aurora (1.0) |
| NECROMANCY | `#22c55e` (green) | ☠ | 100,000 | Moderate aurora (0.6), low saturation (55) |
| ABJURATION | `#06b6d4` (cyan) | ◇ | 500,000 | Soft aurora (0.5), soft vignette (0.50) |
| DIVINATION | `#eab308` (gold) | ◉ | 2,000,000 | Good aurora (0.85) |

**VOWEL_FAMILY_TO_SCHOOL** — ARPAbet vowel family → school (import from `codex/core/constants/schools.js`):

```
IY → PSYCHIC    IH → SONIC     EY → ALCHEMY   AE → WILL
AA → NECROMANCY AO → DIVINATION OW → ABJURATION UW → ABJURATION
AH → WILL       AX → VOID      AW → DIVINATION EH → WILL
AY → PSYCHIC    OY → ALCHEMY   UH → VOID       ER → SONIC
UR → SONIC
```

Aliases: `OH→ABJURATION`, `OO→VOID`, `EE→PSYCHIC`, `AI→PSYCHIC`, `OI→ALCHEMY`, `OU→ABJURATION`

**Determining school from a word:** Strip stress digits from ARPAbet (remove `0/1/2` suffix). Prefer the *stressed* vowel (phoneme ending in `1` or `2`) if present; otherwise take the first vowel. Fall back to `VOID` if no vowel maps.

**School weights from a distribution:**
```js
import { computeSchoolWeights, computeDominantSchool } from 'codex/core/constants/schools.js';
const weights = computeSchoolWeights(vowelFamilyDistribution); // normalized 0-1
const dominant = computeDominantSchool(weights); // highest-weight school ID
```

**SCHOOL_PRIORITY** (tie-breaking in UI — highest stakes wins):
```
VOID > NECROMANCY > WILL > ALCHEMY > SONIC > PSYCHIC > ABJURATION > DIVINATION
```

---

## Section 2: ScholoTime

**File:** `codex/core/scholotime/scholotime.math.js`

All timing in Scholomance is derived from this module. Never compute beat state with custom arithmetic — always use these functions.

```js
// Frame number → milliseconds
frameIndexToTimeMs(frameIndex, fps)           // (frame * 1000) / fps

// Milliseconds → beat state (immutable object)
resolveBeatState(timeMs, { bpm, offsetMs })
// Returns: { index, exactBeat, phase, durationMs }
// index = Math.floor(exactBeat)
// phase = fractional position within the current beat [0,1)
// offsetMs = lead-in (silence before beat 0)

// Beat state → bar state
resolveBarState(beatState, timeSignature?)
// Default 4/4. Returns: { index, exactBar, phase, beatsPerBar }

// Easing types
applyEasing(progress, type)
// types: 'linear', 'smoothstep', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
//        'easeInCubic', 'easeOutCubic', 'easeInOutCubic'

clamp01(value)  // Math.max(0, Math.min(1, value))
```

**useBeatClock hook** (Remotion, `src/video/useBeatClock.ts`):
```ts
const clock = useBeatClock({ bpm, offsetMs });
// Returns: { timeMs, beat: BeatState, bar: BarState }
// Uses useCurrentFrame() + useVideoConfig() internally
```

**Key invariants:**
- `offsetMs = leadInS * 1000` — seconds of silence before the first beat
- `beatDurationMs = 60000 / bpm`
- Same input always produces the same beat state (determinism law)

---

## Section 3: PixelBrain

**Mantra:** *Bytecode first. Render second. Never simulate.*

PixelBrain is a bytecode-driven visual synthesis engine for pixel art sprites, SVG characters, and animated game assets. It is **not** a physics engine, not a particle simulator, not a ray tracer.

### Three Laws of PixelBrain Animation

**1. Absolute Time Is Sovereign**
All rotation/animation uses absolute time, never delta. Delta accumulates error and chokes on frame drops.
```js
// CORRECT
rotation = radiansPerSecond * timeSeconds;

// WRONG
rotation += delta * speed;
```

**2. Bytecode Channels Drive All Motion**
```js
getBytecodeAMP(time, CHANNEL)  // O(1) lookup, zero simulation
// Channels: ROTATION, GLOW, FLICKER, SCALE, OPACITY
```

**3. Pre-Generate, Never Compute Per-Frame**
Patterns (particles, waves) are pre-generated and cached at init. Runtime selects from cache. Zero per-frame generation cost.

### Rotation Formula (memorize)
```js
export function getRotationAtTime(absoluteTimeMs, bpm, degreesPerBeat = 90) {
  const radiansPerSecond = (degreesPerBeat * Math.PI / 180) * (bpm / 60);
  return (radiansPerSecond * absoluteTimeMs * 0.001) % (2 * Math.PI);
}
```

### Character Generation Pipeline

```
character-spec.js        — CharacterSpec: { id, name, schools[], bodyType, hair, face, clothing, ... }
character-foundry.js     — resolveCharacter(spec) → CharacterParts
part-profile-library.js  — resolves profile for each body part slot
character-to-svg.js      — renders CharacterParts → SVG string
character-bytecode-compiler.js — encodes to .pbrain bytecode
```

**Part profile slots:** body, face, hair, clothing, accessory, detail. Each slot has profiles (e.g., `hair.braids`, `face.sharp`) with color variants, geometry specs, and SDF parameters.

**SDF lattice:** Each profile includes a signed-distance-field lattice for accurate boundary rendering. Lattice grids are coordinate systems (immutable), not images.

**Aseprite codec** (`aseprite-binary-codec.js`) — encodes sprite sheets to `.aseprite` binary for game engine import.

**Bytecode output format:**
- `.pbrain` — canonical PixelBrain bytecode, source of truth
- `.json` — diagnostics / human-readable dump
- `.preview.txt` / `.preview.colored.ansi.txt` — terminal preview

### Architecture Pattern
```
Blueprint (PDR / spec) → Bytecode Blueprint Bridge (compiler)
  → AMP Runtime (O(1) lookup) → Phaser / SVG / Remotion renderer
```

---

## Section 4: CODEx Engine — G2P & Phonology

### G2P Jury (`codex/core/phonology/g2p/`)

The G2P (grapheme-to-phoneme) system resolves a word's ARPAbet phoneme sequence via jury consensus across multiple candidate generators.

```js
import { runG2PJury } from 'codex/core/phonology/g2p/g2p.adapter.js';
const { verdict } = await runG2PJury('WORD');
// verdict.winner.phonemes: string[]  — ARPAbet tokens
// verdict.confidence: number         — 0-1 jury consensus score
```

**Pipeline:** word → candidate generators → jury scoring → `verdict.winner.phonemes`

### Vowel Wheel (`codex/core/phonology/vowelWheel.js`)

Organizes ARPAbet vowel families into a circular structure based on acoustic proximity. Used for rhyme scoring — phonetically similar vowels score partial rhyme credit. `FAMILY_IDENTITY` folds alias vowels to canonical families.

### Phonetic Similarity (`codex/core/phonology/phoneticSimilarity.js`)

Scores acoustic similarity between phoneme sequences. Powers rhyme detection and school weight computation.

### Rhyme Engine (`codex/core/rhyme-astrology/deepRhyme.engine.js`)

Deep rhyme analysis: perfect rhyme, family rhyme, near rhyme. Returns `ScoreTrace[]` — structured explanation traces for every scoring decision.

### Scoring Heuristics

All heuristics must be expressible in world-law terms (phoneme density, resonance frequency, kinetic force, structural integrity, entropy). If a heuristic cannot be explained this way, it does not belong in the engine.

---

## Section 5: Music Video System

**Purpose:** Kinetic professional typography music videos rendered via Remotion, words colored by phoneme school, synced to BPM via ScholoTime.

**Role model:**
- **PixelBrain** = Authority (visual layer, character rendering, atmosphere)
- **ScholoTime** = Presenter (timing engine, beat/bar state)
- **BPM** = Director (governs the timing of everything visual)

### AlignmentSidecar Schema (`scholomance.align.v1`)

**File:** `src/video/types.ts`

```ts
interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  beat: { index: number; phase: number; bar: number; barPhase: number };
  school: string;          // one of 8 SCHOOLS keys
  confidence?: number;     // 0-1, WhisperX alignment score
  manualOffsetMs?: number; // override per-word timing without re-running alignment
}

interface AlignmentSidecar {
  schemaVersion: "scholomance.align.v1";
  trackId: string;         // must match GrimoireTrack.id
  bpm: number;
  offsetMs: number;        // leadInS * 1000
  lyricsHash: string;      // sha256 hex, 16 chars — stale detection
  audioUrl?: string;
  audioHash?: string;      // sha256 hex, 16 chars — cache key
  generatedAt: string;     // ISO timestamp
  wordTimings: WordTiming[];
}
```

**Sidecar files live at:** `src/pages/Visualiser/tracks/<trackId>.align.json`

### GrimoireTrack + Alignment

```ts
interface GrimoireTrack {
  id: string;
  title: string;
  audioUrl: string;
  lyrics: string[];        // one line per element
  duration: number;        // seconds
  pacing: { bpm: number; leadInS?: number };
}

// Extended with alignment:
type GrimoireTrackWithAlignment = GrimoireTrack & {
  wordTimings?: WordTiming[];
  alignmentMeta?: Omit<AlignmentSidecar, 'wordTimings'>;
}
```

**Merge:** `mergeTrackAlignment(track, sidecar?)` — silent passthrough if no sidecar; throws on `schemaVersion` or `trackId` mismatch.

### Remotion Component Stack

```
Root.tsx          → <Composition id="KineticLyricsVideo" fps=30 width=1920 height=1080>
KineticLyricsVideo.tsx
  ├── useBeatClock({ bpm, offsetMs })          → clock
  ├── <Audio src={track.audioUrl} />
  ├── <PixelBrainStage words={all} currentMs={clock.timeMs} />  → atmosphere bg
  └── activeWords.map(w => <KineticWord wordTiming={w} clock={clock} beatDurationMs />)
```

**Active word window:** `startMs < nowMs + 500 && endMs > nowMs - 2000` — prevents dense rap from flooding every frame.

**KineticWord:** Each word renders with:
- Color from `SCHOOLS[wordTiming.school].color`
- Scale-up entrance easing over first 25% of word duration
- Glyph ghost bloom pulsing at beat frequency while word is active
- `isBarDownbeat = wordTiming.beat.barPhase < 0.1` (uses *word's* barPhase, not clock's)

**PixelBrainStage atmosphere:**
```ts
// Trailing 2000ms window of past words → most frequent school → atmosphere color
// Tie-breaking: VOID > NECROMANCY > WILL > ALCHEMY > SONIC > PSYCHIC > ABJURATION > DIVINATION
getDominantSchoolFromWindow(words, currentMs)
```

### WhisperX Alignment Pipeline

**Script:** `scripts/align-track.mjs` — run with `npx tsx scripts/align-track.mjs <trackId>`

```
1. Download audio → .tmp/align/<trackId>.mp3 (cached, sha256 keyed)
2. whisperx --align_model WAV2VEC2_ASR_LARGE_LV60K_960H → word-level timestamps + scores
3. Per word: runG2PJury → stressed vowel → stripStress() → VOWEL_FAMILY_TO_SCHOOL → school
4. resolveBeatState(startMs, { bpm, offsetMs }) + resolveBarState() → beat annotation
5. Write AlignmentSidecar → src/pages/Visualiser/tracks/<trackId>.align.json
6. Emit confidence report for words scoring < 0.8
```

**Confidence < 0.8:** Ad libs, doubled vocals, and Suno pronunciation drift. Fix with `manualOffsetMs` per word, no re-run needed.

### Remotion Commands

```bash
npx remotion studio src/video/index.ts     # Studio preview (port 3030)
npx tsx scripts/render-music-video.mjs <trackId>  # Render to file
```

Port is 3030 (8080 is Fastify backend). Config at `remotion.config.ts`.

---

## Section 6: Bytecode Error System

**All errors use `PB-ERR-v1` format.** No custom error formats anywhere in the system.

```
PB-ERR-v1-{CATEGORY}-{SEVERITY}-{MODULE}-{CODE}-{CONTEXT_B64}-{CHECKSUM}
```

**Categories:** `TYPE`, `VALUE`, `RANGE`, `STATE`, `HOOK`, `EXT`, `COORD`, `COLOR`, `NOISE`, `RENDER`, `CANVAS`, `FORMULA`

**Severity:** `FATAL`, `ERROR`, `WARN`, `INFO`

**Checksum:** FNV-1a hash of the preceding fields. AI-parsable — deterministic for the same error context.

**Additional schemas:**
- `PB-RECURSE-v1` — recursion bug detection
- `0xF`-prefixed — pixel art formulas
- Lattice grids — sprite coordinate systems (immutable)

**QA assertions** (`tests/qa/tools/bytecode-assertions.js`): `assertEqual`, `assertTrue`, `assertInRange`, `assertType` — all produce PB-ERR-v1 bytecode on failure.

**Full docs:** `docs/ByteCode Error System/` (01–05)

---

## Section 7: MCP / Collab System

### Boot Order (required before any coordinated work)

```bash
npm run dev:server        # 1. Start Fastify backend
npm run mcp:collab        # 2. Start MCP bridge (stdio)
```

### MCP Bridge

**Entrypoint:** `codex/server/collab/mcp-bridge-entry.js`

**Client config:**
```json
{
  "mcpServers": {
    "scholomance-collab": {
      "command": "node",
      "args": ["--env-file=.env", "codex/server/collab/mcp-bridge-entry.js"]
    }
  }
}
```

### Minimum Verification Sequence

1. Read `collab://status`
2. Call `mcp_scholomance_collab_status_get`
3. Call `mcp_scholomance_collab_agent_register`
4. Call `mcp_scholomance_collab_agent_heartbeat`

### Agent Registration (HTTP / CLI)

```bash
node scripts/connect-collab.js connect \
  --agent-id <id> --name "<name>" --role <ui|backend|qa> --capabilities <list>
```

### Canonical Role Map

| Agent | Domain | Collab Role | Capabilities |
|-------|--------|-------------|-------------|
| Claude | UI, visuals, a11y | `ui` | `jsx,css,framer-motion,a11y` |
| Gemini | Backend, tests, CI | `backend` | `node,fastify,vitest,playwright,ci,debugging` |
| Codex | Schemas, architecture | `backend` | `schemas,architecture,layer-law,mcp` |
| Angel | Arbitration, law | `backend` | `override,arbitration,release` |

**Role law:** Only `ui`, `backend`, `qa` are valid collab roles. Do not invent new role strings.

### Core MCP Tools

```
mcp_scholomance_collab_agent_register / heartbeat / delete
mcp_scholomance_collab_task_create / assign / update / delete / get
mcp_scholomance_collab_lock_acquire / lock_release
mcp_scholomance_collab_pipeline_create / advance / fail / get
mcp_scholomance_collab_message_send / list / delete
mcp_scholomance_collab_codebase_hybrid_search       ← semantic search (preferred)
mcp_scholomance_collab_codebase_list_files / get_neighbors
mcp_scholomance_collab_immunity_scan_file / get_status
mcp_scholomance_collab_diagnostic_scan / summary / violations
mcp_scholomance_collab_skill_vaelrix_law_audit
mcp_scholomance_collab_skill_scholomance_feedback
mcp_scholomance_collab_skill_scholomance_knowledge

# High Inquisitor Debug Ritual (new)
mcp_scholomance_collab_skill_vaelrix_law_debug (vaelrix_law_debug / law_debug / high_inquisitor_debug / debug_oracle)
Produces the exact mandated Debug Report format + DebugTraceIR from vaelrix_law_debug.md. Supports modes A-F. Includes Scholomance-specific audits (Chroma, TrueSight, Dimension, Session, determinism, recursion).

# Additional high-value discovery & action tools (filled 2026-06)
mcp_scholomance_collab_agent_list / task_list / pipeline_list / lock_list
mcp_scholomance_collab_fs_propose_patch (records justified edit intent under lock/task; does not auto-apply)
mcp_scholomance_collab_law_get (targeted retrieval from VAELRIX_LAW + preamble)
```

**MCP resources:** `collab://agents`, `collab://tasks`, `collab://locks`, `collab://activity`, `collab://pipelines`, `collab://status`

### Immune System

Before committing any code change, run:
```
mcp_scholomance_collab_immunity_scan_file
```

Innate immunity rejects entropy and security anti-patterns. Adaptive immunity detects similarity to known high-risk fractures. If a scan reveals a violation, seal the fracture before proceeding.

### Semantic Search Law

Use `mcp_scholomance_collab_codebase_hybrid_search` (TurboQuant) for all codebase analysis. Grep is prohibited for source file analysis. Exception: grep is permitted for logs and non-source files when semantic indexing is unavailable.

---

## Section 8: Agent Team & Domain Map

### Domain Ownership

| Domain | Owner | Writes To |
|--------|-------|-----------|
| UI surface, components, CSS, animations | Claude | `src/pages/`, `src/components/`, `*.css`, `tests/visual/` |
| Backend, debugging, tests, CI, encyclopedia | Gemini | `codex/server/`, `codex/runtime/`, `codex/services/`, `codex/core/` (impls), `tests/`, `.github/workflows/`, `docs/scholomance-encyclopedia/` |
| Schemas, layer law, engine architecture | Codex | `SCHEMA_CONTRACT.md`, `codex/` (arch + schemas), `src/lib/`, `src/hooks/` (contracts), `src/data/`, `scripts/` |
| Law, arbitration, final decisions | Angel | VAELRIX_LAW.md |

**No agent outranks another.** Domain boundaries are the law. Claude does not defer to Gemini. Gemini does not defer to Codex.

### Shared Boundaries (coordinate before acting)

- Combat result rendering — Claude renders, Codex defines shape, Gemini implements
- School theme generation — Codex defines schema, Gemini runs script, Claude consumes output
- `src/data/` tuning — Codex publishes schema, Gemini tunes values

### Escalation Format

When a domain conflict arises, stop and issue:

```
ESCALATION:
- Conflict: [what overlaps — name both domains]
- My domain says: [your position, grounded in your jurisdiction]
- Other domain says: [their likely position]
- Option A: [path + tradeoff]
- Option B: [path + tradeoff]
- Recommendation: [labeled as opinion, not decision]
- Needs: Angel's decision
```

An escalation is not a failure. Agents who resolve domain conflicts unilaterally are violating law.

### Nine Personas

Vaelrix, Agatha Blacklight, Seymore Prism, Big Dad, Angel, Mutant, Hollow God, The Demon, Wildflower.

Creative infrastructure and future Mirrorborne mechanical archetypes. Do not implement mechanic or UI surfaces for Mirrorborne without an explicit spec. Gemini handles persona → mechanic mapping; Claude handles persona → UI surface.

---

## Section 9: VAELRIX_LAW Critical Subset

**Full law:** `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` (v1.15) — read it before major architectural decisions.

**Law 1 — No Hierarchy:** No model outranks another. Domain = jurisdiction.

**Law 3 — Schema Is Sovereign:** `SCHEMA_CONTRACT.md` defines all data shapes. Do not invent parallel schemas. Request new shapes from Codex. Current version: 1.26.

**Law 5 — Pure Analysis Never Touches Effects:** Logic functions = zero DOM, zero GSAP, zero audio. If it touches the render layer it is in the wrong CODEx layer.

**Law 6 — Determinism Is Non-Negotiable:** Same input → same output. No hidden randomness in scoring pipelines. No timestamp-seeded variation in heuristics.

**Law 7 — Security Before Features:** Allow-list validation on all new input surfaces per `ARCH_CONTRACT_SECURITY.md`. Security gates the PR, not the milestone. Auth tokens in httpOnly cookies only. No `eval()`, no `new Function()`.

**Law 8 — Bytecode Is Priority:** All persistent state, exports, and interoperable data use bytecode encoding. Immutability is default — functions return new values, never mutate inputs. Exception: performance-critical loops may mutate with `// MUTATION: [reason]` comment.

**Law 9 — Component Instance Isolation:** No global mutable variables in UI components. All layout contexts and caches in `useRef` — never module-scoped. Pure helper functions accept the instance cache as their first parameter.

**Law 10 — Stacking Sovereignty:** No hardcoded z-indexes > 1. Use semantic constants from `SCHEMA_CONTRACT.md`: `Z_BASE`, `Z_ABOVE`, `Z_OVERLAY`, `Z_SYSTEM`.

**Law 11 — BUG REPORT AUDIT:** When Angel issues the command "BUG REPORT AUDIT", stop current work and write an encyclopedia entry for the most recently fixed bug. Format:

```markdown
# BUG-[YYYY-MM-DD]-[SHORT_NAME]

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-[BUG_CODE]`

## Bug Description / Root Cause / Thought Process / Changes Made / Testing / Lessons Learned
```

Save to `docs/scholomance-encyclopedia/` and commit with the bytecode search code in the message. No fix is complete without its story.

**Law 12 — Law Evolution:** Every agent reading VAELRIX_LAW must evaluate whether the law needs updating. Propose via `ESCALATION: LAW_UPDATE_PROPOSAL` block.

**Law 16 — Antigen Regeneration:** Every fixed bug documented in private `memory/` must be prepared for public infusion into the collective immune system.

1. Tag the memory file with `# INFUSION_ALLOW` and describe the symptoms + cure
2. Run `npm run memory:infuse` to vectorize and inject into the clerical-raid substrate
3. No agent may ignore a documented fix when encountering a regression — if the genes light up (semantic resonance detected), halt and apply the documented cure immediately

Private memory = individual scar. Antigen Regeneration = collective immunity. Share the scars so the system never suffers the same wound twice.

**Law 17 — Semantic Search Mandate:** Use TurboQuant semantic search, not grep, for source file analysis.

**Law 18 — Immune System:** Run immunity scan before every commit.

**Sovereign Editor Principle (SHARED_PREAMBLE):** Unsaved scroll content lives only in React state. Never auto-saves. Never telemetried. Never AI-scanned. Explicit user action (Save Scroll) is the only path to persistence. Server cannot leak what it never received.

---

## Section 10: SCHEMA_CONTRACT Key Shapes

**Owned by Codex. Read by all. Version 1.26.**

### VerseIR

Canonical intermediate representation of analyzed text. Produced by `src/lib/truesight/` and consumed by UI, scoring, and PixelBrain.

```ts
interface WordAnalysis {
  word: string;
  phonemes: string[];           // ARPAbet
  vowelFamily: string;          // dominant vowel family
  school: string;               // derived from vowelFamily
  rhymeKey: string | null;      // for Truesight rhyme color registry
  // optional: verseIRAmplifier.pixelBrain (PixelBrainPayload)
}
```

### Z-Index Tiers

```ts
Z_BASE    = 1    // base content layer
Z_ABOVE   = 10   // overlays on base content
Z_OVERLAY = 100  // modals, drawers, tooltips
Z_SYSTEM  = 1000 // system-level (debug, notifications)
```

### GrimoireTrack (Visualiser)

```ts
interface GrimoireTrack {
  id: string;          // UUID
  title: string;
  audioUrl: string;    // Suno CDN URL
  lyrics: string[];
  duration: number;    // seconds
  pacing: {
    bpm: number;
    leadInS?: number;  // seconds of silence before beat 0
  };
}
```

### Bytecode Schemas (approved list)

- `PB-ERR-v1` — Error encoding (all agents)
- `PB-RECURSE-v1` — Recursion detection
- `0xF`-prefixed — Pixel art formulas
- `PB-XP-v1` — BytecodeXP vaccine artifacts
- `PB-PRED-v1` — Ritual prediction artifacts
- `scholomance.align.v1` — Music video word alignment sidecar
- `scholomance/eq-preset` (v2) — ScholoCandy DSP presets (base32/sha256/crc32)
- Lattice grids — Sprite coordinate systems

---

## Section 11: Key Commands

```bash
# Dev
npm run dev                    # Frontend (localhost:5173)
npm run dev:server             # Backend (localhost:3000)
npm run mcp:collab             # MCP bridge

# Quality gates (run before committing)
npm run typecheck              # tsc across all tsconfigs
npm run test                   # Vitest
npm run lint                   # ESLint max-warnings=0
npm run verify:css-tokens      # CSS token parity check

# Music video
npx remotion studio src/video/index.ts          # Preview (port 3030)
npx tsx scripts/align-track.mjs <trackId>       # WhisperX forced alignment
npx tsx scripts/render-music-video.mjs <trackId> # Render to file

# PixelBrain generation
node scripts/generate-pixelbrain-scimitar.mjs   # Example: scimitar item

# Collab
node scripts/connect-collab.js connect --agent-id <id> --name "<name>" --role <role>
node scripts/connect-collab.js heartbeat --agent-id <id> --status online

# Encyclopedia
# Bug docs: docs/scholomance-encyclopedia/ (on BUG REPORT AUDIT command)
# PDRs: docs/scholomance-encyclopedia/PDR-archive/
# PIRs: docs/scholomance-encyclopedia/post-implementation-reports/
```

---

## Section 12: Typography & Design System

```
Scroll / combat text:  Georgia, serif — var(--text-xl), line-height: 1.9, white-space: pre-wrap
Navigation / labels:   Space Grotesk
Data / phoneme / code: JetBrains Mono
```

**Truesight Mode** — `ScrollEditor.jsx`:
- Active: `textarea { color: transparent; caret-color: gold }` + overlay renders `analyzedWords` as colored word buttons
- Inactive: overlay hidden, textarea normal

**Effects:** Aurora background, vignette, scanlines, glass morphism — subtle, atmospheric. Framer Motion spring physics for combat reveals. Respect `prefers-reduced-motion`.

**Anti-patterns:** No decorative elements disconnected from world law. No purple-gradient generic AI aesthetics. No loading spinners (use skeleton shimmer). No alert boxes (use in-world notification surfaces). No modal dialogs for non-destructive actions.

---

## Section 13: Listen Page — Ambient Audio System

**Location:** `src/pages/Listen/`

The Listen page is the ambient music/radio experience — school-tuned stations, an orb-based UI, and Phaser-rendered visual scenes. It is Claude's domain for rendering and Codex's domain for the audio analysis schema.

### Components & Scenes

| Component | File | Z-Index | Purpose |
|-----------|------|---------|---------|
| `AlchemicalLabBackground` | `AlchemicalLabBackground.tsx` | Z_BASE (0) | Background hexagram + atmosphere (Phaser scene) |
| `CrystalBallVisualizer` | `CrystalBallVisualizer.tsx` | — | Sacred geometry orb — procedural school-specific patterns |
| `HolographicEmbed` | `HolographicEmbed.jsx` | Z_ABOVE (25) | Music player UI overlay |
| `SignalChamberConsole` | `SignalChamberConsole.tsx` | Z_OVERLAY (100) | React mount for Phaser console UI |
| `ScholomanceStation` | `ScholomanceStation.tsx` | Z_OVERLAY (100) | Station selection menu |

**Phaser scenes:** `AlchemicalLabScene` (rotating hexagram, ambient particles), `CrystalBallScene` (orb art), `SignalChamberScene` (console rendering).

### Key Hooks & State

```ts
useAmbientPlayer()    // Audio playback, school tuning, BPM
// Returns: { signalLevel, isPlaying, isTuning, activeStation, ... }
//   signalLevel: 0-1 float — drives visual intensity of all scenes
//   isPlaying: boolean — audio active
//   isTuning: boolean — school transition in progress
//   activeStation: ScholomanceStation metadata

useCurrentSong()      // Current track metadata, playback progress, album art
```

### View Modes

`ListenPage.tsx` tracks `viewMode: 'CHAMBER' | 'STATION'`

- `'CHAMBER'` — orb + console view (default)
- `'STATION'` — ScholomanceStation menu overlay

`triggerIgnition()` — orb click handler that switches `viewMode → 'STATION'`

### Bytecode Animation in Listen Scenes

The Listen page Phaser scenes use the PixelBrain animation primitives directly:

```js
getBytecodeAMP(time, CHANNEL)        // GLOW, FLICKER, SCALE, OPACITY, ROTATION
getRotationAtTime(timeMs, bpm, 90)   // Absolute time → radians for orb rotation
```

`signalLevel` from `useAmbientPlayer` modulates visual intensity — it is the bridge between the audio state and the visual layer. Never read audio state directly in Phaser scenes; consume `signalLevel` only.

### School Theming

Each station maps to a school. On school switch (`isTuning = true`), CSS variables transition to the new school's atmosphere parameters. CSS class pattern:
```css
.school-VOID    { --aurora-intensity: 0.15; --vignette: 0.92; }
.school-ALCHEMY { --aurora-intensity: 1.1;  --saturation: 105; }
```
School styles generated by `node scripts/generate-school-styles.js` (Codex runs, Claude consumes).

---

*This skill synthesizes: SHARED_PREAMBLE.md + VAELRIX_LAW.md v1.15 + SCHEMA_CONTRACT.md v1.26 + schools.js + scholotime.math.js + pixelbrain/* + src/video/* + CLAUDE.md + GEMINI.md + CODEX.md. For authoritative detail on any section, read the source file. This skill reflects the state as of 2026-06-15.*
