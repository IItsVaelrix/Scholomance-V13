# Design Spec — Elemental Crystal Stave Blade Asset (`PB-GEOMETRY-CONSTRUCTION-v1`)

**Date:** 2026-07-29  
**Status:** Approved Design  
**Target Asset:** `PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json`  
**Pipeline Contract:** `PB-GEOMETRY-CONSTRUCTION-v1`  
**Canvas:** 32 × 64 pixels  

---

## 1. Overview & Purpose

This design specifies the creation of a new high-detail weapon asset — the **Elemental Crystal Stave Blade** — leveraging the `PB-GEOMETRY-CONSTRUCTION-v1` solver pipeline. Instead of hand-placing pixel waypoints ("finger painting"), the asset is defined as a set of human-curated geometric primitives, proportion laws, and topological constraints. The solver analytically derives the exact coordinate contours, normals, tangents, curvature, and arc length for the rasterization and VRI layers.

---

## 2. Target Files & Architecture Map

* **Asset Spec:** `PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json` (New Wand Asset Packet)
* **Construction Unit Test:** `codex/core/pixelbrain/construction/__tests__/crystal-stave-blade.test.js` (New Test Suite)
* **Solver Pipeline:** `codex/core/pixelbrain/construction/solver-orchestrator.js` (Existing Pure Function Solver)
* **Formula Evaluator:** `codex/core/pixelbrain/formula-to-coordinates.js` (Evaluates `construction_request`)

---

## 3. Geometric Construction Definition (`PB-GEOMETRY-CONSTRUCTION-v1`)

### 3.1 Anchors (Symmetry Axis $x = 16$)
* `axis`: `[16, 0]`
* `bladeTip`: `[16, 4]`
* `bladeBase`: `[16, 42]`
* `guardCenter`: `[16, 46]`
* `gripEnd`: `[16, 56]`
* `pommelBottom`: `[16, 61]`

### 3.2 Construction Parts

1. **`blade_outer` (`rounded-polygon`):**
   * Faceted outer diamond blade contour.
   * Points: `[16, 4]`, `[24, 28]`, `[21, 42]`, `[16, 42]`, `[11, 42]`, `[8, 28]`
   * Corner radius: `0.5`

2. **`blade_spine` (`tapered-ribbon`):**
   * Central energy core.
   * Start: `[16, 8]`, End: `[16, 42]`
   * Start width: `0.8`, End width: `2.0`

3. **`guard_cluster` (`radial-shard-cluster`):**
   * Radiating crystal gem crossguard.
   * Center: `[16, 46]`
   * Count: `6`, Inner radius: `2.5`, Outer radius: `7.5`

4. **`grip` (`tapered-ribbon`):**
   * Handle connecting guard to pommel.
   * Start: `[16, 46]`, End: `[16, 56]`
   * Start width: `2.2`, End width: `1.8`

5. **`pommel` (`rounded-polygon`):**
   * Faceted pommel stone.
   * Points: `[16, 56]`, `[19, 58.5]`, `[16, 61]`, `[13, 58.5]`
   * Corner radius: `0.4`

---

## 4. Constraints & Validation Laws

### 4.1 Constraints
* **`coaxial`:** `['blade_outer', 'blade_spine', 'guard_cluster', 'grip', 'pommel']` sharing $x = 16$.
* **`mirror-symmetry`:** Axis `[16, 0]`.
* **`coincident`:** `blade_spine.end` to `blade_outer.bottomCenter`, `guard_cluster.center` to `grip.start`, `grip.end` to `pommel.topCenter`.
* **`contained`:** `blade_spine` contained within `blade_outer`.
* **`ratio`:** Blade height vs. Guard + Grip height matches `golden` ratio ($\approx 1.618$).

### 4.2 Validation Laws
* `closedParts`: `['blade_outer', 'guard_cluster', 'pommel']`
* `forbidSelfIntersections`: `true`
* `consistentWinding`: `'clockwise'`
* `minimumCurvatureRadius`: `0.3`
* `requireConnectedAssembly`: `true`

---

## 5. Verification & Determinism Plan

* **Determinism:** 100-iteration replay test verifying identical byte output across all solves.
* **Refusal Check:** Validate that unsatisfiable constraints yield structured refusal (`refused: true`).
* **Formula Integration:** Verify `evaluateFormula` converts `construction_request` to downstream coordinate format without regression.
