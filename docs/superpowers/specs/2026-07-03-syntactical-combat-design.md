# Full Syntactical Combat — Design Spec

**Date:** 2026-07-03 · **Status:** approved by Damien (counterpart = combat.syntax-chess.js; scope = all four pillars + discovery events)

## Goal

Combat resolution driven by actual syntax — word order, clause structure,
grammatical mood — in both the Weave (`spellweave.engine.js`) and the Verse
(`combat.syntax-chess.js`), plus implemented status-chain registries and
typed discovery/epic-cast events for the UI.

## Pillar 1 — Weave grammar (`spellweave.engine.js`)

`parseWeave` becomes a sequential parser. Token order is preserved (no
`uniqueTokens` bag for parsing; the graph alignment still dedupes).

Grammar per clause: `[MODIFIER]* PREDICATE [MODIFIER]* OBJECT`
Clauses separated by CONNECTORS.

New registry token classes (`semantics.registry.js`):
- **MODIFIERS** — intensity/manner adverbs binding to the nearest following
  predicate (or previous, if trailing). Each has `{ powerScale, effect }`.
  Vocabulary: UTTER, SWIFT, TWICE, DEEP, SILENT, BURNING, FROZEN, SUNDERED.
- **CONNECTORS** — `{ chainType }`: AND → `SIMULTANEOUS` (multi-hit, split
  power), THEN → `SEQUENCE` (combo, escalating per link), WHILE →
  `SUSTAINED` (channel: reduced now, status pressure later).

Legality rules (per clause):
- PREDICATE before OBJECT → legal.
- OBJECT before PREDICATE → `inverted` (recoil penalty: resonance −0.15).
- PREDICATE with no OBJECT → `unfocused` (−0.08).
- MODIFIER with no predicate in clause → `dangling` (fizzle drain −0.10).
- More than 3 predicates in a single clause → collapse (existing rule,
  now clause-scoped instead of whole-weave).

Bridge result additions (all additive; existing fields unchanged):
`clauses[]` ({predicates, objects, modifiers, legality, order}),
`chainType`, `strikes` (clause count for SIMULTANEOUS/SEQUENCE),
`syntax` ({legalOrder, modifierPower, danglingModifiers, clauseCount}),
`events[]`.

## Pillar 2 — Verse form analysis (`combat.syntax-chess.js`)

New grammar-form pass over the verse:
- Sentence segmentation on `.!?` and line breaks.
- **Mood** per sentence: imperative (verb-initial command lexicon),
  interrogative (`?` / wh-initial), exclamative (`!`), else declarative.
- **Rhythm**: sentence-length variance, conjunction chain length.
- **Shape**: COMMAND (imperative dominant), PROBE (interrogative),
  WARD (declarative with copular/`shall` framing), LITANY (anaphora —
  repeated sentence-initial tokens / parallel structure).

Archetype profiles gain `syntaxWeaknesses` / `syntaxResistances`
(structure vs structure):
- SHADE — weak: PROBE, LITANY (naming exposes it); resists: WARD.
- GOLEM — weak: LITANY + long ritual chains; resists: COMMAND (short imperatives bounce off).
- GLASS_SERAPH — weak: LITANY rhythm (resonant repetition shatters); resists: PROBE.
- ROT_APOSTLE — weak: COMMAND (imperative purification); resists: WARD.

New components `formMatch`, `moodScore`, `rhythmScore` fold into the score;
multiplier envelope stays clamped 0.82–1.28. Weights rebalance:
weakness 0.24, form 0.14, metaphor 0.16, opposition 0.14, devices 0.12,
novelty 0.08, clarity 0.06, rhythm 0.06, − resistance 0.18.
Result gains `mood`, `shape`, `syntaxMatched[]`, `events[]`.

## Pillar 3 — Status-chain registries (`semantics.registry.js`)

Implement `getSemanticSchoolRegistry` with one chain per school, shaped for
the existing consumer in `combat.profile.js`:
- VOID `HOLLOWING`, ALCHEMY `TRANSMUTATION`, SONIC `RESONANCE`,
  PSYCHIC `DREAD`, WILL `BULWARK`.
- Each: `{ id, keywords[], baseTier }`; escalation uses existing
  `STATUS_TIER_DEFINITIONS` (tiers 1–5) driven by keyword hits, rarity, and
  syntax quality.

## Pillar 4 — Discovery & epic-cast events

Pure data descriptors, emitted in engine results and aggregated by
`combat.scoring.js` into `result.events[]`:
- `{ type: 'DISCOVERY_INEXPLICABLE', word, source, seed }` — verse/weave
  word hits the inexplicable lexicon (runtime/UI dedupes first-discovery
  and fires the special UI event).
- `{ type: 'EPIC_CAST', rarityId, animationCue }` — rarity ordinal ≥ 3
  (MYTHIC and above). `animationCue = { seed, school, rarityId, motif }`,
  seed = FNV-1a-32 of `verse + '␟' + weave` — procedural epic
  animation is deterministic per cast text (deterministic visualizer law).

`combat.balance.js` gains `EPIC_CAST_MIN_RARITY_ORDINAL = 3`.

## Constraints

- All result-shape changes are additive — existing consumers (exegesis,
  UI adapters, tests) keep working.
- Core stays pure: no DOM, no event bus, no I/O.
- Deterministic: same inputs → same outputs, including seeds.
- Vitest coverage for: clause parser + legality, chain-type resolution,
  mood/shape/rhythm detection, archetype form counters, school registries,
  event emission + seed determinism.
