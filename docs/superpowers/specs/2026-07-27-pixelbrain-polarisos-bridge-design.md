# PixelBrain Bridge to PolarisOS Design

**Date:** 2026-07-27
**Status:** Draft for written review
**Scope:** PolarisOS visual asset realization for the existing PixiJS renderer

## 1. Purpose

PixelBrain becomes a deterministic visual asset provider for PolarisOS.

It may determine the internal pixels, palette, transparency, silhouette, and
local animation frames of an asset.

It may not determine whether an entity exists, where that entity appears in
the Polaris scene, its z-order, visibility, interaction region, command
binding, lighting authority, or world state.

The PixelBrain bridge validates and deterministically rasterizes approved
`pixelbrain.render.v1` packets into renderer-neutral RGBA artifacts.

The PixiJS adapter resolves those artifacts into cached GPU textures and falls
back through PNG, procedural glyph, and accessible text without interrupting
simulation or interaction.

This preserves the Polaris product law:

> The world produces the picture. The picture does not produce the world.

## 2. Existing Contracts Preserved

The implementation does not change `SceneManifest`, `SceneLayer`, the scene
compiler, or the meaning of `SceneManifest.contractHash`.

The existing pipeline remains:

```text
authoritative world state
  -> SceneCompiler
  -> SceneManifest
  -> buildScenePlan
  -> PixiSceneRenderer
```

The bridge adds a downstream visual-realization stage:

```text
SceneManifest.contractHash
  -> requested assetKey
  -> PixelBrain packet resolution
  -> packetContentHash
  -> deterministic RGBA raster
  -> rasterHash
  -> PixiJS texture
  -> renderHash
```

`contractHash` means what Polaris requested. `renderHash` means what the
renderer actually resolved and drew.

## 3. Package Boundaries

```text
PolarisOS/packages/
├── pixelbrain-bridge/
│   ├── src/contracts.ts
│   ├── src/diagnostics.ts
│   ├── src/hash.ts
│   ├── src/validatePacket.ts
│   ├── src/normalizePacket.ts
│   ├── src/rasterizePacket.ts
│   └── src/index.ts
│
└── renderer-pixi/
    ├── src/PixelBrainAssetResolver.ts
    ├── src/PixelBrainTextureCache.ts
    ├── src/PixiSceneRenderer.ts
    └── src/scenePlan.ts
```

`@polaris/pixelbrain-bridge` is pure and renderer-neutral. It owns validation,
normalization, hashing, and CPU rasterization. It imports neither PixiJS nor
browser APIs and owns no mutable cache.

`@polaris/renderer-pixi` owns fetching, fallback orchestration, PixiJS texture
creation, GPU caching, eviction, destruction, context restoration, and
drawing.

## 4. Canonical Input Compatibility

The current upstream PixelBrain implementation emits:

```ts
interface UpstreamPixelBrainRenderPacketV1 {
  kind: "pixelbrain.render.v1";
  id: string;
  schemaVersion: 1;
  canvas: {
    width: number;
    height: number;
    cellSize: number;
    transparent: boolean;
    background: string;
  };
  coordinates: unknown[];
  contentHash?: string;
}
```

The bridge preserves these canonical upstream names. It does not introduce a
parallel `version` or `packetId` field on the input packet.

The bridge computes `packetContentHash` from the complete normalized packet.
If an input packet includes `contentHash`, validation requires it to equal the
computed digest. Packets without a supplied digest remain compatible with the
current upstream producer, but the computed digest becomes mandatory on every
normalized and resolved artifact.

This makes the bridge boundary content-addressed without changing the
authoritative Polaris scene schema.

## 5. Pure Bridge Contracts

