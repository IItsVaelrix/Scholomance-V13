# PDR — SCDNA Constructive Silhouette Recall Layer

**Status:** Approved design, pre-implementation (owner tightenings applied 2026-07-04)  
**Date:** 2026-07-04
**Author:** Scholomance Developer (asset-pipeline insight)  
**Archive:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-04-scdna-constructive-silhouette-recall-pdr.md`  
**Depends on:** [`SCDNA.pdr.md`](SCDNA.pdr.md), [`scdl-v1-pdr.md`](scdl-v1-pdr.md), PixelBrain Construction Line Microprocessor (`codex/core/pixelbrain/construction-line-microprocessor.js`), `PB-CONSTRUCTION-SKELETON-v1`, `PB-SILH-BLUEPRINT-v1` (`.silh`), SCDNA proactive injection hook (`docs/superpowers/plans/2026-06-28-scdna-proactive-injection-hook.md`)  
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SCDNA-CONSTRUCT-SILHOUETTE`

---

## 1. Problem Statement

PixelBrain asset quality is now gated at the **outcome** layer but not accelerated at the
**construction** layer.

The forge already produces and audits finished silhouettes:

```txt
PB-SILH-BLUEPRINT-v1 (.silh)     → sealed outcome contours (front/side/top)
pixelbrain-forge-gate.mjs          → shadow-match audits against .silh
pixelbrain-silhouette-scan.mjs     → reference PNG → traced outcome mould
```

The forge also already **generates** constructive geometry locally when an `ITEM-SPEC-v1`
embeds a `construction` block or when SketchAMP runs:

```txt
construction-line-microprocessor.js  → center, rings, radials, axes → 00_Reference cells
PB-CONSTRUCTION-SKELETON-v1          → additive skeleton artifact in forge bundles
image-to-construction-skeleton.js    → reverse inference from finished PNG (post-hoc)
```

What is missing is **instant archetype recall**:

```txt
"I'm forging a void ice greatsword"
  → today: semantic search, memory chunks, or re-deriving geometry from scratch
  → desired: keyed recall of the constructive silhouette scaffold for weapon.greatsword
              before any structural pixels are inked
```

The dominant failure mode in PixelBrain mentorship remains geometric drift at the
**construction stage**, not shading:

> Once rings and center are wrong, no amount of glow or metal shading saves the silhouette.

SCDNA was built to solve a parallel problem in Vaelrix memory: **retrieve with
instructions attached, not adjacent semantic chunks**. This PDR extends SCDNA into
PixelBrain geometry so constructive silhouettes are inherited operational memory,
not rediscovered labor on every new item.

---

## 2. Product Vision

Add an **information layer** to SCDNA — a gene family that decodes to constructive
silhouette scaffolds keyed by item archetype.

```txt
User / agent intent: "make a chestplate" / "weapon.greatsword" / "prop.torch"
  ↓
SCDNA detector matches PB-CONSTRUCT-SILH-* gene (not broad search)
  ↓
Gene decoder resolves archetype + payload pointer + handoff instruction
  ↓
Constructive silhouette artifact loads (deterministic, checksum-verified)
  ↓
SketchAMP / Construction Line Microprocessor emits 00_Reference guide cells
  ↓
Artist or AMP inks 10_Structure against scaffold
  ↓
Per-item .silh (outcome) audits the finished variant at forge gate
```

Mythically:

```txt
.silh        = the body the item must become (verdict)
.construct    = the bones you draw first (scaffold)
SCDNA gene    = the spell that recalls the bones by name
```

---

## 3. Scope

