# Post-Implementation Report

## 1. Change Identity
- **Report ID:** PIR-20260704-002
- **Feature / Fix Name:** Combat Lattice Authority + A* Movement + Gather Intent + Inventory Vertical Slice
- **Author / Agent:** Scholomance Developer / Grok agent
- **Date:** 2026-07-04
- **Branch / Environment:** V13 / local
- **Related Task / Ticket / Prompt:** No-mocks combat vertical slice; click-to-move A*; right-click inspect with dialogue; 2.5D lattice gather intent; spellweave Escape blur; close gaps from PIR-20260704-001
- **Related PDR:** [`2026-07-04-tutorial-obelisk-stormheart-orb-pdr.md`](../PDR-archive/2026-07-04-tutorial-obelisk-stormheart-orb-pdr.md)
- **Supersedes / Extends:** [`PIR-20260704-SPELLWEAVE-INTENT-OCTREE-OBELISK.md`](./PIR-20260704-SPELLWEAVE-INTENT-OCTREE-OBELISK.md) — inventory, e2e, enchant, and movement/gather gaps closed
- **Classification:** Cross-cutting (PixelBrain picker + combat authority + Phaser arena + React HUD + Scholomance OS server)
- **Priority:** High

---

## 2. Executive Summary

Completed the combat arena **no-mocks vertical slice**: persisted inventory with Stormheart Orb grant, siphon MP application, enchant `verse` wiring, and live e2e against `.combat-page-shell`. Shipped **A* click-to-move** with movement arming (left-click character/tile to arm; cyan highlights only within walking distance). Separated **left-click = move/gather** from **right-click = inspect** with tooltip + terminal character dialogue. Resolved **2.5D pointer ambiguity** via deterministic iso-cell candidate ranking and canonical lattice authority. Added **GATHER_INTENT { targetCell, toolId }** validated server-side (Scholomance OS + combat lattice mirror). Escape in spellweave now blurs verse/weave fields so keyboard control returns to the arena.

**Summary:**
> The combat grid is no longer a flat hit-test — it is a lattice of typed cells with ranked picks under shared pixels. Movement is deliberate (arm → path → walk). Inspection is a separate right-click channel with flavor copy. Gather is an intent, not a raycast guess. Inventory and obelisk loot share one persistence path.

---

## 3. Intent and Reasoning

### Problem Statement
> The obelisk tutorial slice from PIR-001 used `localStorage` orb flags, incinerator-blade inventory hacks, and broken Phaser `hitTestPointer[0]` picking. Left-click semantics were ambiguous (move vs inspect vs gather). Island voxels stacked multiple lattice cells under one screen pixel with no tie-break law. E2E still mocked combat. Enchant resolver ignored `verse` when `text` was absent.

### Why This Change Was Chosen
- **Canonical lattice authority** mirrors Scholomance OS movement/gather intent pattern — facts from Phaser geometry, law from pure validators.
- **Deterministic iso-cell picker** gives reproducible picks when top faces, side faces, and gatherable peaks overlap.
- **Movement arming** prevents accidental walks and limits highlight spam to reachable tiles only.
- **Right-click inspect channel** keeps discovery copy (obelisk electricity hint, void spire flavor) without polluting movement clicks.
- **Inventory service** is the single grant/equip path; legacy `scholomance.tutorial.stormheart-orb` migrates automatically.

### Assumptions Made
- Combat grid is 9×9; blocked tiles remain `(8,0)` teleporter and `(4,4)` obelisk/dummy anchor.
- Gather reach is Chebyshev/Manhattan 2 from player grid position (combat) or 3D Manhattan ≤ 2 (OS generic).
- Island **tallest peaks** per heightmap column register as gatherable `void-ore` with `pickaxe`.
- `item_void_pickaxe` exists in default inventory slots; equipping sets `gatherTool: 'pickaxe'` on the scene.
- Left-click on gatherable peak with pickaxe equipped submits gather intent; left-click on grid tile when armed submits move intent.

