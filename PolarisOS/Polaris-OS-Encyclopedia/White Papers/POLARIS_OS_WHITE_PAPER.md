# Polaris OS: The World Produces the Picture
## A White Paper and Field Guide to the Picture-Book MUD

**Date:** 2026-07-28

**Status:** Working MVP through the illustrated-client and PixelBrain bridge milestones

**Audience:** Players, contributors, system architects, QA engineers, and future agents

**Scope:** PolarisOS architecture, current implementation, local demonstration, and verification

**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-WP-POLARIS-OS`

---

## Abstract

Polaris OS is a persistent multiplayer literary world presented as an
illustrated storybook. Players type compact natural-language commands, share
rooms and objects, alter durable world state, and see those changes projected
into prose and pictures.

Its central law is:

> The world produces the picture. The picture does not produce the world.

The server owns the world. A deterministic kernel decides what commands mean
and which events occur. Persistence records those events. Narrative and scene
projectors translate the same authoritative state into prose and a versioned
`SceneManifest`. PixiJS draws that manifest. PixelBrain can now supply
deterministic raster assets to PixiJS, but neither PixelBrain nor PixiJS can
create entities, move objects, change z-order authority, bind commands, or
alter simulation state.

This paper has two doors:

1. **Check it out now:** launch the server and client, then play the shrine
   proof in two browser sessions.
2. **Understand what exists:** follow the causal chain from player language to
   persistent events, synchronized scenes, PixelBrain rasters, and accessible
   fallback output.

---

## 1. What Polaris Is

Polaris is a picture-book MUD: a multiplayer text world whose authoritative
state is surfaced through both literary text and illustrated scenes.

Traditional MUDs are strong at persistent worlds, shared rooms, and language
input. Illustrated games are strong at spatial legibility and atmosphere.
Polaris combines the two without allowing the image to become a hidden game
engine.

The current working title of its first world is **Codex Vale**. The MVP is a
small ruined-shrine scenario built to prove the entire architecture:

- three authored rooms
- two concurrent players
- one shared lantern
- one brazier with a persistent lit state
- deterministic command binding
- race-safe authoritative mutation
- SQLite event persistence and restart restoration
- WebSocket synchronization and resynchronization
- deterministic narrative and visual projections
- PixiJS rendering with PixelBrain, PNG, glyph, and text fallback layers

The shrine is intentionally small. Its purpose is not to demonstrate content
volume. Its purpose is to prove that every layer agrees about one changing
world.

---

## 2. Check Out Polaris in Five Minutes

### 2.1 Prerequisites

- Node.js 20.19 or newer
- npm
- a modern browser
- WebGL for the illustrated PixiJS path; the text path works without it

Commands below assume the shell is at the Scholomance repository root.

### 2.2 Install and prepare the generated assets

```bash
cd PolarisOS
npm install
npm run build:pixelbrain-assets
```

The asset build validates the source PixelBrain packets and regenerates the
fingerprinted browser registry. It should report four generated PixelBrain
assets: the player marker, lantern, unlit brazier, and lit brazier.

### 2.3 Start a fresh authoritative server

Open terminal one from `PolarisOS/`:

```bash
POLARIS_DEMO_DIR="$(mktemp -d)"
DB_PATH="$POLARIS_DEMO_DIR/codex_vale.sqlite" npm run dev:server
```

Using a fresh temporary directory guarantees that a previous demo has not
already removed the lantern or lit the brazier. The server loads
`worldpacks/shrine-demo`, creates the SQLite database, restores any state found
there, and listens on port `3100`.

Optional health check:

```bash
curl http://localhost:3100/health
```

Expected shape:

```json
{
  "status": "ok",
  "world": "codex_vale_mvp",
  "version": "0.1.0"
}
```

### 2.4 Start the illustrated client

Open terminal two from `PolarisOS/`:

```bash
npm run dev:client
```

Vite normally serves the client at:

```text
http://localhost:5173
```

Open that address in two independently created tabs or browser windows. Each
browser session receives a stable tab-local player identity, connects to
`ws://localhost:3100/ws`, identifies itself, and joins `ruined_shrine`.

To inspect the accessibility-preserving text renderer directly, open:

```text
http://localhost:5173/?mode=text
```

### 2.5 Play the shrine proof

With both clients connected:

1. Confirm that both players appear in the **Present** panel.
2. Confirm that the lantern and unlit brazier appear in the initial scene.
3. Enter `take lantern` from both clients.
4. Observe that exactly one command succeeds.
5. Confirm that the lantern leaves the room and enters the winner's inventory.
6. From the winner's client, enter `light brazier`.
7. Observe the scene change from cool moonlight to warm firelight.
8. Refresh or reconnect and confirm that the changed world is restored.