| In scope | Out of scope (deferred) |
|----------|-------------------------|
| New SCDNA gene family `PB-CONSTRUCT-SILH-*` | Auto-generating genes from finished art (observed-behavior tagging forbidden by SCDNA non-goals) |
| `ARCHETYPE_INDEX` module (Phase 1 mandatory) + registry derived from it | Full ML silhouette search / embedding similarity for shape recall |
| Ambiguous-match rejection (`AMBIGUOUS_ARCHETYPE`) | VARIANT-tier / material-compound recall keys |
| Constructive payload contract `PB-CONSTRUCT-SILHOUETTE-v1` | Replacing `.silh` outcome blueprints |
| Decoder handoff to SketchAMP + ITEM-SPEC `construction` injection | Real-time Aseprite plugin (bridge export only in v1) |
| Gene checksum verification (`.pbrain` / JSON payload) | SCDL `construct` grammar block (separate PDR if needed) |
| Proactive injection surfacing scaffold summary in agent context | Runtime `forbiddenDrift` enforcement inside Phaser |
| Vitest coverage for decode + handoff determinism | Collab cross-agent gene sync beyond committed registry |
| SCHEMA_CONTRACT registration notice | Per-item outcome `.silh` auto-authoring from constructive gene |

**Scope guard:** this PDR wires **recall and handoff** only. It does not change forge
shading, SCDL compiler passes, or craft-gate tolerance math.

---

## 4. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Constructive ≠ outcome** — separate contracts, separate tolerances | Construction guides may be 1–2px loose; `.silh` gates are strict. Collapsing them causes either brittle authoring or weak QA |
| **Keyed archetype recall, not embedding search** | SCDNA's strength is deterministic decode. `weapon.greatsword` must always resolve the same scaffold under the same decoder version (SCDNA G5) |
| **Payload is `PB-CONSTRUCT-SILHOUETTE-v1`, not prose** | Machine-actionable geometry spec; English `expression` field is derived, not authoritative |
| **Reuse `construction-v1` spec shape** where applicable | `construction-line-microprocessor.js` already normalizes center/rings/radials/axes. Do not invent a second guide vocabulary |
| **Character archetypes use `PB-CONSTRUCTION-SKELETON-v1` anchors** | Chibi/humanoid scaffolds already exist in `character-construction-skeleton.js`. The recall layer points at them; it does not redefine joint math |
| **Gene points to artifact path + digest** | Same checksum discipline as `.pbrain` verifier in the injection-hook plan. Stale or tampered payloads fail closed |
| **Three recall tiers** | `ARCHETYPE` (class-level), `VARIANT` (school/material modifier), `INSTANCE` (one sealed item). v1 ships ARCHETYPE only; VARIANT is sealed off (see §6.3) |
| **`ARCHETYPE_INDEX` is the single throat of truth** | One committed map owns every legal `{class, archetype}` key, gene id, payload path, and `scaffoldKind`. CLI, decoder, registry, tests, and docs consume it — no duplicate archetype strings elsewhere |
| **Ambiguous archetype keys fail closed** | `weapon` + `sword` does not resolve unless `weapon.sword` exists as a canonical index row. No silent fallback to `greatsword`, `dirk`, or `shortsword` |
| **Injection emits scaffold summary, not full coordinate dump** | Avoid prompt bloat; full payload loads via tool/script seam |
| **Detector may use broad tokens; decoder may not** | Injection `signals` may include search synonyms (e.g. `sword`), but decode/CLI resolution accepts only `ARCHETYPE_INDEX` keys |

---

## 5. Layer Model (authoritative)

```txt
┌─────────────────────────────────────────────────────────────┐
│  SCDNA Gene (PB-CONSTRUCT-SILH-*)                           │
│  identity + routing + imperative + payload pointer          │
└──────────────────────────┬──────────────────────────────────┘
                           │ decode
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PB-CONSTRUCT-SILHOUETTE-v1  (constructive recall artifact) │
│  archetype, grid, views, construction spec OR skeleton      │
└──────────────────────────┬──────────────────────────────────┘
                           │ handoff
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  SketchAMP / Construction Line Microprocessor               │
│  00_Reference guide cells (non-final palette color)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ ink
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  10_Structure … 99_Final                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ audit
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PB-SILH-BLUEPRINT-v1 (.silh) — per-item outcome gate       │
└─────────────────────────────────────────────────────────────┘
```

