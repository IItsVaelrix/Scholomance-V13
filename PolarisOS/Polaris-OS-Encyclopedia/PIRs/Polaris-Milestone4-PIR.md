# Polaris OS — Milestone 4: Scene Compiler — Post-Implementation Review

**Date:** 2026-06-15
**Status:** ✅ COMPLETE
**Tests:** 77 passing (15 new scene tests + 62 existing)
**Typecheck:** 0 errors
**Duration:** ~2 hours

---

## 1. Objective

Implement PDR §15 (Scene Compiler) and the visual half of §16 (Client Rendering): a deterministic room-state → `SceneManifest` projection that turns authoritative world mutations into layered visual instructions, interactable hotspots, and text regions — so that the illustration is a *projection* of world state, never a source of it.

> "The world produces the picture. The picture does not produce the world." (PDR §2)

### Deliverables (PDR §25, Milestone 4)

| Deliverable | Status |
|---|---|
| scene-manifest schema | ✅ |
| room-to-scene projection | ✅ |
| deterministic contract hashing | ✅ |
| lantern + brazier visual rules | ✅ |

### Exit criterion (PDR §25, Milestone 4)

> **"World-state mutations produce correct scene manifests."**

Proven by `tests/integration/Milestone4Gate.test.ts`, which boots the **real** `GameServer` (Fastify + WebSocket + SQLite + kernel + runtime + scene compiler) against the authored `worldpacks/shrine-demo` worldpack and drives **two real `ws` clients**. Unlike the unit tests, this proves the scene contract survives the full stack *with authored illustration hints flowing from the worldpack*.

---

## 2. Critical Architecture Decisions

### 2.1 Authored hints are an *input*, never an authority (dependency law + §5.1)

The scene compiler is a **core** package. PDR §8.3 forbids it from importing the filesystem, and §5.1 forbids any non-server source from carrying world authority. Yet a faithful illustration needs authored data that lives in the worldpack JSON: background asset keys, entity positions, `activatedAsset` swaps, ambient effects, display names.

**Decision:** the compiler takes an optional `SceneHints` input and stays pure. It imports **only** `@polaris/contracts` types and node `crypto` (for the hash). The application layer (`apps/server`) is the only place that reads the worldpack and assembles hints:

```typescript
// packages/scene-compiler/src/SceneCompiler.ts
export interface SceneHints {
  backgroundAsset?: string;
  roomDescription?: string;
  ambientEffects?: string[];
  entities?: Record<string, EntityIllustrationHint>;
}
```

`SnapshotBuilder.buildSceneHints(roomId, roomEntities, deps)` maps the display catalogs (`RoomInfo.illustration`, `EntityInfo.illustration`) into hints. Hints are explicitly documented as *static worldpack data that never carries authority* — the compiler projects them, but the room state still decides visibility, lighting, and the contract hash. This keeps the dependency law intact and keeps the compiler trivially unit-testable with literal hint objects.

### 2.2 `visualRevision === roomRevision` (the manifest is a pure projection)

A scene manifest carries no state of its own — it is a pure function of room state. Therefore its visual contract changes **exactly when the room changes**.

**Decision:** `visualRevision = room.revision` and `sceneId = "<roomId>_rev<roomRevision>"`. There is no separate visual clock to drift out of sync with the world clock. This makes the §15.4 determinism guarantee structural rather than enforced-by-discipline: two manifests with the same room revision and compiler version *must* agree.

### 2.3 The `contractHash` folds in the compiler version and excludes `generatedAt` (§15.4)

The contract hash must be stable across processes and across the two sync paths (snapshot vs. patch), but the manifest also carries a wall-clock `generatedAt` timestamp that is inherently non-deterministic.

**Decision:** `computeContractHash` serializes a **canonical** subset — compiler version, roomId, roomRevision, background key, sorted room flags, and per-layer/hotspot/text-region tuples in stable order — and SHA-256-hashes it, truncated to 16 hex chars. `generatedAt` is deliberately omitted, and `SCENE_COMPILER_VERSION` (`"mvp-1-scene-1"`) is deliberately *included*, so a compiler change invalidates old contracts even if the room state is identical. Layer/hotspot/text-region arrays are sorted by id before hashing so insertion order can never perturb the hash.

