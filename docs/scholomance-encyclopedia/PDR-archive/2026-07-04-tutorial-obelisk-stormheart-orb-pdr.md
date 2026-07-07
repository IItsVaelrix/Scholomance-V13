# PDR — Tutorial Obelisk Stormheart Orb (Linguistic Machine Secret)

**Status:** Approved design, pre-implementation  
**Date:** 2026-07-04  
**Author:** Scholomance Developer (combat-tutorial insight)  
**Archive:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-04-tutorial-obelisk-stormheart-orb-pdr.md`  
**Depends on:** [`thorough_ai_combat_pdr.md`](thorough_ai_combat_pdr.md), [`2026-07-03-syntactical-combat-design.md`](../../superpowers/specs/2026-07-03-syntactical-combat-design.md), `src/phaser/CombatArenaScene.js` (`obeliskFx`, tile `(4,4)`), `codex/core/spellweave.engine.js`, `codex/core/combat.syntax-chess.js`, `codex/core/combat.scoring.js`, `src/pages/Combat/CombatPage.jsx`  
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-TUTORIAL-OBELISK-STORMHEART`

---

## 1. Problem Statement

The combat arena's central obelisk is **ambient spectacle only**.

```txt
Today:
  obeliskFx cycles charge → tesla discharge → cooldown (infinite loop)
  player watches purple runes swell and bolts fan from the tip orb
  no interaction beyond tile inspect ("CENTRAL OBELISK — Immovable Structure")
  tutorial teaches movement + attack, not linguistic machine-reading
```

The obelisk already encodes a readable rhythm — swell, blast, rest — but the
player cannot **counter the sentence**. That wastes:

- The Verse + Weave split (Prima Materia vs Forma)
- SONIC school resonance (electric / vibration lane)
- Weave chain types (`THEN` escalation vs `WHILE` sustain)
- The "smart player discovers world-law" fantasy Scholomance is built for

Most RPG tutorials gate progress behind UI prompts. Scholomance should gate
optional brilliance behind **observation + grammar**. The obelisk is the
first machine worth reading.

---

## 2. Product Vision

Turn the central obelisk into a **tutorial secret puzzle** with two valid
exploit grammars that converge on one outcome:

```txt
Player observes the charge/discharge clock
  ↓
Player casts during a vulnerable phase with overload OR siphon signals
  ↓
Obelisk shaft descends (platform illusion — base stays, cap sinks)
  ↓
Tip orb detaches → interactable rare loot on center tile
  ↓
Discovery event + distinct exegesis line per path (no quest marker)
```

Mythically:

```txt
Overload  = "I fed the tower more voice than it could hold."
Siphon    = "I drank the tower's breath while it was full."
Stormheart Orb = the capacitor that remembers the tower's first sentence.
```

The tutorial never says "solve the obelisk." Observant players who already
understand Spellweave timing and school skew earn a rare item and a story about
how language physics works in this world.

---

## 3. Scope

| In scope | Out of scope (deferred) |
|----------|-------------------------|
| `obeliskState` machine: `active` → `meltdown` \| `siphoned` → `lowered` → `looted` | Full tutorial campaign / quest chain |
| Overload + siphon detection on `combat-cast` (score-threshold families, not passwords) | Backend persistence of tutorial completion flags |
| Phase-gated triggers tied to `obeliskFx.phase` + `intensity` | Obelisk relocation or multi-arena variants |
| Descent tween (shaft/cap sink; base tile geometry unchanged) | New obelisk art pass — reuse procedural draw |
| Detached orb pickup via existing tile interact plumbing | Crafting / enchanting orb at forge (item exists; recipes later) |
| Rare item `item.stormheart-orb` (data stub + combat buff hook) | Orb resale economy / trading |
| Discovery events (`DISCOVERY_OBELISK_OVERLOAD`, `DISCOVERY_OBELISK_SIPHON`) | Mandatory gate — puzzle is optional |
| Terminal + inspect-tile clue strings (one subtle hint at high charge) | Full incantation-box live-syntax UI (separate PDR) |
| Vitest for detection scorer determinism | Phaser e2e for full animation choreography (manual QA v1) |
| One-time-per-save loot (client-local flag v1) | Cross-device cloud sync |