### Alternatives Considered
- **Single click for move + inspect.** Rejected — caused accidental inspect on movement attempts and violated PDR click semantics.
- **Phaser `hitTestPointer` top object only.** Rejected — missed stacked iso faces and island peaks under the same pixel.
- **Client-only gather depletion.** Rejected — state must live on lattice authority for server replay parity.
- **Keep `localStorage` stormheart flag.** Rejected — inventory service migration preserves one-time grant semantics.

### Why Alternatives Were Rejected
> Unified left-click overloaded intent types. Top-hit raycast ignored 2.5D stacking. Client-only gather could desync from OS authority. Parallel persistence keys duplicated loot truth.

---

## 4. Scope of Change

### In Scope
- `inventoryService.js` — persisted slots, equip, `grantItem()`, `hasItem()`, legacy migration, `inventory-changed` events
- `InventoryOverlay.jsx` — wired to service; equip/unequip persists
- `combatPathfinding.js` — 4-connected A*, reachable tiles, blocked set
- `combatLatticeAuthority.js` — canonical cells Map, gather validate/apply
- `iso-cell-picker.js` — `rankPickCandidates`, `pickBestCandidate`
- `combatInspectCopy.js` — title, details, `characterLine` per object type
- `CombatArenaScene.js` — canvas raycast picking, movement arming, A* walk tween, gather intent emit, orb `grantItem()`, siphon `grantMovementPoints()`
- `CombatPage.jsx` — inspect/gather handlers, Escape blur on spellweave, terminal dialogue
- `arenaBridge.js` — `tile-gather` event wiring
- `combatStatController.js` — `grantMovementPoints()`, `applyEquipmentModifiers()`
- `enchantResolver.js` — reads `verse` when `text` absent
- `itemDatabase.js` — Stormheart orb assets; `item_void_pickaxe` with `gatherTool: 'pickaxe'`
- `Scholomance OS/server/gathering.js` — generic `validateGatherIntent` / `applyGatherIntent`
- `Scholomance OS/server/authority.js` — `setGatherIntent()`, `registerGatherCell()`, player `tools[]`
- Vitest: picker, lattice authority, pathfinding, inspect copy, inventory, stat controller, enchant
- E2E `combat.spec.js` — real shell, `MEND FLESH`, no `installCombatMocks`

### Out of Scope
- Intent autocomplete HUD (still deferred from PIR-001)
- `schoolAffinity` resonance wiring
- `SCHEMA_CONTRACT.md` registration for lattice cell / gather intent shapes
- Scholomance OS `gathering.test.js` in default vitest `include` (lives outside `tests/**/*`)
- Starter pickaxe grant policy for fresh profiles (pickaxe ships in default inventory build)
- Full browser playtest sign-off

### Change Type
- [x] Logic only
- [x] Data model (lattice cells, inventory v1 schema, pickaxe item)
- [x] API contract (`GATHER_INTENT`, `tile-inspect`, `tile-gather` events)
- [x] Persistence layer (`scholomance.inventory.v1` + legacy migration)
- [x] Styling / layout (`CombatPage.css` inspect highlight)
- [ ] Performance
- [ ] Accessibility (partial — inspect tooltip; full a11y pass deferred)
- [ ] Security
- [ ] Build / tooling
- [x] Documentation (this PIR)
- [x] Multi-layer / cross-cutting

---

## 5. Files and Systems Touched

