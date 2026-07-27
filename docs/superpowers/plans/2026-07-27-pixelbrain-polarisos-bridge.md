# PixelBrain PolarisOS Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live `pixelbrain.render.v1` packets the deterministic visual-asset layer for PolarisOS while PixiJS remains the lifecycle, caching, placement, and fallback adapter.

**Architecture:** A new pure `@polaris/pixelbrain-bridge` package validates, normalizes, hashes, and rasterizes one static packet into straight RGBA bytes. `@polaris/renderer-pixi` resolves fingerprinted assets, owns byte-budgeted GPU textures, rejects stale asynchronous scenes with render epochs, and records a realized `renderHash` without changing `SceneManifest.contractHash` or `SceneRenderPlan.planHash`.

**Tech Stack:** TypeScript ES2022, Vitest, PixiJS 8, Vite, pure synchronous SHA-256, PB-ERR-v1 diagnostics.

## Global Constraints

- `pixelbrain.render.v1` is exactly one static frame.
- PixelBrain owns packet-local pixels only; Polaris owns existence, placement, z-order, visibility, lighting, interaction, commands, and world state.
- `SceneManifest`, `SceneManifest.contractHash`, and the scene compiler schema do not change.
- The pure bridge imports no PixiJS, DOM, filesystem, network, or Node crypto APIs and owns no mutable cache.
- Coordinates are physical pixel origins and must satisfy `snappedX % cellSize === 0` and `snappedY % cellSize === 0`.
- Packet limit: 8 MiB encoded, 1,000,000 primitives, 2048×2048 canvas, 16 MiB output, and 16,777,216 raster writes.
- Bridge output is straight RGBA; a winning cell replaces all four bytes without blending.
- Cache keys are `rasterHash` or `pngRevision`, never packet ID.
- Resolution order is PixelBrain → PNG → glyph → accessible text.
- Older asynchronous projections may never overwrite newer projections.
- Preserve every unrelated dirty-worktree change and confine implementation edits to `PolarisOS/` plus this plan.

---

## File Structure

### New pure bridge package

- `PolarisOS/packages/pixelbrain-bridge/package.json` — workspace package metadata.
- `PolarisOS/packages/pixelbrain-bridge/src/contracts.ts` — packet, normalized cell, raster, diagnostic, and result types plus hard limits.
- `PolarisOS/packages/pixelbrain-bridge/src/hash.ts` — UTF-8, canonical JSON, synchronous SHA-256, packet/raster/PNG/render hash functions.
- `PolarisOS/packages/pixelbrain-bridge/src/diagnostics.ts` — PB-ERR-v1 encoding and diagnostic factories.
- `PolarisOS/packages/pixelbrain-bridge/src/validatePacket.ts` — untrusted-input shape, authority, size, version, canvas, cell, and color checks.
- `PolarisOS/packages/pixelbrain-bridge/src/normalizePacket.ts` — canonical cells, alpha multiplication, alignment, duplicate policy, work accounting, and packet content hash.
- `PolarisOS/packages/pixelbrain-bridge/src/rasterizePacket.ts` — straight RGBA construction and raster hash.
- `PolarisOS/packages/pixelbrain-bridge/src/index.ts` — public exports and `processPixelBrainPacket`.
- `PolarisOS/packages/pixelbrain-bridge/tests/*.test.ts` — hash, validation, normalization, diagnostics, and raster tests.

### Renderer runtime

- `PolarisOS/packages/renderer-pixi/src/PixelBrainAssetResolver.ts` — fingerprint registry, bounded fetch, hash verification, and fallback resolution.
- `PolarisOS/packages/renderer-pixi/src/PixelBrainTextureCache.ts` — reference-counted byte/GPU budgets and context restoration.
- `PolarisOS/packages/renderer-pixi/src/SceneRenderCoordinator.ts` — epoch and provisional-resource transaction control.
- `PolarisOS/packages/renderer-pixi/src/PixiSceneRenderer.ts` — off-stage scene construction, texture use, atomic swap, and fallback.
- `PolarisOS/packages/renderer-pixi/src/index.ts` — public exports.
- `PolarisOS/packages/renderer-pixi/tests/*.test.ts` — resolver, cache, transaction, and render-hash tests.