**Scope guard:** this PDR wires **tutorial secret interaction** only. It does not
replace core combat scoring, redesign the DivWand HUD, or add quest UI.

---

## 4. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Two paths, one loot** | Rewards experimentation; neither "wrong clever" answer is punished |
| **Score thresholds, not canonical poem** | Aligns with Syntax Chess + spellweave families; many wordings must work |
| **Phase timing is part of the puzzle** | Teaches the obelisk is a *clock*, not scenery |
| **Overload favors charge peak + discharge; siphon favors charge only** | Different timing skill; same machine |
| **Convergent end state `lowered`** | One implementation path for descent + orb spawn |
| **Distinct exegesis per path, same item id** | Lore differentiation without inventory fork |
| **No quest marker / map ping** | Discovery-through-play is the brand |
| **Detection in pure module, arena applies FX** | Keeps CODEx pure; Phaser owns tweens |
| **Deterministic scoring inputs** | Same verse+weave+phase snapshot → same path verdict (VAELRIX determinism law) |
| **Obelisk tile `(4,4)` remains blocked after lowering** | Prevents climbing a sunken pillar; orb sits on plateau |
| **Optional: player must be adjacent to center** | Stops remote sniping; adjacency = 1 tile from `(4,4)` including center |
| **Tesla RNG in discharge FX unchanged** | Visual-only randomness; detection uses phase enum, not bolt angles |

---

## 5. Player Experience

### 5.1 Setup (tutorial context)

First combat arena visit. Obelisk cycles as today. Tutorial covers:

- Movement, attack, verse + weave invoke
- **Not** the obelisk secret

Optional inspect clue when `phase === 'charge'` and `intensity ≥ 0.65`:

> *"The runes are swollen with unread discharge."*

### 5.2 Path A — Overload / Meltdown (aggressive grammar)

**Fantasy:** feed the tower more electricity than it can hold.

**Signal families (additive score):**

| Signal | Source | Weight hint |
|--------|--------|-------------|
| Electric / resonance lexemes | Verse tokens: `bolt`, `thunder`, `arc`, `surge`, `resonate`, `echo`, `overload` | +0.08 each, cap 0.40 |
| SONIC school density | Verse vowel gravity + weave predicates `ECHO`, `RESONATE`, `SHATTER` | +0.20 if dominant |
| Intensity modifiers | Weave: `UTTER`, `BURNING`, `SUNDERED` via `parseWeave` | +`modifierPower` scaled |
| Sequence chain | Weave `chainType === 'SEQUENCE'` (`THEN`) | +0.15 |
| Phase bonus | `charge` with `intensity ≥ 0.70`, or `discharge` | +0.25 / +0.20 |

**FX sequence:**

1. `obeliskFx.phase` hijack → `meltdown` (inward crackle, white rune blowout, bloom spike)
2. Shaft + cap tween down ~120px over 1.2s (ease `Cubic.easeIn`)
3. Orb detaches, bobs to chest height at `(4,4)`
4. Optional: one wild tesla burst toward training dummy (tutorial risk lesson)
5. Terminal: *"The obelisk could not contain the verse."*

### 5.3 Path B — Siphon / Extract (parasitic grammar)

**Fantasy:** drink the tower while it is full.

**Signal families:**

| Signal | Source | Weight hint |
|--------|--------|-------------|
| Drain / hollow lexemes | Verse: `drain`, `siphon`, `hollow`, `pull`, `leech`, `quiet`, `consume` | +0.08 each, cap 0.40 |
| VOID or PSYCHIC skew | Schools from verse + weave `CONSUME`, `HOLLOW`, `CALM` | +0.15 if dominant |
| Sustained channel | Weave `chainType === 'SUSTAINED'` (`WHILE`) | +0.20 |
| Manner modifiers | `SILENT`, `DEEP` | +0.10 each |
| Phase bonus | `charge` only, `intensity ≥ 0.50` | +0.25 |

**FX sequence:**

1. Charge intensity reverses — orb dims, runes gutter
2. Player gains tutorial mana bump: `+15 MP` scaled by stolen `intensity` (capped)
3. Calm descent tween over 1.8s (ease `Cubic.easeOut`) — elevator, not explosion
4. Orb left as depleted core (same mesh, dimmer palette)
5. Terminal: *"You drank the tower's breath."*