Useful commands in the closed MVP vocabulary include:

```text
look
look at brazier
take lantern
inventory
light brazier
north
south
east
west
say hello
```

The client also projects authorized scene hotspots into clickable controls.
Clicking a hotspot sends the same command that could have been typed; the
hotspot does not mutate local state.

---

## 3. The Complete Causal Chain

Polaris exists to preserve one explicit line of causality:

```text
Player language
  ↓
deterministic command binding
  ↓
authoritative validation
  ↓
serialized world mutation
  ↓
durable domain events
  ↓
shared narrative projection
  ↓
SceneManifest projection
  ↓
asset resolution and PixiJS drawing
```

Each stage may interpret or project the result of the stage below it. No stage
may silently claim the authority of an earlier stage.

For example, a lantern sprite disappearing is not the event. The authoritative
event is that the lantern moved from a room location to a player's inventory.
The scene compiler then omits the lantern layer because the current world state
no longer places that entity in the room.

This distinction protects synchronization, persistence, testing, accessibility,
and future renderers. A text-only client and a PixiJS client can look different
while inhabiting the same world.

---

## 4. Architectural Foundations

### 4.1 Dependency law

The package graph points away from infrastructure and toward pure contracts:

```text
@polaris/contracts
        ↑
@polaris/world-kernel
        ↑
@polaris/world-runtime
        ↑
projectors and adapters
        ↑
server and client applications
```

The kernel cannot import Fastify, WebSocket, SQLite, PixiJS, browser APIs, or UI
components. It receives state, a bound command, and deterministic context; it
returns domain events or a refusal.

### 4.2 Package responsibilities

| Package or application | Responsibility |
|---|---|
| `@polaris/contracts` | Shared Zod schemas and TypeScript contracts |
| `@polaris/command-language` | Raw player text to deterministic `BoundCommand` |
| `@polaris/world-kernel` | Pure command resolution and event application |
| `@polaris/world-runtime` | Revision truth, serialized room actors, and commit coordination |
| `@polaris/persistence-sqlite` | SQLite WAL event ledger, snapshots, replay, and restoration |
| `@polaris/realtime-protocol` | WebSocket message validation and connection registry |
| `@polaris/narrative-projector` | Domain events to shared literary prose |
| `@polaris/scene-compiler` | Authoritative room projection to `SceneManifest` |
| `@polaris/pixelbrain-bridge` | Pure packet validation, normalization, hashing, and RGBA rasterization |
| `@polaris/renderer-pixi` | Asset resolution, PixiJS drawing, GPU cache lifecycle, and fallback orchestration |
| `apps/server` | Fastify/WebSocket composition root and authoritative network surface |
| `apps/client` | Browser synchronization, DOM panels, command input, and illustrated scene surface |
| `worldpacks/shrine-demo` | Authored rooms, entities, rules, and PixelBrain source assets |

This separation is the reason the world can be tested without a browser and the
renderer can fail without corrupting the world.

---

## 5. Deterministic Language and World Mutation

Polaris does not send free-form player text to an unrestricted language model.
The MVP begins with a closed, deterministic action vocabulary.

Synonyms bind to canonical actions:

```text
take / grab / get / pick up  → TAKE
light / activate / use       → ACTIVATE
look at / inspect / examine  → EXAMINE
north / n / go north         → MOVE
```

The binder resolves visible targets and produces a typed command. The kernel
validates that command against authoritative state and rules. A player cannot
take an absent object, light the brazier without satisfying its requirements,
or win a lantern race by changing their browser.

Room actors serialize competing commands. The commit coordinator follows the
durability boundary:

```text
propose events
  → persist events
  → accept the committed state
  → broadcast projections
```

If persistence fails, the mutation is not accepted as world truth. If two
players attempt to take the lantern, serialization and authoritative state
ensure that only one transition can commit.

---

## 6. Persistence, Multiplayer, and Reconnection

The realtime server is conventional infrastructure wrapped around the
deterministic core:

- Fastify provides the HTTP surface.
- `@fastify/websocket` provides `/ws`.
- `ConnectionRegistry` tracks connections, identified players, and room
  subscriptions without owning socket-specific domain logic.
- `RoomActorHub` serializes commands per room.
- `SqlitePersistence` stores events and snapshots.
- `SnapshotBuilder` creates the canonical join/resync projection.

Clients track the next expected event sequence. If a gap is detected, the
client requests a fresh snapshot instead of guessing. A reconnect restores
world state from the latest snapshot plus later events, or from full ledger
replay when no snapshot exists.