### 5.1 Constructive silhouette (recall target)

Loose geometry scaffold. Tolerance: guides may deviate ±2px from nominal without
gene invalidation. Lives in `00_Reference`. Never exported as final pixels unless
deliberately promoted.

### 5.2 Outcome silhouette (verification target)

Sealed contour mould. Tolerance: per-view integer snap per `SilhouetteBlueprint.tolerance`.
Lives in craft gate. Authored per item variant after forging, not per archetype class.

---

## 6. `ARCHETYPE_INDEX` — Single Throat of Truth (Phase 1 mandatory)

**Law:** every legal constructive recall path flows through one committed module.
No duplicate archetype strings in CLI flags, decoder logic, SCDNA registry entries,
tests, or docs. Those surfaces import or derive from `ARCHETYPE_INDEX` only.

**Module:** `codex/core/pixelbrain/archetype-index.js`  
**Export:** `ARCHETYPE_INDEX` (frozen object) + `resolveArchetypeKey(key)` + `listArchetypeKeys()`

### 6.1 Index row shape

```typescript
interface ArchetypeIndexRow {
  key: string;              // canonical lookup: "weapon.greatsword"
  class: string;            // ITEM-SPEC class
  archetype: string;        // ITEM-SPEC archetype (dotted ids allowed: "chibi.human")
  geneId: string;           // PB-CONSTRUCT-SILH-* registry id
  payloadPath: string;      // path under repo root to PB-CONSTRUCT-SILHOUETTE-v1 JSON
  scaffoldKind: "construction-v1" | "PB-CONSTRUCTION-SKELETON-v1";
  tier: "ARCHETYPE";        // v1: only ARCHETYPE rows permitted in index
  detectorSignals?: string[]; // optional search synonyms; never used for decode
}
```

### 6.2 v1 seed rows (authoritative)

```txt
ARCHETYPE_INDEX
  weapon.greatsword      → geneId PB-CONSTRUCT-SILH-WEAPON-GREATSWORD-v1
                           payload constructive-silhouettes/weapon.greatsword.v1.json
                           class weapon, archetype greatsword, scaffoldKind construction-v1

  weapon.dirk            → geneId PB-CONSTRUCT-SILH-WEAPON-DIRK-v1
                           payload constructive-silhouettes/weapon.dirk.v1.json
                           class weapon, archetype dirk, scaffoldKind construction-v1

  weapon.pickaxe         → geneId PB-CONSTRUCT-SILH-WEAPON-PICKAXE-v1
                           payload constructive-silhouettes/weapon.pickaxe.v1.json
                           class weapon, archetype pickaxe, scaffoldKind construction-v1

  armor.chestplate       → geneId PB-CONSTRUCT-SILH-ARMOR-CHESTPLATE-v1
                           payload constructive-silhouettes/armor.chestplate.v1.json
                           class armor, archetype chestplate, scaffoldKind construction-v1

  armor.helm             → geneId PB-CONSTRUCT-SILH-ARMOR-HELM-v1
                           payload constructive-silhouettes/armor.helm.v1.json
                           class armor, archetype helm, scaffoldKind construction-v1

  armor.boots            → geneId PB-CONSTRUCT-SILH-ARMOR-BOOTS-v1
                           payload constructive-silhouettes/armor.boots.v1.json
                           class armor, archetype boots, scaffoldKind construction-v1

  shield.round           → geneId PB-CONSTRUCT-SILH-SHIELD-ROUND-v1
                           payload constructive-silhouettes/shield.round.v1.json
                           class shield, archetype round, scaffoldKind construction-v1

  character.chibi.human  → geneId PB-CONSTRUCT-SILH-CHARACTER-CHIBI-HUMAN-v1
                           payload constructive-silhouettes/character.chibi.human.v1.json
                           class character, archetype chibi.human
                           scaffoldKind PB-CONSTRUCTION-SKELETON-v1

  prop.torch             → geneId PB-CONSTRUCT-SILH-PROP-TORCH-v1
                           payload constructive-silhouettes/prop.torch.v1.json
                           class prop, archetype torch, scaffoldKind construction-v1

  prop.obelisk           → geneId PB-CONSTRUCT-SILH-PROP-OBELISK-v1
                           payload constructive-silhouettes/prop.obelisk.v1.json
                           class prop, archetype obelisk, scaffoldKind construction-v1
```

