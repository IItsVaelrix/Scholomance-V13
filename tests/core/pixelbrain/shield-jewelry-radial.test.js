/**
 * Shield and Jewelry factories — radial contract tests
 *
 * Verifies that the buckler (shield) and amulet (jewelry) grammars produce
 * a valid route contract and that `validateRoute` catches missing pieces.
 * The geometry is synthetic — the foundry does not yet produce these
 * archetypes, so the contract is what we test, not the visual output.
 */
import { describe, expect, it } from 'vitest';

import { forgeShield } from '../../../codex/core/pixelbrain/factory/shield-factory.js';
import { forgeJewelry } from '../../../codex/core/pixelbrain/factory/jewelry-factory.js';
import { validateRoute } from '../../../codex/core/pixelbrain/microprocessor-route.js';

function radialCells(canvasWidth, canvasHeight, centerX, centerY, parts) {
  // parts: [{ id, minR2, maxR2 }]
  const cells = [];
  const partsByRadius = (dx, dy) => {
    const r2 = dx * dx + dy * dy;
    for (const part of parts) {
      if (r2 > part.minR2 && r2 <= part.maxR2) return part.id;
    }
    return null;
  };
  for (let y = 0; y < canvasHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const partId = partsByRadius(dx, dy);
      if (!partId) continue;
      cells.push({ x, y, partId, materialId: 1 });
    }
  }
  return cells;
}

function makeSpec(archetype, partIds, material) {
  return {
    contract: 'ITEM-SPEC-v1',
    id: `${archetype}-test`,
    class: archetype === 'amulet' ? 'amulet' : 'armor',
    archetype: archetype === 'buckler' ? 'kite_shield' : archetype,
    bytecode: `${archetype.toUpperCase()}-TEST`,
    canvas: archetype === 'buckler'
      ? { width: 16, height: 16, gridSize: 1 }
      : { width: 12, height: 14, gridSize: 1 },
    symmetry: archetype === 'buckler'
      ? { axis: 'radial', mode: 'strict' }
      : { axis: 'vertical', mode: 'strict' },
    parts: partIds.map((id) => ({
      id,
      profile: `${archetype}.${id}`,
      fill: { material: material || 'iron' },
    })),
  };
}

describe('Shield Factory — buckler (radial-v1) contract', () => {
  const partIds = ['boss', 'face', 'rim'];
  const spec = makeSpec('buckler', partIds, 'iron');

  it('declares the radial buckler grammar with concentric required outputs', () => {
    const { routeDefinition, expansion } = forgeShield(spec, null);
    expect(expansion.grammarId).toBe('shield.buckler.radial-v1');
    expect(routeDefinition.name).toBe('shield.buckler.radial-v1');

    const requiredKinds = new Set(routeDefinition.requiredOutputs.map((r) => r.kind));
    expect(requiredKinds.has('partCells')).toBe(true);
    expect(requiredKinds.has('materialSlot')).toBe(true);

    const partCellReqs = routeDefinition.requiredOutputs
      .filter((r) => r.kind === 'partCells')
      .map((r) => r.id);
    expect(partCellReqs).toEqual(expect.arrayContaining(['boss-cells', 'face-cells', 'rim-cells']));
  });

  it('assigns every required output to a responsible seam step', () => {
    const { routeDefinition } = forgeShield(spec, null);
    for (const req of routeDefinition.requiredOutputs) {
      expect(routeDefinition.requiredOutputSteps[req.id]).toBeTruthy();
      expect(routeDefinition.requiredOutputSeams[req.id]).toBeTruthy();
    }
  });

  it('passes validateRoute against a synthetic radial buckler lattice', () => {
    const cells = radialCells(16, 16, 8, 8, [
      { id: 'boss', minR2: 0, maxR2: 9 },     // r ≤ 3
      { id: 'face', minR2: 9, maxR2: 49 },    // 3 < r ≤ 7
      { id: 'rim',  minR2: 49, maxR2: 64 },   // 7 < r ≤ 8
    ]);
    expect(cells.filter((c) => c.partId === 'boss').length).toBeGreaterThanOrEqual(20);
    expect(cells.filter((c) => c.partId === 'face').length).toBeGreaterThanOrEqual(80);
    expect(cells.filter((c) => c.partId === 'rim').length).toBeGreaterThanOrEqual(30);

    const { routeDefinition } = forgeShield(spec, null);
    const result = validateRoute(routeDefinition, {
      spec,
      silhouette: { cells, partOf: new Map() },
      fills: { coordinates: cells },
      geometry: { masks: { boss: [], face: [], rim: [] } },
      construction: null,
    });
    expect(result.diagnostics.ok).toBe(true);
  });

  it('fails validateRoute when the boss is missing from the lattice', () => {
    const cells = radialCells(16, 16, 8, 8, [
      { id: 'boss', minR2: 0, maxR2: 9 },
      { id: 'face', minR2: 9, maxR2: 49 },
      { id: 'rim',  minR2: 49, maxR2: 64 },
    ]).filter((c) => c.partId !== 'boss');

    const { routeDefinition } = forgeShield(spec, null);
    const result = validateRoute(routeDefinition, {
      spec,
      silhouette: { cells, partOf: new Map() },
      fills: { coordinates: cells },
      geometry: { masks: { boss: [], face: [], rim: [] } },
      construction: null,
    });
    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
          requiredOutput: 'boss-cells',
        }),
      ]),
    );
  });
});

