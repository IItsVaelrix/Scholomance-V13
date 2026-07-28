# Polaris OS — Milestone 5: Illustrated Client — Post-Implementation Review

**Date:** 2026-07-27
**Status:** ✅ COMPLETE
**Tests:** 93 passing (12 new scenePlan unit tests + 4 new Milestone5Gate integration tests + 77 existing)
**Typecheck:** 0 errors
**Browser verification:** full MVP scenario played through headless Chromium (WebGL) — all checks pass

---

## 1. Objective

Implement PDR §25 Milestone 5 (Illustrated Client) and the rendering half of §16 (Client Rendering): turn the authoritative `SceneManifest` produced by Milestone 4 into an actual illustrated storybook page in the browser via PixiJS — while keeping the illustration a *projection* of world state, never a source of it, and keeping the world fully playable when WebGL or art assets are unavailable.

> "The world produces the picture. The picture does not produce the world." (PDR §2)

### Deliverables (PDR §25, Milestone 5)

| Deliverable | Status |
|---|---|
| PixiJS room renderer | ✅ |
| DOM narrative interface | ✅ (wired to live updates) |
| command input | ✅ (keyboard + button + hotspot click) |
| inventory | ✅ (now tracks mutations live) |
| visible player list | ✅ |
| fallback text mode | ✅ (automatic on WebGL failure + `?mode=text`) |

### Exit criterion (PDR §25, Milestone 5)

> **"The complete MVP scenario is playable through the browser."**

Proven two ways:

1. **`tests/integration/Milestone5Gate.test.ts`** boots the **real** `GameServer` (Fastify + WebSocket + SQLite + kernel + runtime + scene compiler), drives **two real `ws` clients** through the scenario, and runs every authoritative manifest through the client's pure `buildScenePlan` projection — proving the illustration tracks the world (lantern removed on take, brazier unlit→lit + warm overlay, identical plan hash for both clients).
2. **Headless Chromium run** of the actual Vite client against the actual server: enter room → `take lantern` → `light brazier`, asserting the canvas renders (WebGL), the lantern moves into the inventory panel and leaves the "Here" panel, and the narrative + scene update. A pixel-level check confirmed the lit scene is measurably warmer (avg RGB shifted from cool `(15,15,35)` to warm `(115,80,49)`).

---

## 2. Critical Architecture Decisions

### 2.1 Split the projection (pure) from the drawing (browser-only)

PixiJS needs WebGL + DOM and **cannot run under the node test runner** (`vitest` environment is `node`; there is no jsdom/happy-dom in the repo). If all renderer logic lived inside the PixiJS class, none of the client's visual decisions could be tested.

**Decision:** introduce `packages/renderer-pixi/src/scenePlan.ts` — a **pure, deterministic, browser-safe** module that projects a `SceneManifest` into a `SceneRenderPlan` (ordered draw instructions, lighting tint, procedural glyph per layer, hotspot rectangles, text regions, and accessible fallback lines). It imports only `@polaris/contracts` types and uses a self-contained FNV-1a hash (no `node:crypto`, so it also runs in the browser bundle).

`PixiSceneRenderer` becomes a thin browser shell: it lazily `import("pixi.js")`, builds a plan via `buildScenePlan`, and only knows how to *draw* a plan. Every visual *decision* (ordering, tint, glyph choice, fallback text) lives in the pure module and is unit-testable in node. This is the client-side mirror of Milestone 4's "manifest is a pure projection of state": here, **the plan is a pure projection of the manifest**.

### 2.2 `pixi.js` is imported lazily, so importing the renderer never touches WebGL

A top-level `import "pixi.js"` would drag WebGL/DOM into node typecheck and tests and would crash any environment without a GPU.

**Decision:** `PixiSceneRenderer.init()` does `await import("pixi.js")` inside a `try/catch`. Merely importing `@polaris/renderer-pixi` is side-effect-free. If context creation throws, the renderer flips to fallback text mode instead of crashing (PDR §5.4). This keeps `tsc --noEmit` and the node test suite clean while the browser gets real WebGL.

### 2.3 Procedural glyphs: the scene stays illustrated when assets are missing

