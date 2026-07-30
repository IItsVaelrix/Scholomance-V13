# The Defold Bridge: Sovereign Runtime Integration
## An Instruction Manual for the Sealed-Packet Pipeline

**Date:** 2026-07-29

**Status:** Implemented and tested (82 TypeScript tests + 18 Lua tests passing)

**Audience:** Engine integrators, runtime developers, QA engineers, and future agents

**Scope:** The `@polaris/scene-packet` and `@polaris/defold-bridge` packages, the
`apps/defold-runtime` Defold project, and the server-side `scene.sealed` emission

**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-WP-DEFOLD-BRIDGE`

**Design spec:** `docs/superpowers/specs/2026-07-29-defold-bridge-design.md`

---

## Abstract

Polaris OS renders its world through two engines: PixiJS (the Visual Laboratory)
and Defold (the Sovereign Runtime). Both consume the same authoritative scene
state, but they must never disagree about *what* they are rendering.

The Defold Bridge solves this with a **sealed packet**: a deterministic,
server-computed projection of the `SceneManifest` into an engine-neutral JSON
contract, sealed with a `plan1:` SHA-256 hash. Consumers verify the seal by
string equality. They never recompute it. They never hash anything. They render
what the packet says, or they refuse the packet and hold their last verified
frame.

This paper is an instruction manual. It tells you how to:

1. Understand the architecture and the four rules that govern it.
2. Build and seal packets on the server.
3. Project packets into Lua-safe wire format.
4. Run the Defold runtime and connect it to the server.
5. Mint and compare render receipts across engines.
6. Test every layer independently.

---

## 1. Architecture: Four Organs

The bridge partitions visual authority into four organs. Each owns exactly one
thing. Sovereignty partitions rather than conflicts.

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

| Organ | Role | Owns | Package |
|---|---|---|---|
| `world-kernel` | World authority (PDR §5.1) | World truth, `roomRevision` | `@polaris/world-kernel` |
| PixelBrain | Visual Compiler | Assets, `pb1:`/`pbr1:`/`png1:` hashes | `@polaris/pixelbrain-bridge` |
| Defold | Sovereign Runtime | What executes when a player plays | `apps/defold-runtime/` |
| PixiJS | Visual Laboratory | Nothing — it is free to be wrong | `packages/renderer-pixi/` |

The laboratory holds no authority, which is precisely what makes it useful for
experiment. The sovereign runtime inherits its truth from the server, never from
the laboratory.

---

## 2. The Four Rules

Every consumer of a sealed packet — PixiJS, Defold, or any future engine — must
obey these rules. They are not suggestions.

### Rule 1: Only the server computes the seal

No consumer ever recomputes a `plan1:` seal. The server calls
`buildSealedPacket()` in `@polaris/scene-packet`, which calls
`computePlanSeal()`, which SHA-256 hashes the canonical JSON of every sealed
field. Consumers receive the seal as a string and compare strings.

**Why:** If two consumers compute seals independently, they need identical
canonical JSON implementations, identical quantization, identical field
exclusion lists. One drift and the system reports false divergence. One producer
makes input equality trivially true.

### Rule 2: Fail closed on seal mismatch

A consumer that cannot match the seal **refuses the packet** and holds its last
verified frame. Blank only if there is no prior frame. It emits `SEAL_MISMATCH`.
Never best-effort.

**Why:** Degradation is legal for *assets* (the `PIXELBRAIN → PNG → GLYPH →
TEXT` ladder). It is not legal for *seals*. A runtime that renders an unverified
packet cannot be sovereign over anything.

### Rule 3: The packet is the only source of visual truth

A consumer derives visual state from the packet alone. No engine-local defaults,
no inferred positions, no "I'll just put it where it was last time." If the
packet says a sprite is at `(400, 240)`, it is at `(400, 240)`. If the packet
does not mention a sprite, it does not exist.

### Rule 4: Monotonic revision gate

`roomRevision` and `sequence` form a monotonic gate. A packet older than what is
on screen is dropped regardless of frame timing. The gate checks:

```
if incoming.roomRevision < current.roomRevision → DROP
if incoming.roomRevision == current.roomRevision
   AND incoming.sequence <= current.sequence → DROP
