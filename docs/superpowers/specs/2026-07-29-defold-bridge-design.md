# Defold Bridge — Design

**Date:** 2026-07-29
**Status:** Approved (design); implementation plan pending
**Scope:** PolarisOS (`PolarisOS/`)

## Organ Roles

Four organs consume or produce visual truth. Each owns exactly one thing.

| Organ | Role | Owns |
|---|---|---|
| `world-kernel` | World authority (PDR §5.1) | World truth, `roomRevision` |
| PixelBrain | Visual Compiler | Assets, `pb1:`/`pbr1:`/`png1:` hashes |
| Defold | Sovereign Runtime | What executes when a player plays |
| PixiJS | Visual Laboratory | Nothing — it is free to be wrong |

Sovereignty partitions rather than conflicts: the kernel remains authoritative over
the world, Defold over the runtime, PixelBrain over assets. The laboratory holds no
authority, which is precisely what makes it useful for experiment.

## Problem

The binding that keeps these organs honest already exists, but it is housed in a
consumer.

`buildSceneRenderPlan` (`packages/renderer-pixi/src/scenePlan.ts`) and
`computeSceneRenderHash` (`packages/renderer-pixi/src/renderIdentity.ts`) together
fuse the scene contract, the plan, the degradation mode, and every asset's content
hash into one identity. But both live inside `renderer-pixi`. The server emits a raw
`SceneManifest` via `scene.patch`; the **client** mints the plan.

Add Defold and there are two plan builders, two `planHash` values, two opinions. A
sovereign runtime that inherits its identity from the laboratory is an inverted
authority — and Lua cannot import TypeScript, so the alternative is a second
implementation of the same law.

### The two hashes are different kinds of thing

This distinction drives the whole design.

- **`planHash`** is a pure projection of the manifest. Deterministic,
  server-computable. This is a **seal**.
- **`render1:` renderHash** folds `resolvedAssets` and `fallbackMode` — whether
  *this* consumer's fetch succeeded, whether *this* consumer degraded to
  `GLYPH`/`TEXT`. The server cannot know that. This is not a seal; it is a
  **render receipt**, evidence of what an engine actually drew.

One producer makes input equality trivially true, so the seal alone proves nothing
about agreement. Receipts are outputs. Comparing Defold's receipt to Pixi's receipt
for the same sealed packet is a comparison that can genuinely fail — which is what
makes "Visual Laboratory" a real role rather than a decorative one.

## Decisions

| Decision | Choice |
|---|---|
| Defold's role | Sovereign runtime; thin client, server stays authoritative |
| Truth transport | Live WebSocket to the existing Fastify server |
| Seal authority | One producer (server). Consumers verify by string equality only |
| Hashing in Lua | None. Lua never computes a hash and never mints a receipt |
| WS mechanism | Pure-Lua RFC6455 over Defold's bundled LuaSocket |
| Wire format | JSON (`json.decode`/`json.encode`, both built in) |

### Verified environment facts

Established by inspection, not assumption:

- Defold **1.13.0 stable**, `engine_sha1 f735c12192bf95684e6ae1ae27c400b8170fc6d8`,
  extracted at `/home/deck/Desktop/Mudlet/defold/Defold`.
- **LuaSocket is bundled** — `builtins/scripts/socket.lua` wraps a native `socket`
  global (`socket.tcp()`, `socket.dns.getaddrinfo`, `sock:receive`/`send`,
  `getfd`/`dirty`). Raw TCP with no native extension.
- **No websocket in builtins**, so WS is hand-rolled or an extension. Hand-rolled
  avoids any dependency on Defold's cloud extender.
- `json.encode` exists in 1.13.0 (arity-check error strings and a call site are both
  present in the editor jar), as does `json.decode`.
- `builtins/ca-certificates/` exists — the engine has TLS for `http`, but not for
  raw sockets. Consequence: **`ws://` only, and no HTML5 target.** Revisit only if a
  web build is required.
- `luajit` and `lua5.4` are installed locally, so Lua modules are unit-testable
  headlessly outside Defold.
- **No `bob.jar` and no `dmengine`** in the extracted editor. A runnable Defold
  binary requires the editor to fetch the engine from `d.defold.com`. See
  *Verification Limits*.