### Assets and client integration

- `PolarisOS/scripts/build-pixelbrain-assets.ts` — deterministic fingerprint generator.
- `PolarisOS/worldpacks/shrine-demo/assets-src/*.pixelbrain.json` — lantern, brazier states, and player marker source envelopes.
- `PolarisOS/apps/client/src/generated/pixelbrainAssetRegistry.ts` — generated immutable registry.
- `PolarisOS/apps/client/public/assets/generated/**` — generated fingerprinted packet files.
- `PolarisOS/apps/client/src/main.ts` — registry and diagnostic callback wiring.
- `PolarisOS/tests/integration/PixelBrainBridgeGate.test.ts` — complete identity/fallback scenario.

### Workspace configuration

- `PolarisOS/package.json` — asset build/test script.
- `PolarisOS/package-lock.json` — workspace link.
- `PolarisOS/tsconfig.json` — `@polaris/pixelbrain-bridge` path.
- `PolarisOS/vitest.config.ts` — test alias.
- `PolarisOS/packages/renderer-pixi/package.json` — bridge dependency.
- `PolarisOS/apps/client/package.json` — bridge dependency only if generated registry types require it.

---

### Task 1: Pure Hash and Diagnostic Foundation

**Files:**
- Create: `PolarisOS/packages/pixelbrain-bridge/package.json`
- Create: `PolarisOS/packages/pixelbrain-bridge/src/contracts.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/src/hash.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/src/diagnostics.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/src/index.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/tests/hash.test.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/tests/diagnostics.test.ts`
- Modify: `PolarisOS/tsconfig.json`
- Modify: `PolarisOS/vitest.config.ts`

**Interfaces:**
- Produces: `sha256Hex(bytes)`, `canonicalJson(value)`, `computePacketContentHash(value)`, `computeRasterHash(width, height, rgba)`, `computePngRevision(bytes)`, `computeRenderHash(value)`.
- Produces: `createDiagnostic(code, severity, context): PixelBrainDiagnostic`.
- Produces constants: `MAX_PACKET_BYTES`, `MAX_CANVAS_DIMENSION`, `MAX_CELL_SIZE`, `MAX_PRIMITIVES`, `MAX_RASTER_BYTES`, `MAX_RASTER_WRITES`.

- [ ] **Step 1: Write failing hash and diagnostic tests**

```ts
it("matches the SHA-256 abc vector", () => {
  expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

it("canonicalizes key order, negative zero, and Unicode deterministically", () => {
  expect(canonicalJson({ z: -0, "😀": 2, a: 1 })).toBe('{"a":1,"z":0,"😀":2}');
});

it("hashes raw raster bytes with dimensions and a pbr1 prefix", () => {
  const a = computeRasterHash(1, 1, new Uint8Array([1, 2, 3, 4]));
  const b = computeRasterHash(1, 1, new Uint8Array([1, 2, 3, 5]));
  expect(a).toMatch(/^pbr1:[0-9a-f]{64}$/);
  expect(a).not.toBe(b);
});

it("emits checksum-valid PB-ERR-v1 diagnostics", () => {
  const diagnostic = createDiagnostic("INVALID_GRID_ALIGNMENT", "ERROR", {
    packetId: "lantern",
    path: "coordinates[0].snappedX",
    detail: "3 is not aligned to cellSize 2",
  });
  expect(diagnostic.protocol).toBe("PB-ERR-v1");
  expect(diagnostic.bytecode).toMatch(/^PB-ERR-v1-COORD-CRIT-IMGPIX-0601-/);
  expect(verifyDiagnosticChecksum(diagnostic.bytecode)).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge/tests/hash.test.ts packages/pixelbrain-bridge/tests/diagnostics.test.ts`

Expected: FAIL because `@polaris/pixelbrain-bridge` and its exports do not exist.