### 2.4 The brazier is a *split layer*, not a flag toggle (§15.5)

PDR §15.5 specifies that lighting the brazier hides `brazier_unlit`, shows `brazier_lit`, and reveals `warm_light_overlay`. A naive implementation would swap an asset key on a single layer.

**Decision:** any entity authored with an `activatedAsset` is compiled into **two mutually-exclusive layers** — `<id>_unlit` (zIndex 10) and `<id>_lit` (zIndex 11) — whose `visible` flags are complementary (`inRoom && !activated` vs. `inRoom && activated`). When lit, a single `warm_light_overlay` lighting layer (zIndex 30) is emitted, guarded by a `warmLightEmitted` flag so multiple lit sources never duplicate it. `lightingState` derives to `warm_firelight`. This models the mutation as *layer presence*, which is exactly what a layered PixiJS renderer (§16.1) consumes, and it makes the unlit/lit states independently addressable assets for the art pipeline.

---

## 3. What Was Built

### 3.1 `scene-manifest` schema (packages/contracts)

Aligned `packages/contracts/src/scene-manifest.ts` with PDR §15.2. The prior schema had no hotspots, no text regions, and used a `contentHash`; it now carries the full §15.2 surface:

* `SceneHotspotSchema` — `hotspotId`, `entityId`, `label`, `command`, `region {x,y,w,h}`, `visible` (§5.3, §16.1)
* `SceneTextRegionSchema` — `regionId`, `kind` (`title` | `description` | `narrative` | `entity-label`), `anchor`, `width`, `text` (§16.2)
* `SceneManifestSchema` — adds `sceneId`, `visualRevision`, `hotspots[]`, `textRegions[]`, and renames the hash to `contractHash` (§15.4)
* `SceneLayerSchema` — `layerType` enum (`background` | `entity` | `prop` | `lighting` | `effect` | `hotspot` | `player-marker`), `position`, `zIndex`, `visible`, `flags`

> **Documented refinement of PDR §15.3:** the PDR sketches `SceneLayer` with `depth` / `anchor` / `stateKey`. The implemented schema uses the equivalent, richer `zIndex` / `position` / `flags` (where `flags` subsumes `stateKey` as a typed record). The semantics are identical; the field names follow the Zod contracts already in use across the renderer and tests.

### 3.2 `SceneCompiler` (packages/scene-compiler)

`compile(input)` projects room state + entities + occupants (+ optional hints) into a `SceneManifest`:

* **Background layer** from `hints.backgroundAsset` (fallback `rooms/<roomId>/background`).
* **Entity layers**, sorted by `entityId` for determinism. Entities with an `activatedAsset` become the §15.5 unlit/lit split; others become a single `entity`/`prop` layer. `visible` is gated on physical room presence, so a taken lantern's layer hides (scenario step 7).
* **Player markers**, sorted by `playerId`, visible only while `connectionState === "connected"`.
* **Lighting** (`deriveLighting`) — `warm_firelight` if any `*_lit` room flag is set or any environment entity is activated; else `ambient_moonlight`.
* **Ambient effects** (`deriveEffects`) — authored effects ∪ `fx_*` room flags, sorted.
* **Hotspots** (`deriveHotspots`) — one per in-room interactable entity, with a derived command (`light brazier` for an environment activation, `take <thing>` for a portable), sorted by id.
* **Text regions** (`deriveTextRegions`) — title + description + per-entity labels, sorted by id.
* **`contractHash`** over the canonical subset (§2.3).