otherwise → APPLY
```

---

## 3. The Sealed Packet Contract

The sealed packet is the single source of visual truth on the wire. Its
TypeScript definition lives in `packages/scene-packet/src/contracts.ts`.

```typescript
interface SealedScenePacket {
  packetVersion: 1;
  sceneId: string;
  roomId: string;
  worldId: string;
  roomRevision: number;        // from the kernel
  visualRevision: number;      // from the scene compiler
  contractHash: string;        // SceneManifest §15.4
  width: number;               // logical canvas (800)
  height: number;              // logical canvas (480)
  backgroundAssetKey: string;
  backgroundGlyph: GlyphSpec;
  lightingState: string;       // e.g. "warm_firelight"
  lightingTint: number;        // 0xRRGGBB integer
  lightingAlphaMilli: number;  // quantized: round(alpha × 1000)
  ambientEffects: string[];    // sorted
  sprites: PlanSprite[];       // zIndex asc, then layerId
  hotspots: PlanHotspot[];     // hotspotId asc
  textRegions: PlanText[];
  fallbackLines: string[];     // one packet describes BOTH modes

  // Travels on the packet but EXCLUDED from the seal:
  sequence: number;            // per-connection delivery ordering
  seal: `plan1:${string}`;     // the seal itself
}
```

### What the seal covers

Every field above **except** `sequence` and `seal` itself. The seal input is
canonicalized with `canonicalJson()` (sorted keys, no floats — only safe
integers), prefixed with `"polaris-plan.v1\0"`, and SHA-256 hashed.

### What the seal excludes

| Field | Why excluded |
|---|---|
| `sequence` | Per-connection delivery ordering, not a projection of room state. Two clients at different sequences would disagree about an identical room. |
| `mode` | Moved to the claim. One packet describes both illustrated and fallback modes. Including it would make a Defold client in fallback and a Pixi lab in illustrated compute different seals for the same room — a false-positive machine. |
| `generatedAt` | The manifest's only non-deterministic field. |

### Float policy

`canonicalJson` throws on non-safe-integers. All fractional quantities are
quantized to integer milli-units at the seal boundary:

| Source | Sealed as |
|---|---|
| `lightingAlpha` | `lightingAlphaMilli` = `round(alpha × 1000)` |
| `PlanSprite.x` / `.y` | `xMilli` / `yMilli` = `round(v × 1000)` |
| `PlanSprite.alpha` | `alphaMilli` |
| Hotspot region `x`/`y`/`w`/`h` | `*Milli` |
| `PlanText` anchor + width | `*Milli` |

Quantization happens once, in the producer, before the seal is computed.
Consumers receive only quantized values. There is no rounding disagreement to
have. The incidental benefit is exact representability in LuaJIT, where every
number is a double.

### Glyph spec

Every sprite and the background carry a `GlyphSpec` — a procedural stand-in
when the real asset is unavailable:

```typescript
interface GlyphSpec {
  shape: "rect" | "circle" | "diamond" | "flame" | "marker" | "overlay";
  color: number;       // 24-bit RGB, e.g. 0xc9a96e
  width: number;
  height: number;
  alphaMilli: number;  // quantized
}
```

The degradation ladder is: `PIXELBRAIN → PNG → GLYPH → TEXT`. Defold's GLYPH
equivalent is a colored quad.

---

## 4. Server Side: Building and Emitting Sealed Packets

### 4.1 The seal producer

The server is the **one and only** seal producer. The emission happens in
`apps/server/src/GameServer.ts` (line ~732), immediately after every
`scene.patch` broadcast:

```typescript
import { buildSealedPacket } from "@polaris/scene-packet";

// Inside the broadcast method, after scene.patch:
if (sceneManifest) {
  this.sealSequenceCounter += 1;
  const sealedPacket = buildSealedPacket(sceneManifest, {
    sequence: this.sealSequenceCounter,
  });
  this.registry.sendToRoom(
    roomId,
    JSON.stringify({
      type: "scene.sealed",
      envelope,
      packet: sealedPacket,
    }),
  );
}
```

`scene.patch` remains during transition so the PixiJS laboratory keeps working.
Both messages are emitted for every scene update.

### 4.2 Using `buildSealedPacket` directly

```typescript
import { buildSealedPacket } from "@polaris/scene-packet";
import type { SceneManifest } from "@polaris/contracts";