The important property is continuity:

```text
same committed event history
  → same restored world state
  → same SceneManifest
  → same deterministic render identities
```

---

## 7. SceneManifest: The Visual Constitution

The scene compiler turns authoritative room state into a deterministic,
renderer-neutral `SceneManifest`.

The manifest carries:

- scene and visual revision identity
- ordered visual layers
- visibility
- world/page placement
- z-order
- lighting state
- interaction hotspots and their command bindings
- accessible text regions
- an authoritative `contractHash`

The same state, rules, compiler version, and approved illustration hints must
produce the same canonical manifest and contract hash. Snapshot and incremental
patch paths share the same hint assembly so they cannot project different
pictures for the same state.

Illustration hints are authored display data. They can suggest an asset key,
position, label, or layer treatment. They cannot decide whether an entity
exists or whether a command succeeds.

The compiler therefore establishes a clean boundary:

```text
contractHash = what Polaris requested
```

The renderer adds a second downstream identity:

```text
renderHash = what the renderer actually resolved and drew
```

Keeping these identities separate allows visual assets to evolve without
pretending that an art revision changed world history.

---

## 8. PixelBrain as the Visual Layer to PixiJS

PixelBrain is a deterministic visual asset provider. PixiJS is the browser and
GPU lifecycle shell.

### 8.1 Pure bridge

`@polaris/pixelbrain-bridge` owns only pure work:

```text
validate packet
  → normalize packet
  → verify SHA-256 content identity
  → rasterize straight RGBA bytes
  → compute rasterHash
  → return PB-ERR-v1 diagnostics as data
```

Its primary artifact is renderer-neutral:

```ts
interface PixelBrainRaster {
  packetId: string;
  packetVersion: "pixelbrain.render.v1";
  packetContentHash: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  rasterHash: string;
  diagnostics: PixelBrainDiagnostic[];
}
```

The bridge contains no PixiJS texture, DOM object, WebGL handle, network load,
filesystem access, or mutable GPU cache.

`pixelbrain.render.v1` represents exactly one static raster frame. Coordinates
are packet-local pixels or cells inside that raster. World position and z-order
remain in the `SceneManifest`.

### 8.2 PixiJS adapter

`@polaris/renderer-pixi` owns runtime-specific work:

- immutable registry lookup
- packet and PNG loading
- conversion from straight RGBA bytes to PixiJS texture sources
- nearest-neighbor sampling
- integer placement and scaling
- reference-counted texture leases
- CPU and estimated GPU byte budgets
- eviction and texture destruction
- context-loss restoration
- asynchronous render epochs
- transactional scene swaps
- hotspot registration

Textures are cached by `rasterHash`, not merely by a readable packet name.
Changed pixels therefore cannot return a stale texture, while equivalent raster
output can share the same GPU resource.

### 8.3 Fallback chain

Visual resolution is explicit:

```text
valid PixelBrain packet
  → verified PNG
  → deterministic procedural glyph
  → accessible text
```

A malformed packet emits diagnostics and continues to PNG resolution. A
missing PNG continues to the glyph. Visual failure never blocks hotspots,
commands, prose, synchronization, or text-mode play.

### 8.4 Immutable asset registry

The asset build fingerprints generated URLs and records expected content
hashes. Browser cache state therefore cannot silently redefine an asset at a
stable mutable path.

The current shrine registry contains:

- player marker
- lantern
- brazier
- lit brazier

Their source packets live in:

```text
worldpacks/shrine-demo/assets-src/
```

Generated browser assets and the generated TypeScript registry live under:

```text
apps/client/public/assets/generated/
apps/client/src/generated/pixelbrainAssetRegistry.ts
```

---

## 9. Asynchronous Freshness and Resource Bounds

Illustrated rendering is asynchronous. A slow older scene must never overwrite
a fast newer scene.

The scene coordinator assigns a monotonically increasing render epoch:

```text
resolve new assets
  → acquire provisional texture leases
  → verify the epoch is still current
  → build and commit the new scene
  → record the new active texture set
  → release the previous scene's leases
```

If the epoch is stale, the renderer is destroyed, asset resolution partially
fails, or drawing cannot commit, provisional resources are released and the
previous valid scene remains intact.

The texture cache is bounded by resources, not just entry count. Its default
policy tracks:

- zero-reference entry count
- retained CPU raster bytes
- estimated GPU bytes
- active-scene bytes
- deterministic monotonic usage ticks

Packet validation also limits canvas size, packet size, primitive count, output
bytes, and total raster writes. This prevents a small canvas with pathological
overlap from consuming unbounded computation.

