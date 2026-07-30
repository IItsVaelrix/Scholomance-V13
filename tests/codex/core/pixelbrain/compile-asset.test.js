/**
 * Unified Asset Pipeline — compileAsset() tests.
 *
 * Proves the four islands are connected:
 *   1. Construction solver → coordinates → SCDL packet
 *   2. SCDL compiler → packet (with gene projection)
 *   3. VRI compiler → scene
 *   4. VRI renderer → RGBA pixels
 *
 * Also proves:
 *   - skipVRI / skipRender short-circuits
 *   - Construction failure → structured error, no partial output
 *   - SCDL failure → structured error
 *   - Determinism: same inputs → same checksums
 *   - Gene projection flows through the unified path
 */

import { describe, it, expect } from 'vitest';
import { compileAsset } from '../../../../codex/core/pixelbrain/compile-asset.js';
import { scanlineFill, ribbonFill, solvedPartToCoords, constructionToCoords } from '../../../../codex/core/pixelbrain/construction-to-coords.js';
import { createConstruction } from '../../../../codex/core/pixelbrain/construction/construction-schema.js';

// ── Minimal SCDL source (matches actual grammar) ────────────────────────────
const MINI_SCDL = `
asset test_square canvas 16x16

palette {
  base = #FF0000
}

part body {
  rect 4 4 8 8 base
}
`;

// ── Minimal construction spec (matches brazierSpec format) ──────────────────
function makeConstruction() {
  return {
    id: 'test-ellipse',
    canvas: { width: 32, height: 32 },
    anchors: {
      center: [16, 16],
    },
    parts: [
      {
        id: 'rim',
        primitive: {
          kind: 'ellipse',
          center: { anchor: 'center' },
          radiusX: 10,
          radiusY: 6,
        },
      },
    ],
    constraints: [],
    validation: {
      closedParts: ['rim'],
      forbidSelfIntersections: true,
      consistentWinding: 'counterclockwise',
      minimumCurvatureRadius: 0.1,
      requireConnectedAssembly: false,
    },
  };
}

// ── scanlineFill ────────────────────────────────────────────────────────────
describe('scanlineFill', () => {
  it('fills a simple square contour', () => {
    const square = [[2, 2], [6, 2], [6, 6], [2, 6], [2, 2]];
    const filled = scanlineFill(square, 10, 10);
    expect(filled.has('3,3')).toBe(true);
    expect(filled.has('4,4')).toBe(true);
    expect(filled.has('5,5')).toBe(true);
    expect(filled.has('0,0')).toBe(false);
    expect(filled.has('9,9')).toBe(false);
  });

  it('returns empty set for degenerate contour', () => {
    expect(scanlineFill([], 10, 10).size).toBe(0);
    expect(scanlineFill([[1, 1]], 10, 10).size).toBe(0);
    expect(scanlineFill(null, 10, 10).size).toBe(0);
  });

  it('clips to canvas bounds', () => {
    const big = [[-5, -5], [20, -5], [20, 20], [-5, 20], [-5, -5]];
    const filled = scanlineFill(big, 10, 10);
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(10);
    }
  });
});

// ── ribbonFill ──────────────────────────────────────────────────────────────
describe('ribbonFill', () => {
  it('fills between two banks', () => {
    const left = [[2, 2], [2, 8]];
    const right = [[6, 2], [6, 8]];
    const filled = ribbonFill(left, right, 10, 10);
    expect(filled.has('3,4')).toBe(true);
    expect(filled.has('4,5')).toBe(true);
    expect(filled.has('0,0')).toBe(false);
  });

  it('returns empty for missing banks', () => {
    expect(ribbonFill(null, [[1, 1]], 10, 10).size).toBe(0);
    expect(ribbonFill([[1, 1]], null, 10, 10).size).toBe(0);
  });
});

