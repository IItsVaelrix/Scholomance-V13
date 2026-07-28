/**
 * Tests: Project Genes Pass — Deterministic Art-Gene Projection
 * PDR §17.1: Projection, order independence, conflicts, provenance
 * PDR §17.2: Determinism matrix
 * PDR §17.3: Required tests (100-run, permutation, epoch, canvas, authority, no-gene)
 */

import { describe, it, expect } from 'vitest';
import { projectGenes } from '../../../../codex/core/pixelbrain/scdl/passes/project-genes.pass.js';
import { createArtGenePacket, stableStringify } from '../../../../codex/core/pixelbrain/scdna-art-gene.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseContext = {
  canvas: { width: 24, height: 20 },
  compilerVersion: '1.0.0',
  projectionAlgoVersion: 1,
  conflictPolicyVersion: 1,
  paletteRoleMappingVersion: '1.0.0',
  sdfByPart: {},
};

function makeGene(id, priority, coords, overrides = {}) {
  return createArtGenePacket({
    assetId: 'shrine-brazier',
    geneId: id,
    projectionMode: 'explicit',
    priority,
    canvas: { width: 24, height: 20 },
    role: 'rim-highlight',
    materialHint: 'obsidian',
    paletteRoles: ['rim'],
    coordinates: coords,
    geometryHints: {},
    ...overrides,
  });
}

const geneA = makeGene('gene-a', 10, [
  { x: 5, y: 5, role: 'rim' },
  { x: 6, y: 5, role: 'rim' },
]);

const geneB = makeGene('gene-b', 20, [
  { x: 6, y: 5, role: 'core' },  // overlaps geneA at (6,5)
  { x: 7, y: 5, role: 'core' },
]);

const geneC = makeGene('gene-c', 5, [
  { x: 10, y: 10, role: 'shadow' },
]);

// ─── Basic Projection ────────────────────────────────────────────────────────

describe('projectGenes', () => {
  it('projects explicit coordinates onto the canvas', () => {
    const result = projectGenes([geneA], baseContext);

    expect(result.cells.length).toBe(2);
    expect(result.cells[0]).toMatchObject({ x: 5, y: 5, role: 'rim' });
    expect(result.cells[1]).toMatchObject({ x: 6, y: 5, role: 'rim' });
    expect(result.projectionChecksum).toMatch(/^scd64:[0-9a-f]{64}$/);
    expect(result.orderedGeneIds).toEqual(['gene-a']);
    expect(result.conflicts).toEqual([]);
  });

  it('returns frozen result', () => {
    const result = projectGenes([geneA], baseContext);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cells)).toBe(true);
    expect(Object.isFrozen(result.conflicts)).toBe(true);
  });
});

// ─── No-Gene Regression (§6.5, §17.3) ───────────────────────────────────────

describe('no-gene regression', () => {
  it('is a strict no-op when no genes apply', () => {
    const result = projectGenes([], baseContext);

    expect(result.cells).toEqual([]);
    expect(result.orderedGeneIds).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.projectionAlgoVersion).toBe(1);
    expect(result.conflictPolicyVersion).toBe(1);
    expect(result.projectionChecksum).toMatch(/^scd64:/);
  });

  it('produces deterministic empty checksum', () => {
    const r1 = projectGenes([], baseContext);
    const r2 = projectGenes([], baseContext);
    expect(r1.projectionChecksum).toBe(r2.projectionChecksum);
  });
});

// ─── 100-Run Replay (§17.3) ─────────────────────────────────────────────────

describe('determinism', () => {
  it('returns byte-identical projection across 100 runs', () => {
    const outputs = new Set();

    for (let index = 0; index < 100; index += 1) {
      outputs.add(stableStringify(projectGenes([geneA, geneB, geneC], baseContext)));
    }

    expect(outputs.size).toBe(1);
  });
});

// ─── Permutation Stability (§17.3) ──────────────────────────────────────────

