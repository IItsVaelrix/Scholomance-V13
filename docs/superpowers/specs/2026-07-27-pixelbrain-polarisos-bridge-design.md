# PixelBrain Bridge to PolarisOS Design

**Date:** 2026-07-27
**Status:** Draft for written review
**Scope:** PolarisOS visual asset realization for the existing PixiJS renderer

## 1. Purpose

PixelBrain becomes a deterministic visual asset provider for PolarisOS.

It may determine the internal pixels, palette, transparency, and silhouette of
one static asset frame.

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

PolarisOS/scripts/
└── build-pixelbrain-assets.ts

PolarisOS/apps/client/src/generated/
└── pixelbrainAssetRegistry.ts
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

The bridge computes `packetContentHash` from the normalized visual content
defined in Section 8.
If an input packet includes `contentHash`, validation requires it to equal the
computed digest. Packets without a supplied digest remain compatible with the
current upstream producer, but the computed digest becomes mandatory on every
normalized and resolved artifact.

This makes the bridge boundary content-addressed without changing the
authoritative Polaris scene schema.

`pixelbrain.render.v1` represents exactly one static raster frame. The bridge
keeps packet-local frame evolution possible for a future protocol version, but
this milestone implements neither multi-frame rasterization nor animation
scheduling.

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
    | "INVALID_GRID_ALIGNMENT"
    | "COORDINATE_OUT_OF_RANGE"
    | "COLOR_INVALID"
    | "PACKET_HASH_MISMATCH"
    | "RASTER_LIMIT_EXCEEDED"
    | "RASTER_WORK_LIMIT_EXCEEDED"
    | "RENDERER_RESOURCE_LIMIT_EXCEEDED"
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
- encoded packet size no greater than 8 MiB
- a raster byte size no greater than 16 MiB
- no more than 1,000,000 coordinate primitives
- finite integer `snappedX` and `snappedY` values
- `snappedX % cellSize === 0`
- `snappedY % cellSize === 0`
- finite integer `z`, defaulting to `0`
- colors encoded as `#RRGGBB` or `#RRGGBBAA`
- optional numeric alpha in `[0, 1]`
- optional `contentHash` matching the computed normalized packet digest
- total clipped raster writes no greater than 16,777,216 physical pixels

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

Both origins must align to the packet grid:

```text
snappedX mod cellSize = 0
snappedY mod cellSize = 0
```

Misalignment invalidates the packet with `INVALID_GRID_ALIGNMENT`. Because one
packet has one global `cellSize`, aligned primitives with different origins
cannot overlap. Two primitives can target the same physical pixels only when
they have the same aligned origin.

For a cell at `(snappedX, snappedY)` with `cellSize = n`, the rasterizer writes
the half-open rectangle:

```text
[snappedX, snappedX + n) × [snappedY, snappedY + n)
```

The raster starts as:

- all zero bytes when `transparent === true`
- the parsed background color when `transparent === false`

Colors use straight RGBA bytes. For `#RRGGBB`, embedded alpha is `255`. For
`#RRGGBBAA`, the final two hex digits are embedded alpha. The optional numeric
coordinate alpha defaults to `1` and combines by multiplication:

```text
effectiveAlphaByte = round(embeddedAlphaByte × explicitAlpha)
```

The winning cell replaces all four destination bytes. The bridge does not
alpha-composite one cell over another or over the initialized background. No
antialiasing, interpolation, subpixel coverage, or color conversion occurs in
the pure bridge.

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

Grid alignment makes different origins physically disjoint. This preserves
explicit PixelBrain layer precedence while making accepted packets independent
of array iteration order.

### Clipping policy

A cell rectangle completely outside the canvas produces
`COORDINATE_OUT_OF_RANGE` and invalidates the packet.

A cell rectangle that intersects an edge is clipped to the half-open canvas
bounds and emits a `WARNING` diagnostic. All four edges use the same rule.
With mandatory grid alignment, a negative top/left origin is necessarily
completely outside and is rejected; partial clipping can occur at the right or
bottom when canvas dimensions are not divisible by `cellSize`. Edge tests cover
the exact reject-or-clip result at left, top, right, and bottom.