describe('Jewelry Factory — amulet (radial-v1) contract', () => {
  const partIds = ['gem', 'bezel', 'chain'];
  const spec = makeSpec('amulet', partIds, 'silver');

  it('declares the radial amulet grammar with concentric required outputs', () => {
    const { routeDefinition, expansion } = forgeJewelry(spec, null);
    expect(expansion.grammarId).toBe('jewelry.amulet.radial-v1');
    expect(routeDefinition.name).toBe('jewelry.amulet.radial-v1');

    const partCellReqs = routeDefinition.requiredOutputs
      .filter((r) => r.kind === 'partCells')
      .map((r) => r.id);
    expect(partCellReqs).toEqual(expect.arrayContaining(['gem-cells', 'bezel-cells', 'chain-cells']));
  });

  it('passes validateRoute against a synthetic radial amulet lattice', () => {
    const cells = radialCells(12, 14, 6, 8, [
      { id: 'gem',   minR2: 0, maxR2: 4 },    // r ≤ 2
      { id: 'bezel', minR2: 4, maxR2: 9 },    // 2 < r ≤ 3
      { id: 'chain', minR2: 9, maxR2: 16 },   // 3 < r ≤ 4
    ]);
    expect(cells.filter((c) => c.partId === 'gem').length).toBeGreaterThanOrEqual(8);
    expect(cells.filter((c) => c.partId === 'bezel').length).toBeGreaterThanOrEqual(10);
    expect(cells.filter((c) => c.partId === 'chain').length).toBeGreaterThanOrEqual(15);

    const { routeDefinition } = forgeJewelry(spec, null);
    const result = validateRoute(routeDefinition, {
      spec,
      silhouette: { cells, partOf: new Map() },
      fills: { coordinates: cells },
      geometry: { masks: { gem: [], bezel: [], chain: [] } },
      construction: null,
    });
    expect(result.diagnostics.ok).toBe(true);
  });

  it('fails validateRoute when the gem is missing from the lattice', () => {
    const cells = radialCells(12, 14, 6, 8, [
      { id: 'gem',   minR2: 0, maxR2: 4 },
      { id: 'bezel', minR2: 4, maxR2: 9 },
      { id: 'chain', minR2: 9, maxR2: 16 },
    ]).filter((c) => c.partId !== 'gem');

    const { routeDefinition } = forgeJewelry(spec, null);
    const result = validateRoute(routeDefinition, {
      spec,
      silhouette: { cells, partOf: new Map() },
      fills: { coordinates: cells },
      geometry: { masks: { gem: [], bezel: [], chain: [] } },
      construction: null,
    });
    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
          requiredOutput: 'gem-cells',
        }),
      ]),
    );
  });
});