describe('permutation stability', () => {
  it('is independent of caller gene array order', () => {
    const baseline = projectGenes([geneA, geneB, geneC], baseContext);
    const shuffled = projectGenes([geneC, geneA, geneB], baseContext);

    expect(stableStringify(shuffled)).toBe(stableStringify(baseline));
  });

  it('orders genes by priority ascending then geneId ascending', () => {
    const result = projectGenes([geneB, geneA, geneC], baseContext);
    // geneC (priority 5) < geneA (priority 10) < geneB (priority 20)
    expect(result.orderedGeneIds).toEqual(['gene-c', 'gene-a', 'gene-b']);
  });
});

// ─── Conflict Resolution ─────────────────────────────────────────────────────

describe('conflict resolution', () => {
  it('resolves overlaps with priority-then-geneId policy', () => {
    const result = projectGenes([geneA, geneB], baseContext);

    // geneA (priority 10) and geneB (priority 20) overlap at (6,5)
    // geneB has higher priority → processed later → wins
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]).toMatchObject({
      x: 6,
      y: 5,
      winnerGeneId: 'gene-b',
      loserGeneId: 'gene-a',
      policy: 'priority-then-geneId',
    });

    // The surviving cell at (6,5) should be geneB's
    const cell65 = result.cells.find((c) => c.x === 6 && c.y === 5);
    expect(cell65.role).toBe('core');
    expect(cell65._gene.geneId).toBe('gene-b');
    expect(cell65._gene.overlap).toMatchObject({
      replacedGeneId: 'gene-a',
      policy: 'priority-then-geneId',
    });
  });

  it('uses geneId as tie-breaker when priorities are equal', () => {
    const geneX = makeGene('gene-x', 10, [{ x: 3, y: 3, role: 'x' }]);
    const geneY = makeGene('gene-y', 10, [{ x: 3, y: 3, role: 'y' }]);

    const result = projectGenes([geneY, geneX], baseContext);

    // Same priority → geneId ascending → gene-x first, gene-y second → gene-y wins
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].winnerGeneId).toBe('gene-y');
    expect(result.conflicts[0].loserGeneId).toBe('gene-x');
  });
});

// ─── Causal Provenance (§6.4) ───────────────────────────────────────────────