const manifest: SceneManifest = /* from the scene compiler */;

const packet = buildSealedPacket(manifest, { sequence: 1 });
// packet.seal === "plan1:a3f8c2..."  (64 hex chars)
// packet.sprites sorted by zIndex asc, then layerId
// packet.hotspots sorted by hotspotId
// packet.ambientEffects sorted
// All floats quantized to milli-units
// All null assetKeys projected as ""
```

The function is **pure**: identical manifest + identical sequence → identical
packet + identical seal, always.

### 4.3 The protocol message

`scene.sealed` is registered in `packages/contracts/src/protocol.ts`:

```typescript
export const SceneSealedMessageSchema = z.object({
  type: z.literal("scene.sealed"),
  envelope: RevisionEnvelopeSchema,
  packet: z.unknown(),  // full SealedScenePacket; typed as unknown
                         // to avoid circular dependency on scene-packet
});
```

The `packet` field is `z.unknown()` at the protocol layer to avoid a circular
dependency. The server validates the packet before emission. Consumers validate
it on receipt.

---

## 5. The Wire: Lua-Safe Projection

### 5.1 Why the wire projection is not a no-op

Defold's `json.decode` has two hazards:

1. **`[]` and `{}` decode to the same empty Lua table.** Lua cannot distinguish
   an empty array from an empty object.
2. **`null` does not exist in Lua.** `json.decode` renders JSON `null` as
   `nil`, which vanishes from tables.

The wire projection in `packages/defold-bridge/src/wire.ts` solves both:

- **No nulls anywhere.** Nullable strings become `""`.
- **Explicit counts.** Every array field carries a `*Count` sibling
  (`spriteCount`, `hotspotCount`, `textRegionCount`, `ambientEffectCount`,
  `fallbackLineCount`) so Lua can distinguish an empty list from an absent
  field.
- **Flattened glyphs.** Nested `GlyphSpec` objects are flattened to scalar
  fields (`glyphShape`, `glyphColor`, `glyphWidth`, `glyphHeight`,
  `glyphAlphaMilli`) to avoid ambiguous empty-table semantics.

### 5.2 Using `toLuaWire`

```typescript
import { toLuaWire } from "@polaris/defold-bridge";
import type { SealedScenePacket } from "@polaris/scene-packet";

const packet: SealedScenePacket = /* from buildSealedPacket */;
const wire = toLuaWire(packet);

// wire.spriteCount === packet.sprites.length
// wire.hotspotCount === packet.hotspots.length
// wire.sprites[0].glyphShape === "flame"  (not a nested object)
// wire.sprites[0].assetKey === ""         (not null)

const json = JSON.stringify(wire);
// Send `json` as a WebSocket text frame to Defold.
```

The projection is **pure and deterministic**: same packet → same wire object,
always. The result is ready for `JSON.stringify` → WebSocket text frame.

### 5.3 Wire packet shape (Lua side)

What Defold's `json.decode` receives:

```lua
{
  packetVersion = 1,
  sceneId = "ruined_shrine",
  roomId = "ruined_shrine",
  worldId = "codex_vale",
  roomRevision = 42,
  visualRevision = 7,
  contractHash = "ch_...",
  width = 800,
  height = 480,
  backgroundAssetKey = "",
  backgroundGlyphShape = "rect",
  backgroundGlyphColor = 1053738,    -- 0x10142a
  backgroundGlyphWidth = 800,
  backgroundGlyphHeight = 480,
  backgroundGlyphAlphaMilli = 1000,
  lightingState = "warm_firelight",
  lightingTint = 16756838,           -- 0xffb066
  lightingAlphaMilli = 280,
  ambientEffectCount = 0,
  ambientEffects = {},
  spriteCount = 3,
  sprites = {
    {
      layerId = "brazier_1",
      layerType = "entity",
      assetKey = "entities/brazier_lit",
      xMilli = 400000,
      yMilli = 300000,
      zIndex = 10,
      glyphShape = "flame",
      glyphColor = 16747566,         -- 0xff8c2e
      glyphWidth = 80,
      glyphHeight = 104,
      glyphAlphaMilli = 1000,
      label = "Brazier",
    },
    -- ...
  },
  hotspotCount = 2,
  hotspots = { -- ... },
  textRegionCount = 1,
  textRegions = { -- ... },
  fallbackLineCount = 4,
  fallbackLines = { "The Ruined Shrine", "A cold wind...", -- ... },
  sequence = 17,
  seal = "plan1:a3f8c2...",
}
```

---

## 6. Defold Runtime: Setup and Operation

### 6.1 Prerequisites

- **Defold 1.13.0 stable** (engine SHA `f735c12192bf`)
- **LuaSocket** is bundled with Defold — no extension needed
- **`json.encode` / `json.decode`** are built into Defold 1.13.0
- **`luajit` or `lua5.4`** installed locally for headless Lua testing
- The PolarisOS server running on `ws://127.0.0.1:3000/ws`