**Not in index (v1):** `weapon.sword`, `weapon.shortsword`, `weapon.void-ice-greatsword`,
or any `VARIANT` / material / school compound key.

New rows require: index entry + payload artifact + registry gene whose `payload.path`
and `id` match the index row exactly. CI test asserts registry ↔ index bijection.

### 6.3 VARIANT tier sealed off (v1 hard law)

VARIANT recall is deferred and **must not be implemented accidentally**.

```txt
"void ice greatsword"  →  recalls weapon.greatsword.v1 ONLY
void, ice, school, glow, material, damage identity  →  downstream forge passes (palette, SCDL, enchant)
```

Forbidden in v1:

- `weapon.greatsword.void-ice` index rows
- `tier: "VARIANT"` payloads
- detector logic that composes archetype + adjective into a new scaffold key
- gene signals that encode material identity (`void`, `ice`, `cyan_glow`) as recall keys

Rationale: taxonomy grows horns before the skeleton can walk. Material flavor is not
constructive geometry.

### 6.4 Ambiguous Match Law (decoder + CLI)

`resolveArchetypeKey(input)` accepts only:

1. A canonical index `key` (`weapon.greatsword`), or
2. A `{ class, archetype }` pair that maps to exactly one index row.

**Must reject (fail closed, error code `AMBIGUOUS_ARCHETYPE`):**

```txt
{ class: "weapon", archetype: "sword" }     # sword is not canonical unless weapon.sword row exists
{ class: "weapon" }                         # class alone is never sufficient
"greatsword"                                # bare token without class is never sufficient
```

**Must reject when multiple index rows share a `detectorSignals` synonym:**

```txt
distill_query → "sword"
two+ rows list "sword" in detectorSignals  →  no injection; log AMBIGUOUS_ARCHETYPE
```

**Must not:** silently choose `greatsword` when the user said `sword`. SCDNA purity
requires explicit canonical keys or unambiguous `{class, archetype}` pairs only.

Orphan payloads without index rows are inert. Orphan index rows without payloads fail
decode. Registry genes not listed in index fail CI.

---

## 7. Contracts

### 7.1 SCDNA gene shape (extends existing registry entry)

New gene `kind`: `PB-CONSTRUCT-SILHOUETTE`. Additional fields on the committed
`scdna/compiler.json` entry:

```json
{
  "id": "PB-CONSTRUCT-SILH-WEAPON-GREATSWORD-v1",
  "kind": "PB-CONSTRUCT-SILHOUETTE",
  "status": "active",
  "confidence": 0.95,
  "freshness": 1.0,
  "signals": ["pixelbrain", "weapon", "greatsword", "forge", "silhouette", "construction"],
  "archetypeKey": "weapon.greatsword",
  "imperative": "Recall constructive greatsword scaffold before inking Structure. Do not substitute outcome .silh as a build guide.",
  "requiredChecks": [
    "Load PB-CONSTRUCT-SILHOUETTE-v1 payload by digest",
    "Hand off to SketchAMP / ITEM-SPEC construction block",
    "Keep guides on 00_Reference layer only"
  ],
  "forbiddenDrift": [
    "Do not eyeball center or blade ratio when archetype gene matches",
    "Do not use .silh contours as construction guides",
    "Do not skip constructive recall for matched weapon.greatsword intent"
  ],
  "payload": {
    "contract": "PB-CONSTRUCT-SILHOUETTE-v1",
    "path": "codex/core/pixelbrain/constructive-silhouettes/weapon.greatsword.v1.json",
    "digest": "<sha256-hex-over-canonical-json>"
  },
  "expression": "When forging a greatsword, load the canonical 3:1 blade scaffold (center, grip axis, pommel ellipse) before structural pixels.",
  "route": {
    "brains": ["PIXELBRAIN_BRAIN", "CODE_BRAIN"],
    "amplifiers": ["SketchAMP", "ConstructionLineMicroprocessor"]
  }
}
```