Integer arithmetic is checked before buffer offsets are computed. Any unsafe
offset or byte-size calculation produces `RASTER_LIMIT_EXCEEDED`.

Before allocating or writing the output, normalization computes:

```text
totalRasterWrites = sum(clippedCellWidth × clippedCellHeight)
```

If the total exceeds `16,777,216`, the packet is rejected with
`RASTER_WORK_LIMIT_EXCEEDED`. Output byte size, primitive count, and raster
work are independent limits; passing one never bypasses another.

## 8. Deterministic Identity

Hashing is a wire-level contract:

- algorithm: SHA-256
- digest encoding: 64 lowercase hexadecimal characters
- strings: UTF-8
- JSON string escaping: escape quotation mark, reverse solidus, and U+0000
  through U+001F; do not escape solidus or other Unicode code points
- object keys: lexicographically sorted by Unicode code point
- numbers: canonical decimal safe-integer representation
- arrays: preserved in normalized order
- `-0`: normalized to `0`
- `undefined`, `NaN`, and infinities: prohibited
- raster RGBA: raw bytes, never JSON number arrays

In the byte formulas below, `||` means byte concatenation.

Canonical packet content excludes `packetId`, the supplied `contentHash`,
diagnostics, and `sourcePrimitiveIndex`. Exact duplicates are coalesced before
hashing. Cells appear in canonical `(y, x, z, rgba)` order and encode RGBA as
lowercase `#rrggbbaa`.

```text
packetContentBytes =
  UTF8("pixelbrain-packet.v1\0")
  || UTF8(canonicalJson(normalizedVisualContent))

packetContentHash =
  "pb1:" || lowercaseHex(SHA256(packetContentBytes))
```

`packetContentHash` is pure visual-content identity. Renaming a packet does not
change it. The readable `packetId` remains in `PixelBrainResolvedAsset` for
provenance and diagnostics but never keys a texture.

Raster identity uses binary framing:

```text
rasterBytes =
  UTF8("pixelbrain-raster.v1\0")
  || uint32BigEndian(width)
  || uint32BigEndian(height)
  || rgba

rasterHash =
  "pbr1:" || lowercaseHex(SHA256(rasterBytes))
```

PNG identity follows the same rule:

```text
pngRevision =
  "png1:" || lowercaseHex(
    SHA256(UTF8("pixelbrain-png.v1\0") || responseBytes)
  )
```

`renderHash` uses UTF-8 canonical JSON with the same object, number, and array
rules plus the domain prefix `UTF8("polaris-render.v1\0")`, and is formatted
as `render1:<64 lowercase hexadecimal characters>`.

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
      pngBytes: Uint8Array;
      width: number;
      height: number;
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

The default browser resolver never derives a mutable URL directly from
`assetKey`. It consumes a build-generated registry:

```ts
export interface PixelBrainAssetRegistryEntry {
  assetKey: string;
  pixelBrainUrl?: string;
  expectedPacketContentHash?: string;
  pngUrl?: string;
  expectedPngHash?: string;
}

export type PixelBrainAssetRegistry = Readonly<
  Record<string, PixelBrainAssetRegistryEntry>
>;
```

Source assets live under:

```text
PolarisOS/worldpacks/shrine-demo/assets-src/
```

The deterministic asset-build script:

1. validates and hashes source packets and PNG bytes;
2. writes immutable fingerprinted files under
   `apps/client/public/assets/generated/`;
3. generates `apps/client/src/generated/pixelbrainAssetRegistry.ts`;
4. fails when two source assets claim the same `assetKey`; and
5. removes no files outside its generated output manifest.

Example generated entry:

```ts
"entities/lantern": {
  assetKey: "entities/lantern",
  pixelBrainUrl:
    "/assets/generated/entities/lantern.pb1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pixelbrain.json",
  expectedPacketContentHash:
    "pb1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
}
```