- [ ] **Step 3: Implement the minimal pure foundation**

Implement a standard 64-round SHA-256 over `Uint8Array`, code-point key sorting via `Array.from(key)`, the exact domain prefixes from the design, and PB-ERR-v1 with base64 UTF-8 JSON plus FNV-1a checksum. Reject unsupported canonical values rather than coercing them.

Public signatures:

```ts
export function sha256Hex(bytes: Uint8Array): string;
export function canonicalJson(value: unknown): string;
export function computePacketContentHash(value: unknown): `pb1:${string}`;
export function computeRasterHash(
  width: number,
  height: number,
  rgba: Uint8Array,
): `pbr1:${string}`;
export function computePngRevision(bytes: Uint8Array): `png1:${string}`;
export function computeRenderHash(value: unknown): `render1:${string}`;
export function createDiagnostic(
  code: PixelBrainDiagnosticCode,
  severity: PixelBrainDiagnosticSeverity,
  context: { packetId?: string; path?: string; detail: string },
): PixelBrainDiagnostic;
export function verifyDiagnosticChecksum(bytecode: string): boolean;
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge/tests/hash.test.ts packages/pixelbrain-bridge/tests/diagnostics.test.ts && npm run typecheck`

Expected: all new tests PASS; TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/packages/pixelbrain-bridge PolarisOS/tsconfig.json PolarisOS/vitest.config.ts
git commit -m "feat(polaris): add PixelBrain hash and diagnostic core"
```

---

### Task 2: Packet Validation and Canonical Normalization

**Files:**
- Create: `PolarisOS/packages/pixelbrain-bridge/src/validatePacket.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/src/normalizePacket.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/tests/validation.test.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/tests/normalization.test.ts`
- Modify: `PolarisOS/packages/pixelbrain-bridge/src/index.ts`

**Interfaces:**
- Consumes: Task 1 diagnostics, canonical hash, and limits.
- Produces: `validatePixelBrainPacket(input): PacketValidationResult`.
- Produces: `normalizePixelBrainPacket(input): PixelBrainNormalizationResult`.
- Produces: `parsePixelColor(color, alpha?): readonly [number, number, number, number]`.

- [ ] **Step 1: Write failing validation tests**

Use a shared valid fixture:

```ts
const validPacket = {
  kind: "pixelbrain.render.v1",
  id: "lantern",
  schemaVersion: 1,
  canvas: {
    width: 8,
    height: 8,
    cellSize: 2,
    transparent: true,
    background: "#00000000",
  },
  coordinates: [
    { snappedX: 0, snappedY: 0, z: 0, color: "#ff000080", alpha: 0.5 },
    { snappedX: 2, snappedY: 0, z: 0, color: "#00ff00" },
  ],
};
```

Tests must assert:

```ts
expect(normalizePixelBrainPacket(validPacket).ok).toBe(true);
expect(codeOf({ ...validPacket, kind: "pixelbrain.render.v2" }))
  .toBe("UNSUPPORTED_PACKET_VERSION");
expect(codeOf(withCell({ snappedX: 1 }))).toBe("INVALID_GRID_ALIGNMENT");
expect(codeOf(withCell({ color: "red" }))).toBe("COLOR_INVALID");
expect(codeOf({ ...validPacket, worldX: 4 })).toBe("PACKET_SCHEMA_INVALID");
expect(codeOf(withCell({ command: "take lantern" }))).toBe("PACKET_SCHEMA_INVALID");
```

Add exact tests for invalid dimensions, cell size, unsafe integer coordinates, encoded packet size, work limit, supplied hash mismatch, alpha multiplication (`0x80 × 0.5 → 64`), input-order independence, higher-z precedence, exact duplicate coalescing, and equal-z conflicting duplicate rejection.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge/tests/validation.test.ts packages/pixelbrain-bridge/tests/normalization.test.ts`

Expected: FAIL because the validation/normalization exports are absent.

- [ ] **Step 3: Implement validation and normalization**

