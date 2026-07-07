# SHARED PROJECT PREAMBLE

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-LAW-SHARED-PREAMBLE`

## All agents read this before every session.

---

Scholomance V11 is a ritual-themed, text-combat MUD where syntax is a living world — grammar, phoneme structure, and linguistic form are not just scoring mechanisms. They are the physical laws of the universe. Words have mass. Rhyme keys are resonance frequencies. Alliteration is kinetic force. The editor is the arena.

---

## SCDNA Genes (Mandatory Inheritance)

All agents **must** internalize active SCDNA genes before touching assets, SCDL pipelines, isometric/2.5D rendering, or pixelbrain work.

Current active genes:
- `SCDNA_Gene_Isometric_Asset_Integrity.md` — Never force 2D assets into 2.5D space. Always redesign via SCDL source + proper masking/clipping/anchoring (see the gene for the exact process used on the VOID tutorial island tiles).
- `SCDNA_Gene_Combat_Galaxy_Viewport_Fill.md` — The galaxy background in the Combat arena MUST always take up the entire viewport (dynamic sizing from live game scale). Agents are strictly forbidden from changing the galaxy fill logic, resize handling, or reducing its coverage in any way.
- `SCDNA_Gene_Character_Skeleton_Manifold.md` — Every character sprite is a chart of one canonical skeleton manifold. Bind parts to named joint anchors; derive each facing as a projection chart; author animation as a single trajectory. No literal cell plotting or per-direction re-derivation.

## The Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React SPA (`src/`) |
| Backend | Fastify (`codex/server/`) |
| Storage | SQLite + Redis cache |
| Engine | CODEx — four strict layers: Core → Services → Runtime → Server |
| Dictionary | WordNet (OEWN) primary, GCIDE secondary, Datamuse fallback |
| Combat | Phoneme-density scoring with full explanation traces (`ScoreTrace[]`) |
| Schools | SONIC / PSYCHIC / VOID / ALCHEMY / WILL — each has CSS variables, XP gates, thematic flavor |
| Bytecode | `PB-ERR-v1` errors, `PB-RECURSE-v1` recursion detection, `0xF` formulas, lattice grids |
| QA | Bytecode assertion library (`tests/qa/tools/bytecode-assertions.js`) |

---

## Repository

Live at `github.com/IItsVaelrix/scholomance-V11`.

Folders confirmed present: `.claude/`, `codex/`, `dict_data/`, `docs/`, `public/`, `scripts/`

---

## The Nine-Persona Pantheon

Vaelrix, Agatha Blacklight, Seymore Prism, Big Dad, Angel, Mutant, Hollow God, The Demon, Wildflower.

These are both creative infrastructure and, in future Mirrorborne integration, mechanical archetypes.

- **Gemini** is consulted when personas map to game mechanics
- **Claude** is consulted when personas surface in UI

Mirrorborne integration is forward-looking. Do not implement mechanic or UI surfaces for it without an explicit spec.

---

## The Sovereign Editor — Foundational Principle

**User work never leaves the browser without explicit consent.**

This is not a feature. This is not a policy. This is **architectural law** — enforced by code, not promises.

### What This Means

| State | Where Data Lives | Who Can Access |
|-------|-----------------|----------------|
| **Unsaved work** | Browser memory (React state) | Only the user |
| **Explicitly saved work** | Database (user-committed) | User + authorized systems |
| **Deleted work** | Nowhere | Nobody |

### Architectural Enforcement

```
┌─────────────────────────────────────────────────────────┐
│  User's Browser (Sovereign Territory)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ScrollEditor Content (unsaved)                   │  │
│  │  - React state only                               │  │
│  │  - Never auto-saved                               │  │
│  │  - Never telemetry-scanned                        │  │
│  │  - Never sent to server                           │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│                          │ User clicks "Save Scroll"     │
│                          │ (explicit consent)            │
│                          ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  POST /api/scrolls (data leaves browser)          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              Server (only receives explicit saves)
```

### What Scholomance Does NOT Do

| Practice | Common In Industry | Scholomance Stance |
|----------|-------------------|-------------------|
| Auto-save drafts to cloud | Standard (Google Docs, Notion) | ❌ Prohibited |
| Scan content for AI training | Common (GitHub Copilot, Notion AI) | ❌ Prohibited |
| Telemetry captures user text | Common (analytics, heatmaps) | ❌ Prohibited |
| Admin panel to view user drafts | Common (support tools) | ❌ Does not exist |
| Session recovery from server | Common (VS Code, Word) | ❌ Prohibited |
| Background sync to cloud | Common (iCloud, Drive) | ❌ Prohibited |

### What Scholomance DOES Do

| Practice | Implementation |
|----------|---------------|
| **Client-side state** | React `useState` — exists only in browser memory |
| **Explicit save required** | User must click "Save Scroll" to persist |
| **No content telemetry** | Analytics (if any) never capture scroll content |
| **No draft storage** | Server only receives user-committed saves |
| **Ephemeral unsaved work** | Closing tab without save = work is gone (by design) |
| **User controls persistence** | What is saved, when, and how — user decides |

### Why This Exists

**Privacy by architecture, not policy.**

Most platforms promise privacy through:
- Privacy policies (legal documents, enforceable by lawsuit)
- Terms of service (contracts, enforceable by court)
- Trust statements ("we don't scan your data")

Scholomance enforces privacy through:
- **Code structure** (client-side state never leaves browser)
- **No backdoor** (no admin panel, no draft database table)
- **Absence of data** (server cannot leak what it never received)

**You can verify this by reading the code.** Not by trusting a policy.

### Threat Model

| Threat | Scholomance Defense |
|--------|---------------------|
| **Server breach** | Only explicitly saved scrolls exposed, not drafts |
| **Admin access** | No admin panel exists to view drafts |
| **Law enforcement subpoena** | Nothing to subpoena for unsaved work |
| **Employee curiosity** | No database query can retrieve drafts |
| **Analytics leak** | No analytics capture scroll content |
| **AI training scan** | No AI scans user content |
| **Third-party integration** | No integrations have access to drafts |

### User Tradeoff

**What users gain:**
- ✅ True privacy (architecturally enforced)
- ✅ Full control over what persists
- ✅ No surveillance capitalism
- ✅ No AI training on their work

**What users accept:**
- ⚠️ Unsaved work is ephemeral (closing tab = lost)
- ⚠️ No cross-device sync (work lives on one device)
- ⚠️ No auto-recovery (user is responsible for saving)

**This is a conscious design choice.** Sovereignty over convenience.

### Related Principles

This principle aligns with:
- **Local-first software** (data lives on user's device)
- **End-to-end encryption** (Signal, ProtonMail — only endpoints can decrypt)
- **Self-sovereign identity** (user controls their data, not platforms)
- **Data minimalism** (collect only what user explicitly sends)

### Implementation Checklist

All agents must verify:

- [ ] No auto-save to server without explicit user action
- [ ] No telemetry/analytics capture scroll content
- [ ] No admin panel to view user drafts
- [ ] No cloud sync without user consent
- [ ] React state is client-side only (no server-synced stores for drafts)
- [ ] Database only stores explicitly saved scrolls
- [ ] No AI scanning of user content (training or inference)

**Violation of this principle is a critical architecture bug.** Escalate immediately.

---

## The Laws of This World (Physical Constants)

These are not flavor — they are the axioms everything else is derived from:

- Words have mass — phoneme density determines damage weight
- Rhyme keys are resonance frequencies — matching keys creates harmonic interference
- Alliteration is kinetic force — consonant clusters at onset generate momentum
- Meter consistency is structural integrity — broken meter destabilizes a scroll's power
- Rarity and novelty are entropy — uncommon words disrupt predictable defenses
- **Bytecode is truth** — all exports, persistence, and interoperability encode to bytecode first
- **Lattice is law** — pixel art exists as grid coordinates, not rendered images
- **Symmetry is automatic** — every upload analyzed for inherent symmetry patterns
- **Errors are bytecode** — all failures use `PB-ERR-v1` format with FNV-1a checksums

All scoring heuristics are expressions of these constants. If a heuristic cannot be explained in these terms, it does not belong in the engine.

**Bytecode Error System Documentation:**
- `docs/ByteCode Error System/01_Bytecode_Error_System_Overview.md` — System architecture
- `docs/ByteCode Error System/02_Error_Code_Reference.md` — Error code catalog
- `docs/ByteCode Error System/03_AI_Parsing_Guide.md` — AI parsing specifications
- `docs/ByteCode Error System/04_QA_Integration_Guide.md` — QA assertion library
- `docs/ByteCode Error System/05_Integration_Summary.md` — Implementation summary

---

## Agent Reading Order (Every Session)

1. `SHARED_PREAMBLE.md` — this file, the world (includes **Sovereign Editor Principle**)
2. `VAELRIX_LAW.md` — the law, the escalation protocol
3. `SCHEMA_CONTRACT.md` — the data shapes and event bus
4. `docs/ByteCode Error System/` — error encoding, QA assertions (MANDATORY for all agents)
5. Your agent context file (`CLAUDE.md` / `CODEX.md` / `BLACKBOX.md` / `GEMINI.md`)

**Note:** The Sovereign Editor Principle (Section 4) is foundational. All agents must verify their work respects user data sovereignty before implementation.