## Architecture

```
world-kernel ──► scene-compiler ──► SceneManifest (contractHash)
                                          │
                        @polaris/scene-packet   ◄── neutral organ
                        buildSealedPacket → plan1: seal
                                          │
                              server seals it, ONE producer
                                          │
                            SealedScenePacket on the wire
                       ┌──────────────────┴──────────────────┐
                       ▼                                     ▼
            Defold (Sovereign Runtime)            Pixi (Visual Laboratory)
            verify seal ==                        verify seal ==
            render ──► claim                      render ──► claim
                       └────► bridge mints receipts ────┘
                                     │
                              CI receipt diff
```

The kernel's `roomRevision` is the only heartbeat. Defold introduces a second clock
in `update(self, dt)`; LuaSocket is therefore polled non-blocking (`settimeout(0)`)
inside that update, with packets applied at frame boundaries. The engine's frame rate
must never become an authority on world time.

## The Sealed Packet Contract

```ts
// THE SEAL — engine-neutral. Exactly one producer: the server.
interface SealedScenePacket {
  packetVersion: 1;
  sceneId: string;
  roomId: string;
  worldId: string;
  roomRevision: number;
  visualRevision: number;
  contractHash: string;             // SceneManifest §15.4
  width: number;
  height: number;
  backgroundAssetKey: string;
  backgroundGlyph: GlyphSpec;
  lightingState: string;
  lightingTint: number;             // 0xRRGGBB
  lightingAlphaMilli: number;       // quantized
  ambientEffects: string[];         // sorted
  sprites: PlanSprite[];            // zIndex asc, then layerId
  hotspots: PlanHotspot[];          // hotspotId asc
  textRegions: PlanText[];
  fallbackLines: string[];          // one packet describes BOTH modes

  // NOT covered by the seal — see "What the seal excludes"
  sequence: number;                 // delivery ordering, per connection
  seal: `plan1:${string}`;
}
```

Deliberately absent: `mode`, `resolvedAssets`, `generatedAt` — the three things a
consumer owns.

### What the seal excludes

`sequence` travels on the packet but is **excluded from the seal computation**,
following the existing precedent that `contractHash` excludes `generatedAt`.

`sequence` is per-connection delivery ordering, not a projection of room state.
Sealing it would break determinism — the same room state delivered at two different
sequences would produce two different seals — and two clients legitimately at
different sequences would disagree about an identical room. The monotonic gate (Rule
4) reads `sequence`; the seal does not cover it.

Every other field above is sealed. `roomRevision` and `visualRevision` *are* manifest
fields and are therefore deterministic projections of room state, so they remain
inside the seal.

```ts
// THE CLAIM — what an engine reports about its own render. No hashing.
interface RenderReceiptClaim {
  seal: `plan1:${string}`;
  engine: "pixi" | "defold";
  mode: "illustrated" | "fallback";
  resolvedAssets: ResolvedAssetLedgerEntry[];
}

// THE RECEIPT — minted in TypeScript from a claim. The falsifier.
interface RenderReceipt extends RenderReceiptClaim {
  renderHash: `render1:${string}`;
}
```

Both engines' claims pass through one hash function, so a receipt diff is real
divergence in what was drawn, never hash-implementation drift.

### Removing `mode` from the seal

`scenePlan.ts:272` currently folds `mode` into `planHash` on purpose: *"`mode` is
included so a fallback projection never collides with an illustrated one."*

That was correct while the plan was a private client artifact. As a shared seal it is
a false-positive machine: a Defold client in fallback and a Pixi lab in illustrated,
rendering the identical room, would compute different seals — equality verification
would fail on a **healthy** system.

`mode` moves to the claim, where `computeSceneRenderHash` already folds it as
`fallbackMode`. No property is lost; the non-collision guarantee relocates to the
organ that owns it. `fallbackLines` are already unconditionally present in the plan,
so one packet fully describes both modes.

### Seal strength

`planHash` is currently `fnv1a` over `JSON.stringify`. Two properties are acceptable
for a private staleness check and too weak for an authority seal:

- 32 bits — birthday collisions arrive around ~65k distinct scenes.
- `JSON.stringify` uses insertion order, not canonical order. Safe with one
  implementation; fragile as a contract.

