# Spellweave Vocabulary White Paper

**Audience:** designers, combat engineers, tutorial authors, and agents wiring weave UI.
**Scope:** authoritative weave-parseable lexicon and clause grammar (V13 intent-first).
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SPELLWEAVE-VOCABULARY`

**Authority:** `codex/core/semantics.registry.js`, `codex/core/weave-intent-octree.js`, `codex/core/spellweave.engine.js`
**Date:** 2026-07-04
**Version:** V13 (intent-first grammar)

---

## 1. Executive Summary

Spellweave is the **Forma** — the geometric instruction layer that shapes raw linguistic energy from the Verse (**Prima Materia**). Where the Verse is poetic, associative, and school-tinted by vowel gravity, the Weave is **deterministic, ordered, and grammatical**.

The spellweave vocabulary is not a flat keyword list. It is a **typed lexicon** of 345 weave-parseable tokens organized into four syntactic roles, plus a separate verse-only predicate registry for Syntax Chess. The centerpiece is the **Weave Intent Octree Forest**: 325 intent tokens arranged as five root classes, each branching into eight manner families (octants), each bearing eight specialized leaf tokens.

**Design principle:** The weave names **force (INTENT)**, not verb predicates. Players may speak coarse class roots (`OFFENSIVE`) or granular leaves (`REND`, `SANCTUARY`, `UNWEAVE`). School affiliation is resolved from the Verse's dominant school — not from the weave token itself.

---

## 2. Architectural Placement

```
Verse (≤300 chars)          Weave (60–100 chars)
     │                              │
     │  vowel gravity               │  clause grammar
     │  metaphor / rhyme            │  intent → object
     │  Syntax Chess mood           │  modifiers / connectors
     ▼                              ▼
         ┌─────────────────────────────────┐
         │   calculateSyntacticBridge()    │
         │   spellweave.engine.js          │
         └─────────────────────────────────┘
                         │
                         ▼
              Intent · Resonance · Strikes
              ChainType · Syntax Events
```

The bridge compares weave tokens against verse tokens via a token graph (semantic association, school resonance, phonetic echo, syntactic compatibility). Resonance is the magnitude multiplier; word order is law.

---

## 3. Token Taxonomy

| Role | Count | Registry | Weave-parseable? | Purpose |
|------|-------|----------|------------------|---------|
| **INTENT** | 325 | `weave-intent-octree.js` | Yes | Names the force applied |
| **OBJECT** | 9 | `semantics.registry.js` → `OBJECTS` | Yes | Names the vessel targeted |
| **MODIFIER** | 8 | `semantics.registry.js` → `MODIFIERS` | Yes | Scales delivery manner |
| **CONNECTOR** | 3 | `semantics.registry.js` → `CONNECTORS` | Yes | Chains clauses |
| **PREDICATE** | 18 | `semantics.registry.js` → `PREDICATES` | **No** (Verse / Syntax Chess only) | Verb-level verse analysis |

**Lookup paths:**

- `lookupWeaveToken(word)` — INTENT, OBJECT, MODIFIER, CONNECTOR only
- `lookupSemanticToken(word)` — above plus PREDICATE (verse layer)

---

## 4. Clause Grammar

Each weave is parsed as one or more clauses:

```
[MODIFIER]* INTENT [MODIFIER]* OBJECT (CONNECTOR clause)*
```

### 4.1 Legality States

| State | Condition | Resonance Penalty |
|-------|-----------|-------------------|
| `legal` | INTENT before OBJECT, modifiers bound | 0 |
| `inverted` | OBJECT spoken before INTENT | −0.15 |
| `unfocused` | INTENT with no OBJECT | −0.08 |
| `dangling` | MODIFIER with no INTENT in clause | −0.10 per clause |
| `collapsed` | >3 INTENT tokens in a single clause | Collapse path (strikes → 1) |
| `inert` | No semantic tokens | Ignored |

### 4.2 Example Weaves

| Weave | Legality | Chain | Notes |
|-------|----------|-------|-------|
| `offensive the flesh` | legal | SINGLE | Canonical minimal clause |
| `utter offensive the flesh` | legal | SINGLE | Modifier power ×1.25 |
| `the flesh offensive` | inverted | SINGLE | Same lexemes, worse resonance |
| `swift offensive the flesh then offensive the stone` | legal ×2 | SEQUENCE | Combo escalation (+0.04 per link) |
| `offensive the flesh and offensive the stone` | legal ×2 | SIMULTANEOUS | Multi-hit, split force |
| `offensive the flesh while defensive the soul` | legal ×2 | SUSTAINED | Channel: resonance ×0.9, status pressure |

---

## 5. Root Intent Classes

Five immutable root classes drive all bridge resolution:

| Class | Label | Combat Role |
|-------|-------|-------------|
| `OFFENSIVE` | Offensive Force | Harm, break, overwhelm |
| `DEFENSIVE` | Defensive Warding | Protect, absorb, deflect |
| `HEALING` | Restorative Healing | Mend, purify, restore |
| `UTILITY` | Utility Shaping | Alter, reveal, move, channel |
| `DISRUPTION` | Disruptive Interference | Fray, silence, dispel, destabilize |

Each class token (e.g. `OFFENSIVE`) is a valid weave intent with manner `BROAD` and `powerScale: 1.0`. Granular leaves inherit the class intent but carry specialized manner tags, school affinities, and per-leaf power scales (0.92–1.48).

---

## 6. The Intent Octree Forest

### 6.1 Structure

```
INTENT CLASS (root)
├── Octant 0 (ALPHA) — manner family
│   ├── leaf 0 … leaf 7
├── Octant 1 (BETA)
│   └── …
└── Octant 7 (THETA)
    └── leaf 0 … leaf 7