### 6.2 Project structure

```
apps/defold-runtime/
├── game.project              ← Defold project config (800×480)
├── main/
│   ├── main.collection       ← Bootstrap collection
│   └── bootstrap.script      ← Entry point: WS → decode → gate → render → claim
├── scenepacket/
│   ├── ws.lua                ← Pure-Lua RFC6455 client over LuaSocket
│   ├── packet.lua            ← Decode, seal equality, revision gate
│   ├── render.lua            ← Packet → sprites/labels in draw order
│   └── claim.lua             ← Build render.claim JSON (no hashing)
└── tests/
    └── packet_test.lua       ← 18 Lua unit tests (run with luajit)
```

### 6.3 `game.project`

```ini
[project]
title = PolarisOS Defold Runtime
version = 0.1.0

[bootstrap]
main_collection = /main/main.collection

[display]
width = 800
height = 480
high_dpi = 1

[engine]
run_while_iconified = 1

[physics]
type = 2D
```

The display matches the logical canvas in the sealed packet (800×480).

### 6.4 The bootstrap script

`main/bootstrap.script` is the entry point. It wires the four Lua modules
together:

```lua
local ws       = require("scenepacket.ws")
local packet   = require("scenepacket.packet")
local render   = require("scenepacket.render")
local claim    = require("scenepacket.claim")

local WS_URL = "ws://127.0.0.1:3000/ws"
```

**Lifecycle:**

1. **`init(self)`** — Creates the WebSocket client, registers callbacks,
   connects. On open, sends `connection.identify` and `room.join`.

2. **`update(self, dt)`** — Polls the socket non-blocking every frame.
   `settimeout(0)` ensures the engine's frame rate never becomes an authority
   on world time.

3. **`on_message` callback** — When a `scene.sealed` message arrives:
   - Re-encodes the packet sub-object for the byte-cap check
   - Calls `packet.accept(raw_json, current_state)` — the full pipeline:
     decode → revision gate → seal equality
   - On reject: logs the reason, holds last verified frame (Rule 2)
   - On accept: calls `render.apply(pkt)` to rebuild the scene from the
     packet alone (Rule 3)
   - Updates `current_state` for the monotonic gate
   - Builds and sends a `render.claim` back over the WebSocket

4. **`on_input(self, action_id, action)`** — Hotspot tap → hit-test →
   `command.submit` with `expectedRevision` (Runtime Flow step 1).

5. **`final(self)`** — Closes the WebSocket.

### 6.5 The WebSocket client (`ws.lua`)

A pure-Lua RFC6455 client over Defold's bundled LuaSocket. Key properties:

- **Non-blocking.** `settimeout(0)` on the TCP socket. Polled inside
  `update(dt)`.
- **Client-masked frames.** RFC6455 §5.3 requires client→server frames to be
  masked. The mask key is 4 random bytes.
- **No SHA-1.** The server's `Sec-WebSocket-Accept` header is not verified.
  This is deliberate: Lua does no hashing (Rule 1).
- **Base64 encode** for the `Sec-WebSocket-Key` handshake header.
- **Reconnect with backoff.** On disconnect, waits `_reconnect_delay` seconds
  (default 1.0) before retrying.
- **`ws://` only.** No TLS. LuaSocket has no TLS for raw sockets. No HTML5
  target.