Normalization output must have this exact visual hash payload:

```ts
const hashPayload = {
  packetVersion: "pixelbrain.render.v1",
  schemaVersion: 1,
  width,
  height,
  cellSize,
  transparent,
  background: toHexRgba(background),
  cells: cells.map(({ x, y, z, rgba }) => ({
    x,
    y,
    z,
    rgba: toHexRgba(rgba),
  })),
};
```

Sort by `y`, `x`, `z`, then RGBA. Coalesce identical writes. Reject different RGBA at the same `(x,y,z)`. Calculate clipped work before coalescing. Treat a completely outside rectangle as an error and right/bottom partial rectangles as warning-producing clips.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge/tests/validation.test.ts packages/pixelbrain-bridge/tests/normalization.test.ts && npm run typecheck`

Expected: all PASS, typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/packages/pixelbrain-bridge
git commit -m "feat(polaris): validate and normalize PixelBrain packets"
```

---

### Task 3: Deterministic Straight-RGBA Rasterization

**Files:**
- Create: `PolarisOS/packages/pixelbrain-bridge/src/rasterizePacket.ts`
- Create: `PolarisOS/packages/pixelbrain-bridge/tests/rasterize.test.ts`
- Modify: `PolarisOS/packages/pixelbrain-bridge/src/index.ts`

**Interfaces:**
- Consumes: `NormalizedPixelBrainPacket` and `computeRasterHash`.
- Produces: `rasterizeNormalizedPacket(packet): PixelBrainRaster`.
- Produces: `processPixelBrainPacket(input): PixelBrainBridgeResult`.

- [ ] **Step 1: Write failing byte-exact raster tests**

```ts
it("writes cellSize rectangles and leaves transparent pixels zeroed", () => {
  const result = processPixelBrainPacket(packet({
    width: 4,
    height: 2,
    cellSize: 2,
    coordinates: [{ snappedX: 0, snappedY: 0, color: "#ff000080" }],
  }));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect([...result.raster.rgba]).toEqual([
    255, 0, 0, 128, 255, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    255, 0, 0, 128, 255, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
});

it("higher z replaces RGBA without alpha blending", () => {
  const result = processPixelBrainPacket(packet({
    coordinates: [
      { snappedX: 0, snappedY: 0, z: 0, color: "#ff000080" },
      { snappedX: 0, snappedY: 0, z: 1, color: "#0000ff40" },
    ],
  }));
  expect(pixelAt(result, 0, 0)).toEqual([0, 0, 255, 64]);
});
```

Also assert byte-identical repeated output, equivalent reordered packet raster hashes, packet rename invariance, all edge outcomes, background initialization, and one-byte changes altering `rasterHash`.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge/tests/rasterize.test.ts`

Expected: FAIL because the rasterizer does not exist.

- [ ] **Step 3: Implement the minimal rasterizer**

Allocate only after normalization passes. Fill opaque backgrounds with one deterministic loop. Iterate canonical cells from low to high z and replace RGBA over each pre-clipped half-open rectangle. Return all normalization warnings unchanged.

- [ ] **Step 4: Run bridge suite and typecheck**

Run: `cd PolarisOS && npx vitest run packages/pixelbrain-bridge && npm run typecheck`

Expected: all bridge tests PASS; typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/packages/pixelbrain-bridge
git commit -m "feat(polaris): rasterize PixelBrain packets deterministically"
```

---

### Task 4: Fingerprinted Asset Registry and Shrine Packets

**Files:**
- Create: `PolarisOS/scripts/build-pixelbrain-assets.ts`
- Create: `PolarisOS/scripts/tests/build-pixelbrain-assets.test.ts`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/lantern.pixelbrain.json`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/brazier.pixelbrain.json`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/brazier-lit.pixelbrain.json`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/player-marker.pixelbrain.json`
- Generate: `PolarisOS/apps/client/src/generated/pixelbrainAssetRegistry.ts`
- Generate: `PolarisOS/apps/client/public/assets/generated/**`
- Modify: `PolarisOS/package.json`
- Modify: `PolarisOS/package-lock.json`