### 7.2 `PB-CONSTRUCT-SILHOUETTE-v1` payload

```typescript
interface ConstructiveSilhouetteRecall {
  contract: "PB-CONSTRUCT-SILHOUETTE-v1";
  schemaVersion: "0.1.0";
  id: string;                    // e.g. "weapon.greatsword.v1"
  tier: "ARCHETYPE";             // v1: ARCHETYPE only
  class: string;                 // ITEM-SPEC class
  archetype: string;             // ITEM-SPEC archetype
  canvas: { width: number; height: number };
  grid?: { width: number; height: number; depth: number }; // voxel items
  scaffoldKind: "construction-v1" | "PB-CONSTRUCTION-SKELETON-v1";
  construction?: ConstructionSpecV1;   // when scaffoldKind = construction-v1
  skeleton?: CharacterSkeleton;        // when scaffoldKind = PB-CONSTRUCTION-SKELETON-v1
  proportions?: Record<string, number>; // e.g. { bladeRatio: 0.65, guardWidth: 0.4 }
  views?: {
    front?: { bbox: [number, number, number, number] };
    side?: { bbox: [number, number, number, number] };
  };
  handoff: {
    target: "SketchAMP" | "ITEM-SPEC" | "SCDL-REFERENCE";
    layer: "00_Reference";
    guideColor: "#00E5FF";
  };
  digest: string;
}
```

`ConstructionSpecV1` reuses the normalized shape from `normalizeConstructionSpec()`:

```txt
version: construction-v1
center: { x, y }
rings: [{ radius, role? }]
radials: { count, offsetDegrees? }
axes: boolean
bbox?: { x, y, w, h }   // v1 additive: outer silhouette bounding guide
```

### 7.3 Decoder output (handoff packet)

Pure functions:

```txt
resolveArchetypeKey(key | { class, archetype }) → ArchetypeIndexRow | throw
decodeConstructiveSilhouetteGene(gene) → HandoffPacket
```

`decodeConstructiveSilhouetteGene` MUST call `resolveArchetypeKey(gene.archetypeKey)` first.
Registry entries without `archetypeKey` matching an index row fail validation at compile time.

Handoff packet shape:

```typescript
interface ConstructiveSilhouetteHandoff {
  geneId: string;
  archetype: { class: string; archetype: string };
  itemSpecConstruction: ConstructionSpecV1 | null;
  skeleton: CharacterSkeleton | null;
  referenceCells: Coordinate[];      // from applyConstructionLines([], spec)
  imperative: string;
  requiredChecks: string[];
  forbiddenDrift: string[];
}
```

`referenceCells` are computed at decode time deterministically — never stored in the
gene registry (store the formula, not the pixels; Wand/SCDL precedent).

---

## 8. Recall Paths

### 8.1 Agent session (proactive injection)

Extends `vaelrix_forcefield.scdna.inject`:

```txt
UserPromptSubmit
  → distill_query(task)
  → detect_gene_matches(registry) including PB-CONSTRUCT-SILH-* kind
  → if match: decode payload digest + emit directive block:
      - archetype id
      - center + major proportions (human-readable)
      - tool invocation: `node scripts/pixelbrain-recall-construct.mjs --archetype weapon.greatsword`
      - requiredChecks + forbiddenDrift from gene
  → if no match: fall through to existing pixelbrain law genes only
```

