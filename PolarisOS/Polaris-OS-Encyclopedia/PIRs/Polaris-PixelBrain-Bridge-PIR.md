# Polaris OS — PixelBrain Bridge to PixiJS — Post-Implementation Review

**Date:** 2026-07-27  
**Status:** COMPLETE, with one unrelated workspace-build limitation recorded below  
**Tests:** 181 passing across 22 files  
**Browser gate:** 1 passing in headless Chromium
**Typecheck:** 0 errors  
**Client production build:** passing  
**SceneManifest schema and `contractHash`:** unchanged

---

## 1. Objective

Make PixelBrain a deterministic visual-asset provider for PolarisOS while
keeping PixiJS as the browser/GPU lifecycle shell.

The implementation preserves the governing rule:

> The world produces the picture. The picture does not produce the world.

PixelBrain controls packet-local pixels only. Polaris continues to control
entity existence, world placement, z-order, visibility, interaction regions,
commands, lighting authority, and world state.

`pixelbrain.render.v1` represents exactly one static raster frame. This
milestone does not implement packet-local animation scheduling.

---

## 2. Package Boundary

### `@polaris/pixelbrain-bridge`

The bridge is pure and renderer-neutral. It imports no PixiJS, DOM, filesystem,
network, or Node crypto APIs and owns no mutable cache.

It provides:

- packet validation and the Polaris-authority firewall
- canonical normalization
- exact SHA-256 identity protocols
- deterministic straight-RGBA rasterization
- PB-ERR-v1 diagnostics as returned data

Its output is:

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

### `@polaris/renderer-pixi`

The Pixi adapter owns:

- immutable asset-registry resolution
- PixelBrain → PNG → glyph → text fallback
- RGBA/PNG texture creation
- nearest-neighbor, straight-alpha upload settings
- GPU texture reference counting, eviction, destruction, and restoration
- render epochs and transactional scene swaps
- integer sprite placement and integer display scaling
- realized-asset ledgers and `renderHash`
- hotspot registration and drawing

No Pixi texture or GPU-backed resource crosses into the pure bridge.

---

## 3. Deterministic Contracts

### 3.1 Packet semantics

- Coordinates are physical pixel origins.
- `snappedX` and `snappedY` must be divisible by the global `cellSize`.
- A cell writes the half-open rectangle
  `[x, x + cellSize) × [y, y + cellSize)`.
- Higher local `z` replaces lower `z`.
- Exact duplicates coalesce.
- Conflicting RGBA at identical `(x, y, z)` is rejected.
- Embedded color alpha is multiplied by explicit alpha and rounded.
- Winning writes replace all four destination bytes; the bridge does not blend.
- Transparent canvases initialize to zero-alpha bytes.

### 3.2 Limits

| Limit | Value |
|---|---:|
| Encoded packet | 8 MiB |
| Canvas dimension | 2048 per axis |
| Cell size | 64 |
| Coordinate primitives | 1,000,000 |
| Output RGBA | 16 MiB |
| Total clipped raster writes | 16,777,216 |

The work ceiling is checked before duplicate coalescing, preventing small
outputs with pathological overlapping workloads.

### 3.3 Identity chain

```text
SceneManifest.contractHash
  → SceneRenderPlan.planHash
  → packetContentHash
  → rasterHash or pngRevision
  → renderHash
```

- `contractHash` means what Polaris requested.
- `renderHash` means what the client actually resolved and drew.
- `packetContentHash` excludes readable `packetId`.
- Cache keys are `rasterHash` or `pngRevision`, never packet ID.

Hash wire contracts:

- SHA-256
- lowercase hexadecimal output
- UTF-8 strings
- object keys sorted by Unicode code point
- safe-integer canonical decimal numbers
- negative zero normalized to zero
- undefined, fractions, unsafe integers, NaN, and infinity prohibited
- raw raster RGBA bytes with big-endian dimensions
- domain prefixes `pb1:`, `pbr1:`, `png1:`, and `render1:`

---

## 4. Immutable Asset Pipeline

Source packets live under:

```text
worldpacks/shrine-demo/assets-src/
```

`scripts/build-pixelbrain-assets.ts` validates each source through the real
bridge and emits:

- normalized packets carrying verified `contentHash`
- full-digest fingerprinted URLs
- a deterministic generated-file manifest
- a sorted TypeScript asset registry

The shrine demo includes live PixelBrain packets for:

- `entities/lantern`
- `entities/brazier`
- `entities/brazier_lit`
- `players/marker_default`