**Interfaces:**
- Consumes: `processPixelBrainPacket` and `computePngRevision`.
- Produces: `buildPixelBrainAssets({ sourceDir, publicDir, registryFile })`.
- Source envelope: `{ assetKey: string, packet: UpstreamPixelBrainRenderPacketV1 }`.

- [ ] **Step 1: Write failing generator tests**

Tests create temporary source/output directories and assert:

```ts
expect(first.registry).toEqual(second.registry);
expect(entry.pixelBrainUrl).toMatch(
  /lantern\.pb1-[0-9a-f]{64}\.pixelbrain\.json$/,
);
expect(entry.expectedPacketContentHash).toMatch(/^pb1:[0-9a-f]{64}$/);

await writeSource("second.pixelbrain.json", {
  assetKey: "entities/lantern",
  packet: validPacket("second"),
});
await expect(buildPixelBrainAssets(paths)).rejects.toThrow(/duplicate assetKey/);

await replaceSources([{
  assetKey: "entities/misaligned",
  packet: {
    ...validPacket("misaligned"),
    coordinates: [{ snappedX: 1, snappedY: 0, color: "#ffffff" }],
  },
}]);
await expect(buildPixelBrainAssets(paths)).rejects.toThrow(
  /INVALID_GRID_ALIGNMENT/,
);
```

- [ ] **Step 2: Run generator test and verify RED**

Run: `cd PolarisOS && npx vitest run scripts/tests/build-pixelbrain-assets.test.ts`

Expected: FAIL because the generator is absent.

- [ ] **Step 3: Implement generator and source packets**

The four demo packets use grid-aligned local canvases, concise limited palettes, transparent backgrounds, and no world-placement fields. The generator writes normalized packets with verified `contentHash`, fingerprinted names, a deterministic generated-file manifest, and a sorted TypeScript registry.

- [ ] **Step 4: Generate assets and verify determinism**

Run: `cd PolarisOS && npm run build:pixelbrain-assets && npx vitest run scripts/tests/build-pixelbrain-assets.test.ts && npm run build:pixelbrain-assets`

Expected: generator test PASS, including byte-for-byte comparison of two independently generated output trees; the second workspace generation exits 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/scripts PolarisOS/worldpacks/shrine-demo/assets-src PolarisOS/apps/client/src/generated PolarisOS/apps/client/public/assets/generated PolarisOS/package.json PolarisOS/package-lock.json
git commit -m "feat(polaris): add fingerprinted PixelBrain shrine assets"
```

---

### Task 5: Runtime Asset Resolver and Strict Fallbacks

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/src/PixelBrainAssetResolver.ts`
- Create: `PolarisOS/packages/renderer-pixi/tests/PixelBrainAssetResolver.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/package.json`
- Modify: `PolarisOS/packages/renderer-pixi/src/index.ts`

**Interfaces:**
- Consumes: generated/injected `PixelBrainAssetRegistry`, bridge processor, `GlyphSpec`.
- Produces: `PixelBrainAssetResolver.resolve(assetKey, fallback): Promise<AssetResolution>`.
- Produces: bounded packet/PNG stream reader.

- [ ] **Step 1: Write failing resolver tests**

Use injected fetch/decode functions to prove:

```ts
expect((await resolver.resolve("entities/lantern", fallback)).status)
  .toBe("PIXELBRAIN");
expect((await invalidPacketResolver.resolve("entities/lantern", fallback)).status)
  .toBe("PNG");
expect((await missingPngResolver.resolve("entities/lantern", fallback)).status)
  .toBe("GLYPH");
expect((await textResolver.resolve("entities/lantern", fallback)).status)
  .toBe("TEXT");
```

Also assert diagnostic propagation, packet and PNG expectation mismatch, 8/16 MiB streaming cancellation, same-origin fingerprint validation, query/path-traversal rejection, and no fetch for mutable derived paths.

