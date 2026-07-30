# Scene Quality Pillars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five scene quality pillars (Bounded Fusion, Scene Lighting Field, Authored Bark Craft, Scene Feel Priors, and Quality Mode Lock) across PolarisOS scene compilation and presentation packages.

**Architecture:** Extend `@polaris/scene-compiler` to output semantic role masks and depth layer metadata; enhance `@polaris/renderer-pixi` (`scenePlan.ts`, `atmospherePlan.ts`, `AtmosphereRenderer.ts`, `PixiSceneRenderer.ts`) to calculate global light fields, render cylindrical bark art-genes, apply depth-band priors, and validate render quality modes deterministically.

**Tech Stack:** TypeScript, Node.js (vitest/node test runner), PixiJS v8 adapter, Playwright (`art-verify.mjs`).

## Global Constraints
- Maintain 100% pure node testability for plan builders (`scenePlan.ts`, `atmospherePlan.ts`).
- Deterministic FNV-1a hashing for all plans and contract hashes (no `Math.random`).
- Zero unclustered mid-density fill blobs in output scenes.

---

### Task 1: Bounded Fusion Masks

**Files:**
- Create: `PolarisOS/packages/scene-compiler/tests/boundedFusion.test.ts`
- Modify: `PolarisOS/packages/scene-compiler/src/SceneCompiler.ts:30-180`
- Modify: `PolarisOS/packages/renderer-pixi/src/scenePlan.ts:50-220`

**Interfaces:**
- Consumes: `SceneLayer`, `SceneManifest` from `@polaris/contracts`
- Produces: `SemanticRole` enum, `roleMask` property on `PlanSprite`, `CanAttach(roleA, roleB)` function

- [ ] **Step 1: Write the failing test for Semantic Role Masking**

Write `PolarisOS/packages/scene-compiler/tests/boundedFusion.test.ts`:
```typescript
import { describe, test, expect } from "vitest";
import { canAttachRoles, SemanticRole } from "../src/SceneCompiler.js";

describe("Bounded Fusion Masks", () => {
  test("prevents sky vectors from attaching to canopy contours", () => {
    const skyRole = SemanticRole.SKY;
    const canopyRole = SemanticRole.CANOPY;
    expect(canAttachRoles(skyRole, canopyRole)).toBe(false);
  });

  test("allows trunk to attach to ground", () => {
    const trunkRole = SemanticRole.TRUNK;
    const groundRole = SemanticRole.GROUND;
    expect(canAttachRoles(trunkRole, groundRole)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/scene-compiler/tests/boundedFusion.test.ts`
Expected: FAIL ("canAttachRoles not found / module not found")

- [ ] **Step 3: Implement SemanticRole and canAttachRoles**

Modify `PolarisOS/packages/scene-compiler/src/SceneCompiler.ts`:
```typescript
export enum SemanticRole {
  SKY = 0x01,
  CANOPY = 0x02,
  TRUNK = 0x04,
  GROUND = 0x08,
  PROP = 0x10,
}

const ALLOWED_ATTACHMENTS: Record<SemanticRole, number> = {
  [SemanticRole.SKY]: SemanticRole.SKY,
  [SemanticRole.CANOPY]: SemanticRole.CANOPY | SemanticRole.TRUNK,
  [SemanticRole.TRUNK]: SemanticRole.TRUNK | SemanticRole.GROUND | SemanticRole.CANOPY,
  [SemanticRole.GROUND]: SemanticRole.GROUND | SemanticRole.TRUNK | SemanticRole.PROP,
  [SemanticRole.PROP]: SemanticRole.PROP | SemanticRole.GROUND,
};

export function canAttachRoles(roleA: SemanticRole, roleB: SemanticRole): boolean {
  return (ALLOWED_ATTACHMENTS[roleA] & roleB) !== 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/scene-compiler/tests/boundedFusion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scene-compiler/src/SceneCompiler.ts packages/scene-compiler/tests/boundedFusion.test.ts
git commit -m "feat(compiler): add SemanticRole and canAttachRoles for bounded fusion"
```