Injection block MUST NOT embed full `referenceCells` arrays (prompt size law).

### 8.2 Forge CLI (deterministic script)

New script `scripts/pixelbrain-recall-construct.mjs`:

```bash
node scripts/pixelbrain-recall-construct.mjs --archetype weapon.greatsword [--json] [--inject-item-spec path.json]
```

Responsibilities:

1. `resolveArchetypeKey(--archetype)` against `ARCHETYPE_INDEX` (not fuzzy search).
2. Load index row → gene id → payload path.
3. Verify payload `digest` against file on disk.
4. Run `applyConstructionLines([], construction)` or attach skeleton.
5. Emit JSON handoff packet or merge `construction` into an `ITEM-SPEC-v1` stub.

Exit codes: `0` success, `2` digest mismatch, `3` unknown archetype, `4` decode error,
`5` ambiguous archetype (`AMBIGUOUS_ARCHETYPE`).

### 8.3 Foundry integration (optional v1.1)

`forgeItemAsset()` accepts `recallGeneId` option. When present and `spec.construction`
is absent, decoder pre-fills `construction` before SketchAMP stage. Existing specs with
explicit `construction` win (gene is advisory, not override).

---

## 9. File Structure (implementation target)

```txt
codex/core/pixelbrain/
  archetype-index.js                    # ARCHETYPE_INDEX — single throat of truth (Phase 1)
  constructive-silhouette-recall.js     # decode, verify, handoff (pure; imports index only)
  constructive-silhouettes/             # committed ARCHETYPE payloads
    weapon.greatsword.v1.json
    weapon.dirk.v1.json
    shield.round.v1.json
    character.chibi.human.v1.json
    ...

scripts/
  pixelbrain-recall-construct.mjs       # CLI entry

steamdeck_brain/vaelrix_forcefield/scdna/
  constructive_silhouette.py            # gene kind handler for inject + decoder hook
  compiler.json                         # PB-CONSTRUCT-SILH-* entries (digest-updated)

tests/core/pixelbrain/
  constructive-silhouette-recall.test.js

tests/codex/ or steamdeck_brain/vaelrix_forcefield/tests/
  test_constructive_silhouette_gene.py  # decode + inject surfacing
```

---

## 10. Implementation Phases

### Phase 1 — `ARCHETYPE_INDEX` + contract + decoder (gate)

- [ ] Implement `archetype-index.js` with full v1 seed rows (§6.2). **No other module hardcodes archetype strings.**
- [ ] Register `PB-CONSTRUCT-SILHOUETTE-v1` + `ArchetypeIndexRow` in `SCHEMA_CONTRACT.md` (notice: additive).
- [ ] Implement `constructive-silhouette-recall.js` (imports index only; `resolveArchetypeKey` + decode + digest verify + handoff).
- [ ] Implement Ambiguous Match Law (§6.4): `weapon.sword`, bare `greatsword`, class-only queries fail with `AMBIGUOUS_ARCHETYPE`.
- [ ] Seed 3 payloads: `weapon.dirk`, `shield.round`, `character.chibi.human` (paths from index rows).
- [ ] Vitest: deterministic handoff hash; digest mismatch fails closed; ambiguous keys fail closed; index/registry bijection test stub.

**Gate:** `npm run test -- tests/core/pixelbrain/constructive-silhouette-recall.test.js` green. Grep gate: no archetype string literals in decoder/CLI outside `archetype-index.js`.

### Phase 2 — SCDNA registry + CLI

- [ ] Add `PB-CONSTRUCT-SILH-*` genes to `scdna/compiler.json` — each entry generated from or validated against `ARCHETYPE_INDEX` (`archetypeKey`, `payload.path`, `geneId`).
- [ ] Implement `pixelbrain-recall-construct.mjs`.
- [ ] Extend `inject.py` to recognize `kind: PB-CONSTRUCT-SILHOUETTE` and format scaffold summary.
- [ ] Python tests: detector matches `greatsword` intent; deprecated gene skipped.