The resolver never derives mutable `<assetKey>.pixelbrain.json` or
`<assetKey>.png` paths. It accepts only registry-controlled
`/assets/generated/...` URLs whose filename digest matches the expected hash.
Packet responses are streamed with an 8 MiB ceiling; PNG responses use a
16 MiB ceiling. Actual response bytes are hashed before use.

---

## 5. Texture and Async Lifecycle

The default cache policy is:

```ts
{
  maxZeroReferenceEntries: 64,
  maxRetainedRasterBytes: 64 * 1024 * 1024,
  maxEstimatedGpuBytes: 128 * 1024 * 1024,
  maxActiveSceneBytes: 64 * 1024 * 1024,
}
```

Eviction considers only zero-reference entries and orders them by monotonically
increasing `usageTick`, then cache key. Active textures are never evicted.
PNG cache entries retain both verified encoded bytes and decoded upload bytes;
both count against the CPU budget.

Pixi texture sources use:

```ts
{
  format: "rgba8unorm",
  alphaMode: "no-premultiply-alpha",
  scaleMode: "nearest",
  autoGenerateMipmaps: false,
}
```

The Pixi application uses `antialias: false` and `roundPixels: true`.

Every asynchronous render captures an epoch. A newer render, context
restoration, or renderer destruction invalidates older work. Scene commits are:

1. resolve the new assets
2. acquire provisional texture leases
3. build a new root off-stage
4. verify the epoch
5. add the new root and remove the old root
6. record the new plan, ledger, and render hash
7. release old texture leases and destroy the old root

Stale and failed builds release all provisional leases and destroy any
uncommitted off-stage root. A failed replacement retains the previous valid
scene.

---

## 6. Harness Laws and Evidence

### Projection authority

`validation.test.ts` rejects `worldX`, `worldY`, `position`, `zIndex`,
`visible`, `hotspot`, `interactionRegion`, `command`, `lightingState`,
`roomId`, and `entityId` at packet or coordinate level.

### Complete projection identity

Hash, normalization, raster, registry, resolver, render-identity, and
integration tests cover packet rename invariance, input-order invariance,
changed-raster identity, PNG byte identity, fallback source identity, and
client/reconnect parity.

### Asynchronous freshness

`SceneRenderCoordinator.test.ts` proves slow Scene A cannot overwrite fast
Scene B, renderer destruction invalidates pending work, partial failures release
leases, stale off-stage roots are discarded, and prior resources release only
after a successful commit.

### Resource boundedness

Validation tests cover packet, canvas, output, primitive, and work limits.
Texture-cache tests cover zero-reference count, retained CPU bytes, estimated
GPU bytes, active-scene bytes, deterministic eviction, destruction, and context
restoration.

---

## 7. Verification Evidence

Executed from `PolarisOS/` on 2026-07-27:

```text
npm run build:pixelbrain-assets
  Generated 4 PixelBrain asset file(s).

git diff --exit-code -- apps/client/src/generated apps/client/public/assets/generated
  exit 0

npm test
  22 test files passed
  181 tests passed
  0 failed

npm run typecheck
  exit 0

npm run build --workspace=apps/client
  736 modules transformed
  production client built successfully

npm run test:browser:pixelbrain
  1 Chromium test passed
  straight RGBA over a contrasting background composited without a dark halo
```

The test total includes:

- 55 pure bridge tests
- 4 deterministic asset-generator tests
- 25 new resolver/cache/coordinator/render-identity tests
- 4 PixelBrain integration-gate tests
- all pre-existing Polaris milestone, kernel, runtime, protocol, persistence,
  compiler, command-language, and scene-plan tests

The complete root `npm run build` also builds the client successfully, then
fails in the pre-existing empty `apps/world-studio` workspace because that
workspace has no `index.html`. No PixelBrain module appears in that failure.
This review does not add unrelated World Studio files or alter its package.

`tests/browser/PixelBrainAlpha.spec.ts` executes the actual Pixi
`BufferImageSource` path in headless Chromium. It renders a 50%-alpha red texel
over opaque blue, extracts the composited pixel, and asserts balanced red/blue
channels with full output alpha. This supplements the unit gate that checks the
exact no-premultiplication, nearest-neighbor, and no-mipmap source options.

---

## 8. Scope Fidelity

The authoritative `SceneManifest` schema, compiler projection, simulation
protocol, synchronization protocol, hotspot commands, and `contractHash`
remain unchanged.

No animation scheduling, live generative art, world placement metadata, or
simulation authority was added to PixelBrain. Visual failure at every level
still preserves accessible text and interactive commands.
