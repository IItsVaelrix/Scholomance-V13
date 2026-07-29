# Crystal Stave Blade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and verify the `crystal-stave-blade` asset using the `PB-GEOMETRY-CONSTRUCTION-v1` solver pipeline.

**Architecture:** Define the asset as a frozen geometric construction packet containing named anchors, 5 domain-specific primitives (`rounded-polygon`, `tapered-ribbon`, `radial-shard-cluster`), topological constraints (`coaxial`, `mirror-symmetry`, `coincident`, `contained`, `ratio`), and validation laws. Validate construction solving, 100-iteration determinism replay, and Wand formula evaluation.

**Tech Stack:** Node.js, Vitest, JavaScript (ES modules)

## Global Constraints

- **Contract:** `PB-GEOMETRY-CONSTRUCTION-v1`
- **Canvas Size:** 32 × 64 pixels
- **Solver Version:** 1.0.0
- **Determinism:** Pure functions, 100-iteration byte-for-byte identical output guarantee.

---

### Task 1: Unit Test Suite for Crystal Stave Blade Construction

**Files:**
- Create: `codex/core/pixelbrain/construction/__tests__/crystal-stave-blade.test.js`

**Interfaces:**
- Consumes: `createConstruction`, `solve` from `codex/core/pixelbrain/construction/index.js`
- Produces: Test suite verifying `PB-GEOMETRY-CONSTRUCTION-v1` packet creation, validation report passing, and 100-iteration replay determinism.

- [ ] **Step 1: Write the test file**

```javascript
import { describe, it, expect } from 'vitest';
import { createConstruction, solve } from '../index.js';

export const crystalStaveBladeSpec = {
  id: 'crystal-stave-blade',
  canvas: { width: 32, height: 64 },
  anchors: {
    axis:       [16, 0],
    bladeTip:   [16, 4],
    bladeBase:  [16, 42],
    guardCenter:[16, 46],
    gripEnd:    [16, 56],
    pommelBottom:[16, 61],
  },
  parts: [
    {
      id: 'blade_outer',
      primitive: {
        kind: 'rounded-polygon',
        points: [
          [16, 4],
          [24, 28],
          [21, 42],
          [16, 42],
          [11, 42],
          [8, 28],
        ],
        cornerRadius: 0.5,
      },
    },
    {
      id: 'blade_spine',
      primitive: {
        kind: 'tapered-ribbon',
        start: [16, 8],
        end: [16, 42],
        startWidth: 0.8,
        endWidth: 2.0,
      },
    },
    {
      id: 'guard_cluster',
      primitive: {
        kind: 'radial-shard-cluster',
        center: [16, 46],
        count: 6,
        innerRadius: 2.5,
        outerRadius: 7.5,
      },
    },
    {
      id: 'grip',
      primitive: {
        kind: 'tapered-ribbon',
        start: [16, 46],
        end: [16, 56],
        startWidth: 2.2,
        endWidth: 1.8,
      },
    },
    {
      id: 'pommel',
      primitive: {
        kind: 'rounded-polygon',
        points: [
          [16, 56],
          [19, 58.5],
          [16, 61],
          [13, 58.5],
        ],
        cornerRadius: 0.4,
      },
    },
  ],
  constraints: [
    { kind: 'coaxial', parts: ['blade_outer', 'blade_spine', 'guard_cluster', 'grip', 'pommel'] },
    { kind: 'mirror-symmetry', axis: { anchor: 'axis' } },
  ],
  validation: {
    closedParts: ['blade_outer', 'guard_cluster', 'pommel'],
    forbidSelfIntersections: true,
    consistentWinding: 'clockwise',
    minimumCurvatureRadius: 0.3,
    requireConnectedAssembly: true,
  },
};

describe('crystal-stave-blade construction', () => {
  it('creates a frozen PB-GEOMETRY-CONSTRUCTION-v1 packet with checksum', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    expect(packet.contract).toBe('PB-GEOMETRY-CONSTRUCTION-v1');
    expect(packet.checksum).toMatch(/^scd64:[A-F0-9]{64}$/);
    expect(Object.isFrozen(packet)).toBe(true);
  });

  it('solves successfully with validationReport.passed === true', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    const result = solve(packet);
    expect(result.refused).toBe(false);
    expect(result.validationReport.passed).toBe(true);
    expect(result.parts.blade_outer).toBeDefined();
    expect(result.parts.guard_cluster).toBeDefined();
    expect(result.parts.grip).toBeDefined();
    expect(result.parts.pommel).toBeDefined();
  });

  it('passes 100-iteration determinism replay test', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    const firstSolve = JSON.stringify(solve(packet));
    for (let i = 0; i < 99; i++) {
      const currentSolve = JSON.stringify(solve(packet));
      expect(currentSolve).toBe(firstSolve);
    }
  });
});
```

- [ ] **Step 2: Run test to verify execution**

Run: `npx vitest run codex/core/pixelbrain/construction/__tests__/crystal-stave-blade.test.js`
Expected: PASS

- [ ] **Step 3: Commit unit test suite**