**Gate:** recall CLI prints handoff for `weapon.dirk`; injection test fixture contains archetype + imperative.

### Phase 3 — Authoring ergonomics

- [ ] Document archetype authoring workflow in PixelBrain Agent Operating Manual (one section, not a new doc tree).
- [ ] Add `forgeItemAsset({ recallGeneId })` advisory pre-fill (optional).
- [ ] Seed remaining v1 index rows + payloads (greatsword, chestplate, pickaxe, torch, helm, boots, obelisk) by extending `ARCHETYPE_INDEX` only.

**Gate:** new item from recalled scaffold passes existing construction-line-microprocessor tests when spec is built from handoff.

### Phase 4 — Outcome pairing (manual v1)

- [ ] For each ARCHETYPE payload, document paired `.silh` outcome example where one exists (e.g. pickaxe).
- [ ] Forge gate README note: `.silh` is per-instance; constructive gene is per-class.

---

## 11. Acceptance Criteria (QA checklist)

| ID | Criterion | Why it matters | Verification |
|----|-----------|----------------|--------------|
| F-1 | Same gene + decoder version → identical `HandoffPacket` hash | Proves deterministic recall | Vitest snapshot on `referenceCells` digest |
| F-2 | Tampered payload file → decode fails with digest error | Protects the memory layer | Vitest corrupt-byte test |
| F-3 | `weapon.greatsword` intent matches gene before broad search | Proves keyed recall is working | Python detector test |
| F-4 | Injection block contains imperative + archetype, not full cell list | Prevents context flooding | Python formatter test |
| F-5 | Recalled guides land on `00_Reference` role only | Prevents scaffold pixels becoming final art | `applyConstructionLines` role audit |
| F-6 | Explicit `ITEM-SPEC.construction` overrides gene pre-fill | Preserves author override | Foundry integration test |
| F-7 | `.silh` gate unchanged — constructive recall does not weaken outcome tolerance | Proves QA tolerance was not weakened | `silhouette-blueprint-golden.test.js` still green |
| F-8 | `weapon.sword` and other non-canonical keys → `AMBIGUOUS_ARCHETYPE` (no silent fallback) | Proves SCDNA purity; taxonomy cannot drift via guesswork | Vitest + Python ambiguous-match tests |
| F-9 | `ARCHETYPE_INDEX` is the only module listing archetype keys; registry/payloads derive from it | Proves single throat of truth | CI grep gate + bijection test (index ↔ registry ↔ payload paths) |
| F-10 | `void ice greatsword` recall resolves `weapon.greatsword.v1` only; no VARIANT scaffold | Keeps material flavor out of constructive tier | Vitest + detector test: `void`/`ice` tokens do not alter resolved key |

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gene/archetype taxonomy drift vs `ITEM-SPEC-v1` | Medium | High | **Mandatory** `ARCHETYPE_INDEX` in Phase 1 (F-9); not optional mitigation |
| Ambiguous user intent (`sword`, `weapon`) silently picks wrong scaffold | Medium | High | Ambiguous Match Law (§6.4) + F-8; fail closed |
| VARIANT creep from material adjectives (`void ice`) | Medium | High | §6.3 sealed-off law + F-10; flavor is downstream only |
| Prompt bloat from coordinate dumps | Medium | Medium | F-4 formatter law; CLI for full payload |
| Authors treat `.silh` as construction guide | Medium | High | `forbiddenDrift` on every gene; craft gate docs |
| Stale digests after payload edit | High | Medium | `compiler ritual` script updates gene digest on commit (same as `.pbrain` verifier plan) |

---

## 13. Non-Goals (reaffirmed)