### 5.4 Convergence — loot

| Field | Value |
|-------|-------|
| Item id | `item.stormheart-orb` |
| Rarity | `RARE` (tutorial) |
| Pickup | Left-click interact on orb sprite at `(4,4)` after `lowered` |
| Combat hook (v1) | Passive: +8% sonic resonance on next N casts OR discharge puff on attack (data flag only in v1) |
| Lore | *"A capacitor that remembers the tower's first sentence."* |

Both paths grant the same item. Exegesis line and discovery event type differ.

---

## 6. Detection Contract

### 6.1 Pure module: `codex/core/obelisk-puzzle.resolver.js`

```ts
type ObeliskPhase = 'charge' | 'discharge' | 'cooldown';

type ObeliskSnapshot = {
  state: 'active' | 'lowered' | 'looted';
  phase: ObeliskPhase;
  intensity: number; // 0..1 from obeliskFx
};

type CastSnapshot = {
  verse: string;
  weave: string;
  bridge: BridgeResult;      // from calculateSyntacticBridge
  combatScore: CombatResult; // from calculateCombatScore
  playerAdjacent: boolean;
};

type ObeliskVerdict =
  | { kind: 'none' }
  | { kind: 'overload'; score: number; events: DiscoveryEvent[] }
  | { kind: 'siphon'; score: number; events: DiscoveryEvent[]; manaGrant: number };
```

**Resolution law:**

```txt
if snapshot.state !== 'active' → none
if !playerAdjacent → none (v1 law; relax in v1.1 if feel-testing demands)

overloadScore = sum(overload signals from §5.2)
siphonScore   = sum(siphon signals from §5.3)

OVERLOAD_THRESHOLD = 0.72
SIPHON_THRESHOLD   = 0.68

if overloadScore ≥ OVERLOAD_THRESHOLD AND overloadScore > siphonScore → overload
else if siphonScore ≥ SIPHON_THRESHOLD → siphon
else → none
```

Thresholds are constants in the module; Vitest asserts boundary behavior.

### 6.2 Arena integration

On `combat-cast` (existing `CombatPage` → Phaser bridge):

```txt
CombatArenaScene receives cast + builds ObeliskSnapshot from obeliskFx
  → resolveObeliskPuzzle(snapshot, castSnapshot)
  → if overload: beginMeltdownSequence()
  → if siphon: beginSiphonSequence(manaGrant)
  → emit discovery event to terminal via combat-cast-ack or custom event
```

`obeliskFx` loop **pauses** once `state !== 'active'`. Ambient tesla stops.

### 6.3 Event types (additive)

```ts
{ type: 'DISCOVERY_OBELISK_OVERLOAD', seed, path: 'meltdown' }
{ type: 'DISCOVERY_OBELISK_SIPHON', seed, path: 'siphon', manaGrant }
```

`seed` = FNV-1a-32 of `verse + '␟' + weave + '␟' + phase` (deterministic visualizer law).

---

## 7. Obelisk State Machine

```txt
                    ┌─────────────────────────────────────┐
                    │              active                  │
                    │  (charge ↔ discharge ↔ cooldown)    │
                    └──────────────┬──────────────────────┘
                                   │
              overload verdict     │     siphon verdict
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
              ┌──────────┐                 ┌──────────┐
              │ meltdown │                 │ siphoned │
              │  (FX)    │                 │  (FX)    │
              └────┬─────┘                 └────┬─────┘
                   │                            │
                   └────────────┬───────────────┘
                                ▼
                          ┌──────────┐
                          │ lowered  │
                          │ orb spawn│
                          └────┬─────┘
                               │ interact
                               ▼
                          ┌──────────┐
                          │  looted  │
                          │ (terminal│
                          │  + inv)  │
                          └──────────┘
```

| State | obeliskFx | Tile `(4,4)` | Orb |
|-------|-----------|--------------|-----|
| `active` | cycling | `isObelisk: true`, blocked | tip glow (ambient) |
| `meltdown` / `siphoned` | transitional FX | blocked | attached, animating |
| `lowered` | idle dim runes | blocked, inspect text changes | interactable loot |
| `looted` | idle | blocked | removed |