// ── solvedPartToCoords ──────────────────────────────────────────────────────
describe('solvedPartToCoords', () => {
  it('rasterizes a closed contour part', () => {
    const part = {
      id: 'test',
      primitiveKind: 'ellipse',
      closedContour: [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
    };
    const coords = solvedPartToCoords(part, {
      color: '#FF0000',
      canvasW: 16,
      canvasH: 16,
    });
    expect(coords.length).toBeGreaterThan(0);
    expect(coords[0].color).toBe('#FF0000');
    expect(coords[0]._construction.partId).toBe('test');
    const keys = coords.map(c => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rasterizes a ribbon part', () => {
    const part = {
      id: 'stem',
      primitiveKind: 'tapered-ribbon',
      leftBank: [[4, 2], [4, 10]],
      rightBank: [[8, 2], [8, 10]],
    };
    const coords = solvedPartToCoords(part, {
      color: '#00FF00',
      material: 'iron',
      canvasW: 16,
      canvasH: 16,
    });
    expect(coords.length).toBeGreaterThan(0);
    expect(coords[0].material).toBe('iron');
  });

  it('falls back to spine stroke', () => {
    const part = {
      id: 'line',
      primitiveKind: 'bezier-chain',
      spine: [[1, 1], [5, 5], [10, 10]],
    };
    const coords = solvedPartToCoords(part, {
      color: '#0000FF',
      canvasW: 16,
      canvasH: 16,
    });
    expect(coords.length).toBe(3);
  });

  it('falls back to named points', () => {
    const part = {
      id: 'dots',
      namedPoints: { a: [3, 3], b: [7, 7] },
    };
    const coords = solvedPartToCoords(part, {
      color: '#FFFFFF',
      canvasW: 16,
      canvasH: 16,
    });
    expect(coords.length).toBe(2);
  });
});

// ── constructionToCoords ────────────────────────────────────────────────────
describe('constructionToCoords', () => {
  it('converts a full solver result', () => {
    const solverResult = {
      parts: {
        rim: {
          id: 'rim',
          primitiveKind: 'ellipse',
          closedContour: [[4, 4], [12, 4], [12, 12], [4, 12], [4, 4]],
          color: '#4A6A8A',
        },
      },
    };
    const coords = constructionToCoords(solverResult, {
      partStyles: { rim: { color: '#FF0000', material: 'steel' } },
      defaultColor: '#808080',
      canvasW: 16,
      canvasH: 16,
    });
    expect(coords.length).toBeGreaterThan(0);
    expect(coords[0].color).toBe('#FF0000');
    expect(coords[0].material).toBe('steel');
  });
});

// ── compileAsset: SCDL only ─────────────────────────────────────────────────
describe('compileAsset — SCDL only', () => {
  it('compiles SCDL to packet + VRI + RGBA', () => {
    const result = compileAsset({ scdl: MINI_SCDL, scale: 2 });
    expect(result.ok).toBe(true);
    expect(result.packet).toBeTruthy();
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(result.vriScene).toBeTruthy();
    expect(result.vriScene.checksum).toBeTruthy();
    expect(result.rgba).toBeTruthy();
    expect(result.rgba.width).toBe(32); // 16 * 2
    expect(result.rgba.height).toBe(32);
    expect(result.rgba.data.length).toBe(32 * 32 * 4);
    expect(result.errors).toHaveLength(0);
  });

  it('skipVRI stops after SCDL', () => {
    const result = compileAsset({ scdl: MINI_SCDL, skipVRI: true });
    expect(result.ok).toBe(true);
    expect(result.packet).toBeTruthy();
    expect(result.vriScene).toBeNull();
    expect(result.rgba).toBeNull();
  });

  it('skipRender stops after VRI', () => {
    const result = compileAsset({ scdl: MINI_SCDL, skipRender: true });
    expect(result.ok).toBe(true);
    expect(result.packet).toBeTruthy();
    expect(result.vriScene).toBeTruthy();
    expect(result.rgba).toBeNull();
  });

  it('rejects missing SCDL', () => {
    const result = compileAsset({});
    expect(result.ok).toBe(false);
    expect(result.errors[0].stage).toBe('input');
  });

  it('reports SCDL compilation errors', () => {
    const result = compileAsset({ scdl: 'this is not valid scdl' });
    expect(result.ok).toBe(false);
    expect(result.errors[0].stage).toBe('scdl');
  });
});

// ── compileAsset: Construction + SCDL ───────────────────────────────────────
describe('compileAsset — Construction bridge', () => {
  it('solves construction and injects coords into packet', () => {
    const spec = makeConstruction();
    const construction = createConstruction(spec);
    const result = compileAsset({
      scdl: MINI_SCDL,
      construction,
      partStyles: { rim: { color: '#4A6A8A', material: 'steel' } },
      canvas: { width: 32, height: 32 },
      skipVRI: true,
    });
    expect(result.ok).toBe(true);
    expect(result.constructionCoords).toBeTruthy();
    expect(result.constructionCoords.length).toBeGreaterThan(0);
    expect(result.solverResult).toBeTruthy();
    expect(result.solverResult.resultChecksum).toBeTruthy();

    // Construction coords should be in the packet
    const totalCoords = result.packet.geometry.coordinates.length;
    expect(totalCoords).toBeGreaterThan(result.constructionCoords.length);

    // Diagnostic should report injection
    const injectDiag = result.diagnostics.find(d => d.stage === 'construction-inject');
    expect(injectDiag).toBeTruthy();
    expect(injectDiag.injected).toBe(result.constructionCoords.length);
  });

  it('reports construction solver failure gracefully', () => {
    // Create a valid construction packet, then corrupt it to trigger solver failure
    const spec = makeConstruction();
    const construction = createConstruction(spec);
    // Corrupt: remove the anchor that the ellipse references
    const corrupted = { ...construction, anchors: {} };
    const result = compileAsset({
      scdl: MINI_SCDL,
      construction: corrupted,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].stage).toBe('construction');
  });
});

// ── compileAsset: Genes ─────────────────────────────────────────────────────
describe('compileAsset — Gene projection', () => {
  it('projects genes through the unified path', () => {
    const genes = [
      {
        assetId: 'test-square',
        geneId: 'test-highlight',
        geneType: 'art-direction',
        priority: 10,
        projectionMode: 'explicit',
        canvas: { width: 16, height: 16 },
        coordinates: [
          { x: 5, y: 5, color: '#FFFFFF' },
          { x: 6, y: 5, color: '#FFFFFF' },
        ],
        geometryHints: {},
        role: 'highlight',
        curator: 'test',
        rationale: 'test gene',
      },
    ];
    const result = compileAsset({ scdl: MINI_SCDL, genes, scale: 2 });
    expect(result.ok).toBe(true);

    // Gene cells should be in the packet
    const geneCells = result.packet.geometry.coordinates.filter(c => c._gene);
    expect(geneCells.length).toBe(2);
  });
});

// ── compileAsset: Determinism ───────────────────────────────────────────────
describe('compileAsset — Determinism', () => {
  it('produces identical output on repeated calls', () => {
    const a = compileAsset({ scdl: MINI_SCDL, scale: 2 });
    const b = compileAsset({ scdl: MINI_SCDL, scale: 2 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.vriScene.checksum).toBe(b.vriScene.checksum);
    expect(a.packet.geometry.coordinates.length).toBe(b.packet.geometry.coordinates.length);
    expect(Buffer.from(a.rgba.data).equals(Buffer.from(b.rgba.data))).toBe(true);
  });

  it('construction checksum is stable', () => {
    const spec = makeConstruction();
    const construction = createConstruction(spec);
    const a = compileAsset({ scdl: MINI_SCDL, construction, skipVRI: true });
    const b = compileAsset({ scdl: MINI_SCDL, construction, skipVRI: true });
    expect(a.ok).toBe(true);
    expect(a.solverResult.resultChecksum).toBe(b.solverResult.resultChecksum);
    expect(a.constructionCoords.length).toBe(b.constructionCoords.length);
  });
});

// ── compileAsset: Full pipeline timing ──────────────────────────────────────
describe('compileAsset — Timing', () => {
  it('reports timing for each stage', () => {
    const spec = makeConstruction();
    const construction = createConstruction(spec);
    const result = compileAsset({
      scdl: MINI_SCDL,
      construction,
      scale: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.timing.construction).toBeGreaterThanOrEqual(0);
    expect(result.timing.scdl).toBeGreaterThanOrEqual(0);
    expect(result.timing.vri).toBeGreaterThanOrEqual(0);
    expect(result.timing.render).toBeGreaterThanOrEqual(0);
  });
});