---

### Task 2: Authored Bark Craft Art-Genes

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/barkCraft.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/scenePlan.ts:110-180`

**Interfaces:**
- Consumes: `GlyphSpec`, `PlanSprite`
- Produces: `generateCylindricalBarkSteps(u, lightNormal)`, `generateBarkCrevices(seed, height)`

- [ ] **Step 1: Write failing test for Bark Craft Shading**

Write `PolarisOS/packages/renderer-pixi/tests/barkCraft.test.ts`:
```typescript
import { describe, test, expect } from "vitest";
import { generateCylindricalBarkSteps } from "../src/scenePlan.js";

describe("Authored Bark Craft", () => {
  test("computes discrete cylindrical value steps across u [-1, 1]", () => {
    const centerStep = generateCylindricalBarkSteps(0.0, 1.0);
    const edgeStep = generateCylindricalBarkSteps(0.95, 1.0);
    expect(centerStep).toBeGreaterThan(edgeStep);
    expect([0, 1, 2, 3]).toContain(centerStep);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/renderer-pixi/tests/barkCraft.test.ts`
Expected: FAIL ("generateCylindricalBarkSteps not exported")

- [ ] **Step 3: Implement cylindrical bark step shading**

Modify `PolarisOS/packages/renderer-pixi/src/scenePlan.ts`:
```typescript
export function generateCylindricalBarkSteps(u: number, lightDot: number): number {
  const clampedU = Math.max(-1, Math.min(1, u));
  const normalX = Math.sqrt(1 - clampedU * clampedU);
  const intensity = normalX * lightDot;
  return Math.min(3, Math.floor(intensity * 4));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/renderer-pixi/tests/barkCraft.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer-pixi/src/scenePlan.ts packages/renderer-pixi/tests/barkCraft.test.ts
git commit -m "feat(renderer): add cylindrical bark value-step generator"
```

---

### Task 3: Scene Lighting Field Calculation

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/lightingField.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/atmospherePlan.ts:350-420`

**Interfaces:**
- Consumes: `SceneRenderPlan`, `GlowField`
- Produces: `evaluateSceneLightingField(x, y, z, lightSource)`

- [ ] **Step 1: Write failing test for global light intensity calculation**

Write `PolarisOS/packages/renderer-pixi/tests/lightingField.test.ts`:
```typescript
import { describe, test, expect } from "vitest";
import { evaluateSceneLightingField } from "../src/atmospherePlan.js";

describe("Scene Lighting Field", () => {
  test("computes radial falloff revaluation value", () => {
    const lightSource = { x: 400, y: 100, z: 0, intensity: 1.0 };
    const nearValue = evaluateSceneLightingField(400, 150, 0, lightSource);
    const farValue = evaluateSceneLightingField(400, 400, 0, lightSource);
    expect(nearValue).toBeGreaterThan(farValue);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/renderer-pixi/tests/lightingField.test.ts`
Expected: FAIL ("evaluateSceneLightingField not exported")

- [ ] **Step 3: Implement evaluateSceneLightingField**

Modify `PolarisOS/packages/renderer-pixi/src/atmospherePlan.ts`:
```typescript
export interface LightSource {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export function evaluateSceneLightingField(
  x: number,
  y: number,
  z: number,
  source: LightSource,
): number {
  const dx = x - source.x;
  const dy = y - source.y;
  const dz = z - source.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const r0Sq = 120 * 120;
  const falloff = source.intensity / Math.max(1, distSq / r0Sq);
  const atmosphericHaze = Math.exp(-0.001 * z);
  return Math.min(1.0, falloff * atmosphericHaze);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/renderer-pixi/tests/lightingField.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer-pixi/src/atmospherePlan.ts packages/renderer-pixi/tests/lightingField.test.ts
git commit -m "feat(atmosphere): implement scene lighting field falloff calculation"
```

---

### Task 4: Scene Feel Priors & Depth Bands

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/sceneFeelPriors.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/scenePlan.ts:190-270`

**Interfaces:**
- Consumes: `PlanSprite`, `zIndex`
- Produces: `assignDepthBand(zIndex)`, `DepthBand` enum (`BACKGROUND`, `FOCAL`, `FOREGROUND`)

- [ ] **Step 1: Write failing test for Depth Band assignment**

Write `PolarisOS/packages/renderer-pixi/tests/sceneFeelPriors.test.ts`:
```typescript
import { describe, test, expect } from "vitest";
import { assignDepthBand, DepthBand } from "../src/scenePlan.js";

describe("Scene Feel Priors", () => {
  test("maps zIndex to depth bands correctly", () => {
    expect(assignDepthBand(2)).toBe(DepthBand.BACKGROUND);
    expect(assignDepthBand(10)).toBe(DepthBand.FOCAL);
    expect(assignDepthBand(25)).toBe(DepthBand.FOREGROUND);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/renderer-pixi/tests/sceneFeelPriors.test.ts`
Expected: FAIL ("assignDepthBand not exported")

- [ ] **Step 3: Implement assignDepthBand**

Modify `PolarisOS/packages/renderer-pixi/src/scenePlan.ts`:
```typescript
export enum DepthBand {
  BACKGROUND = "background",
  FOCAL = "focal",
  FOREGROUND = "foreground",
}

export function assignDepthBand(zIndex: number): DepthBand {
  if (zIndex < 5) return DepthBand.BACKGROUND;
  if (zIndex <= 20) return DepthBand.FOCAL;
  return DepthBand.FOREGROUND;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/renderer-pixi/tests/sceneFeelPriors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer-pixi/src/scenePlan.ts packages/renderer-pixi/tests/sceneFeelPriors.test.ts
git commit -m "feat(renderer): add DepthBand classification and Scene Feel priors"
```

---

### Task 5: Quality Mode Lock Enforcement

**Files:**
- Create: `PolarisOS/packages/renderer-pixi/tests/qualityModeLock.test.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/PixiSceneRenderer.ts:350-450`

**Interfaces:**
- Consumes: `SceneRenderPlan`
- Produces: `validateRenderQualityMode(plan)`, `RenderQualityMode` enum

- [ ] **Step 1: Write failing test for Quality Mode Validation**

Write `PolarisOS/packages/renderer-pixi/tests/qualityModeLock.test.ts`:
```typescript
import { describe, test, expect } from "vitest";
import { validateRenderQualityMode, RenderQualityMode } from "../src/PixiSceneRenderer.js";

describe("Quality Mode Lock", () => {
  test("approves MODE_DENSE_PIXEL_CRAFT and MODE_SPARSE_ICONIC", () => {
    expect(validateRenderQualityMode(RenderQualityMode.DENSE_PIXEL_CRAFT)).toBe(true);
    expect(validateRenderQualityMode(RenderQualityMode.SPARSE_ICONIC)).toBe(true);
  });

  test("rejects invalid mid-fi blob mode", () => {
    expect(validateRenderQualityMode("MID_FI_BLOB" as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/renderer-pixi/tests/qualityModeLock.test.ts`
Expected: FAIL ("validateRenderQualityMode not exported")

- [ ] **Step 3: Implement validateRenderQualityMode**

Modify `PolarisOS/packages/renderer-pixi/src/PixiSceneRenderer.ts`:
```typescript
export enum RenderQualityMode {
  DENSE_PIXEL_CRAFT = "MODE_DENSE_PIXEL_CRAFT",
  SPARSE_ICONIC = "MODE_SPARSE_ICONIC",
}

export function validateRenderQualityMode(mode: string): boolean {
  return (
    mode === RenderQualityMode.DENSE_PIXEL_CRAFT ||
    mode === RenderQualityMode.SPARSE_ICONIC
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/renderer-pixi/tests/qualityModeLock.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/renderer-pixi/src/PixiSceneRenderer.ts packages/renderer-pixi/tests/qualityModeLock.test.ts
git commit -m "feat(renderer): enforce strict quality mode lock validation"
```