```bash
git add codex/core/pixelbrain/construction/__tests__/crystal-stave-blade.test.js
git commit -m "test: add crystal-stave-blade construction unit test"
```

---

### Task 2: Create Wand Asset File `crystal-stave-blade.wand.json`

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json`

**Interfaces:**
- Consumes: Construction spec from Task 1
- Produces: Complete Wand JSON asset file for consumption by engine and renderers.

- [ ] **Step 1: Write `crystal-stave-blade.wand.json`**

```json
{
  "asset": "crystal-stave-blade",
  "canvas": { "width": 32, "height": 64 },
  "description": "Elemental Crystal Stave Blade constructed via PB-GEOMETRY-CONSTRUCTION-v1 pipeline.",
  "formulas": [
    {
      "role": "crystal-stave-blade.construction",
      "type": "construction_request",
      "description": "Deterministic geometric construction of crystal stave blade.",
      "formula": {
        "coordinateFormula": {
          "type": "construction_request",
          "constructionId": "crystal-stave-blade",
          "anchors": {
            "axis": [16, 0],
            "bladeTip": [16, 4],
            "bladeBase": [16, 42],
            "guardCenter": [16, 46],
            "gripEnd": [16, 56],
            "pommelBottom": [16, 61]
          },
          "parts": [
            {
              "id": "blade_outer",
              "primitive": {
                "kind": "rounded-polygon",
                "points": [
                  [16, 4],
                  [24, 28],
                  [21, 42],
                  [16, 42],
                  [11, 42],
                  [8, 28]
                ],
                "cornerRadius": 0.5
              }
            },
            {
              "id": "blade_spine",
              "primitive": {
                "kind": "tapered-ribbon",
                "start": [16, 8],
                "end": [16, 42],
                "startWidth": 0.8,
                "endWidth": 2.0
              }
            },
            {
              "id": "guard_cluster",
              "primitive": {
                "kind": "radial-shard-cluster",
                "center": [16, 46],
                "count": 6,
                "innerRadius": 2.5,
                "outerRadius": 7.5
              }
            },
            {
              "id": "grip",
              "primitive": {
                "kind": "tapered-ribbon",
                "start": [16, 46],
                "end": [16, 56],
                "startWidth": 2.2,
                "endWidth": 1.8
              }
            },
            {
              "id": "pommel",
              "primitive": {
                "kind": "rounded-polygon",
                "points": [
                  [16, 56],
                  [19, 58.5],
                  [16, 61],
                  [13, 58.5]
                ],
                "cornerRadius": 0.4
              }
            }
          ],
          "constraints": [
            { "kind": "coaxial", "parts": ["blade_outer", "blade_spine", "guard_cluster", "grip", "pommel"] },
            { "kind": "mirror-symmetry", "axis": { "anchor": "axis" } }
          ],
          "validation": {
            "closedParts": ["blade_outer", "guard_cluster", "pommel"],
            "forbidSelfIntersections": true,
            "consistentWinding": "clockwise",
            "minimumCurvatureRadius": 0.3,
            "requireConnectedAssembly": true
          }
        }
      },
      "pressure": 0.95
    }
  ]
}
```

- [ ] **Step 2: Commit asset file**

```bash
git add PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json
git commit -m "feat(wand): add crystal-stave-blade wand asset file"
```

---

### Task 3: Integration Verification with Wand Formula Evaluator

**Files:**
- Create: `codex/core/pixelbrain/__tests__/crystal-stave-blade-integration.test.js`

**Interfaces:**
- Consumes: `evaluateFormula` from `codex/core/pixelbrain/formula-to-coordinates.js` and `crystal-stave-blade.wand.json`
- Produces: Verified integration test confirming coordinate output generation.

- [ ] **Step 1: Write integration test**

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFormula } from '../formula-to-coordinates.js';

describe('crystal-stave-blade wand formula integration', () => {
  it('evaluates construction_request formula from JSON asset into valid coordinates', () => {
    const wandPath = path.resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json');
    const wandAsset = JSON.parse(fs.readFileSync(wandPath, 'utf8'));
    
    expect(wandAsset.formulas.length).toBeGreaterThan(0);
    const formulaEntry = wandAsset.formulas[0];
    
    const coords = evaluateFormula(formulaEntry.formula.coordinateFormula, wandAsset.canvas);
    expect(coords.length).toBeGreaterThan(0);
    
    // Check key point attributes emitted by construction_request
    const firstCoord = coords[0];
    expect(firstCoord.x).toBeDefined();
    expect(firstCoord.y).toBeDefined();
    expect(firstCoord.source).toBe('construction');
    expect(firstCoord.validationPassed).toBe(true);
    expect(firstCoord.tangent).toBeDefined();
    expect(firstCoord.normal).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run codex/core/pixelbrain/__tests__/crystal-stave-blade-integration.test.js`
Expected: PASS

- [ ] **Step 3: Commit integration test**

```bash
git add codex/core/pixelbrain/__tests__/crystal-stave-blade-integration.test.js
git commit -m "test: verify crystal-stave-blade wand formula integration"
```
