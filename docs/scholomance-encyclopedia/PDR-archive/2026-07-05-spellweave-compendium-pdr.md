# PDR — Spellweave Compendium (Multi-Tier Lexical Amplification)

**Status:** Proposed design, pre-implementation  
**Date:** 2026-07-05  
**Author:** Scholomance Developer  
**Feature Name:** Spellweave Compendium  
**Classification:** Core combat linguistics, scoring amplification, player progression  
**Priority:** High  
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SPELLWEAVE-COMPENDIUM`  
**Depends on:** [`SPELLWEAVE_VOCABULARY_WHITE_PAPER.md`](../Scholomance%20White%20Papers/SPELLWEAVE_VOCABULARY_WHITE_PAPER.md), `codex/core/spellweave.engine.js`, `codex/core/weave-intent-octree.js`, `codex/core/semantics.registry.js`, `codex/core/combat.syntax-chess.js`, `codex/core/combat.scoring.js`, `codex/core/scholomance-stats.schema.js`, `codex/core/verseir-amplifier/plugins/lexicalResonance.js`, `codex/core/verseir-amplifier/plugins/rareElements.js`, `src/game/combat/combatCastScoring.js`, `src/pages/Combat/CombatPage.jsx`  
**Related PDRs:** [`Scholomance-Tactical-Lattice-Battle-Board-PDR.md`](Scholomance-Tactical-Lattice-Battle-Board-PDR.md), [`2026-07-04-tutorial-obelisk-stormheart-orb-pdr.md`](2026-07-04-tutorial-obelisk-stormheart-orb-pdr.md), [`thorough_ai_combat_pdr.md`](thorough_ai_combat_pdr.md)

---

## 1. Problem Statement

Spellweave V13 solved **grammar** — intent classes, clause legality, chain types, and bridge resonance between Verse and Weave. Players can cast legal weaves and see damage land.

What Spellweave does **not** yet reward:

```txt
Using the right *kind* of language for the moment
Knowing why "sciamachy" hits harder than "fight" when grammatically placed
Feeling that SONIC magic cares about vibration words, PSYCH magic cares about fracture words
Transmuting METAL into RUST through verbal alchemy instead of generic OFFENSIVE
Letting emotion in the verse charge the school the player is actually running
Discovering compendium entries through play (not flat keyword lists)
```

Today, a masterful verse and a bland verse with the same weave skeleton can score too similarly. The intent octree differentiates **force shape**; it does not yet differentiate **lexical depth across semantic planes**.

The Spellweave Compendium closes that gap by introducing **amplification tiers** — orthogonal scoring layers that read the Verse (and selectively the Weave) for domain-specific signal, then apply gated multipliers tied to Scholomance stats and grammatical correctness.

---

## 2. Product Vision

The **Spellweave Compendium** is the player's grimoire of linguistic physics — a discoverable registry of tier-tagged lexemes, transmutation pairs, emotion→school couplings, and rarity bands.

```txt
Verse (Prima Materia)                Weave (Forma)
        │                                    │
        ├─ Elemental tier readout            ├─ Object binding (FLESH, STONE, METAL…)
        ├─ Emotion tier → school bias        ├─ Intent class / leaf
        ├─ Lexical rarity tier               ├─ Modifier / connector legality
        ├─ Chemical tier (VALCH)           │
        ├─ Psychology tier (PSYCH)           │
        ├─ Sonic / Myth / Discovery tiers    │
        ▼                                    ▼
              ┌──────────────────────────────────────┐
              │   calculateCompendiumAmplification()   │
              │   codex/core/spellweave-compendium.* │
              └──────────────────────────────────────┘
                                │
                                ▼
              Bridge resonance × tier amplifiers × stat gates
                                │
                                ▼
              Combat score · Syntax Chess · Discovery XP