**API:**

```lua
local client = ws.create("ws://127.0.0.1:3000/ws")
client:on_open(function() ... end)
client:on_message(function(raw_json) ... end)
client:on_close(function() ... end)
client:on_error(function(err) ... end)
client:connect()

-- Every frame:
client:poll(dt)

-- Send:
client:send(json.encode({ type = "command.submit", ... }))

-- Shutdown:
client:close()
```

### 6.6 The packet module (`packet.lua`)

Three functions, one pipeline:

```lua
-- Decode with byte cap (1 MiB, applied BEFORE decode):
local pkt, err = packet.decode(raw_json)

-- Monotonic revision gate (Rule 4):
local ok = packet.passes_revision_gate(pkt, current_state)

-- Seal equality (Rules 1 + 2):
local ok, reason = packet.verify_seal(pkt, held_seal)

-- Full pipeline (decode → gate → seal):
local pkt, reason = packet.accept(raw_json, current_state)
```

**`current_state`** is a table: `{ roomRevision = N, sequence = N, seal = "plan1:..." }`
or `nil` for the first packet.

**Rejection reasons:** `MALFORMED_JSON`, `OVERSIZED_PAYLOAD`, `STALE_REVISION`,
`MALFORMED_SEAL`, `SEAL_MISMATCH`.

### 6.7 The render module (`render.lua`)

Translates a decoded wire packet into Defold game objects:

```lua
local resolved_assets = render.apply(packet)
```

- Clears all prior objects and rebuilds from the packet alone (Rule 3).
- Sprites are created in packet order (already sorted by the server: zIndex
  asc, then layerId).
- Milli-units are converted back to pixels: `milli / 1000.0`.
- Hotspots are registered for input hit-testing.
- Returns a list of `{ requestedAssetKey, source }` for the claim.
- MVP degradation: all assets resolve as `"GLYPH"` (colored quads). The
  `PIXELBRAIN` and `PNG` tiers require binary asset delivery (out of scope).

**Hit-testing:**

```lua
local command = render.hit_test(screen_x, screen_y)
-- Returns the command string if a hotspot was hit, nil otherwise.
```

### 6.8 The claim module (`claim.lua`)

Builds a `render.claim` message. **Lua never computes a hash and never mints a
receipt.** The claim is a plain JSON object:

```lua
local claim_obj = claim.build_claim(seal, mode, resolved_assets)
local json_str = claim.encode_claim(claim_obj)
client:send(json_str)
```

The claim shape:

```json
{
  "type": "render.claim",
  "seal": "plan1:a3f8c2...",
  "engine": "defold",
  "mode": "illustrated",
  "resolvedAssets": [
    {
      "requestedAssetKey": "entities/brazier_lit",
      "source": "GLYPH"
    }
  ]
}
```

Optional fields (`packetId`, `packetContentHash`, `rasterHash`, `pngRevision`)
are omitted when empty, because Lua has no null — absent means null on the
TypeScript side.

---

## 7. Receipts: Cross-Engine Verification

### 7.1 The claim → receipt flow

```
Defold renders → builds claim → sends over WS
                                      │
PixiJS renders → builds claim ────────┤
                                      ▼
                          @polaris/defold-bridge
                          parseDefoldClaim(raw)
                          mintDefoldReceipt(raw)
                                      │
                          @polaris/scene-packet
                          mintReceipt(claim)
                          receiptsEqual(a, b)
                                      │
                              CI receipt diff
```

Both engines' claims pass through **one hash function** (`computeRenderHash` in
`@polaris/pixelbrain-bridge`), so a receipt diff is real divergence in what was
drawn, never hash-implementation drift.

### 7.2 Minting a receipt from a Defold claim

```typescript
import { parseDefoldClaim, mintDefoldReceipt } from "@polaris/defold-bridge";

// Raw claim as received from Defold over the WebSocket:
const raw = {
  seal: "plan1:a3f8c2...",
  engine: "defold" as const,
  mode: "illustrated" as const,
  resolvedAssets: [
    { requestedAssetKey: "entities/brazier_lit", source: "GLYPH" },
  ],
};

// Parse and validate (throws on malformed input):
const claim = parseDefoldClaim(raw);

// Mint the receipt (adds renderHash):
const receipt = mintDefoldReceipt(raw);
// receipt.renderHash === "render1:7b2e..."
```