- Replacing semantic search for lore, phoneme, or combat recall.
- Auto-deriving constructive genes from finished PNGs (reverse path stays `image-to-construction-skeleton.js`, post-hoc).
- Merging constructive and outcome contracts into one file format.
- Shipping every item with a gene before the v1 seed set is stable.
- **VARIANT-tier recall** — including material/school/adjective compounds (`void-ice-greatsword`, `weapon.greatsword.void-ice`). Deferred until ARCHETYPE tier is stable.
- **Synonym-based decode** — broad tokens (`sword`, `blade`) may surface detector candidates but must never select a payload without a canonical index key.

---

## 14. SCHEMA_CONTRACT Notice (draft for Phase 1)

```txt
Notice: additive registration
Contract: PB-CONSTRUCT-SILHOUETTE-v1
Changed fields:
  - ArchetypeIndexRow + ARCHETYPE_INDEX module (single throat of truth)
  - ConstructiveSilhouetteRecall interface
  - SCDNA gene kind PB-CONSTRUCT-SILHOUETTE with archetypeKey + payload pointer + digest
  - ConstructiveSilhouetteHandoff decoder output
  - AMBIGUOUS_ARCHETYPE error code
Claude impact: /pixelbrain and forge agents may call pixelbrain-recall-construct.mjs
  or receive injection summaries; must not treat .silh as construction authority
```

---

## 15. Example End-to-End Session

```txt
User: "I need to forge a void ice greatsword for combat"

1. inject.distill_query → tokens: forge, void, ice, greatsword, combat, pixelbrain
2. detector matches PB-CONSTRUCT-SILH-WEAPON-GREATSWORD-v1 via canonical token "greatsword"
   (void/ice are ignored for constructive recall — material identity is downstream)
3. resolveArchetypeKey("weapon.greatsword") → index row → weapon.greatsword.v1 payload
4. injection block:
     ## SCDNA Constructive Silhouette Recall
     Archetype: weapon.greatsword (ARCHETYPE tier only — not void-ice variant)
     Center: (16, 28) on 32×48 canvas
     Proportions: bladeRatio 0.65, guardWidth 0.4
     Run: node scripts/pixelbrain-recall-construct.mjs --archetype weapon.greatsword --inject-item-spec ./draft.json
     Do NOT use outcome .silh as a build guide.
     Apply void/ice via palette, materials, and shading passes after Structure is inked.

5. Agent runs CLI → draft ITEM-SPEC with construction block populated (generic greatsword scaffold)
6. forgeItemAsset(draft) → SketchAMP emits cyan guides on 00_Reference
7. Artist inks Structure; void/ice motifs applied in Energy/Shading layers (not recalled scaffold)
8. pixelbrain-silhouette-scan.mjs → item-specific void-ice-greatsword.silh
9. pixelbrain-forge-gate.mjs --blueprint void-ice-greatsword.silh → pass
```

**Counter-example (must fail):**

```txt
User: "forge a sword"
→ resolveArchetypeKey({ class: "weapon", archetype: "sword" }) → AMBIGUOUS_ARCHETYPE
→ no injection, no silent fallback to greatsword or dirk
→ agent must ask for canonical archetype or user must say "greatsword"
```

---

## 16. Relation to Prior Art

| System | Role after this PDR |
|--------|---------------------|
| SCDNA Retrieval Genome | Becomes the **bus** for constructive silhouette recall |
| SketchAMP | Becomes the **executor** that materializes recalled scaffolds |
| `.silh` | Stays the **verdict** layer for finished items |
| `pixelbrain-silhouette-scan.mjs` | Stays **ingest** (reference → outcome mould), not recall |
| SCDL scene graph | Unchanged; future `construct import` is a separate PDR |
| Construction Lines reference doc | Becomes the human-facing explanation of what genes recall |

---

**Approval:** Design approved for Phase 1 implementation. Phase 1 ships `ARCHETYPE_INDEX` first — no decoder without it. VARIANT tier, SCDL `construct` import, and Aseprite live-sync are explicitly deferred and sealed off (§6.3).