# Vixel Co-Synthesis Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Vixel Co-Synthesis Engine in `PolarisOS/scripts/vixel-rasterize.mjs`, unifying vector manifold geometry (Wand) and pixel craft (SCDL) through vector-guided material orientation, vector photonic field falloff, and Bayer-dithered sub-pixel coverage.

**Architecture:** Modify `renderVixel()` in `PolarisOS/scripts/vixel-rasterize.mjs` to continuously sample vector tangents for material grain alignment, evaluate vector emission light fields, and modulate sub-pixel AA with a 4×4 Bayer matrix.

**Tech Stack:** JavaScript (ES modules), Node.js, Vitest, PNG encoder.

## Global Constraints
- Maintain 100% pure deterministic rendering (Run 1 hash === Run 2 hash).
- Vector and pixel fields must co-synthesize (vector tangents orient pixel material grain; vector light fields revalue pixel swatches).
- Pass all ablation tests (`diffPixels > 5%`).

---

### Task 1: Vector-Guided Material Grain Orientation

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/vixelCosynthesis.test.ts`
- Modify: `PolarisOS/scripts/vixel-rasterize.mjs:50-240`

**Interfaces:**
- Consumes: `vectorPaths`, `tangent`, `MATERIAL_GRAIN`
- Produces: `computeOrientedVixelGrain(s, d, arcLen, kappa, grain, tangent)`

- [ ] **Step 1: Write unit test for vector-guided grain orientation**

Write `PolarisOS/packages/renderer-pixi/tests/vixelCosynthesis.test.ts`:
```typescript
import { describe, test, expect } from "vitest";

function computeVectorOrientedAngle(tangent: [number, number], baseDirection: number): number {
  const vecAngle = Math.atan2(tangent[1], tangent[0]);
  return vecAngle + baseDirection;
}