Inspect text after lowering:

> *"The obelisk has sunk into the plateau. Something gleams where the crown was."*

---

## 8. Item Contract (v1 stub)

```json
{
  "id": "item.stormheart-orb",
  "name": "Stormheart Orb",
  "rarity": "RARE",
  "school": "SONIC",
  "tags": ["tutorial", "capacitor", "obelisk-drop"],
  "description": "A capacitor that remembers the tower's first sentence.",
  "combatModifiers": {
    "sonicResonanceBonus": 0.08,
    "dischargeOnAttack": false
  }
}
```

Location: `src/data/items/stormheart-orb.json` (or existing item DB pattern).

Inventory grant v1: `localStorage` key `scholomance.tutorial.stormheart-orb` + terminal log.
Full inventory UI integration deferred.

---

## 9. File Structure (implementation target)

```txt
codex/core/
  obelisk-puzzle.resolver.js       # pure detection (§6)
  obelisk-puzzle.signals.js        # lexeme families + weights (data, not prose)

src/phaser/
  CombatArenaScene.js              # state machine, tweens, orb pickup (extend)
  obelisk-puzzle.fx.js             # meltdown/siphon/descent sequences (optional extract)

src/pages/Combat/
  CombatPage.jsx                   # forward cast ack + discovery lines to terminal

src/data/items/
  stormheart-orb.json

tests/unit/combat/
  obelisk-puzzle.resolver.test.js  # threshold, determinism, adjacency, phase gates
```

---

## 10. Implementation Phases

### Phase 1 — Pure resolver + tests (gate)

- [ ] Implement `obelisk-puzzle.signals.js` with lexeme families from §5.2 / §5.3.
- [ ] Implement `obelisk-puzzle.resolver.js` with threshold law (§6.1).
- [ ] Vitest: overload wins when scores tie-break; phase gate rejects cooldown casts;
  same inputs → same verdict; `active` only.

**Gate:** `npm run test -- tests/unit/combat/obelisk-puzzle.resolver.test.js` green.

### Phase 2 — Arena state machine + descent

- [ ] Add `obeliskState` to `CombatArenaScene` (default `active`).
- [ ] Wire `combat-cast` handler to resolver; ignore when not `active`.
- [ ] Implement `beginMeltdownSequence` + `beginSiphonSequence` tweens.
- [ ] Pause `updateObeliskFx` cycle after transition begins.
- [ ] Spawn interactable orb sprite at lowered state.

**Gate:** Manual QA — overload cast during charge peak triggers descent; cooldown cast does not.

### Phase 3 — Loot + discovery + terminal

- [ ] Add `stormheart-orb.json` item stub.
- [ ] Orb left-click → grant item + `looted` state + terminal success line.
- [ ] Emit discovery events; `CombatPage` logs path-specific exegesis.
- [ ] Client-local one-time flag prevents duplicate drops.

**Gate:** Second pickup attempt yields inspect-only message; terminal shows correct path line.

### Phase 4 — Polish + clue

- [ ] High-charge inspect clue string (§5.1).
- [ ] Optional dummy zaps on meltdown path.
- [ ] Siphon mana grant reflected in combat stats HUD (`movementPoints` or dedicated tutorial MP).

**Gate:** Playtest — player who has not read docs can discover siphon within 3 cycles OR
overload within 5 cycles when prompted with clue only.

---

## 11. Acceptance Criteria (QA checklist)

| ID | Criterion | Why it matters | Verification |
|----|-----------|----------------|--------------|
| T-1 | Same `verse+weave+phase+intensity` → identical verdict | Determinism law | Vitest snapshot on `resolveObeliskPuzzle` |
| T-2 | Cooldown-phase cast never triggers either path | Phase timing is the puzzle | Vitest + manual |
| T-3 | Overload and siphon both yield `item.stormheart-orb` | Convergent reward | Manual pickup both paths |
| T-4 | Exegesis lines differ by path | Rewards experimentation narrative | Terminal log assert |
| T-5 | `state !== 'active'` ignores further casts | No re-farming | Vitest + manual |
| T-6 | Non-adjacent cast ignored (v1) | Prevents remote exploit | Vitest adjacency mock |
| T-7 | Obelisk ambient loop stops after success | Machine is "solved" | Visual QA |
| T-8 | No quest marker / UI button for secret | Discovery design | Grep: no `quest`/`objective` strings |
| T-9 | At least 3 distinct verse wordings pass per path in fixtures | Not a password puzzle | Vitest fixture table |
| T-10 | `DISCOVERY_*` event `seed` stable per cast text | Epic/discovery law | Vitest hash |