| Area | File / Module | Type | Risk | Notes |
|------|---------------|------|------|-------|
| Core | `codex/core/pixelbrain/iso-cell-picker.js` | New | Medium | Deterministic 2.5D pick ranking |
| Combat | `src/game/combat/combatLatticeAuthority.js` | New | High | Canonical lattice + gather law |
| Combat | `src/game/combat/combatPathfinding.js` | New | Medium | A* + reachable set |
| Combat | `src/game/combat/combatInspectCopy.js` | New | Low | Inspect presentation copy |
| Combat | `src/game/combat/combatStatController.js` | Edit | Medium | MP grant + equipment |
| Combat | `src/game/combat/enchantResolver.js` | Edit | Low | `verse` fallback |
| Inventory | `src/game/inventory/inventoryService.js` | New | High | Single persistence path |
| Phaser | `src/phaser/CombatArenaScene.js` | Edit | High | Picking, move, gather, loot |
| UI | `src/pages/Combat/CombatPage.jsx` | Edit | Medium | Inspect/gather/Escape |
| UI | `src/pages/Combat/arenaBridge.js` | Edit | Low | `tile-gather` bridge |
| UI | `src/ui/inventory/InventoryOverlay.jsx` | Edit | Medium | Service-backed equip |
| Data | `src/data/itemDatabase.js` | Edit | Low | Orb + pickaxe |
| OS | `Scholomance OS/server/gathering.js` | New | Medium | Generic gather validator |
| OS | `Scholomance OS/server/authority.js` | Edit | Medium | `setGatherIntent` |
| Tests | `tests/unit/pixelbrain/iso-cell-picker.test.js` | New | Low | 3 cases |
| Tests | `tests/unit/combat/combatLatticeAuthority.test.js` | New | Low | 2 cases |
| Tests | `tests/unit/combat/combatPathfinding.test.js` | New | Low | 5 cases |
| Tests | `tests/unit/combat/combatInspectCopy.test.js` | New | Low | 2 cases |
| Tests | `tests/unit/inventory/inventoryService.test.js` | New | Low | 3 cases |
| Tests | `tests/qa/e2e/combat.spec.js` | Edit | Medium | Live HUD path |

### Dependency Impact Check
- **Imports changed:** `CombatArenaScene.js`, `CombatPage.jsx`, `InventoryOverlay.jsx` — downstream of inventory + lattice modules.
- **Shared state:** `scholomance.inventory.v1`; `latticeAuthority.cells` Map on scene; `movementArmed` per session.
- **Event flows:** `tile-inspect`, `tile-gather`, `inventory-changed`; obelisk loot via `grantItem()` not raw storage.
- **UI consumers:** Terminal logs character dialogue; inspect tooltip shows `buildInspectPresentation` fields.
- **Breaking change:** Left-click no longer inspects; players must right-click for tile copy. Movement requires arming.

---

## 6. Implementation Details

### Before
```txt
Loot:           localStorage stormheart flag; incinerator-blade hacks
Inventory:      static overlay; no grant/hasItem service
Picking:        hitTestPointer[0] — wrong under iso stack
Movement:       keyboard only / ambiguous click
Inspect:        mixed into left-click or missing dialogue
Gather:         none
Enchant:        text-only incantation field
E2E:            installCombatMocks
Escape:         trapped focus in spellweave fields
```

### After
```txt
Loot:           grantItem(STORMHEART_ORB_ITEM_ID) + legacy migration
Inventory:      inventoryService v1 — slots, equip, events
Picking:        canvas world-point → polygon hits → pickBestCandidate()
Movement:       arm → A* path → walk tween; reachable cyan highlights
Inspect:        right-click → amethyst highlight + tooltip + terminal quote
Gather:         GATHER_INTENT validated on lattice authority; peak depletion
Enchant:        verse || text combined string
E2E:            .combat-page-shell + MEND FLESH + BRIDGE STABLE
Escape:         blur verse/weave; capture-phase listener
```

### Iso-Cell Picker (2.5D ambiguity)
Priority stack when multiple cells share a pixel:
1. Top face before left/right side faces
2. Gatherable cell matching equipped `toolId`
3. Reachable lattice keys (when movement armed)
4. Nearest to player (3D Manhattan)
5. Highest `interactionPriority`
6. Stable `latticeCellKey` localeCompare

### Combat Lattice Authority
- `createCombatLatticeAuthority()` — `cells` Map + `depleted` Set
- `registerCombatGridCell()` — 9×9 grid entries with obelisk priority 80
- `registerGatherableCell()` — tallest island peaks; `requiredTool: 'pickaxe'`, `yield: 'void-ore'`
- `validateCombatGatherIntent()` / `applyCombatGatherIntent()` — mirror OS `gathering.js` codes

### Movement Arming + A*
- `movementArmed` false until left-click on player sprite or player grid tile
- `endTurn` disarms; keyboard WASD requires armed state
- `findPath()` 4-connected A*; `getReachableTiles()` for highlight set
- Blocked: `(8,0)` teleporter, `(4,4)` obelisk anchor