The MVP ships **no binary art** (`worldpacks/shrine-demo/assets/` is empty). PDR §5.4 requires the world to stay playable when an asset fails to load; PDR §26.2 says to use fixed MVP assets and layered composition.

**Decision:** every layer carries a **procedural vector glyph** (a `GlyphSpec`: shape + color + size) resolved deterministically from its `assetKey`/`layerType` in `scenePlan.ts`. The renderer draws the glyph immediately and overlays an authored texture only if one loads (`preload()` is best-effort; a failed load is silent and the glyph remains). Result: the scene is always visibly illustrated — lantern as a brass diamond, brazier as a flame, players as green markers, the warm overlay as a full-canvas tint — with zero binary assets, and real art can drop in later without changing any projection logic.

### 2.4 `scene.patch` now carries refreshed panel state (the playable-scenario fix)

The Milestone 3 client rendered its side panels (Here / Present / Inventory) **only from full `room.snapshot`** messages. Incremental updates arrived as `domain.events` (prose) + `scene.patch` (canvas manifest) — neither carried entity/player state — so after `take lantern` the canvas updated but the inventory panel stayed empty. That violates scenario step 6 ("the lantern appears in the successful player's inventory") and thus the Milestone 5 exit criterion.

**Decision:** the server already recomputes the room's entities + occupants on every broadcast. `broadcastEvents` now attaches `entities` (visible = room + carried), `players` (occupants), and `entityInfo` (display names) to the `scene.patch` message, reusing a new shared `collectVisibleEntities(state, room, occupants)` helper (extracted from `buildRoomSnapshot` so snapshot and patch project *identical* panel state). The client extracts `renderPanels(msg)` and calls it on both `room.snapshot` and `scene.patch`. Authority is unchanged — the client still only projects server state.

### 2.5 Entity layers carry their authored `displayName` (consistency fix)

Player-marker layers already carried `flags: { displayName }`, but entity layers only carried the entity's own flags — so a renderer had no human-readable label for the lantern/brazier (it would show `entities/lantern`). The authored `displayName` was already flowing into hotspots and text regions, just not layer flags.

**Decision:** `SceneCompiler` now merges `hint.displayName` into entity layer flags via a `layerFlags(entity, hint)` helper (used at all three layer-creation sites). This is **backward-compatible with the Milestone 4 visual contract**: layer flags are deliberately *excluded* from the `contractHash` inputs (§15.4), so the hash is unchanged — confirmed by the Milestone 4 gate staying green.

---

## 3. What Was Built

### 3.1 `scenePlan.ts` — pure manifest → plan projection (packages/renderer-pixi)

`buildScenePlan(manifest, { fallbackMode? }) → SceneRenderPlan`:

* **Sprites** — visible, non-background layers mapped to `PlanSprite`s (position, zIndex, resolved `GlyphSpec`, display label), in **total deterministic order** (`zIndex` asc, then `layerId`). Input array order can never perturb output.
* **Lighting** — `lightingState` → tint/alpha/background palette (`warm_firelight` = orange `0xffb066`; `ambient_moonlight` = cool `0x8fa9d6`).
* **Hotspots** — visible only, sorted by id, carrying their authored `command`.
* **Text regions** — title / description / entity labels.
* **Fallback lines** — accessible text projection (PDR §16.3): lighting, per-entity `[type] name`, effects, and an `Interact:` line.
* **`planHash`** — FNV-1a over every visually-meaningful field (excludes `generatedAt`; includes `mode` so illustrated ≠ fallback). Pure and platform-independent.

### 3.2 `PixiSceneRenderer` — browser adapter (packages/renderer-pixi)

* `init()` — lazy `import("pixi.js")`, creates the `Application`, mounts an accessible `<canvas role="img">`; on failure → fallback text mode.
* `renderScene(manifest)` / `applyPatch(manifest)` — build the plan, then either draw it (PixiJS) or project fallback text. A patch is a full deterministic re-projection (the server sends a complete manifest on `scene.patch`).
* `drawPlan` — background fill → sprites in z-order (procedural glyph, or texture if cached) → full-canvas lighting tint → text regions → interactive hotspots wired to `onCommand`.
* `preload(assetKeys)` — best-effort texture cache; failures are silent (glyph stays).
* Fallback text renderer — mounts an accessible DOM region with lighting, layers, clickable hotspot buttons, and a `scene … #contractHash #planHash` debug line.
* `destroy()` — tears down the Pixi app, DOM, and texture cache.