Upgrade to `plan1:` = sha256 over the existing `canonicalJson`, joining the
`pb1:`/`pbr1:`/`png1:`/`render1:` family. Consumers pay nothing — they compare
strings.

### Float policy

`canonicalJson` throws on non-safe-integers (`"Canonical numbers must be finite safe
integers"`). Sprite `x`/`y` derive from manifest `z.number()` and `lightingAlpha` is
fractional, so every fractional quantity is quantized to integer milli-units at the
seal boundary and named accordingly:

| Source | Sealed as |
|---|---|
| `lightingAlpha` | `lightingAlphaMilli` = `round(alpha * 1000)` |
| `PlanSprite.x` / `.y` | `xMilli` / `yMilli` = `round(v * 1000)` |
| `PlanSprite.alpha` | `alphaMilli` |
| Hotspot region `x`/`y`/`w`/`h` | `*Milli` |
| `PlanText` anchor + width | `*Milli` |

`lightingTint` and `zIndex` are already integers and pass through unchanged.
Quantization happens once, in the producer, before the seal is computed — consumers
receive only the quantized values, so there is no rounding disagreement to have.
Required by `canonicalJson`; the incidental benefit is exact representability in
LuaJIT, where every number is a double.

## The Four Rules

1. Only the server computes `seal`. No consumer ever recomputes it.
2. A consumer that cannot match the `seal` refuses the packet and holds its last
   verified frame (blank only if there is no prior frame), emitting `SEAL_MISMATCH`.
   Never best-effort.
3. A consumer derives visual state from the packet alone. No engine-local defaults,
   no inferred positions.
4. `roomRevision`/`sequence` form a monotonic gate. A packet older than what is on
   screen is dropped regardless of frame timing.

Rule 2 is a deliberate judgment call: it chooses sovereignty over PDR §5.4's
graceful-degradation instinct. Degradation remains legal for *assets* (the
`PIXELBRAIN → PNG → GLYPH → TEXT` ladder); it is not legal for *seals*. A runtime that
renders an unverified packet cannot be sovereign over anything.

## Components

### `packages/scene-packet/` (new, neutral)

| File | Responsibility |
|---|---|
| `contracts.ts` | `SealedScenePacket`, `RenderReceiptClaim`, `RenderReceipt`, `GlyphSpec`, `PlanSprite`, `PlanHotspot`, `PlanText`, `ResolvedAssetLedgerEntry` + Zod schemas |
| `buildSealedPacket.ts` | `SceneManifest` → `SealedScenePacket`. Hoisted from `scenePlan.ts`, minus `mode` |
| `seal.ts` | `computePlanSeal`, quantizers |
| `receipt.ts` | `toResolvedAssetLedgerEntry`, `mintReceipt`. Hoisted from `renderIdentity.ts` |
| `verifySeal.ts` | Equality check + diagnostic |

Depends only on `@polaris/contracts` and `@polaris/pixelbrain-bridge` (whose sha256
is hand-rolled — no `node:crypto`), so it is importable from server, client, and
tooling alike.

**Dependency law extension:** `scene-packet` may not import Pixi, Defold, Fastify,
WebSocket, SQLite, or browser APIs.

### `packages/defold-bridge/` (new, TS, pure)

| File | Responsibility |
|---|---|
| `wire.ts` | `SealedScenePacket` → Lua-safe JSON |
| `receipt.ts` | Parse a Defold claim, mint and compare receipts |

The wire projection is not a no-op. Defold's `json.decode` renders `[]` and `{}` as
the same empty table, and `SceneLayer.assetKey` is `z.string().nullable()` — nulls
exist in real data. The projection therefore emits **no nulls** and carries explicit
counts wherever Lua must know a list is a list.

### `apps/defold-runtime/` (new, Defold project)

`game.project`, `main/main.collection`, `main/bootstrap.script`, and:

| Module | Responsibility |
|---|---|
| `scenepacket/ws.lua` | Pure-Lua RFC6455 client over bundled LuaSocket, non-blocking |
| `scenepacket/packet.lua` | Decode, seal equality, revision gate |
| `scenepacket/render.lua` | Packet → sprites/labels in deterministic draw order |
| `scenepacket/claim.lua` | Collect resolved-asset facts, report upward |