---

## 10. Accessibility Is an Architectural Property

Text mode is not a screenshot caption bolted onto the renderer. The
`SceneManifest` already carries semantic text and command-bearing hotspots.

When PixiJS or an asset source fails, the client can still present:

- room title and description
- lighting state
- visible entities
- present players
- inventory
- exits
- narrative updates
- command input
- clickable interaction controls

This proves the authority boundary. If the game becomes unplayable when the
picture disappears, too much authority has leaked into the picture.

Use this URL to review the fallback deliberately:

```text
http://localhost:5173/?mode=text
```

---

## 11. What Has Been Built

The milestone PIRs are the current implementation record. The older milestone
table in `PolarisOS/README.md` predates later work and should not be used as the
final status authority.

| Milestone | Current result | Principal proof |
|---|---|---|
| 1 — Domain kernel | Complete | In-memory deterministic lantern race and pure event application |
| 2 — Persistence | Complete | SQLite ledger, snapshots, replay, and restart restoration |
| 3 — Realtime multiplayer | Complete | Two WebSocket clients, room serialization, sync, and resync |
| 4 — Scene compiler | Complete | Deterministic `SceneManifest`, snapshot/patch hash parity |
| 5 — Illustrated client | Complete | PixiJS client, live panels, hotspots, fallback mode, full shrine scenario |
| PixelBrain bridge | Complete | Pure raster bridge, immutable asset registry, bounded cache, render epochs |
| 6 — Hardening | Not complete as a milestone | Individual hardening laws exist; broader stress/mobile/operational work remains |

### 11.1 Verification baseline

The PixelBrain post-implementation review recorded this baseline on
2026-07-27. The test suite, typecheck, client build, and Chromium alpha gate
were re-run successfully while authoring this paper on 2026-07-28:

| Gate | Recorded result |
|---|---|
| Node test suite | 181 tests across 22 files |
| TypeScript | 0 errors |
| Client production build | Passing; 724 modules transformed |
| PixelBrain browser alpha gate | 1 passing headless Chromium test |
| Generated asset drift check | Clean after four assets generated |
| Full and production npm audits | 0 vulnerabilities after the 2026-07-28 dependency migration |

The suite covers the kernel, command language, persistence, room actors,
realtime protocol, scene compiler, pure scene plan, PixelBrain bridge, asset
generator, resolver, texture cache, render coordinator, render identity, and
cross-client integration.

---

## 12. Verify It Yourself

Run from `PolarisOS/`.

### 12.1 Fast architectural gate

```bash
npm test
npm run typecheck
```

### 12.2 Focused integration gate

```bash
npm run test:integration
```

This exercises real server composition and the multiplayer milestone
scenarios, including the shrine state transitions.

### 12.3 PixelBrain asset reproducibility

```bash
npm run build:pixelbrain-assets
git diff --exit-code -- \
  apps/client/src/generated \
  apps/client/public/assets/generated
```

A clean diff proves the checked-in generated assets agree with the current
source packets and generator.

### 12.4 Browser alpha contract

```bash
npm run test:browser:pixelbrain
```

This sends a semi-transparent colored texel through the actual PixiJS
`BufferImageSource` path in Chromium and checks composition over a contrasting
background. It guards the bridge's straight-RGBA contract against accidental
premultiplication and dark halos.

### 12.5 Production build

```bash
npm run build
```

The repository build runs build scripts for implemented workspaces and skips
the future `apps/world-studio` stub through npm's `--if-present` workspace
behavior. The stub intentionally exposes no `dev` or `build` script until it
has a real application entry.

For a client-only production build, run:

```bash
npm run build --workspace=apps/client
```

---

## 13. Troubleshooting the Local Demo

### Server port `3100` is already in use

Start the server on another port:

```bash
PORT=3200 DB_PATH="$POLARIS_DEMO_DIR/codex_vale.sqlite" npm run dev:server
```

Then point the client at it:

```text
http://localhost:5173/?ws=ws://localhost:3200/ws
```

### The shrine is already changed

The default database is persistent by design. Restart the demo with a new
temporary database as shown in Section 2.3.

### Both windows appear to be the same player

Open independently created browser tabs, a private window, or separate browser
profiles. Polaris stores the demo player id in `sessionStorage`, so duplicated
tabs may inherit an identity depending on how the browser created them.

### No illustrated canvas appears

Try text mode:

```text
http://localhost:5173/?mode=text
```

If text mode works, the authoritative server and synchronization path are
healthy; the problem is isolated to browser graphics or asset loading.

### PixelBrain assets appear stale