describe('causal provenance', () => {
  it('attaches complete provenance to every surviving cell', () => {
    const result = projectGenes([geneA], baseContext);

    for (const cell of result.cells) {
      expect(cell._gene).toBeDefined();
      expect(cell._gene.assetId).toBe('shrine-brazier');
      expect(cell._gene.geneId).toBe('gene-a');
      expect(cell._gene.genePriority).toBe(10);
      expect(cell._gene.geneChecksum).toMatch(/^scd64:/);
      expect(cell._gene.projectionChecksum).toBe(result.projectionChecksum);
      expect(cell._gene.passVersion).toBe(1);
      expect(cell._gene.sourceCoordOrHint.type).toBe('coordinate');
      expect(cell._gene.sourceCoordOrHint.coordinateIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Projection Identity (§17.2 Determinism Matrix) ─────────────────────────

describe('projection identity', () => {
  it('changes when projection epoch changes', () => {
    const first = projectGenes([geneA], { ...baseContext, projectionAlgoVersion: 1 });
    const second = projectGenes([geneA], { ...baseContext, projectionAlgoVersion: 2 });
    expect(second.projectionChecksum).not.toBe(first.projectionChecksum);
  });

  it('changes when conflict policy version changes', () => {
    const first = projectGenes([geneA], { ...baseContext, conflictPolicyVersion: 1 });
    const second = projectGenes([geneA], { ...baseContext, conflictPolicyVersion: 2 });
    expect(second.projectionChecksum).not.toBe(first.projectionChecksum);
  });

  it('changes when compiler version changes', () => {
    const first = projectGenes([geneA], { ...baseContext, compilerVersion: '1.0.0' });
    const second = projectGenes([geneA], { ...baseContext, compilerVersion: '2.0.0' });
    expect(second.projectionChecksum).not.toBe(first.projectionChecksum);
  });

  it('changes when palette mapping version changes', () => {
    const first = projectGenes([geneA], { ...baseContext, paletteRoleMappingVersion: '1.0.0' });
    const second = projectGenes([geneA], { ...baseContext, paletteRoleMappingVersion: '2.0.0' });
    expect(second.projectionChecksum).not.toBe(first.projectionChecksum);
  });

  it('binds nested canvas dimensions into projection identity', () => {
    const small = projectGenes([geneA], { ...baseContext, canvas: { width: 8, height: 8 } });
    const large = projectGenes([geneA], { ...baseContext, canvas: { width: 64, height: 64 } });
    expect(large.projectionChecksum).not.toBe(small.projectionChecksum);
  });

  it('changes when gene checksum changes', () => {
    const geneV1 = makeGene('gene-v', 10, [{ x: 1, y: 1, role: 'a' }]);
    const geneV2 = makeGene('gene-v', 10, [{ x: 1, y: 1, role: 'b' }]);

    const r1 = projectGenes([geneV1], baseContext);
    const r2 = projectGenes([geneV2], baseContext);
    expect(r2.projectionChecksum).not.toBe(r1.projectionChecksum);
  });

  it('changes when SDF checksum changes', () => {
    const ctx1 = {
      ...baseContext,
      sdfByPart: { 'brazier-body': { checksum: 'scd64:aaa', width: 24, height: 20, values: [] } },
    };
    const ctx2 = {
      ...baseContext,
      sdfByPart: { 'brazier-body': { checksum: 'scd64:bbb', width: 24, height: 20, values: [] } },
    };

    const r1 = projectGenes([geneA], ctx1);
    const r2 = projectGenes([geneA], ctx2);
    expect(r2.projectionChecksum).not.toBe(r1.projectionChecksum);
  });

  it('remains stable when only input gene array order changes', () => {
    const r1 = projectGenes([geneA, geneB], baseContext);
    const r2 = projectGenes([geneB, geneA], baseContext);
    expect(r1.projectionChecksum).toBe(r2.projectionChecksum);
  });
});

// ─── Derived Contour Projection ──────────────────────────────────────────────

describe('derived contour projection', () => {
  it('traces contour cells from SDF data', () => {
    const derivedGene = createArtGenePacket({
      assetId: 'shrine-brazier',
      geneId: 'contour-test',
      projectionMode: 'derived',
      priority: 10,
      canvas: { width: 4, height: 4 },
      role: 'contour',
      materialHint: 'obsidian',
      paletteRoles: ['rim'],
      coordinates: [],
      geometryHints: {
        contourFollow: true,
        contourPartId: 'test-part',
        rimWidth: 0.5,
      },
    });

    const ctx = {
      ...baseContext,
      canvas: { width: 4, height: 4 },
      sdfByPart: {
        'test-part': {
          checksum: 'scd64:test',
          width: 4,
          height: 4,
          values: [
            2.0, 1.0, 1.0, 2.0,
            1.0, 0.0, 0.0, 1.0,
            1.0, 0.0, 0.0, 1.0,
            2.0, 1.0, 1.0, 2.0,
          ],
        },
      },
    };

    const result = projectGenes([derivedGene], ctx);

    // Cells with |sd| < 0.5: only the 0.0 values at (1,1), (2,1), (1,2), (2,2)
    expect(result.cells.length).toBe(4);
    expect(result.cells.every((c) => c._gene.sourceCoordOrHint.type === 'geometryHint')).toBe(true);
    expect(result.cells[0]._gene.sourceCoordOrHint.contourPartId).toBe('test-part');
  });
});

// ─── Bounds Checking ─────────────────────────────────────────────────────────

describe('bounds checking', () => {
  it('skips out-of-bounds coordinates', () => {
    const gene = makeGene('oob', 10, [
      { x: -1, y: 0, role: 'rim' },
      { x: 0, y: 0, role: 'rim' },
      { x: 100, y: 100, role: 'rim' },
    ]);

    const result = projectGenes([gene], baseContext);
    expect(result.cells.length).toBe(1);
    expect(result.cells[0]).toMatchObject({ x: 0, y: 0 });
  });
});