### 7.3 Comparing receipts across engines

```typescript
import { crossEngineReceiptsEqual } from "@polaris/defold-bridge";
import { mintReceipt } from "@polaris/scene-packet";

const defoldReceipt = mintDefoldReceipt(defoldRawClaim);
const pixiReceipt = mintReceipt(pixiClaim);

if (crossEngineReceiptsEqual(defoldReceipt, pixiReceipt)) {
  // Both engines resolved the same assets in the same mode.
  // The scene is visually equivalent at the asset-resolution level.
} else {
  // Genuine divergence. One engine degraded differently,
  // resolved different assets, or used a different mode.
}
```

**Note:** The `engine` field is folded into the render hash. A Pixi receipt and
a Defold receipt for the same scene will **not** be equal by design — the engine
identity is part of the receipt. To compare visual equivalence, compare the
`resolvedAssets` arrays and `mode` directly, or use a CI harness that strips the
engine field before hashing.

### 7.4 What the receipt proves

The receipt proves that two engines:
- Received the same sealed packet (same `seal`)
- Rendered in the same mode (`illustrated` or `fallback`)
- Resolved the same assets from the same sources (`PIXELBRAIN`, `PNG`, `GLYPH`,
  or `TEXT`)

The receipt does **not** prove pixel-level equivalence. Screenshot diffing
requires a real Defold build and is deferred.

---

## 8. Failure Behavior

| Failure | Response | Rule |
|---|---|---|
| Seal mismatch | Refuse packet, hold last verified frame, emit `SEAL_MISMATCH` | 2 |
| Malformed JSON | `pcall`, drop, diagnose. Never crash the runtime | — |
| Oversized payload (> 1 MiB) | Rejected **before** decode | — |
| Disconnect | Backoff reconnect (1s default), then `state.resync.request` with `lastSequence` | — |
| Stale revision | Dropped by the monotonic gate (`STALE_REVISION`) | 4 |
| Missing asset | Degradation ladder: `PIXELBRAIN → PNG → GLYPH → TEXT`. Defold's GLYPH is a colored quad. Recorded as `"GLYPH"` in the claim. | 3 |
| Malformed seal (not `plan1:` prefix) | Rejected as `MALFORMED_SEAL` | 2 |

---

## 9. Testing

### 9.1 TypeScript tests (82 tests)

Run from `PolarisOS/`:

```bash
npx vitest run --reporter=verbose
```

| Suite | File | Tests | What it proves |
|---|---|---|---|
| Seal determinism | `packages/scene-packet/tests/seal.test.ts` | 12 | Identical manifest → identical seal. Mode independence. Sequence independence. Canonical ordering. Quantizer correctness. |
| Packet building | `packages/scene-packet/tests/buildSealedPacket.test.ts` | 15 | Determinism. Milli-quantization. Null → "" projection. Sort order. Seal format (`plan1:` + 64 hex). |
| Receipts | `packages/scene-packet/tests/receipt.test.ts` | 12 | Minting. Divergence detection. Cross-engine comparison. |
| Wire projection | `packages/defold-bridge/tests/wire.test.ts` | 12 | No-null invariant. Explicit counts. Flattened glyphs. JSON round-trip. |
| Bridge receipts | `packages/defold-bridge/tests/receipt.test.ts` | 13 | Claim parsing. Malformed rejection. Cross-engine receipts. Engine field in hash. |

**Key regression tests:**

- **Mode independence:** Illustrated and fallback consumers yield the *same*
  seal. This is the direct regression test for the `mode`-in-`planHash` defect
  that the bridge design fixes.
- **Sequence independence:** The same manifest delivered at two different
  `sequence` values yields the *same* seal.
- **No-null wire:** The wire projection contains zero `null` values. Verified by
  recursive traversal of the projected object.

### 9.2 Lua tests (18 tests)

Run headlessly (no Defold required):

```bash
cd apps/defold-runtime
luajit tests/packet_test.lua
# or: lua5.4 tests/packet_test.lua
```