- [ ] **Step 2: Run test and verify RED**

Run: `cd PolarisOS && npx vitest run packages/renderer-pixi/tests/PixelBrainAssetResolver.test.ts`

Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement resolver**

Resolve only registry entries. PixelBrain failure appends diagnostics and proceeds. PNG decoding returns renderer-neutral `{ pngBytes, width, height }`; creation and ownership of any PixiJS source stays in the texture cache/renderer layer. Glyph uses the plan-provided spec; text uses the accessible label. Text mode bypasses all fetch and decoding work.

- [ ] **Step 4: Run resolver tests and typecheck**

Run: `cd PolarisOS && npx vitest run packages/renderer-pixi/tests/PixelBrainAssetResolver.test.ts && npm run typecheck`

Expected: PASS and typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/packages/renderer-pixi PolarisOS/package-lock.json
git commit -m "feat(polaris): resolve PixelBrain assets with strict fallbacks"
```

---

### Task 6: Byte-Budgeted Texture Cache and Render Transactions

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/src/PixelBrainTextureCache.ts`
- Create: `PolarisOS/packages/renderer-pixi/src/SceneRenderCoordinator.ts`
- Create: `PolarisOS/packages/renderer-pixi/tests/PixelBrainTextureCache.test.ts`
- Create: `PolarisOS/packages/renderer-pixi/tests/SceneRenderCoordinator.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/index.ts`

**Interfaces:**
- Produces: `PixelBrainTextureCache.acquire(input): TextureLease | null`.
- Produces: `release`, `restoreContext`, `destroy`, and `stats`.
- Produces: `SceneRenderCoordinator.begin()`, `isCurrent(epoch)`, `invalidate()`, and `run(transaction)`.

- [ ] **Step 1: Write failing cache and freshness tests**

Cache tests assert texture reuse by raster hash, same packet ID/new raster creating a new texture, deterministic `usageTick`, all four budgets, zero-reference eviction, active non-eviction, texture/source destruction, and restoration from retained bytes.

Coordinator tests assert:

```ts
const slowA = coordinator.run(sceneA);
const fastB = coordinator.run(sceneB);
await fastB;
releaseA();
await slowA;
expect(commits).toEqual(["B"]);
expect(released).toContain("A");
```

Add destruction-during-resolution, partial failure, stale provisional lease release, failed build retaining the prior commit, and restoration invalidation.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd PolarisOS && npx vitest run packages/renderer-pixi/tests/PixelBrainTextureCache.test.ts packages/renderer-pixi/tests/SceneRenderCoordinator.test.ts`

Expected: FAIL because both classes are absent.

- [ ] **Step 3: Implement cache and coordinator**

Use default policy `{64, 64 MiB, 128 MiB, 64 MiB}`. Increment `usageTick` only on acquire. Sort eviction candidates by tick then key. Treat provisional leases as an all-or-release set. Coordinator state changes only inside commit.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd PolarisOS && npx vitest run packages/renderer-pixi/tests/PixelBrainTextureCache.test.ts packages/renderer-pixi/tests/SceneRenderCoordinator.test.ts && npm run typecheck`