The WS client needs base64 and client-side frame masking. It needs **no SHA-1**: the
server's `Sec-WebSocket-Accept` is not verified, consistent with Lua doing no hashing.

### Changes to existing code

- `packages/renderer-pixi/` — loses plan building and identity hashing; re-exports
  from `scene-packet` for compatibility. `PixiSceneRenderer` and
  `SceneRenderCoordinator` consume a `SealedScenePacket` and emit a claim.
- `apps/server/src/GameServer.ts` — builds and seals the packet, emits `scene.sealed`.
- `packages/contracts/src/protocol.ts` — adds `scene.sealed` to the server message
  union. `scene.patch` remains during transition so the laboratory keeps working.
- `PolarisOS/README.md` and the PDR — record the organ roles and dependency law
  extension.

## Runtime Flow

1. Defold input (hotspot tap) → `command.submit` with `expectedRevision`.
2. Kernel resolves the command → events → `roomRevision` bumps.
3. `scene-compiler` projects a `SceneManifest` (`contractHash`).
4. Server calls `buildSealedPacket`, computes `plan1:`, emits `scene.sealed`.
5. Defold polls the socket non-blocking inside `update(dt)`; `json.decode` under
   `pcall`; revision gate; seal equality; render or fail closed.
6. Defold reports a claim; the bridge mints the receipt.

## Failure Behavior

| Failure | Response |
|---|---|
| Seal mismatch | Refuse packet, hold last verified frame, `SEAL_MISMATCH` |
| Malformed JSON | `pcall`, drop, diagnose. Never crash the runtime |
| Oversized payload | Byte cap mirroring `MAX_PACKET_BYTES`, applied **before** decode |
| Disconnect | Backoff reconnect, then `state.resync.request` with `lastSequence` |
| Stale revision | Dropped by the monotonic gate |
| Missing asset | Existing ladder; Defold's `GLYPH` equivalent is a colored quad, recorded as `GLYPH` in the claim so the receipt tells the truth about degradation |

## Testing

**`scene-packet`**
- Seal determinism: identical manifest → identical seal.
- **Mode independence**: illustrated and fallback consumers yield the *same* seal.
  This is the direct regression test for the `mode`-in-`planHash` defect.
- **Sequence independence**: the same manifest delivered at two different `sequence`
  values yields the *same* seal.
- Quantization determinism; rejection of unquantized floats.
- Canonical ordering: key insertion order does not affect the seal.

**`defold-bridge`**
- Projection emits no nulls and no ambiguous empty tables.
- Round-trip through `json.decode` semantics preserves list-ness.
- Receipt minting from claims; receipt comparison detects divergence.

**Lua, under `luajit` with a stubbed `socket`**
- RFC6455 frame codec: masking, fragmentation, close frames.
- Revision gate: out-of-order and stale packets dropped.
- Fail-closed on seal mismatch.

**Integration**
- A TS fake-Defold client speaking the same wire against the real server — the honest
  end-to-end proof that runs today.
- Cross-engine receipt equality: Pixi vs the fake client for one sealed packet.

## Verification Limits

Stated plainly so no later claim overreaches:

- **No Defold build offline.** The extracted editor has no `bob.jar` and no
  `dmengine`; the engine is fetched from `d.defold.com` on first use. Everything on
  the Defold side is verified by `luajit` unit tests and the fake-client integration
  test until a build is possible.
- **Screenshot diffing is deferred.** Receipt equality proves the two engines resolved
  the same assets in the same mode. It does not prove they drew the same pixels. The
  pixel-level lab↔sovereign comparison requires a real Defold build and is out of
  scope here.
- **`ws://` only, no HTML5.** A consequence of hand-rolling WS over raw LuaSocket,
  which has no TLS.

## Out of Scope

- Build-time atlas export from PixelBrain into Defold (`.atlas`/`.tilesource`). Asset
  delivery to Defold is a follow-up spec; this design carries `assetKey` and the
  degradation ladder, not baked atlases.
- Retiring `renderer-pixi` or `apps/client`. The laboratory stays.
- Offline/single-player play. The runtime is a thin client by decision.
- Authoring gameplay in Defold beyond what is needed to render a sealed packet and
  submit a command.