```

- **5 classes × (1 root + 8 octants × 8 leaves) = 325 tokens**
- Octant axes: `ALPHA, BETA, GAMMA, DELTA, EPSILON, ZETA, ETA, THETA`
- Path format: `OFFENSIVE/Rend/REND` via `formatIntentPath(token)`

### 6.2 OFFENSIVE — 65 tokens

| Octant | Manner | School Affinity | Leaf Tokens |
|--------|--------|-----------------|-------------|
| **Impact** | KINETIC | WILL | STRIKE, SMASH, CRUSH, BATTER, SLAM, PUMMEL, THRUST, CRACK |
| **Rend** | CUT | WILL, SONIC | SLASH, CLEAVE, REND, PIERCE, LACERATE, RIVE, CARVE, SHEAR |
| **Burn** | FLAME | ALCHEMY | IGNITE, SCORCH, SEAR, INCINERATE, KINDLE, CHAR, BLAZE, IMMOLATE |
| **Resonance** | VIBRATION | SONIC | ECHO, RESONATE, SHATTER, QUAKE, RUPTURE, VIBRATE, PEAL, FRACTURE |
| **Corrosion** | DECAY | ALCHEMY, VOID | ROT, WITHER, CORRODE, ACID, FESTER, DECAY, MOLD, TARNISH |
| **Assault** | PSYCHIC | PSYCHIC | SCISS, GAZE, PROBE, LANCE, SPIKE, NEEDLE, INVADE, STING |
| **Voidfeed** | HUNGER | VOID | CONSUME, DEVOUR, DRAIN, LEECH, SIPHON, GNAW, ANNUL, ERODE |
| **Barrage** | CASCADE | SONIC, WILL | BARRAGE, VOLLEY, CASCADE, ERUPT, DETONATE, STORM, HAIL, FLURRY |
| *Root* | BROAD | — | **OFFENSIVE** |

### 6.3 DEFENSIVE — 65 tokens

| Octant | Manner | School Affinity | Leaf Tokens |
|--------|--------|-----------------|-------------|
| **Shield** | BARRIER | WILL | SHIELD, AEGIS, BULWARK, BASTION, WARDEN, COVER, SHELL, GUARD |
| **Ward** | RITUAL | WILL, ABJURATION | HALO, CIRCLE, RITUAL, SEAL, SIGIL, GLYPH, RUNE, VEIL |
| **Fortify** | HARDEN | WILL, ALCHEMY | FORTIFY, HARDEN, STEEL, BRACE, ROOT, GRIP, TENSE, STEADY |
| **Absorb** | SOAK | VOID, WILL | ABSORB, SOAK, BUFFER, CUSHION, DAMPEN, MUFFLE, CATCH, ENDURE |
| **Reflect** | MIRROR | SONIC, WILL | REFLECT, RETURN, MIRROR, REBOUND, DEFLECT, TURN, ANGLE, REDIRECT |
| **Sanctuary** | HAVEN | WILL, ABJURATION | SANCTUARY, REFUGE, HAVEN, SHELTER, COCOON, BOWER, KEEP, CITADEL |
| **Anchor** | IMMOBILE | WILL | ANCHOR, MOOR, PIN, CLAMP, FIX, IMMOBILE, SET, LOCK |
| **Dissipate** | SCATTER | SONIC, VOID | DISSIPATE, SCATTER, UNWIND, DISPERSE, DIFFUSE, FADE, QUIET, DIM |
| *Root* | BROAD | — | **DEFENSIVE** |

### 6.4 HEALING — 65 tokens

| Octant | Manner | School Affinity | Leaf Tokens |
|--------|--------|-----------------|-------------|
| **Mend** | RESTORE | ALCHEMY | MEND, HEAL, CURE, PATCH, KNIT, CLOSE, RESTORE, REPAIR |
| **Purify** | CLEANSE | ALCHEMY, WILL | PURIFY, CLEANSE, FLUSH, WASH, CLEAR, RINSE, SCRUB, BAPTIZE |
| **Regrow** | RENEW | ALCHEMY | REGROW, RENEW, BLOOM, SPRING, RISE, REFORM, REBUILD, REGEN |
| **Soothe** | EASE | PSYCHIC, ALCHEMY | SOOTHE, EASE, CALM, SOFTEN, COOL, BALM, SALVE, COMFORT |
| **Revive** | RALLY | ALCHEMY, WILL | REVIVE, RALLY, QUICKEN, WAKE, SPARK, RECALL, RESCUE, REBORN |
| **Bind** | STITCH | ALCHEMY | STITCH, SUTURE, STABLE, CLASP, GRASP, TIE, LASH, FASTEN |
| **Infuse** | CHARGE | ALCHEMY, WILL | INFUSE, FILL, IMBUE, LOAD, FEED, NOURISH, SATE, ENRICH |
| **Sanctify** | HALLOW | WILL, ALCHEMY | SANCTIFY, HALLOW, CONSECRATE, GRACE, LIGHT, ELEVATE, UPLIFT, ASCEND |
| *Root* | BROAD | — | **HEALING** |

### 6.5 UTILITY — 65 tokens

| Octant | Manner | School Affinity | Leaf Tokens |
|--------|--------|-----------------|-------------|
| **Transmute** | ALTER | ALCHEMY | TRANSMUTE, SHIFT, ALTER, MORPH, CHANGE, CONVERT, TRANSFORM, REFORGE |
| **Reveal** | EXPOSE | DIVINATION, PSYCHIC | REVEAL, SHOW, UNMASK, EXPOSE, GLIMPSE, SIGHT, SCAN, BEHOLD |
| **Restrain** | SNARE | WILL, PSYCHIC | SNARE, TRAP, CAGE, NET, GRAPPLE, LASSO, HOOK, MANACLE |
| **Summon** | CALL | NECROMANCY, WILL | SUMMON, CALL, INVOKE, MANIFEST, BRING, FETCH, CONJURE, RAISE |
| **Displace** | MOTION | WILL | DISPLACE, PUSH, PULL, LIFT, SLIDE, WARP, BEND, PORT |
| **Amplify** | BOOST | SONIC, WILL | AMPLIFY, BOOST, MAGNIFY, HEIGHTEN, INTENSIFY, SURGE, CHARGE, STRETCH |
| **Scry** | PERCEIVE | DIVINATION, PSYCHIC | SCRY, PEER, WATCH, LISTEN, TRACE, SEEK, FIND, LOCATE |
| **Channel** | ROUTE | WILL, VOID | CHANNEL, ROUTE, BRIDGE, CONDUCT, PIPE, FLOW, LINK, COUPLE |
| *Root* | BROAD | — | **UTILITY** |

### 6.6 DISRUPTION — 65 tokens

| Octant | Manner | School Affinity | Leaf Tokens |
|--------|--------|-----------------|-------------|
| **Silence** | MUTE | SONIC, PSYCHIC | SILENCE, MUTE, STILL, HUSH, GAG, MUZZLE, STIFLE, SUPPRESS |
| **Unweave** | FRAY | VOID, PSYCHIC | UNWEAVE, FRAY, UNRAVEL, LOOSEN, SLIP, UNBIND, UNKNOT, TEASE |
| **Dispel** | STRIP | ABJURATION, WILL | DISPEL, BANISH, STRIP, BREAK, NULL, VOID, UNMAKE, CANCEL |
| **Fear** | DREAD | PSYCHIC | FEAR, DREAD, TERROR, PANIC, HAUNT, SHAKE, QUAIL, FLINCH |
| **Confuse** | SCRAMBLE | PSYCHIC | CONFUSE, BEFUDDLE, MUDDLE, FOG, BLUR, SWIRL, TANGLE, TWIST |
| **Hollow** | EMPTY | VOID | HOLLOW, EMPTY, VACATE, DEPLETE, BLEED, SAP, WANE, EBB |
| **Curse** | MALEFIC | NECROMANCY, VOID | CURSE, BLIGHT, DOOM, MARK, TAINT, SPOIL, RUIN, AFFLICT |
| **Sever** | CUT_LINK | VOID, WILL | SEVER, SPLIT, PART, DIVIDE, ISOLATE, QUARANTINE, EXILE, BAN |
| *Root* | BROAD | — | **DISRUPTION** |

---

## 7. Objects — The Vessel Layer

Nine object tokens name what the intent acts upon:

| Token | Category | Multiplier | Typical Use |
|-------|----------|------------|-------------|
| `SOUL` | METAPHYSICAL | 1.2 | Spirit-level targeting |
| `SPIRIT` | METAPHYSICAL | 1.2 | Ethereal vessel |
| `MIND` | MENTAL | 1.1 | Psychic operations |
| `FLESH` | PHYSICAL | 1.0 | Body targeting |
| `SINEW` | PHYSICAL | 1.0 | Structural body |
| `BLOOD` | PHYSICAL | 1.3 | Vitae / life-force |
| `STONE` | ELEMENTAL | 0.9 | Earth / matter |
| `AIR` | ELEMENTAL | 0.8 | Wind / breath |
| `FIRE` | ELEMENTAL | 1.1 | Flame vessel |

Multiple objects in a weave grant a +0.06 resonance bonus. Intent–object pairs form `SYNTACTIC_COMPATIBILITY` edges in the token graph.

---

## 8. Modifiers — Delivery Scaling

Modifiers bind to the nearest INTENT in their clause and scale resonance delivery:

| Token | Power Scale | Manner Tag | Semantic Role |
|-------|-------------|------------|---------------|
| `UTTER` | ×1.25 | ABSOLUTE | Total, uncompromising force |
| `SUNDERED` | ×1.20 | REND | Breaking/tearing delivery |
| `BURNING` | ×1.18 | FLAME | Thermal intensification |
| `DEEP` | ×1.15 | PENETRATE | Piercing depth |
| `FROZEN` | ×1.12 | FROST | Cryogenic manner |
| `TWICE` | ×1.10 | ECHO | Repeated/strengthened |
| `SWIFT` | ×1.08 | HASTE | Accelerated delivery |
| `SILENT` | ×1.05 | STEALTH | Concealed manner |

Modifier power compounds multiplicatively across clauses (clamped 1.0–2.0). A dangling modifier (`swift the flesh`) contributes zero power and incurs legality penalties.

---

## 9. Connectors — Chain Discipline

| Token | Chain Type | Combat Behavior |
|-------|------------|-----------------|
| `AND` | SIMULTANEOUS | Strikes land together; force may split across hits |
| `THEN` | SEQUENCE | Combo chain; +0.04 resonance per additional armed clause |
| `WHILE` | SUSTAINED | Channel weave; resonance ×0.9 now, status pressure later |

Mixed connectors in one weave yield `chainType: MIXED`. Strikes count armed clauses (those containing at least one INTENT).

---

## 10. Verse Predicates (Not Weave Tokens)

Eighteen predicate verbs exist for **Verse / Syntax Chess** analysis only. They do **not** parse as weave tokens — legacy predicate→intent mapping has been superseded by the intent octree:

| School | Predicates | Mapped Intent |
|--------|------------|---------------|
| ALCHEMY | MEND, PURGE, TRANSMUTE, IGNITE | HEALING / DISRUPTION / UTILITY / OFFENSIVE |
| SONIC | ECHO, RESONATE, QUIET, SHATTER | OFFENSIVE / DEFENSIVE |
| PSYCHIC | GAZE, SCISSION, CALM, FEAR | UTILITY / OFFENSIVE / DEFENSIVE / DISRUPTION |
| VOID | CONSUME, HOLLOW, NULLIFY | OFFENSIVE / DISRUPTION / DEFENSIVE |
| WILL | STRIKE, SHIELD, SURGE | OFFENSIVE / DEFENSIVE / UTILITY |

Note: several predicates (`STRIKE`, `IGNITE`, `ECHO`, `CONSUME`, `MEND`, etc.) also appear as **octree leaves**, where they function as weave INTENT tokens with full manner metadata.

---

## 11. School Status-Chain Keywords

While school is derived from the Verse, weave vocabulary aligns with per-school status chains used downstream in combat profiling. These keyword corpora are not weave tokens but semantic escalation fuel:

| School | Chain ID | Sample Keywords |
|--------|----------|-----------------|
| VOID | HOLLOWING | hollow, consume, devour, unmake, null, annihilate, erase, void hunger |
| ALCHEMY | TRANSMUTATION | transmute, quicksilver, dissolve, calcine, ferment, crucible |
| SONIC | RESONANCE | resonate, overtone, harmonic, shatterpoint, crescendo, standing wave |
| PSYCHIC | DREAD | dread, terror, whisper, paranoia, nightmare, mindworm |
| WILL | BULWARK | bulwark, unyielding, adamant, bastion, aegis, iron resolve |

Status tiers run 1–5 (`SEMANTIC_TIER_COUNT = 5`), labeled as `{SCHOOL} {CHAIN} {TIER}`.

---

## 12. Reserved Token Collisions

The octree builder enforces collision safety. No intent leaf may duplicate:

- **Connectors:** AND, THEN, WHILE
- **Modifiers:** UTTER, SWIFT, TWICE, DEEP, SILENT, BURNING, FROZEN, SUNDERED
- **Objects:** SOUL, FLESH, MIND, SINEW, SPIRIT, BLOOD, STONE, AIR, FIRE

This guarantees unambiguous token classification at parse time.

---

## 13. Bridge Scoring Implications

### Resonance Formula (non-collapsed)

Base 0.55, then:

| Factor | Weight / Effect |
|--------|-----------------|
| Semantic alignment (verse↔weave graph) | +0.35 × score |
| School resonance | +0.25 × score |
| Phonetic harmony | +0.12 × score |
| Syntax legality | +0.18 × score |
| Legal clause order ratio | +0.10 × ratio |
| Modifier power above 1.0 | +(power − 1) × 0.4 |
| Multiple objects | +0.06 |
| High graph alignment (>0.75) | +0.08 |
| Low graph alignment (<0.25) | −0.12 |
| SEQUENCE combo links | +0.04 per extra strike |
| SUSTAINED channel | ×0.9 multiplier |

### Collapse Rule

Any single clause carrying **more than three INTENT tokens** triggers `WEAVE_COLLAPSE`. The weave frays: strikes reset to 1, resonance floors near 0.1–0.5. Chaining overload across separate clauses via `THEN` is legal — overload must be concentrated, not distributed.

---

## 14. Player-Facing Guidance

### Precision vs. Breadth

- **Class roots** (`healing the flesh`) — reliable, manner `BROAD`, fastest to compose under pressure.
- **Leaf tokens** (`sanctify the soul`) — specialized manner tags, school affinities for graph alignment, slightly higher leaf power scales.
- **Modifier stacking** (`utter deep offensive the flesh`) — legal if modifiers precede or follow their INTENT within the clause.

### Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| `mend heal cure fix the flesh` | Clause collapse (>3 intents) |
| `the flesh rend` | Inverted order penalty |
| `swift the stone` | Dangling modifier |
| `offensive` alone | Unfocused (no vessel) |
| Verse-fire + weave-healing | Low semantic/school alignment penalty |

### Combo Templates

```
# Single strike
REND the FLESH