```ts
export interface PixelBrainDiagnostic {
  protocol: "PB-ERR-v1";
  bytecode: string;
  code:
    | "PACKET_SCHEMA_INVALID"
    | "UNSUPPORTED_PACKET_VERSION"
    | "INVALID_CANVAS_DIMENSIONS"
    | "INVALID_CELL_SIZE"
    | "COORDINATE_OUT_OF_RANGE"
    | "COLOR_INVALID"
    | "PACKET_HASH_MISMATCH"
    | "RASTER_LIMIT_EXCEEDED"
    | "RASTERIZATION_FAILED";
  severity: "WARNING" | "ERROR";
  packetId?: string;
  path?: string;
  detail: string;
}

export interface NormalizedPixelCell {
  x: number;
  y: number;
  z: number;
  rgba: readonly [number, number, number, number];
  sourcePrimitiveIndex: number;
}

export interface NormalizedPixelBrainPacket {
  packetId: string;
  packetVersion: "pixelbrain.render.v1";
  schemaVersion: 1;
  packetContentHash: string;
  width: number;
  height: number;
  cellSize: number;
  transparent: boolean;
  background: readonly [number, number, number, number];
  cells: readonly NormalizedPixelCell[];
}

export interface PixelBrainRaster {
  packetId: string;
  packetVersion: "pixelbrain.render.v1";
  packetContentHash: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  rasterHash: string;
  diagnostics: PixelBrainDiagnostic[];
}

export type PixelBrainBridgeResult =
  | {
      ok: true;
      packet: NormalizedPixelBrainPacket;
      raster: PixelBrainRaster;
      diagnostics: PixelBrainDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: PixelBrainDiagnostic[];
    };
```

Diagnostics are returned as data. The pure package does not log, display, or
persist them.

## 6. Validation Rules

The validator accepts only:

- `kind === "pixelbrain.render.v1"`
- `schemaVersion === 1`
- a non-empty string `id`
- integer canvas width and height in `[1, 2048]`
- integer `cellSize` in `[1, 64]`
- a raster byte size no greater than 16 MiB
- no more than 1,000,000 coordinate primitives
- finite integer `snappedX` and `snappedY` values
- finite integer `z`, defaulting to `0`
- colors encoded as `#RRGGBB` or `#RRGGBBAA`
- optional numeric alpha in `[0, 1]`
- optional `contentHash` matching the computed normalized packet digest

Unknown fields are ignored unless they attempt to claim Polaris authority.
The following fields are rejected wherever they appear at packet root or
coordinate level:

- `worldX`
- `worldY`
- `position`
- `zIndex`
- `visible`
- `hotspot`
- `interactionRegion`
- `command`
- `lightingState`
- `roomId`
- `entityId`

This is the placement and authority firewall.

## 7. Coordinate and Raster Semantics

PixelBrain coordinates are local to the packet canvas. Polaris positions the
completed raster in world/page space.

`snappedX` and `snappedY` are already physical pixel-space origins. They are
not multiplied by `cellSize`.

For a cell at `(snappedX, snappedY)` with `cellSize = n`, the rasterizer writes
the half-open rectangle:

```text
[snappedX, snappedX + n) × [snappedY, snappedY + n)
```

The raster starts as:

- all zero bytes when `transparent === true`
- the parsed background color when `transparent === false`

Colors use straight RGBA bytes because PixiJS texture upload accepts ordinary
RGBA sources. No antialiasing, interpolation, subpixel coverage, or color
conversion occurs in the pure bridge.

### Stable ordering and duplicate policy

Cells normalize in total order:

```text
y ascending
-> x ascending
-> z ascending
-> sourcePrimitiveIndex ascending
```

Layer precedence is carried only by packet-local integer `z`:

- the greatest `z` at a local cell wins
- exact duplicate writes coalesce
- conflicting writes at the same `(x, y, z)` are rejected as
  `PACKET_SCHEMA_INVALID`

This preserves explicit PixelBrain layer precedence while making accepted
packets independent of array iteration order.

### Clipping policy

A cell rectangle completely outside the canvas produces
`COORDINATE_OUT_OF_RANGE` and invalidates the packet.

A cell rectangle that intersects an edge is clipped to the half-open canvas
bounds and emits a `WARNING` diagnostic. All four edges use the same rule.

Integer arithmetic is checked before buffer offsets are computed. Any unsafe
offset or byte-size calculation produces `RASTER_LIMIT_EXCEEDED`.

## 8. Deterministic Identity

The bridge uses one canonical stable serializer and one synchronous,
browser/node-equivalent SHA-256 implementation for packet and raster
identities. Packet hashes use the `pb1:<64 lowercase hex characters>` prefix;
raster hashes use `pbr1:<64 lowercase hex characters>`.

```ts
packetContentHash = stableHash(normalizedPacketWithoutHashes);

rasterHash = stableHash({
  version: "pixelbrain-raster.v1",
  width,
  height,
  rgba,
});
```

The hash implementation must consume raw RGBA bytes, not a lossy string
summary.

The Pixi texture cache key is `rasterHash`, never packet ID. Equivalent raster
bytes share a texture. Changed bytes cannot reuse the prior cache entry merely
because the readable packet ID stayed the same.

## 9. Asset Resolution