The generated TypeScript registry is imported into the client bundle. Packet
and PNG URLs contain their full digest and are immutable/cache-safe. A response
whose actual hash differs from the registry expectation is rejected before
texture creation.

Packet responses are read through a bounded stream. The resolver cancels the
body and emits `RASTER_LIMIT_EXCEEDED` once 8 MiB is exceeded; it does not call
unbounded `response.json()` or `response.arrayBuffer()` first.

PNG responses use the same bounded-reader pattern with a 16 MiB encoded limit.
Decoded width and height must each be in `[1, 2048]` before cache acquisition.

PNG resolution fetches image bytes once, computes `pngRevision` from those
exact bytes, verifies `expectedPngHash`, and creates the Pixi-compatible image
source from the same buffer. HTTP timestamps, cache headers, and readable
filenames are never content identity.

An injected registry and fetch function remain available for tests and
embedded deployments.

## 10. PixiJS Texture Lifecycle

`PixelBrainTextureCache` owns entries shaped as:

```ts
interface PixelBrainTextureEntry {
  cacheKey: string; // rasterHash or pngRevision
  retainedBytes: Uint8Array;
  retainedByteLength: number;
  estimatedGpuBytes: number;
  texture: unknown;
  references: number;
  usageTick: number;
}

interface PixelBrainTextureCachePolicy {
  maxZeroReferenceEntries: number;
  maxRetainedRasterBytes: number;
  maxEstimatedGpuBytes: number;
  maxActiveSceneBytes: number;
}
```

The MVP policy is:

```ts
{
  maxZeroReferenceEntries: 64,
  maxRetainedRasterBytes: 64 * 1024 * 1024,
  maxEstimatedGpuBytes: 128 * 1024 * 1024,
  maxActiveSceneBytes: 64 * 1024 * 1024,
}
```

Responsibilities:

- create a Pixi texture from RGBA bytes
- configure nearest-neighbor sampling
- reuse one texture per `rasterHash` or `pngRevision`
- retain PixelBrain RGBA or PNG source bytes for context restoration
- release references when a scene is reprojected
- track retained CPU bytes and estimated decoded GPU bytes
- destroy evicted GPU textures and their texture sources
- rebuild textures after WebGL context restoration
- destroy all textures when `PixiSceneRenderer.destroy()` runs

The cache uses a private monotonic integer counter. Every acquire increments
the counter and copies it to `usageTick`; wall-clock time is never consulted.
`retainedByteLength` is `retainedBytes.byteLength`.
`estimatedGpuBytes` is `width × height × 4` for each unique decoded RGBA
texture source; shared sprites do not multiply the estimate.
Eviction considers only zero-reference entries and sorts by `usageTick`
ascending, then `cacheKey` ascending. It evicts until entry count, retained CPU
bytes, and estimated GPU bytes all satisfy the policy.

Active textures are never evicted. A proposed scene whose active decoded
texture bytes would exceed `maxActiveSceneBytes` does not acquire the
over-budget asset. Assets are considered in canonical `assetKey` order; an
over-budget asset emits `RENDERER_RESOURCE_LIMIT_EXCEEDED` and continues to its
glyph or text fallback.

PixiJS crisp-pixel requirements:

- application antialiasing disabled
- renderer `roundPixels: true`
- `BufferImageSource` created with `format: "rgba8unorm"`
- `BufferImageSource` created with `alphaMode: "no-premultiply-alpha"`
- `BufferImageSource` created with `scaleMode: "nearest"`
- automatic mipmaps disabled
- integer sprite positions
- integer display scale
- no fractional camera or container transforms

These rules belong only to the Pixi adapter.

The adapter uploads the bridge's straight RGBA bytes without premultiplication.
A browser test renders a semi-transparent colored PixelBrain pixel over a
contrasting background and verifies the expected composite, preventing dark
halos or an accidental premultiplied-alpha interpretation.

## 11. Render Identity

`SceneRenderPlan.planHash` remains the pure hash of unresolved scene
instructions. It must not depend on network or GPU state.