### 3.3 Client wiring (apps/client)

* `main.ts` now imports `PixiSceneRenderer` and the real `SceneManifest` type from `@polaris/contracts` (type-only; erased at bundle time). The stale local scene interfaces were removed.
* The renderer is instantiated against `#scene` with `onCommand: sendCommand`; `?mode=text` forces fallback for review/low-power devices.
* `renderScene` delegates to the renderer; `renderPanels` (extracted) re-projects Here/Present/Inventory on both snapshot and patch. "Here" filters to entities whose `location.type === "room"` so carried items leave the room list.
* `index.html` — canvas-friendly `#scene` styling plus styles for the fallback region, hotspot buttons, and contract-hash line.

### 3.4 Server enrichment (apps/server)

* `SnapshotBuilder.collectVisibleEntities(state, room, occupants)` — new exported helper (room entities + occupants' inventories, sorted). `buildRoomSnapshot` now uses it.
* `GameServer.broadcastEvents` — `scene.patch` now also carries `entities`, `players`, and `entityInfo` so clients re-project panels on every mutation.

---

## 4. Verification

### 4.1 Unit — `packages/renderer-pixi/tests/scenePlan.test.ts` (12 tests, node)

Determinism (same manifest → same `planHash`; independent of layer order; `generatedAt` excluded; changes when a visual field changes), z-ordering + visibility, the lantern/brazier MVP visual rules, lighting tint mapping, hotspot projection, and fallback text mode.

### 4.2 Integration — `tests/integration/Milestone5Gate.test.ts` (4 tests)

Boots the real server + two `ws` clients and runs every emitted manifest through `buildScenePlan`:

* **M5-1** initial snapshot → illustrated plan with lantern + unlit-brazier sprites, deterministic hash, brazier hotspot command `light brazier`, cool moonlight tint.
* **M5-2** `take lantern` → lantern sprite + hotspot removed from the plan (step 7).
* **M5-3** `light brazier` → unlit→lit swap + warm overlay + warm tint, and **both clients derive an identical `planHash`** (client projection parity).
* **M5-4** the same manifest projects to accessible fallback text (PDR §5.4).

### 4.3 Browser — headless Chromium against the live Vite client + server

Drove the full scenario through the real UI: connect → `take lantern` → `light brazier`. All checks passed: lantern appears in the inventory panel, leaves the "Here" panel, brazier remains, narrative updates, scene renders as an illustrated `<canvas>` (WebGL active), **no page errors**. A pixel comparison of the screenshots confirmed the lighting mutation is visibly drawn (scene average RGB `(15,15,35)` unlit → `(115,80,49)` lit; warmth `r−b` from −20 to +66).

### 4.4 Full suite

`npx vitest run` → **93 passing** (11 files), including the Milestone 2/3/4 gates (no regressions from the compiler or server changes). `tsc --noEmit -p tsconfig.json` → **0 errors**.

---

## 5. Scope Fidelity

Milestone 5 stayed locked to the MVP. No combat, crafting, procedural generation, live AI image generation, or unrestricted LLM execution (PDR §7.3). The renderer draws **fixed procedural MVP assets** per §26.2; generated art can enter later only through versioned visual contracts. The kernel was untouched; the only core change (entity `displayName` in layer flags) is a backward-compatible enrichment of the Milestone 4 projection that leaves the `contractHash` invariant.

---

## 6. Follow-ups (deferred to Milestone 6: Hardening)

* Author real PNG art under `worldpacks/shrine-demo/assets/` and wire `assetBaseUrl` to serve it; the renderer's `preload()` path will overlay textures automatically.
* Playwright e2e spec codifying the §4.3 browser run (currently verified via an ad-hoc script).
* Mobile layout review + duplicate-message and forced-restart resync drills (PDR §25 Milestone 6).