Regenerate the immutable registry:

```bash
npm run build:pixelbrain-assets
```

Then restart the Vite client. Do not hand-edit generated fingerprints.

---

## 14. Current Boundaries and Limitations

Polaris is a working architectural MVP, not yet a production service or a
content-complete game.

Current boundaries include:

- `pixelbrain.render.v1` supports one static frame; packet-local animation is
  reserved for a future protocol.
- The maintained PixelBrain browser gate currently targets Chromium.
- World Studio is a future workspace and is not presently buildable as an
  application.
- The shrine is deliberately small: three rooms and a compact closed command
  vocabulary.
- The current milestone does not add combat, crafting, unrestricted procedural
  generation, live AI image generation, or unrestricted LLM execution.
- Broader mobile review, forced-restart stress drills, duplicate-message
  hardening, and production operations belong to the hardening milestone.
- PNG fallback is implemented and tested through the resolver, while the four
  shipped shrine assets currently resolve directly from PixelBrain packets.

These are scope boundaries, not permission to weaken the established laws.
Future features must preserve authoritative simulation, deterministic
projection, asynchronous freshness, and resource boundedness.

---

## 15. The Four Durable Laws

The work so far reveals four reusable engineering laws.

### 15.1 Projection authority

A downstream visual provider may realize form but cannot introduce world
authority.

### 15.2 Complete projection identity

Every input capable of changing realized output must participate in an
appropriate identity: world contract, packet content, raster output, PNG bytes,
fallback source, or final render.

### 15.3 Asynchronous freshness

An older asynchronous projection may never overwrite a newer authoritative
projection.

### 15.4 Resource boundedness

Validation must bound computational work and retained resources, not merely
input count or cache entry count.

These laws matter because their violations can remain invisible during a
successful demo. They belong in harnesses, not only in design prose.

---

## 16. Where to Read Next

### Product and architecture

- `Polaris-OS-Encyclopedia/PDRs/Polaris-OS-PDR.md` — complete product design
  requirements and milestone model
- `README.md` — package orientation and basic commands
- `packages/contracts/src/` — authoritative data contracts
- `packages/world-kernel/src/` — deterministic domain core

### Implementation history

- `Polaris-OS-Encyclopedia/PIRs/Polaris-Milestone1-PIR.md`
- `Polaris-OS-Encyclopedia/PIRs/Polaris-Milestone2-PIR.md`
- `Polaris-OS-Encyclopedia/PIRs/Polaris-Milestone3-PIR.md`
- `Polaris-OS-Encyclopedia/PIRs/Polaris-Milestone4-PIR.md`
- `Polaris-OS-Encyclopedia/PIRs/Polaris-Milestone5-PIR.md`
- `Polaris-OS-Encyclopedia/PIRs/Polaris-PixelBrain-Bridge-PIR.md`

### The live shrine

- `worldpacks/shrine-demo/world.json`
- `worldpacks/shrine-demo/rooms/`
- `worldpacks/shrine-demo/entities/`
- `worldpacks/shrine-demo/rules/mvp-1.json`
- `worldpacks/shrine-demo/assets-src/`

### Visual pipeline

- `packages/scene-compiler/src/SceneCompiler.ts`
- `packages/pixelbrain-bridge/src/`
- `packages/renderer-pixi/src/scenePlan.ts`
- `packages/renderer-pixi/src/PixelBrainAssetResolver.ts`
- `packages/renderer-pixi/src/PixelBrainTextureCache.ts`
- `packages/renderer-pixi/src/SceneRenderCoordinator.ts`
- `packages/renderer-pixi/src/PixiSceneRenderer.ts`

### Verification

- `tests/integration/Milestone3Gate.test.ts`
- `tests/integration/Milestone4Gate.test.ts`
- `tests/integration/Milestone5Gate.test.ts`
- `tests/integration/PixelBrainBridgeGate.test.ts`
- `tests/browser/PixelBrainAlpha.spec.ts`

---

## 17. Closing Position

Polaris has crossed the line from architecture sketch to playable systems
proof.

Two clients can inhabit the same shrine. Their commands pass through a
deterministic language boundary. A race for a shared object resolves once.
Committed events survive restart. Narrative and scenes update for both clients.
The scene compiler produces a deterministic contract. PixelBrain realizes
approved local pixels. PixiJS manages the browser and GPU. If graphics fail,
the text world remains playable.

That is the significance of the current implementation. Polaris is not merely
drawing a MUD, and it is not using a picture as a database. It is maintaining
one authoritative literary world and allowing several faithful surfaces to
reveal it.

> The world produces the picture. The picture does not produce the world.