---

## 12. Example Cast Fixtures (Vitest seed)

| Path | Verse (abbrev) | Weave | Phase | Expected |
|------|----------------|-------|-------|----------|
| Overload | *"The thunder answers the swollen rune."* | `utter resonate the air then shatter the stone` | `charge` 0.85 | `overload` |
| Overload | *"Arc upon arc — overload the lattice bell."* | `echo strike the air` | `discharge` | `overload` |
| Siphon | *"I pull the hush from the tower's breath."* | `silent consume the soul while hollow the mind` | `charge` 0.60 | `siphon` |
| Siphon | *"Drain the purple swell; quiet the spark."* | `deep calm the mind while consume the soul` | `charge` 0.75 | `siphon` |
| None | *"A gentle wind across the plateau."* | `strike the flesh` | `cooldown` | `none` |
| None | *"Thunder thunder thunder"* (no weave grammar) | `strike shatter consume` | `charge` 0.90 | `none` (collapse / low bridge) |

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Players never discover secret | Medium | Medium | One inspect clue; community word-of-mouth is feature |
| Threshold too strict → frustration | Medium | High | T-9 fixture table; playtest Phase 4 gate |
| Threshold too loose → trivial | Medium | Medium | Tie-break favors higher path score; cooldown hard reject |
| Incantation box brittleness hides weave grammar | High | High | Puzzle works with terminal feedback; live-syntax UI is separate work |
| Phaser tween desync from iso depth | Low | Medium | Orb depth = 30; shaft graphics depth unchanged during tween |
| `buildTeslaBolts` RNG confuses phase detection | Low | Low | Detection reads `fx.phase` enum only, not bolt state |
| Duplicate loot on scene remount | Medium | Medium | T-5 state + localStorage flag |

---

## 14. Non-Goals (reaffirmed)

- Replacing the training dummy or adding a boss fight at the obelisk.
- Making the secret mandatory for tutorial completion.
- New obelisk mesh or PixelBrain asset pass (procedural graphics only).
- Full inventory UI, trading, or crafting loops for the orb.
- Multiplayer sync of tutorial discovery state.
- Rewriting `obeliskFx` discharge RNG to seeded bolts (visual-only debt stays).

---

## 15. Open Questions (resolve before Phase 2)

| # | Question | Default if unanswered |
|---|----------|----------------------|
| Q1 | Same item or siphon variant (`stormheart-orb-hollow`)? | Same item, different exegesis (§5.4) |
| Q2 | Require adjacency or allow ranged cast? | Adjacent only (§6.1) |
| Q3 | Meltdown dummy zap — damage or pure FX? | Pure FX v1 |
| Q4 | Persist loot in profile save or session-only? | `localStorage` v1 |

---

## 16. PR Plan (suggested stack)

```txt
PR-1  codex/core/obelisk-puzzle.* + Vitest (Phase 1)
PR-2  CombatArenaScene state machine + tweens (Phase 2)
PR-3  item stub + pickup + terminal/discovery (Phase 3)
PR-4  clue string + polish (Phase 4)
```

PR-1 may merge independently. PR-2+ require manual QA note in PR description.

---

## 17. References

- Obelisk FX loop: `src/phaser/CombatArenaScene.js` (`drawObelisk`, `updateObeliskFx`, `obeliskFx`)
- Center tile flag: `isObelisk: (tx === 4 && ty === 4)`
- Cast bridge: `CombatPage.jsx` → `combat-cast` event → `calculateCombatScore`
- Weave grammar: `docs/superpowers/specs/2026-07-03-syntactical-combat-design.md`
- Discovery event pattern: same spec §Pillar 4 (`DISCOVERY_INEXPLICABLE`, `EPIC_CAST`)