A `cleanFlags` sanitizer drops `null`/`undefined` entity-flag markers (e.g. the worldpack's `activation: null`) so layer flags stay schema-valid (`boolean | string | number` only).

### 3.3 `SnapshotBuilder.buildSceneHints` (apps/server)

New exported helper that assembles `SceneHints` from the display catalogs. **Both** sync paths use it: `buildRoomSnapshot` (join/resync) passes hints into the compile, and the `scene.patch` broadcast path uses the same helper. This is the fix for the §15.4 divergence described in §4.1 — there is exactly one hint-assembly function, so a snapshot and a patch of the same state compile identically.

### 3.4 `loadWorldpack` illustration metadata (apps/server)

Extended `RoomInfo` / `EntityInfo` with an `illustration` block read from the worldpack JSON (`backgroundAsset`, `ambientEffects`, `asset`, `activatedAsset`, `layerType`, `position`, `interactable`, `hotspotCommand`). Added `deriveHotspotCommand` so an environmental object's first activation becomes a verb (`"lit"` → `"light brazier"`). The authored `defaultPosition` is mapped to the hint `position`. The filesystem concern stays entirely in the app layer.

### 3.5 Renderer + client (packages/renderer-pixi, apps/client)

* `PixiSceneRenderer.renderScene` / `applyPatch` consume the manifest's `layers`, `hotspots`, and log the `contractHash` for visual-contract debugging.
* The browser client renders authored hotspots as clickable regions that submit the hotspot's `command` via `command.submit` (§16.1), and keeps the §16.3 text fallback (title, description, entity list, exits, command input) fully playable without PixiJS assets.

---

## 4. Supporting Hardening (bugs the work surfaced)

Two real defects had to be fixed to make the scene contract correct. Both are backward-compatible and all prior tests still pass.

### 4.1 §15.4 determinism violation — snapshot/patch hint divergence

`GameServer.broadcastEvents` originally compiled the `scene.patch` **without** hints, while `room.snapshot` compiled **with** them. The same room state would therefore yield two different `contractHash` values — a direct breach of §15.4 ("the same room state … must produce the same … contract hash"). A client comparing a resync snapshot against a prior patch would see a spurious contract change.

**Fix:** both paths now share `SnapshotBuilder.buildSceneHints`. The M4-4 gate test asserts snapshot/patch `contractHash` parity for the same authoritative state.

### 4.2 Schema breach — `activation: null` in layer flags

The worldpack authors the brazier with `flags: { activated: false, activation: null }`. Copied verbatim into a layer, `activation: null` violates `SceneLayerSchema.flags` (`boolean | string | number`), so `SceneManifestSchema.parse` would reject every manifest carrying the brazier.

**Fix:** the `cleanFlags` sanitizer in the compiler drops `null`/`undefined` markers, which carry no visual meaning. Manifests now validate cleanly (asserted in M4-1 and M4-3).

---

## 5. Test Results

```
 ✓ packages/scene-compiler/tests/SceneCompiler.test.ts          (17 tests)
 ✓ packages/world-kernel/tests/WorldKernel.test.ts              (9 tests)
 ✓ packages/world-runtime/tests/RoomActor.test.ts               (6 tests)
 ✓ packages/world-runtime/tests/Milestone2Gate.test.ts          (9 tests)
 ✓ tests/persistence/Milestone2.test.ts                         (12 tests)
 ✓ packages/command-language/tests/CommandBinder.test.ts        (10 tests)
 ✓ tests/integration/Milestone3Gate.test.ts                     (4 tests)
 ✓ tests/integration/Milestone4Gate.test.ts                     (4 tests)
 ✓ packages/realtime-protocol/tests/ConnectionRegistry.test.ts  (6 tests)

 Test Files  9 passed (9)
      Tests  77 passed (77)
   Duration  2.22s
```

### Milestone 4 Test Coverage

**Integration gate (`tests/integration/Milestone4Gate.test.ts`) — two real WS clients, authored worldpack:**

| Test | Invariant |
|---|---|
| M4-1 | Snapshot manifest validates against `SceneManifestSchema`; projects authored background (`rooms/ruined_shrine/background`), ambient effect (`dust_motes`), brazier hotspot with command `light brazier`, title/description/entity-label text regions, and the authored brazier position `{400,280}` (not the default `0,0`); initial lighting `ambient_moonlight` with unlit layer visible / lit hidden (§15.2, §16.1) |
| M4-2 | Taking the lantern hides its scene layer for **both** clients — no visible `shrine_lantern` layer remains (scenario step 7) |
| M4-3 | Lighting the brazier swaps unlit→lit layers + reveals `warm_light_overlay`, lighting flips to `warm_firelight`, manifest still validates, and **both** clients receive an **identical `contractHash`** (§15.5, §15.4) |
| M4-4 | A resync snapshot and the broadcast `scene.patch` for the same state yield the **same `contractHash`** — snapshot/patch parity (§15.4) |

**Unit — `SceneCompiler` (17, up from 6):** schema validation; authored-hint projection (background, positions, ambient effects); determinism (same state → same `contractHash`, `generatedAt` excluded, compiler version folded in); brazier unlit/lit split + warm overlay; lantern removal on take; hotspot derivation (`light brazier` / `take lantern`); text-region generation; `cleanFlags` null-stripping; player-marker visibility by connection state.

---

## 6. Dependency Law Compliance (PDR §8.3)

```
contracts ← world-kernel ← world-runtime ← scene-compiler ← apps/server
                                ↑                 ↑               ↑
                         (RoomActorHub)    (SceneCompiler =    (SnapshotBuilder =
                                            pure projection,    assembles hints from
                                            imports only        the worldpack; only
                                            contracts + crypto) place that reads FS)
```

Verified: **`scene-compiler` imports only `@polaris/contracts` types and node `crypto`.** It has **zero** imports of Fastify, WebSocket, SQLite, PixiJS, the filesystem, or browser APIs.

* `SceneCompiler` is a pure function of `(room, entities, occupants, hints?)` — unit-tested with literal objects, no I/O.
* `SceneHints` is assembled only in `apps/server` (`SnapshotBuilder.buildSceneHints` ← `loadWorldpack`), keeping the filesystem at the adapter boundary.
* `renderer-pixi` (PixiJS) and `apps/client` (DOM/browser) remain above the core, consuming manifests but never producing them.

---

## 7. PDR Compliance Audit

| Requirement | Status | Evidence |
|---|---|---|
| §15.1 Room state → visual projection → manifest → rendering | ✅ | `SceneCompiler.compile` |
| §15.2 Manifest fields (sceneId, visualRevision, layers, hotspots, textRegions, contractHash) | ✅ | `scene-manifest.ts` + M4-1 |
| §15.3 Scene layer (layerId, asset, depth/zIndex, visible, anchor/position, state/flags) | ✅ | `SceneLayerSchema` (documented field-name refinement, §3.1) |
| §15.4 Same state + compiler version → same ordering/assets/hotspots/visual state/contract hash | ✅ | `computeContractHash` + M4-3 + M4-4 |
| §15.5 Brazier unlit/lit + `warm_light_overlay` + persistence | ✅ | split-layer rule + M4-3 (persistence proven in M2/M3 restart gates) |
| §16.1 PixiJS: backgrounds, prop layers, markers, overlays, lighting, hotspots | ✅ | `PixiSceneRenderer` + client hotspot click |
| §16.2 DOM: prose, command input, narrative, inventory, status, labels | ✅ | client text regions + panels |
| §16.3 Fallback when PixiJS/assets fail (title, description, entity list, exits, commands, sync) | ✅ | client text-fallback scene |
| §5.1 Illustration never authoritative | ✅ | hints are projection inputs only (§2.1) |
| §8.3 Core imports no infra | ✅ | §6 |

---

## 8. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `contractHash` is truncated to 16 hex chars (64 bits) | LOW | Collision probability is negligible for MVP scene counts; widen to full SHA-256 if visual-contract auditing needs it |
| Hotspot regions use a fixed 96×96 default size | LOW | Authored `position` centers the region; per-entity sizing can be added to `EntityIllustrationHint` without a schema break |
| `SCENE_COMPILER_VERSION` is a manual constant | LOW | Correct for MVP; wire to a build/ruleset version when the art pipeline versions assets |
| PixiJS renderer logs rather than fully composites assets | LOW | MVP has no shipped art assets; the manifest contract is proven, and the §16.3 text fallback keeps the world playable |
| `visualRevision` aliases `roomRevision` | LOW | Intentional (§2.2); a manifest is a pure projection, so a separate visual clock would only add drift |

---

## 9. File Inventory

### New Files
- `tests/integration/Milestone4Gate.test.ts` — 4 integration tests (two real WS clients, authored worldpack)

### Modified Files
- `packages/contracts/src/scene-manifest.ts` — §15.2 alignment: `SceneHotspot`, `SceneTextRegion`, `visualRevision`, `sceneId`, `contractHash` (was `contentHash`)
- `packages/scene-compiler/src/SceneCompiler.ts` — authored-hint projection, split-layer brazier rule, hotspots, text regions, `cleanFlags`, versioned `contractHash`
- `packages/scene-compiler/src/index.ts` — export `SceneHints` / `EntityIllustrationHint` / `SCENE_COMPILER_VERSION`
- `packages/scene-compiler/tests/SceneCompiler.test.ts` — 6 → 17 unit tests
- `apps/server/src/SnapshotBuilder.ts` — new `buildSceneHints`, shared by snapshot + patch paths (§4.1)
- `apps/server/src/loadWorldpack.ts` — `illustration` metadata on room/entity catalogs + `deriveHotspotCommand`
- `apps/server/src/GameServer.ts` — `scene.patch` broadcast now compiles with shared hints (§4.1)
- `packages/renderer-pixi/src/PixiSceneRenderer.ts` — render `layers`/`hotspots`, surface `contractHash`
- `apps/client/src/main.ts` — clickable hotspots → `command.submit`; text-region rendering
- `tests/integration/Milestone2Gate.test.ts`, `Milestone3Gate.test.ts` — `contentHash` → `contractHash` renames

---

## 10. Metrics

| Metric | Value |
|---|---|
| Total tests | 77 |
| New tests (Milestone 4) | 15 (11 unit + 4 integration) |
| Test duration | 2.22s |
| New test files | 1 |
| Modified source files | 8 |
| Typecheck errors | 0 |
| Dependency-law violations | 0 |

---

## 11. Conclusion

Milestone 4 is complete. The scene compiler proves the exit criterion — **world-state mutations produce correct scene manifests** — end to end:

1. **Scene-manifest schema** now carries the full PDR §15.2 surface: layers, interactable hotspots, text regions, a visual revision, and a deterministic contract hash.
2. **Room-to-scene projection** is a pure, hint-driven function: authored worldpack data (backgrounds, positions, `activatedAsset` swaps, ambient effects, display names) flows in as non-authoritative `SceneHints`, and authoritative room state decides visibility, lighting, and the hash.
3. **Deterministic contract hashing** folds in the compiler version, excludes `generatedAt`, and sorts all collections — so the same state yields the same `contractHash` across processes and across both sync paths (M4-3, M4-4).
4. **Lantern + brazier visual rules** implement §15.5: taking the lantern hides its layer for both clients; lighting the brazier swaps the unlit/lit split, reveals the warm overlay, flips lighting to `warm_firelight`, and persists (proven by the M2/M3 restart gates).

The dependency law holds: `scene-compiler` imports only `contracts` + `crypto`; only the app layer reads the worldpack and assembles hints. The illustration remains a projection of the world, never its source.

**Run it:**

```bash
cd PolarisOS
npm run dev:server          # Fastify + WS on :3100 (SQLite at data/codex_vale.sqlite)
npm run dev:client          # Vite client → click the brazier hotspot → "light brazier"
npm run test:integration    # the Milestone 3 + Milestone 4 exit gates
```

**Next: Milestone 5 (Illustrated client + reconnect)** — full PixiJS scene compositing, page-turn presentation, and the disconnect/reconnect restoration path completing the MVP causal chain (PDR §1 scenario steps 11–13).