After asynchronous asset resolution, `PixiSceneRenderer` computes:

```ts
renderIdentity = {
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
};

renderHash =
  "render1:" + lowercaseHex(
    SHA256(
      UTF8("polaris-render.v1\0")
      || UTF8(canonicalJson(renderIdentity))
    )
  );
```

The renderer exposes `currentRenderHash` and the resolved-asset ledger for
diagnostics and integration tests.

## 12. Rendering Flow

`PixiSceneRenderer` owns:

```ts
private renderEpoch = 0;
private destroyed = false;
private activeSceneRoot: unknown | null = null;
private activeTextureKeys = new Set<string>();
private lastCommittedManifest: SceneManifest | null = null;
```

Every render captures a monotonically increasing epoch. Any newer render,
context restoration, or `destroy()` invalidates all older unfinished work.

For each full scene projection:

1. Increment and capture `renderEpoch`.
2. Build the pure `SceneRenderPlan`.
3. Collect unique asset keys in canonical order.
4. Resolve each key through the strict fallback chain without acquiring GPU
   resources.
5. If the epoch is stale or the renderer is destroyed, discard resolutions
   and return `"stale"`.
6. Acquire new texture references into a provisional lease set while enforcing
   active-scene byte limits.
7. Recheck the epoch. If stale, release every provisional lease and return
   `"stale"`.
8. Build a complete new Pixi scene root off-stage. The current valid root
   remains mounted.
9. Recheck the epoch. If stale, destroy the provisional root, release every
   provisional lease, and return `"stale"`.
10. Compute `renderHash`.
11. Atomically replace the mounted scene root, record the new active texture
    keys and manifest, then release the prior scene's texture references.

`currentPlan`, `currentRenderHash`, the resolved-asset ledger, and
`lastCommittedManifest` update only in step 11. Stale or failed work is never
observable as current renderer state.

```ts
export type SceneRenderOutcome =
  | { status: "committed"; plan: SceneRenderPlan; renderHash: string }
  | { status: "stale"; plan: SceneRenderPlan }
  | { status: "fallback"; plan: SceneRenderPlan; renderHash: string };
```

Resolution failure for one asset continues through PNG, glyph, and text
without failing the scene transaction. If off-stage drawing fails, the
provisional root and all provisional leases are released and the prior valid
scene stays mounted. When no prior valid scene exists, the renderer commits
the accessible text projection.

`destroy()` increments `renderEpoch`, marks the instance destroyed, destroys
the active root, releases active leases, destroys the texture cache, and
removes fallback DOM. A later `init()` starts a new lifecycle with a fresh
epoch; pre-destroy work can never match it.

On `webglcontextrestored`, the renderer invalidates the current epoch, asks
each retained texture source to upload again from retained bytes, and reprojects
`lastCommittedManifest`. PixiJS context restoration is therefore supported
without refetching mutable asset paths.

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
The source packets are compiled into fingerprinted immutable client assets and
the generated registry uses the same `assetKey`s already emitted by the scene
compiler.

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
- coordinates and grid alignment: `COORD`
- colors: `COLOR`
- raster-work and renderer-memory limits: `RENDER`
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
- Grid-misaligned coordinates emit `INVALID_GRID_ALIGNMENT`.
- Invalid colors are rejected.
- Invalid dimensions and cell size are rejected.
- Supplied content-hash mismatch is rejected.
- Primitive count, output bytes, and total raster writes are independently
  bounded.
- World-position and interaction fields cannot influence output.

### Raster determinism

- Same normalized packet produces byte-identical RGBA.
- Reordering non-conflicting primitives cannot change output.
- Transparent cells remain zero-alpha.
- Embedded and explicit alpha multiply with exact rounding.
- A winning write replaces all four destination bytes without blending.
- Higher packet-local `z` deterministically wins.
- Conflicting duplicates at equal `(x, y, z)` are rejected.
- Differently aligned origins cannot overlap.
- Clipping is exact at all four edges.
- Raster hash changes whenever output bytes change.
- Equivalent packets produce equivalent raster hashes.
- Renaming a packet does not change `packetContentHash` or `rasterHash`.
- SHA-256 fixtures match in Node and a browser.