```

**Player fantasy:**

> "I didn't memorize a damage rotation — I learned the world's vocabulary. When I spoke *petrichor* after the rain tile, the board listened."

The Compendium is not a shop. It is **evidence of fluency** — entries unlock when the player uses tier signal correctly in combat, inspects enemies, or completes linguistic challenges.

---

## 3. Design Pillars

| Pillar | Rule |
|--------|------|
| **Grammar gates power** | Tier amplifiers apply at reduced or zero strength when weave legality is `inverted`, `dangling`, or `collapsed`. Rare words do not excuse bad Forma. |
| **Tiers stack additively in log space, not exponentially** | Multiple tier hits yield diminishing returns; one dominant tier per cast is the skill expression. |
| **School is earned from Verse, shaped by Weave** | Emotion and elemental tiers bias school affinity; weave intent selects delivery. |
| **Stats gate ceiling, not floor** | Low VALCH can still trigger Chemical tier at baseline; high VALCH widens transmutation menu and multiplier cap. |
| **Discovery over checklist** | Compendium UI reveals tiers progressively; brute-force keyword spam is penalized via Syntax Chess and fizzle law. |
| **Deterministic** | Same verse + weave + board context + stat block → same tier breakdown (VAELRIX law). |
| **CODEx-pure core** | Tier detection lives in `codex/core/`; UI and persistence are adapters. |

---

## 4. Scope

| In scope (v1) | Out of scope (deferred) |
|---------------|-------------------------|
| Core tier schema + registry format | Full etymology graph / Wiktionary live fetch |
| Six primary tiers (see §5) + two extension tiers (§5.7–5.8) | Player-authored custom tier mods |
| `calculateCompendiumAmplification()` pure function | Real-time LLM rarity scoring |
| Integration hook in combat score pipeline (server + browser fallback) | Non-combat social spell duels |
| Compendium overlay UI (read-only v1) | Compendium trading / auction house |
| Tier breakdown in combat terminal + results overlay | Voice-input tier detection |
| Codex unit tests per tier family | Full 50k-word rarity corpus (seed with ~500 v1 lemmas) |
| DISCOVERY XP grants on first correct tier use | Cross-save cloud compendium sync |
| Beastiary cross-links (weakness ↔ tier counsel) | Crafting recipes consuming compendium entries |

**Scope guard:** This PDR defines **tier amplification and the compendium registry**. It does not replace the intent octree, rewrite clause grammar, or redesign the Verse editor.

---

## 5. Tier System

Each tier produces a **TierReadout**:

```ts
interface TierReadout {
  tierId: string;           // e.g. 'ELEMENTAL'
  band: string;             // e.g. 'METAL', 'RARE_IV', 'GRIEF'
  matchedLexemes: string[]; // normalized tokens
  rawSignal: number;        // 0..1 detector strength
  grammarFactor: number;    // 0..1 from weave legality
  statFactor: number;       // 0..1 from scholomance gate
  amplifier: number;        // final tier multiplier contribution
  counsel: string;          // one-line player-facing explanation
  discovered: boolean;      // first-time unlock flag
}
```

Final compendium multiplier (v1):

```txt
compendiumMultiplier = clamp(
  1 + Σ tierAmplifier_i × tierWeight_i,
  0.75,
  2.25
)
```

Recommended `tierWeight` defaults: dominant tier 1.0, secondary hits 0.35, tertiary 0.15.

---

### 5.1 Elemental Tier (including Metal)

**Purpose:** Reward verse imagery aligned with physical element vocabulary and weave object binding.

**Bands:** `FIRE`, `WATER`, `AIR`, `EARTH`, `METAL`, `WOOD`, `VOID`, `LIGHTNING` (SONIC-aligned), `ICE`, `PLASMA` (high VALCH + FIRE crossover)

**Detection surface:** Verse tokens mapped via `codex/core/spellweave-compendium/elemental.registry.js` (v1 seed ~120 lemmas). METAL is first-class, not a subset of EARTH:

```txt
METAL lemmas: iron, copper, rust, alloy, filings, anvil, rivet, oxide, patina…
EARTH lemmas: stone, grit, loam, fault, sediment…
```

**Binding rule:** Tier hits harder when weave `OBJECT` matches or transmutes compatibly:

| Verse band | Favorable weave objects | Example |
|------------|-------------------------|---------|
| METAL | `STONE`, `FLESH` (armor) | "oxidize the rivet" + `REND METAL` |
| FIRE | `FIRE`, `SPIRIT` | "cinder bloom" + `IGNITE FIRE` |
| WATER | `FLESH`, `SPIRIT` | "brine soak" + `PURGE FLESH` |

**Stat gate:** `VALCH` widens METAL transmutation eligibility; `SONIC` boosts LIGHTNING/PLASMA bands.

**Example counsel:** `Elemental METAL resonance — oxide imagery matched STONE target.`

---

### 5.2 Emotion Tier

**Purpose:** Verse emotional register biases school affinity and tier amplifier. Different emotions **power different schools** — not all anger is FIRE.

**Bands → primary school bias (v1 table):**

| Emotion band | Primary school | Secondary | Combat read |
|--------------|----------------|-----------|-------------|
| `RAGE` | ALCHEMY | SONIC | Pressure, overheating, burst |
| `FEAR` | PSYCHIC | VOID | Fray, hesitation, dissonance |
| `GRIEF` | VOID | PSYCHIC | Hollow, drain, silence |
| `WONDER` | SONIC | UTILITY | Resonance, revelation |
| `JOY` | HEALING | LIGHT-adjacent | Restore, brighten |
| `DISGUST` | ALCHEMY | DISRUPTION | Purge, corrode |
| `AWE` | MYTH-weighted | SONIC | Archetypal finishers |
| `CONTEMPT` | PSYCHIC | OFFENSIVE | Precision cuts, exposed flaws |

**Detection:** Emotion lemmas + syntactic proxies (exclamation density capped, second-person accusation, modal fear verbs). No sentiment ML in v1 — curated lexicon only.

**Weave coupling:** Emotion tier applies at `grammarFactor × 1.0` only when weave `chainType` matches emotion:

```txt
RAGE    favors SEQUENCE (THEN chains) — escalating pressure
FEAR    favors SUSTAINED (WHILE) — lingering dread
JOY     favors SIMULTANEOUS (AND) — harmonious burst
```

**Stat gate:** `BAPO` raises emotion ceiling; mismatched school reduces amplifier by 25% (not zero — poetic irony is allowed).

**Example counsel:** `Emotion RAGE feeds ALCHEMY — sequence weave sustained the heat.`


---

### 5.3 Lexical Rarity Tier

**Purpose:** Rare English lemmas amplify spell effect when used **grammatically correctly** in the Verse (and optionally as weave modifiers). Rewards vocabulary depth without requiring obsolete words in the weave layer.

**Rarity bands (v1):**

| Band | Example lemmas | Base amplifier | Grammar requirement |
|------|----------------|----------------|---------------------|
| `COMMON` | fight, break, shield | +0.00 | legal weave |
| `UNCOMMON` | lacerate, fulminate | +0.04 | legal + one imagery family hit |
| `RARE_I` | petrichor, susurrus | +0.08 | legal + no collapse |
| `RARE_II` | sciamachy, marcescent | +0.12 | legal + syntax shape match (PROBE/COMMAND) |
| `RARE_III` | omphaloskepsis, velleity | +0.15 | legal + school-aligned emotion tier |
| `ARCHAIC` | thou, whence, hath | +0.06 | legal; BAPO gate; decorative not stacked with RARE_III |

**Grammar gate (critical design rule):**

```txt
If weave legality is inverted or collapsed:
  rarity amplifier ×= 0.25   (word still "recognized", but wasted)