```ts
export interface PixelBrainResolvedAsset {
  requestedAssetKey: string;
  packetId: string | null;
  packetContentHash: string | null;
  rasterHash: string | null;
  pngRevision: string | null;
  source: "PIXELBRAIN" | "PNG" | "GLYPH" | "TEXT";
  diagnostics: readonly PixelBrainDiagnostic[];
}

export type AssetResolution =
  | {
      status: "PIXELBRAIN";
      assetKey: string;
      packetId: string;
      raster: PixelBrainRaster;
      diagnostics: readonly PixelBrainDiagnostic[];
    }
  | {
      status: "PNG";
      assetKey: string;
      /** SHA-256 of the response bytes, formatted as png1:<64 lowercase hex>. */
      pngRevision: string;
      textureSource: unknown;
      diagnostics: readonly PixelBrainDiagnostic[];
    }
  | {
      status: "GLYPH";
      assetKey: string;
      glyph: GlyphSpec;
      diagnostics: readonly PixelBrainDiagnostic[];
    }
  | {
      status: "TEXT";
      assetKey: string;
      accessibleLabel: string;
      diagnostics: readonly PixelBrainDiagnostic[];
    };
```

Resolution order is strict:

```text
valid PixelBrain packet
  -> revisioned PNG
  -> procedural glyph
  -> accessible text
```

A malformed PixelBrain packet emits diagnostics and continues to PNG. Failure
at every visual level never blocks hotspots, commands, synchronization, or the
DOM narrative interface.

The default browser resolver requests:

```text
<assetBaseUrl>/<assetKey>.pixelbrain.json
<assetBaseUrl>/<assetKey>.png
```

An injected resolver remains available for tests, embedded deployments, and
future packet registries.

PNG resolution fetches the image bytes once, computes `pngRevision` from those
exact bytes, and creates the Pixi-compatible image source from the same byte
buffer. HTTP cache headers and URLs are not accepted as content identity.

## 10. PixiJS Texture Lifecycle

`PixelBrainTextureCache` owns entries shaped as:

```ts
interface PixelBrainTextureEntry {
  rasterHash: string;
  raster: PixelBrainRaster;
  texture: unknown;
  references: number;
  lastUsed: number;
}
```

Responsibilities:

- create a Pixi texture from RGBA bytes
- configure nearest-neighbor sampling
- reuse one texture per `rasterHash`
- retain raster bytes for context restoration
- release references when a scene is reprojected
- destroy evicted GPU textures
- rebuild textures after WebGL context restoration
- destroy all textures when `PixiSceneRenderer.destroy()` runs

The initial policy is reference-aware least-recently-used eviction with a
maximum of 128 zero-reference entries. Active textures are never evicted.

PixiJS crisp-pixel requirements:

- application antialiasing disabled
- nearest-neighbor texture scale mode
- integer sprite positions
- integer display scale
- rounded pixels enabled
- no fractional camera or container transforms

These rules belong only to the Pixi adapter.

## 11. Render Identity

`SceneRenderPlan.planHash` remains the pure hash of unresolved scene
instructions. It must not depend on network or GPU state.

After asynchronous asset resolution, `PixiSceneRenderer` computes:

```ts
renderHash = stableHash({
  contractHash: plan.contractHash,
  planHash: plan.planHash,
  fallbackMode: plan.mode,
  resolvedAssets: resolvedAssets
    .map((asset) => ({
      assetKey: asset.requestedAssetKey,
      source: asset.source,
      packetContentHash: asset.packetContentHash,
      rasterHash: asset.rasterHash,
      pngRevision: asset.pngRevision ?? null,
    }))
    .sort((a, b) => a.assetKey.localeCompare(b.assetKey)),
});
```

The renderer exposes `currentRenderHash` and the resolved-asset ledger for
diagnostics and integration tests.

## 12. Rendering Flow

For each full scene projection:

1. Build the pure `SceneRenderPlan`.
2. Collect unique background and sprite asset keys.
3. Resolve each key through the strict fallback chain.
4. Acquire PixelBrain textures by `rasterHash` or PNG textures by revision.
5. Compute `renderHash`.
6. Draw background, resolved sprites, Polaris lighting, text, and hotspots.
7. Release texture references no longer used by the scene.

Polaris lighting remains a scene-level authority. PixelBrain may bake local
asset shading into its pixels but cannot change `lightingState` or the
scene-level lighting overlay.

## 13. Demo Integration