### Cache

- Same raster hash reuses one texture.
- Changed raster creates a new texture even when packet ID is unchanged.
- Evicted textures are destroyed.
- Entry-count, retained-CPU-byte, estimated-GPU-byte, and active-scene-byte
  limits are enforced independently.
- Equal-age eviction ties resolve by cache key, and `usageTick` never reads the
  clock.
- Renderer destruction clears GPU resources.
- Context restoration rebuilds textures from retained raster bytes.

### Asynchronous freshness

- Slow Scene A followed by fast Scene B can commit only Scene B.
- Renderer destruction during resolution prevents commit and releases all
  provisional resources.
- Partial asset-resolution failure continues through the fallback chain.
- Every stale render releases all provisional texture references.
- Drawing failure retains the prior valid scene and releases the provisional
  scene.
- Context restoration invalidates unfinished work and reproduces the last
  committed render identity.

### Fallback order

- Valid PixelBrain packet outranks PNG.
- Invalid packet emits diagnostics and falls back to PNG.
- Missing PNG falls back to a glyph.
- Text mode resolves to accessible text without GPU work.
- Failure at every visual level never blocks hotspots or commands.
- A semi-transparent PixelBrain pixel uploads as straight alpha with nearest
  sampling and produces no dark halo over a contrasting browser background.

### Asset registry

- The build is deterministic for identical source bytes.
- Generated packet and PNG URLs contain full content hashes.
- Registry expectation mismatch rejects the response and continues fallback.
- Duplicate `assetKey`s fail the asset build.
- Mutable unhashed asset paths are never fetched by the default resolver.

### Integration

- Shrine lantern renders from a real PixelBrain packet.
- Brazier states resolve to distinct packet and raster hashes.
- Taking the lantern removes it from the scene.
- Lighting the brazier swaps the rendered asset.
- Both clients produce identical raster and render hashes.
- Reconnect reproduces the same realization.
- Both clients resolve the same fingerprinted registry entries.
- Text fallback remains playable.
- Scene synchronization and `contractHash` behavior remain unchanged.

## 16. Out of Scope

- PixelBrain authoring inside PolarisOS
- PixelBrain control of world placement or interaction
- multi-frame packets and animation scheduling
- Project Lotus CELS composition
- modifying `SceneManifest` or its contract hash
- server-side generation of PixelBrain art
- unrestricted remote packet URLs
- shader or material execution from untrusted packet metadata

## 17. Security and Resource Rules

- Resolve only same-origin fingerprinted URLs present in the generated
  registry.
- Reject `..`, absolute URLs, query injection, and encoded path traversal.
- Treat packet JSON as untrusted input.
- Enforce input, output, raster-work, active-scene, retained-memory, and
  estimated-GPU limits before committing resources.
- Never execute packet strings as code.
- Never deserialize functions, shaders, commands, or event handlers.
- Keep user-authored unsaved work in browser memory; this bridge performs no
  persistence or telemetry.

## 18. Harness Laws

These invariants are named so tests and future adapters can enforce them
directly:

### Projection authority

A downstream visual provider may realize form but cannot introduce world
authority.

### Complete projection identity

Every input capable of changing realized output appears in the appropriate
downstream identity.

### Asynchronous freshness

An older asynchronous projection may never overwrite a newer authoritative
projection.

### Resource boundedness

Validation bounds computational work and retained resources, not merely input
count or output dimensions.

## 19. Definition of Done

The bridge is complete when:

1. the pure package passes validation and byte-exact raster tests;
2. the renderer owns and correctly destroys all GPU resources;
3. the shrine demo visibly uses live PixelBrain packets;
4. the complete Polaris suite and TypeScript check pass;
5. fallback mode remains fully playable; and
6. identical authoritative scenes and assets produce identical
   `contractHash`, `planHash`, `packetContentHash`, `rasterHash`, and
   `renderHash` chains across clients and reconnects.