If rarity lemma is misspelled token-not-in-lexicon:
  no rarity hit (prevents fuzzy cheat)
If rarity lemma appears but Syntax Chess marks VERBOSITY_FAULT:
  rarity amplifier ×= 0.5
```

**Stat gate:** `CODEX` improves detection of RARE_II+; `KSYN` unlocks compound rarity pairs (two rare lemmas in legal anaphora → bonus +0.03).

**Existing asset reuse:** Seed bands from `verseir-amplifier/plugins/rareElements.js` and `lexicalResonance.js` — Compendium tier IDs must map to amplifier plugin tiers without double-counting. **Rule:** VerseIR lexical plugins run in server scoring; Compendium tier is the **player-facing aggregation**; internal dedupe via `tierClaimBitmap`.

**Example counsel:** `Lexical RARE_II — "sciamachy" shadow-boxed the sentinel's guard.`


---

### 5.4 Chemical Tier (Verbal Alchemy / VALCH)

**Purpose:** Model transmutation chains — metal→rust, salt→brine, blood→cinder — as tier-scored **reaction paths** when Verse names reagents and Weave selects compatible intent/object.

**Reaction record shape:**

```ts
interface ChemicalReaction {
  id: string;                    // 'metal_oxidize'
  reagents: string[];            // verse lemmas
  products: string[];            // implied outcome lemmas (flavor)
  requiredObject?: string;       // weave OBJECT token
  requiredIntentClass?: string;  // OFFENSIVE | DISRUPTION | …
  valchMin: number;              // stat floor
  amplifier: number;
  statusEffect?: string;         // e.g. 'CORRODE', 'RUST_DEBUFF'
}
```