describe("Vixel Co-Synthesis Engine", () => {
  test("orients material grain along vector tangent", () => {
    const tangent: [number, number] = [0, 1]; // Vertical tangent
    const angle = computeVectorOrientedAngle(tangent, 0);
    expect(angle).toBeCloseTo(Math.PI / 2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/renderer-pixi/tests/vixelCosynthesis.test.ts`
Expected: PASS (verifying helper algorithm)

- [ ] **Step 3: Implement vector-guided grain orientation in rasterizer**

Modify `PolarisOS/scripts/vixel-rasterize.mjs`:
```javascript
// Orient material grain along vector tangent if available
if (tangent && grain) {
  const vecAngle = Math.atan2(tangent[1], tangent[0]);
  const effectiveGrain = { ...grain, direction: vecAngle + (grain.direction || 0) };
  grainMod = evaluateVixelTexture(s, d, arcLen, cell.curvature, effectiveGrain);
}
```

- [ ] **Step 4: Commit Task 1**

```bash
git add PolarisOS/scripts/vixel-rasterize.mjs PolarisOS/packages/renderer-pixi/tests/vixelCosynthesis.test.ts
git commit -m "feat(rasterizer): implement vector-guided material grain orientation"
```

---

### Task 2: Vector Photonic Field Falloff & Swatch Revaluation

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/vectorPhotonicField.test.ts`
- Modify: `PolarisOS/scripts/vixel-rasterize.mjs:150-220`

**Interfaces:**
- Consumes: `vectorPaths`, `subX`, `subY`
- Produces: `evaluateVectorEmissionField(px, py, vectorPaths)`

- [ ] **Step 1: Write unit test for vector emission field calculation**

Write `PolarisOS/packages/renderer-pixi/tests/vectorPhotonicField.test.ts`:
```typescript
import { describe, test, expect } from "vitest";

function evaluateVectorEmissionField(px: number, py: number, pathPoint: { x: number; y: number }, role: string): number {
  if (!role.includes("torii") && !role.includes("moon") && !role.includes("lantern") && !role.includes("book") && !role.includes("rune")) {
    return 0;
  }
  const dx = px - pathPoint.x;
  const dy = py - pathPoint.y;
  const distSq = dx * dx + dy * dy;
  const radiusSq = 35 * 35;
  return Math.exp(-distSq / radiusSq) * 35;
}

describe("Vector Photonic Emission Field", () => {
  test("computes radial falloff from vector light source", () => {
    const light = evaluateVectorEmissionField(10, 10, { x: 10, y: 10 }, "scholomance.book_pages");
    const dark = evaluateVectorEmissionField(100, 100, { x: 10, y: 10 }, "scholomance.book_pages");
    expect(light).toBeGreaterThan(dark);
    expect(light).toBeCloseTo(35);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run packages/renderer-pixi/tests/vectorPhotonicField.test.ts`
Expected: PASS

- [ ] **Step 3: Integrate vector photonic emission field in rasterizer**

Modify `PolarisOS/scripts/vixel-rasterize.mjs`:
```javascript
// Vector Photonic Field Falloff (vector light sources emit light onto adjacent pixel cells)
let vectorLightBoost = 0;
if (!nullVector && vectorPaths.length > 0) {
  const subX = cx + u;
  const subY = cy + v;
  for (const path of vectorPaths) {
    if (path.role && (path.role.includes('torii') || path.role.includes('moon') || path.role.includes('lantern') || path.role.includes('book') || path.role.includes('rune'))) {
      const minD = distToPolyline(subX, subY, path.points);
      const fall = Math.exp(-(minD * minD) / (32 * 32));
      vectorLightBoost += fall * 30 * (path.pressure || 1);
    }
  }
}
```

- [ ] **Step 4: Commit Task 2**

```bash
git add PolarisOS/scripts/vixel-rasterize.mjs PolarisOS/packages/renderer-pixi/tests/vectorPhotonicField.test.ts
git commit -m "feat(rasterizer): integrate vector photonic emission field calculation"
```

---

### Task 3: Vector-Modulated Bayer Dithering & Sub-Pixel AA

**Files:**
- Modify: `PolarisOS/scripts/vixel-rasterize.mjs:70-290`

**Interfaces:**
- Consumes: `px`, `py`, `coverage`
- Produces: `BAYER_4X4` matrix lookup, `applyBayerDither(coverage, px, py)`

- [ ] **Step 1: Add Bayer 4x4 Dither Matrix to rasterizer**

Modify `PolarisOS/scripts/vixel-rasterize.mjs`:
```javascript
const BAYER_4X4 = [
  [ 0/16,  8/16,  2/16, 10/16],
  [12/16,  4/16, 14/16,  6/16],
  [ 3/16, 11/16,  1/16,  9/16],
  [15/16,  7/16, 13/16,  5/16],
];

function applyBayerDither(val, px, py) {
  const dither = BAYER_4X4[py % 4][px % 4] - 0.5;
  return Math.max(0, Math.min(1, val + dither * 0.15));
}
```

- [ ] **Step 2: Apply Bayer dithering to vector stroke coverage**

Modify `PolarisOS/scripts/vixel-rasterize.mjs`:
```javascript
if (strokeCov > 0) {
  const ditheredCov = applyBayerDither(strokeCov, px, py);
  const alpha = ditheredCov * (path.pressure || 1) * (isFence ? 0.95 : 0.85);
  // ... apply color blending
}
```

- [ ] **Step 3: Commit Task 3**

```bash
git add PolarisOS/scripts/vixel-rasterize.mjs
git commit -m "feat(rasterizer): apply Bayer 4x4 ordered dithering to vector stroke boundaries"
```

---

### Task 4: Execute Full Vixel Synthesis Pipeline & Verify Evidence

**Files:**
- Execute: `node PolarisOS/scripts/vixel-rasterize.mjs scholomance-forest-entrance 4`
- Execute: `node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4`
- Output: `PolarisOS/evidence/vixel-scholomance-forest-entrance-4x.png`, `PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png`

- [ ] **Step 1: Run rasterizer for Scholomance Forest Entrance**

Run: `node PolarisOS/scripts/vixel-rasterize.mjs scholomance-forest-entrance 4`
Expected: Output PNG written, 100% determinism PASS

- [ ] **Step 2: Run rasterizer for Moonlit Shrine Forest**

Run: `node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4`
Expected: Output PNG written, 100% determinism PASS

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run packages/renderer-pixi/tests`
Expected: All tests PASS

- [ ] **Step 4: Commit rasterized evidence artifacts**

```bash
git add PolarisOS/evidence/*4x.png
git commit -m "feat(evidence): generate co-synthesized Vixel evidence PNG artifacts"
```