| Test group | What it proves |
|---|---|
| Decode | Valid JSON accepted. Malformed JSON rejected without crash. Non-string input rejected. |
| Byte cap | Oversized payload (> 1 MiB) rejected **before** decode. |
| Revision gate | Stale `roomRevision` dropped. Stale `sequence` at same revision dropped. Newer packets accepted. First packet always accepted. |
| Seal equality | Matching seal accepted. Mismatched seal rejected with `SEAL_MISMATCH`. Malformed seal (no `plan1:` prefix) rejected. First packet (no held seal) accepted. |
| Full pipeline | `packet.accept()` chains decode → gate → seal correctly. |

The test file stubs the `json` global (Defold provides it; `luajit` does not)
with a minimal encoder/decoder.

### 9.3 What the tests do NOT prove

Stated plainly so no later claim overreaches:

- **No Defold build.** The extracted editor has no `bob.jar` and no `dmengine`.
  The engine is fetched from `d.defold.com` on first use. Everything on the
  Defold side is verified by `luajit` unit tests until a build is possible.
- **No screenshot diffing.** Receipt equality proves the two engines resolved
  the same assets in the same mode. It does not prove they drew the same
  pixels.
- **No binary asset delivery.** The MVP renders GLYPH (colored quads) for all
  assets. The `PIXELBRAIN` and `PNG` tiers require atlas/texture delivery to
  Defold, which is a follow-up spec.

---

## 10. Dependency Law

`@polaris/scene-packet` may not import:
- Pixi, Defold, Fastify, WebSocket, SQLite, or browser APIs

It depends only on:
- `@polaris/contracts` (types)
- `@polaris/pixelbrain-bridge` (sha256, canonicalJson, computeRenderHash)

This makes it importable from server, client, and tooling alike.

`@polaris/defold-bridge` depends only on:
- `@polaris/scene-packet` (types + receipt minting)

The Lua modules in `apps/defold-runtime/` depend only on:
- Defold's bundled `socket` (LuaSocket)
- Defold's built-in `json`
- Defold's built-in `go`, `vmath`, `hash`

No external Defold extensions. No native modules. No cloud extender.

---

## 11. Runtime Flow (End to End)

The complete lifecycle of a scene update, from player input to verified render:

```
1. Player taps a hotspot in Defold
   └─► on_input → render.hit_test(x, y) → command string

2. Defold sends command.submit over WebSocket
   └─► { type: "command.submit", playerId, roomId, expectedRevision, rawInput }

3. Server: kernel resolves the command
   └─► events → roomRevision bumps

4. Server: scene-compiler projects a SceneManifest
   └─► contractHash computed

5. Server: buildSealedPacket(manifest, { sequence })
   └─► plan1: seal computed (SHA-256 over canonicalJson)

6. Server emits scene.sealed to the room
   └─► { type: "scene.sealed", envelope, packet }
   (scene.patch also emitted for PixiJS transition)

7. Defold: ws.lua polls the socket in update(dt)
   └─► non-blocking receive, frame decode

8. Defold: packet.accept(raw_json, current_state)
   └─► decode → byte cap → revision gate → seal equality
   └─► REJECT: hold last frame, log reason
   └─► ACCEPT: proceed

9. Defold: render.apply(packet)
   └─► clear prior objects, rebuild from packet alone
   └─► sprites in draw order, hotspots registered
   └─► returns resolved_assets list

10. Defold: claim.build_claim(seal, mode, resolved_assets)
    └─► sends render.claim over WebSocket

11. Bridge: parseDefoldClaim(raw) → mintDefoldReceipt(raw)
    └─► render1: hash computed

12. CI: crossEngineReceiptsEqual(defoldReceipt, pixiReceipt)
    └─► TRUE: both engines agree
    └─► FALSE: genuine divergence, investigate
```

---

## 12. Extending the Bridge

### 12.1 Adding a new engine

Any engine that can receive JSON over WebSocket can join the bridge:

1. Implement the four rules.
2. Decode the wire packet (use `toLuaWire` format or the raw
   `SealedScenePacket` JSON).
3. Render from the packet alone.
4. Report a claim with `engine: "your-engine"`.
5. Add your engine to the `engine` enum in `RenderReceiptClaimSchema`.