The shrine demo gains real `pixelbrain.render.v1` packets for:

- lantern
- brazier, unlit
- brazier, lit
- default player marker

Each packet uses a readable ID and deterministic computed content identity.
The packets are served from the client asset root using the same `assetKey`s
already emitted by the scene compiler.

The demo proves:

- the lantern resolves from PixelBrain on initial load
- taking it removes its draw object while allowing its zero-reference texture
  to remain eligible for bounded cache reuse
- lighting the brazier swaps to a distinct packet and `rasterHash`
- both clients realize identical `rasterHash` and `renderHash` values
- reconnecting reproduces the same identities

## 14. Error Encoding

Each `PixelBrainDiagnostic.bytecode` is a valid `PB-ERR-v1` string with an
FNV-1a checksum, using existing categories where possible:

- packet shape/version/hash: `VALUE`
- dimensions and resource limits: `RANGE` or `RENDER`
- coordinates: `COORD`
- colors: `COLOR`
- unexpected raster failure: `RENDER`

The bridge implements the established bytecode wire format locally because
Polaris packages may not import the Scholomance application core. It does not
invent a second wire format.

The renderer receives diagnostics through an optional callback:

```ts
onDiagnostic?: (diagnostic: PixelBrainDiagnostic) => void;
```

The renderer does not log internally when the callback is provided. Production
play remains uninterrupted.

## 15. Test-First Acceptance Gate

### Packet validation

- Valid `pixelbrain.render.v1` packet is accepted.
- Unknown version emits `UNSUPPORTED_PACKET_VERSION`.
- Non-integer coordinates are rejected.
- Invalid colors are rejected.
- Invalid dimensions and cell size are rejected.
- Supplied content-hash mismatch is rejected.
- World-position and interaction fields cannot influence output.

### Raster determinism

- Same normalized packet produces byte-identical RGBA.
- Reordering non-conflicting primitives cannot change output.
- Transparent cells remain zero-alpha.
- Higher packet-local `z` deterministically wins.
- Conflicting duplicates at equal `(x, y, z)` are rejected.
- Clipping is exact at all four edges.
- Raster hash changes whenever output bytes change.
- Equivalent packets produce equivalent raster hashes.

### Cache

- Same raster hash reuses one texture.
- Changed raster creates a new texture even when packet ID is unchanged.
- Evicted textures are destroyed.
- Renderer destruction clears GPU resources.
- Context restoration rebuilds textures from retained raster bytes.

### Fallback order

- Valid PixelBrain packet outranks PNG.
- Invalid packet emits diagnostics and falls back to PNG.
- Missing PNG falls back to a glyph.
- Text mode resolves to accessible text without GPU work.
- Failure at every visual level never blocks hotspots or commands.

### Integration

- Shrine lantern renders from a real PixelBrain packet.
- Brazier states resolve to distinct packet and raster hashes.
- Taking the lantern removes it from the scene.
- Lighting the brazier swaps the rendered asset.
- Both clients produce identical raster and render hashes.
- Reconnect reproduces the same realization.
- Text fallback remains playable.
- Scene synchronization and `contractHash` behavior remain unchanged.

## 16. Out of Scope

- PixelBrain authoring inside PolarisOS
- PixelBrain control of world placement or interaction
- animation scheduling beyond reserving packet-local frame compatibility
- Project Lotus CELS composition
- modifying `SceneManifest` or its contract hash
- server-side generation of PixelBrain art
- unrestricted remote packet URLs
- shader or material execution from untrusted packet metadata

## 17. Security and Resource Rules

- Resolve only same-origin paths derived from validated `assetKey`s.
- Reject `..`, absolute URLs, query injection, and encoded path traversal.
- Treat packet JSON as untrusted input.
- Enforce size limits before allocating RGBA buffers.
- Never execute packet strings as code.
- Never deserialize functions, shaders, commands, or event handlers.
- Keep user-authored unsaved work in browser memory; this bridge performs no
  persistence or telemetry.

## 18. Definition of Done

The bridge is complete when:

1. the pure package passes validation and byte-exact raster tests;
2. the renderer owns and correctly destroys all GPU resources;
3. the shrine demo visibly uses live PixelBrain packets;
4. the complete Polaris suite and TypeScript check pass;
5. fallback mode remains fully playable; and
6. identical authoritative scenes and assets produce identical
   `contractHash`, `planHash`, `packetContentHash`, `rasterHash`, and
   `renderHash` chains across clients and reconnects.