# Modifier amp
UTTER REND the BLOOD

# Two-hit sequence
OFFENSIVE the FLESH then DISRUPTION the MIND

# Simultaneous dual-target
SHIELD the SOUL and FORTIFY the FLESH

# Sustained channel
HEALING the FLESH while DEFENSIVE the SPIRIT
```

---

## 15. API Surface for Tooling

| Function | Returns |
|----------|---------|
| `listAllWeaveIntentTokens()` | All 325 intent tokens, sorted |
| `lookupWeaveIntent(token)` | Leaf metadata (manner, path, schoolAffinity) |
| `formatIntentPath(token)` | Human-readable octree path |
| `listOctantsForClass(class)` | Octant families + token lists (UI discovery) |
| `getIntentForest()` | Full forest for reference UIs |
| `parseWeave(weave)` | Clause breakdown + syntax metrics |
| `calculateSyntacticBridge({verse, weave, dominantSchool})` | Authoritative combat bridge result |

---

## 16. Evolution Notes

The V13 vocabulary represents a deliberate shift from **predicate-first** weave grammar (legacy mechanic spec: "Mend the flesh") to **intent-first** grammar ("healing the flesh" or "mend the flesh" where `MEND` is an octree leaf under HEALING/RESTORE, not a standalone predicate).

Higher-order interpretation — metaphor, semantic fields, archetypes, register tension — remains on the **VerseIR amplifier substrate**. The weave vocabulary is the combat-facing, deterministic floor.

---

## 17. Related Documents

- [2026-07-03 Syntactical Combat Design](../../superpowers/specs/2026-07-03-syntactical-combat-design.md) — clause grammar pillar spec
- [PIR: Spellweave Intent Octree Obelisk](../post-implementation-reports/PIR-20260704-SPELLWEAVE-INTENT-OCTREE-OBELISK.md) — implementation report
- Legacy: `ARCHIVE REFERENCE DOCS/legacy-docs/MECHANIC SPEC - Spellweaving and the Syntactic Bridge.md` (predicate-first; superseded)

---

**Total weave-parseable vocabulary: 345 tokens**
(325 INTENT + 9 OBJECT + 8 MODIFIER + 3 CONNECTOR)

**Total semantic registry (including verse predicates): 363 tokens**