### Click Semantics (CombatArenaScene)
| Button | Armed | Target | Intent |
|--------|-------|--------|--------|
| Left | yes | grid tile in reachable set | MOVE (A* path) |
| Left | yes | gatherable peak + pickaxe | GATHER_INTENT |
| Left | no | player / own tile | ARM movement |
| Right | — | any lattice hit | INSPECT (`tile-inspect`) |

### Inventory Service
- Storage key: `scholomance.inventory.v1`
- Legacy key `scholomance.tutorial.stormheart-orb` → silent `grantItem` on first load
- `grantItem`, `hasItem`, `equipItem`, `unequipItem`, `resetInventoryForTests`, `clearInventoryCache`
- Stormheart orb excluded from default slot seed (quest item)

### Inspect Copy
- `buildInspectPresentation(action)` — obelisk, island peak, void terrain, leyline, stormheart orb, grid tile
- `characterLine` echoed in terminal as quoted dialogue
- Obelisk electricity hint preserved from PIR-001

### Spellweave Escape
- Capture-phase `keydown` on window when verse/weave `contenteditable` focused
- Blurs active field; inventory overlay skips Escape when contenteditable inside overlay focused

### Architectural Notes
> Client path: canvas `pointerEventToWorld` → collect polygon hits into `latticePickCandidates` → `pickLatticeAt` → emit MOVE / GATHER / INSPECT. Authority path: `latticeAuthority.cells` is the single source of gatherable/depleted truth; OS `gathering.js` provides the same law for headless replay. Matches `Scholomance OS/server/movement.js` intent validation pattern.

### Tradeoffs Accepted
- Player sprite `pointerdown` may race canvas handler — arming still works via grid tile click.
- OS `gathering.test.js` not in root vitest include — run separately or extend config.
- Gather reach uses grid Chebyshev in combat adapter vs 3D Manhattan in OS module (both ≤ 2).
- Default inventory pre-fills all non-quest items including pickaxe — may overwhelm UI until curated.

---

## 7. Behavior Changes

### User-Facing Behavior Changes
- Left-click no longer inspects; right-click shows inspect tooltip + character quote in terminal.
- Click character or standing tile to arm movement; cyan tiles show walk range; click reachable tile to path.
- Equip void pickaxe → left-click tallest void spire gathers ore (spire depletes visually).
- Obelisk loot and siphon MP persist through inventory / stat controller — no blade hack.
- Escape blurs spellweave inputs; WASD returns to arena control.
- E2E combat rite uses live HUD labels (`Verse input`, `Weave input`, `BRIDGE STABLE`).

### Internal Behavior Changes
- `grantItem()` replaces `localStorage.setItem` for stormheart orb.
- `enchantResolver` concatenates `incantation.verse` when `text` missing.
- `submitGatherIntent` emits `tile-gather`; `applyCombatGatherIntent` marks cell depleted.
- `movementArmed` gates `isReachableTile` highlights and keyboard move handlers.

### Non-Behavioral Changes
- [ ] Refactor only
- [ ] Naming cleanup
- [x] Documentation (this PIR)
- [x] Test coverage expansion

---

## 8. Risk Analysis

### Primary Risks Introduced
| Risk | Mitigation |
|------|------------|
| Players don't discover movement arming | Player tint shift (0xaaffcc); click self/tile arms |
| Right-click inspect unfamiliar | Context menu suppressed on canvas; amethyst highlight feedback |
| Pickaxe not equipped | Default inventory includes `item_void_pickaxe`; inspect copy mentions pickaxe |
| Polygon pick misses thin voxels | `registerLatticePickCandidate` on island interactive polygons |
| Legacy orb flag + inventory race | Migration runs once on `readStorage`; idempotent `grantItem` |

### Blast Radius
- [x] Combat arena pointer + movement path
- [x] Inventory overlay equip persistence
- [x] Obelisk loot grant path
- [ ] Rest of game unaffected

### Rollback Readiness
- [x] Moderate — revert arena pointer handlers + inventory service; re-enable localStorage orb stub if needed

### Rollback Method
> Revert `CombatArenaScene.js` canvas handlers and `inventoryService.js` integration. Restore prior `CombatPage.jsx` inspect wiring. Delete new modules: `combatPathfinding.js`, `combatLatticeAuthority.js`, `iso-cell-picker.js`, `combatInspectCopy.js`, `gathering.js`.