**v1 seed reactions (minimum 24):**

```txt
metal + moisture → rust       (METAL object, CORROSION imagery)
salt + water → brine          (PURGE / DISRUPTION)
sulfur + flame → sulfurous    (ALCHEMY school skew)
iron + bile → vitriol         (high VALCH finisher)
silver + moonlight → mirror   (PSYCHIC crossover)
```

**Board coupling:** Chemical tier ×1.15 when caster or target stands on `Rune` or `Corrosion` lattice tile (see Tactical Lattice PDR).

**Stat gate:** `VALCH` primary; `KSYN` allows two-step reaction chains (`THEN` connector) at VALCH 25+.

**Example counsel:** `Chemical METAL_OXIDIZE — verbal alchemy converted plating to rust.`


---

### 5.5 Psychology Tier (Psychic Schism / PSYCH)

**Purpose:** Reward fracture, mirage, obsession, and dissociation vocabulary — the language of minds splitting under pressure.

**Bands:** `FRACTURE`, `MIRAGE`, `OBSESSION`, `DISSOCIATION`, `PARANOIA`, `EGO_DEATH`, `POSSESSION`, `DREAMLOGIC`

**Detection:** PSYCH lemmas + second-person ambiguity + contradiction pairs ("I am not I", "forget yourself").

**Combat effects (scoring-side v1):**

```txt
FRACTURE    → Syntax Chess weakness family alignment bonus
MIRAGE      → defender hit penalty (illusions waste ML reads)
OBSESSION   → sustained weave extension without extra mana (cap 1 turn)
POSSESSION  → brief control flip on low-INT enemies (future AI hook)
```

**Stat gate:** `PSYCH` primary; `CINF` boosts MIRAGE and DREAMLOGIC presentation finishers.

**Counsel tone:** In-world, never clinical DSM language.

**Example counsel:** `Psychology FRACTURE — selfhood split breached the matrix guard.`


---

### 5.6 Sonic Tier (extension — CREATIVE_COMBAT)

**Purpose:** Vibration, cadence, silence-break, and rhythmic lemma bands for SONIC school.

**Bands:** `RESONANCE`, `DISSONANCE`, `HUSH`, `CADENCE`, `HARMONIC`, `FEEDBACK`

**Coupling:** Strong synergy with `MODIFIER: UTTER` and lattice `Sonic` tiles.

**Stat gate:** `SONIC` primary; `BAPO` secondary.

---

### 5.7 Mythological Tier (extension — MYTH)

**Purpose:** Archetypal names and ritual weight (storm-heart, ferryman, tithe) amplify when `MYTH` stat and boss context align.

**Bands:** `TITAN`, `FERAL`, `SACRED`, `TABOO`, `FERAL_LIGHT`

**Gate:** `MYTH` + encounter `mythWeight` metadata from bestiary.

---

### 5.8 Discovery Tier (extension — DISCOVERY)

**Purpose:** First-use lemmas, weird combos, and off-label object bindings grant bonus when `DISCOVERY` stat high.

**Bands:** `NOVEL_LEXEME`, `OFF_LABEL_OBJECT`, `WEIRD_CHAIN`, `TERRAIN_EXPERIMENT`

**Rule:** Diminishing returns on repeat spam of same entry in one battle.

---

## 6. Scholomance Stat Mapping

| Stat | Primary tiers gated | Effect |
|------|---------------------|--------|
| `VALCH` | Chemical, Elemental (METAL) | Unlocks reactions; raises Chemical ceiling |
| `PSYCH` | Psychology | Unlocks bands; resist/fray interplay |
| `SONIC` | Sonic, Elemental (LIGHTNING) | Resonance bands |
| `BAPO` | Emotion, Lexical Rarity (ARCHAIC) | Emotion ceiling; archaic grace |
| `CODEX` | Lexical Rarity | Reveals RARE_II+ in compendium UI |
| `KSYN` | Chemical chains, Rarity pairs | Combo synthesis |
| `MYTH` | Mythological | Boss finisher tier |
| `CINF` | Psychology (MIRAGE), Emotion (AWE) | Presentation-linked amps |
| `DISCOVERY` | Discovery | Novelty rewards |

Tactical stat `INT` (monsters) does **not** apply to player compendium tiers — separate AI read pipeline.

---

## 7. Architecture