The seal is engine-neutral. The receipt is engine-specific. The comparison is
the falsifier.

### 12.2 Adding binary asset delivery

The current MVP renders GLYPH (colored quads) for all assets. To deliver real
PixelBrain rasters to Defold:

1. Export a `.atlas` + `.tilesource` from PixelBrain packets at build time.
2. Serve the atlas textures over HTTP or bundle them in the Defold project.
3. In `render.lua`, resolve `assetKey` against the atlas before falling back
   to GLYPH.
4. Record the resolution source as `"PIXELBRAIN"` or `"PNG"` in the claim.

This is a follow-up spec. The bridge contract already carries `assetKey` and
the full degradation ladder.

### 12.3 Adding TLS

The current bridge is `ws://` only because LuaSocket has no TLS for raw
sockets. To add `wss://`:

1. Use a Defold extension that provides TLS sockets (e.g., `defold-websocket`).
2. Or terminate TLS at a reverse proxy and forward `ws://` to Defold.
3. Update `ws.lua` to use the TLS socket constructor.

This also unlocks the HTML5 target, which requires `wss://`.

---

## 13. File Index

| Path | Role |
|---|---|
| `packages/scene-packet/src/contracts.ts` | All shared types + Zod schemas |
| `packages/scene-packet/src/seal.ts` | `computePlanSeal`, `toMilli`, `alphaToMilli` |
| `packages/scene-packet/src/buildSealedPacket.ts` | `SceneManifest → SealedScenePacket` (the ONE seal producer) |
| `packages/scene-packet/src/receipt.ts` | `mintReceipt`, `receiptsEqual`, `toResolvedAssetLedgerEntry` |
| `packages/scene-packet/src/verifySeal.ts` | `verifySeal`, `passesRevisionGate` |
| `packages/scene-packet/src/index.ts` | Barrel export |
| `packages/defold-bridge/src/wire.ts` | `toLuaWire` — Lua-safe wire projection |
| `packages/defold-bridge/src/receipt.ts` | `parseDefoldClaim`, `mintDefoldReceipt`, `crossEngineReceiptsEqual` |
| `packages/defold-bridge/src/index.ts` | Barrel export |
| `packages/contracts/src/protocol.ts` | `scene.sealed` message schema (line ~166) |
| `apps/server/src/GameServer.ts` | Seal emission (line ~732) |
| `apps/defold-runtime/game.project` | Defold project config |
| `apps/defold-runtime/main/main.collection` | Bootstrap collection |
| `apps/defold-runtime/main/bootstrap.script` | Entry point |
| `apps/defold-runtime/scenepacket/ws.lua` | Pure-Lua RFC6455 WebSocket client |
| `apps/defold-runtime/scenepacket/packet.lua` | Decode, seal equality, revision gate |
| `apps/defold-runtime/scenepacket/render.lua` | Packet → sprites/labels |
| `apps/defold-runtime/scenepacket/claim.lua` | Build render.claim JSON |
| `apps/defold-runtime/tests/packet_test.lua` | 18 Lua unit tests |

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Seal** (`plan1:`) | SHA-256 hash of the canonical JSON of a sealed packet. Computed once by the server. Verified by string equality. |
| **Claim** | What an engine reports about its own render: seal + engine + mode + resolved assets. No hashing. |
| **Receipt** (`render1:`) | A claim plus a `renderHash`. Minted in TypeScript from a claim. The falsifier. |
| **Wire packet** | The Lua-safe JSON projection of a sealed packet. No nulls, explicit counts, flattened glyphs. |
| **Monotonic gate** | The `roomRevision`/`sequence` check that drops stale packets. |
| **Degradation ladder** | `PIXELBRAIN → PNG → GLYPH → TEXT`. The ordered fallback for missing assets. |
| **Milli-units** | Integer quantization of floats: `round(value × 1000)`. The only rounding that ever happens. |
| **Sovereign runtime** | Defold. It executes what the server says. It does not infer, default, or best-effort. |
| **Visual laboratory** | PixiJS. It is free to be wrong. Its value is experiment, not authority. |

---

*The world produces the picture. The picture does not produce the world.*
*The seal proves the picture. The receipt proves the engine drew it.*