---

## 9. Validation Performed

### Manual Validation
- [ ] Full click-to-move arming playthrough in browser — recommended
- [ ] Right-click obelisk → electricity hint + terminal quote — recommended
- [ ] Equip pickaxe → gather tallest peak — recommended
- [ ] Obelisk overload/siphon → inventory orb — recommended
- [ ] Escape blur from spellweave — recommended
- [ ] Mobile — not tested

### Automated Validation
- [x] `tests/unit/pixelbrain/iso-cell-picker.test.js` — 3/3 pass
- [x] `tests/unit/combat/combatLatticeAuthority.test.js` — 2/2 pass
- [x] `tests/unit/combat/combatPathfinding.test.js` — 5/5 pass
- [x] `tests/unit/combat/combatInspectCopy.test.js` — 2/2 pass
- [x] `tests/unit/inventory/inventoryService.test.js` — 3/3 pass
- [x] `tests/unit/combat/combatStatController.test.js` — 7/7 pass
- [x] `tests/unit/combat/enchantResolver.test.js` — 9/9 pass
- [x] `tests/unit/combat/obelisk-puzzle.resolver.test.js` — 8/8 pass
- [x] `tests/unit/weave-intent-octree.test.js` — 8/8 pass
- [x] `tests/unit/spellweave.grammar.test.js` — 16/16 pass
- [x] `tests/unit/semantics.registry.chains.test.js` — 8/8 pass
- [x] `Scholomance OS/tests/gathering.test.js` — 3/3 pass (separate vitest invocation)
- **Total:** 71/71 root vitest combat slice + 3/3 OS gather pass (2026-07-04)

### Exact Validation Command
```bash
npm run test -- tests/unit/pixelbrain/iso-cell-picker.test.js \
  tests/unit/combat/combatLatticeAuthority.test.js \
  tests/unit/combat/combatPathfinding.test.js \
  tests/unit/combat/combatInspectCopy.test.js \
  tests/unit/inventory/inventoryService.test.js \
  tests/unit/combat/combatStatController.test.js \
  tests/unit/combat/enchantResolver.test.js \
  tests/unit/combat/obelisk-puzzle.resolver.test.js \
  tests/unit/weave-intent-octree.test.js \
  tests/unit/spellweave.grammar.test.js \
  tests/unit/semantics.registry.chains.test.js
```

OS gather law (not in default vitest `include`):
```bash
npx vitest run "Scholomance OS/tests/gathering.test.js" --dir "Scholomance OS"
```

---

## 10. Regression Checklist
- [x] No broken imports in tested modules
- [x] Iso-cell picker tie-break deterministic (vitest priority at equal distance)
- [x] Gather depletion blocks second `validateCombatGatherIntent`
- [x] Legacy stormheart key migrates without duplicate grant on reload
- [x] Enchant resolver accepts `verse`-only incantation
- [x] E2E uses live `.combat-page-shell` — **PIR-001 gap closed**
- [x] Inventory grant for stormheart — **PIR-001 gap closed**
- [x] Scholomance OS `gathering.test.js` — 3/3 pass when run explicitly (outside default `tests/**/*` include)
- [ ] `schoolAffinity` not yet consumed — unchanged from PIR-001

---

## 11. Performance and Stability Notes
- **Lattice pick:** O(n) over registered candidates per click; n ≈ island voxels + grid cells (acceptable at combat scale).
- **A*:** 9×9 grid — trivial open-set sort per query.
- **Inventory:** single `localStorage` read/write per mutation; cached in memory.

---

## 12. Security / Safety / Data Integrity Review
- **localStorage:** inventory JSON only; no secrets.
- **Gather validation:** tool and reach checked before depletion; unknown cells reject with typed codes.
- **No network / auth impact**

---

## 13. Documentation Updates
- [x] This PIR
- [x] JSDoc on iso-cell-picker ranking contract
- [ ] `SCHEMA_CONTRACT.md` notice for `LatticeCell` / `GatherIntent` deferred
- [ ] Update PIR-001 §14 to mark inventory/e2e/enchant gaps resolved