### 7.1 CODEx layer placement

```txt
codex/core/spellweave-compendium/
  compendium.schema.js          — TierReadout types, band enums, clamps
  compendium.registry.js        — master index, version string
  elemental.registry.js
  emotion.registry.js
  lexical-rarity.registry.js    — imports curated rare lemma bands
  chemical-reactions.registry.js
  psychology.registry.js
  sonic.registry.js
  myth.registry.js
  discovery.registry.js
  compendium.engine.js          — calculateCompendiumAmplification()
  compendium.grammar-gate.js    — weave legality → grammarFactor
  compendium.stat-gate.js       — scholomance block → statFactor
```

**Services (adapters):**

```txt
codex/services/spellweave-compendium.persistence.js  — local unlock ledger (v1)
```

**Runtime:**

```txt
codex/runtime/spellweave-compendium.pipeline.js      — cache tier lookups per session
```

**Server authority:**

```txt
codex/server/services/combatScore.service.js         — compose bridge + compendium + syntax chess
POST /api/combat/score                               — returns tierBreakdown[] in scoreData
```

**Client:**

```txt
src/game/combat/combatCastScoring.js                 — attach tierBreakdown to fallback path
src/ui/combat/SpellweaveCompendiumOverlay.jsx        — grimoire UI (v1 read-only)
src/pages/Combat/CombatPage.jsx                      — terminal tier lines
```

### 7.2 Pipeline insertion point

```txt
1. parseVerse + parseWeave (existing)
2. calculateSyntacticBridge() (existing)
3. calculateCompendiumAmplification()  ← NEW
4. evaluateSyntacticalChess() (existing)
5. normalizeCombatScore() with compendiumMultiplier
```

Dedup rule with VerseIR: if `scoreData.verseIR.tierClaimBitmap` already credits `LEXICAL_RARE`, Compendium Lexical tier applies **residual** amplifier only (max(0, compendiumAmp - verseIRAmp)).

---

## 8. Player Experience

### 8.1 Combat cast feedback

After Invoke, terminal emits tier lines (max 3 shown, rest in inspect):

```txt
[COMPENDIUM] Elemental METAL +0.11 — oxide imagery matched STONE.
[COMPENDIUM] Chemical METAL_OXIDIZE +0.14 — VALCH transmutation.
[COMPENDIUM] Lexical RARE_II +0.12 — "sciamachy" grammatically placed.
```

### 8.2 Spellweave Compendium overlay

Opened from Combat HUD grimoire icon or `C` hotkey in arena:

```txt
Left rail: tier families (Elemental, Emotion, Rarity, Chemical, Psychology, …)
Center: unlocked entries with example verse snippet + weave pairing
Right: stat gates ("VALCH 18 required for METAL_OXIDIZE")
Hover: counsel text + beastiary cross-link
```

Locked entries show silhouette + hint tier (`??? RARE — grammar-sensitive`).

### 8.3 Progression

```txt
First correct tier use in combat → unlock entry + DISCOVERY XP
Repeat use → dim XP, still valid amps
Mastery (10 correct uses) → gold border + alternate counsel line
```

---

## 9. Data Model (v1)

```json
{
  "compendiumVersion": "spellweave-compendium-v1",
  "entryId": "chemical.metal_oxidize",
  "tierId": "CHEMICAL",
  "band": "METAL_OXIDIZE",
  "title": "Vitriolic Rust",
  "versePrompt": "moisture bites the iron seam",
  "weavePrompt": "DISRUPT METAL",
  "schoolAffinity": ["ALCHEMY", "SONIC"],
  "statGates": { "VALCH": 12 },
  "grammarRequirement": "legal",
  "baseAmplifier": 0.14,
  "tags": ["CORROSION", "METAL", "DEBUFF"]
}
```

Player unlock ledger (local v1):

```json
{
  "unlockedEntryIds": ["elemental.metal", "rarity.sciamachy"],
  "masteryCounts": { "chemical.metal_oxidize": 4 }
}
```

---

## 10. Implementation Phases (PR Plan)