Expected: PASS and typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add PolarisOS/packages/renderer-pixi
git commit -m "feat(polaris): bound texture resources and reject stale scenes"
```

---

### Task 7: PixiJS Renderer and Live Client Integration

**Files:**
- Modify: `PolarisOS/packages/renderer-pixi/src/PixiSceneRenderer.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/index.ts`
- Create: `PolarisOS/packages/renderer-pixi/tests/renderIdentity.test.ts`
- Modify: `PolarisOS/apps/client/src/main.ts`
- Modify: `PolarisOS/apps/client/package.json`
- Create: `PolarisOS/tests/integration/PixelBrainBridgeGate.test.ts`

**Interfaces:**
- Consumes: resolver, cache, coordinator, generated registry.
- Produces: `SceneRenderOutcome`, `currentRenderHash`, and resolved-asset ledger.
- Preserves: `renderScene(manifest)`, `applyPatch(manifest)`, fallback controls, command callback, and `destroy()`.

- [ ] **Step 1: Write failing render-identity and integration tests**

Pure integration tests load generated source packets and assert:

```ts
expect(lantern.source).toBe("PIXELBRAIN");
expect(unlit.rasterHash).not.toBe(lit.rasterHash);
expect(aliceRenderHash).toBe(bobRenderHash);
expect(reconnectedRenderHash).toBe(aliceRenderHash);
```

Renderer-factory tests assert `BufferImageSource` options:

```ts
expect(options).toMatchObject({
  format: "rgba8unorm",
  alphaMode: "no-premultiply-alpha",
  scaleMode: "nearest",
  autoGenerateMipmaps: false,
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd PolarisOS && npx vitest run packages/renderer-pixi/tests/renderIdentity.test.ts tests/integration/PixelBrainBridgeGate.test.ts`

Expected: FAIL because realized identity and live registry wiring are absent.

- [ ] **Step 3: Refactor PixiSceneRenderer transactionally**

Initialize Pixi with `antialias: false` and `roundPixels: true`. Resolve unique keys, acquire provisional leases, build a new `Container` off-stage, recheck epoch, compute `renderHash`, swap roots, then release prior leases. Use `BufferImageSource` with straight-alpha and nearest-neighbor options. Keep text/hotspot behavior unchanged. On failure retain the prior root or mount text if none exists.

- [ ] **Step 4: Wire generated registry and diagnostics**

`apps/client/src/main.ts` imports `pixelBrainAssetRegistry`, passes it to `PixiSceneRenderer`, and routes diagnostics to an in-memory capped development list without sending user or packet content to the server.

- [ ] **Step 5: Run focused and complete Polaris verification**

Run:

```bash
cd PolarisOS
npm run build:pixelbrain-assets
npx vitest run packages/pixelbrain-bridge packages/renderer-pixi tests/integration/PixelBrainBridgeGate.test.ts
npm run test
npm run typecheck
npm run build
```

Expected: all tests PASS; typecheck and Vite build exit 0.

- [ ] **Step 6: Commit**

```bash
git add PolarisOS/packages/renderer-pixi PolarisOS/apps/client PolarisOS/tests/integration/PixelBrainBridgeGate.test.ts PolarisOS/package-lock.json
git commit -m "feat(polaris): render live PixelBrain assets through PixiJS"
```

---

### Task 8: Final Contract Audit and PIR Update

**Files:**
- Create: `PolarisOS/Polaris-OS-Encyclopedia/PIRs/Polaris-PixelBrain-Bridge-PIR.md`
- Modify only if evidence requires it: `PolarisOS/README.md`

**Interfaces:**
- Consumes: final test/build evidence and approved design.
- Produces: implementation inventory, identity chain, fallback evidence, resource budgets, and known limitations.

- [ ] **Step 1: Run final clean verification**

Run:

```bash
cd PolarisOS
npm run build:pixelbrain-assets
git diff --exit-code -- apps/client/src/generated apps/client/public/assets/generated
npm run test
npm run typecheck
npm run build
```

Expected: generated assets unchanged; test, typecheck, and build all exit 0.

- [ ] **Step 2: Audit the four harness laws**

Confirm with named tests:

- Projection authority: forbidden world fields rejected.
- Complete projection identity: contract, plan, packet, raster, PNG, and render identities covered.
- Asynchronous freshness: slow-old/fast-new test.
- Resource boundedness: packet, work, retained-byte, GPU-byte, and active-scene tests.

- [ ] **Step 3: Write the PIR with exact evidence**

Document exact command results, test counts, file inventory, cache budgets, static-frame limitation, and the unchanged `SceneManifest` contract.

- [ ] **Step 4: Commit**

```bash
git add PolarisOS/Polaris-OS-Encyclopedia/PIRs/Polaris-PixelBrain-Bridge-PIR.md PolarisOS/README.md
git commit -m "docs(polaris): review PixelBrain bridge implementation"
```