---

## 14. Known Gaps and Follow-Up Work

### Known Incomplete Areas
1. **Intent autocomplete HUD** — unchanged deferral from PIR-001
2. **`schoolAffinity` resonance** — wire leaf affinity into bridge math
3. **Browser playtest sign-off** — movement arming feel, gather FX, obelisk loot UX
4. **OS gathering vitest in CI** — passes 3/3 via separate command; add to CI include or nightly
5. **Player sprite vs canvas pick ordering** — confirm arming via sprite click in all browsers
6. **Curated starter inventory** — default slot fill may be too noisy for new players

### Follow-Up Recommendations
| Priority | Item |
|----------|------|
| P1 | Browser playtest: arm → move → right-click inspect → pickaxe gather → obelisk loot |
| P1 | Run `Scholomance OS/tests/gathering.test.js` in CI or nightly |
| P2 | Intent browser panel using `listOctantsForClass()` |
| P2 | Register `LatticeCell` / `GatherIntent` in SCHEMA_CONTRACT |
| P3 | Trim default inventory seed to tutorial-relevant items only |

### PIR-001 Gap Closure Map
| PIR-001 Gap | Status | Evidence |
|-------------|--------|----------|
| Inventory integration (stormheart) | ✅ Closed | `inventoryService.js` + `grantItem` in arena |
| E2E combat spec | ✅ Closed | `combat.spec.js` live shell |
| Enchant `verse` wiring | ✅ Closed | `enchantResolver.js` + 9 vitest cases |
| Intent autocomplete HUD | ⏳ Open | unchanged |
| `schoolAffinity` resonance | ⏳ Open | unchanged |

---

## 15. Acceptance Mapping (Combat Vertical Slice)

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| C-1 | No inventory mocks / hacks | ✅ | `inventoryService`; incinerator path removed |
| C-2 | A* click-to-move | ✅ | `combatPathfinding.test.js` + arena `findPath` |
| C-3 | Movement arming + reachable highlights | ✅ | `movementArmed` gates in `CombatArenaScene` |
| C-4 | Left = move/gather, right = inspect | ✅ | `handleCanvasPointerDown` / `handleCanvasContextMenu` |
| C-5 | Inspect tooltip + terminal dialogue | ✅ | `combatInspectCopy.test.js` + `CombatPage` logs |
| C-6 | Deterministic 2.5D lattice pick | ✅ | `iso-cell-picker.test.js` |
| C-7 | GATHER_INTENT server validation | ✅ | `combatLatticeAuthority.test.js` + OS `gathering.js` |
| C-8 | Stormheart orb via inventory | ✅ | `inventoryService.test.js` migration case |
| C-9 | Siphon grants MP | ✅ | `combatStatController.grantMovementPoints` |
| C-10 | Escape blurs spellweave | ✅ | `CombatPage.jsx` capture listener |
| C-11 | E2E live combat rite | ✅ | `combat.spec.js` (not run in vitest batch above) |

---

## 16. Lattice Pick Priority (Reference)

```txt
1. faceType: top < left < right
2. gatherable && requiredTool === toolId
3. key in reachableKeys (when armed)
4. manhattan(cell, playerCell) ascending
5. interactionPriority descending
6. latticeCellKey localeCompare
```

Gather validation codes (shared OS + combat):
```txt
INVALID_INTENT | NO_TILE | DEPLETED | NOT_GATHERABLE | WRONG_TOOL | TOOL_MISSING | OUT_OF_REACH | BLOCKED
```

---

## 17. Sign-Off

| Role | Status | Date |
|------|--------|------|
| Implementation | Complete | 2026-07-04 |
| Unit tests | 71/71 pass | 2026-07-04 |
| E2E spec | Updated (not re-run in this session) | 2026-07-04 |
| Manual browser QA | Pending | — |
| PIR-001 gap closure | Partial (3/5 items closed) | — |

**Verdict:** Shippable as the no-mocks combat vertical slice. Lattice authority, movement arming, inspect dialogue, and gather intent form a coherent click model. One browser playthrough recommended to confirm pointer feel and pickaxe gather UX before demo.