| PR | Title | Depends | Deliverable |
|----|-------|---------|-------------|
| **PR-1** | `compendium.schema` + registry skeleton | — | Types, version, empty engine stub, tests |
| **PR-2** | Elemental + Emotion registries | PR-1 | 120 + 80 lemmas, band detectors, unit tests |
| **PR-3** | Lexical Rarity registry + VerseIR dedupe | PR-1 | Rarity bands, grammar gate, dedupe bitmap |
| **PR-4** | Chemical reactions registry + VALCH gate | PR-1, PR-2 | 24 reactions, object/intent binding tests |
| **PR-5** | Psychology + Sonic registries | PR-1 | PSYCH bands, SONIC bands, syntax chess hooks |
| **PR-6** | `compendium.engine` integration | PR-2–5 | `calculateCompendiumAmplification()` pure |
| **PR-7** | Server combat score wiring | PR-6 | `/api/combat/score` returns `tierBreakdown` |
| **PR-8** | Client fallback + terminal lines | PR-7 | `combatCastScoring.js`, CombatPage logs |
| **PR-9** | Compendium overlay UI (read-only) | PR-8 | Overlay + unlock persistence adapter |
| **PR-10** | Myth + Discovery tiers + bestiary links | PR-6 | Boss mythWeight, discovery diminishing returns |
| **PR-11** | PIR + white paper delta | PR-10 | Update SPELLWEAVE vocabulary white paper § |

Recommended merge order: PR-1 → PR-2 → PR-3 → PR-4 → PR-5 → PR-6 → PR-7 → PR-8 → PR-9 → PR-10 → PR-11.

---

## 11. Success Metrics

| Metric | Target (30 days post-ship) |
|--------|----------------------------|
| % casts with ≥1 tier hit | ≥ 45% of successful invokes |
| Unique tier entries unlocked per player (tutorial arena) | ≥ 8 |
| Grammar-gated rarity waste rate | ≤ 20% of rarity attempts (teaches Forma) |
| Combat score variance between bland vs tiered cast (same weave skeleton) | ≥ 35% delta median |
| Compendium overlay open rate per combat session | ≥ 1.0 |
| Unit test coverage `codex/core/spellweave-compendium/**` | ≥ 90% branch |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Double-counting with VerseIR lexical plugins | `tierClaimBitmap` + residual-only rule |
| Rare word elitism / accessibility | COMMON band still viable; rarity is bonus not requirement |
| Keyword spam in verse | Syntax Chess VERBOSITY_FAULT + discovery diminishing returns |
| Registry maintenance burden | Versioned JSON packs; codegen from CSV for designers |
| Browser bundle size | Lazy-load registries per tier family on overlay open |
| Emotion tier cultural bias | v1 English curated set; locale packs deferred |

---

## 13. Open Questions

1. Should weave layer allow a single `RARE` modifier token, or Verse-only rarity in v1? **Recommendation:** Verse-only v1; weave stays deterministic intent grammar.
2. Should Chemical tier alter `OBJECT` token mid-cast (METAL → RUST pseudo-object)? **Recommendation:** v2; v1 applies status effect without object mutation.
3. Compendium unlocks account-wide or per-character? **Recommendation:** per-character v1, account sync when cloud saves ship.

---

## 14. Acceptance Criteria (v1 done)

- [ ] `calculateCompendiumAmplification()` returns deterministic `TierReadout[]` for fixture corpus
- [ ] Combat terminal shows ≥1 compendium line on tiered tutorial cast
- [ ] Lexical RARE (`sciamachy`) scores higher than COMMON (`fight`) with identical legal weave
- [ ] Inverted weave reduces rarity amplifier per grammar gate
- [ ] Chemical `metal_oxidize` fires with VALCH ≥ 12, METAL imagery, legal `DISRUPT` + object binding
- [ ] Emotion `RAGE` biases ALCHEMY school readout in `scoreData`
- [ ] Compendium overlay lists unlocked entries with stat gate tooltips
- [ ] No double-count against VerseIR `rareElements` plugin in server path
- [ ] Vitest suite ≥ 60 tests across tier families
- [ ] PIR filed under `post-implementation-reports/`

---

## 15. Glossary

| Term | Definition |
|------|------------|
| **Compendium** | Discoverable registry of tier-tagged linguistic entries |
| **Tier** | Orthogonal scoring plane (Elemental, Emotion, …) |
| **Band** | Sub-category within a tier (METAL, RARE_II, GRIEF) |
| **Grammar factor** | Multiplier from weave legality state |
| **Stat gate** | Scholomance stat threshold modulating tier ceiling |
| **Prima Materia** | Verse layer (poetic energy) |
| **Forma** | Weave layer (grammatical shape) |

---

*End of PDR — Spellweave Compendium*