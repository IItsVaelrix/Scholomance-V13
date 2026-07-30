/**
 * Asset pipeline — composition boundary and identity chain.
 *
 * These drive the real SCDL sources in PolarisOS/worldpacks/shrine-demo, not
 * synthetic fixtures, because the point of the entry point is that the whole
 * path runs without a caller reassembling it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  compileAsset,
  verifyLineage,
  CONSTRUCTION_LINK,
  LINEAGE_CONTRACT,
} from '../../../../codex/core/pixelbrain/asset-pipeline.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const scdlDir = resolve(repoRoot, 'PolarisOS/worldpacks/shrine-demo/scdl');
const src = (name) => readFileSync(resolve(scdlDir, name), 'utf8');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Self-contained construction: a tapered ribbon and a detached boss. Kept local
// rather than imported from another test file so this suite owns its fixtures.
const VALIDATION = {
  closedParts: [],
  forbidSelfIntersections: true,
  consistentWinding: 'counterclockwise',
  minimumCurvatureRadius: 0.2,
  requireConnectedAssembly: false,
};

const gateSpec = () => ({
  id: 'pipeline-gate-probe',
  canvas: { width: 16, height: 16 },
  anchors: { top: [8, 2], bottom: [8, 14], side: [13, 8] },
  parts: [
    { id: 'body', primitive: { kind: 'tapered-ribbon', start: { anchor: 'top' }, end: { anchor: 'bottom' }, startWidth: 2, endWidth: 4 } },
    { id: 'boss', primitive: { kind: 'ellipse', center: { anchor: 'side' }, radiusX: 2, radiusY: 2 } },
  ],
  constraints: [],
  validation: { ...VALIDATION },
});

describe('compileAsset — full path', () => {
  it('runs SCDL -> VRI without a caller reassembling the chain', () => {
    const r = compileAsset(src('sword.scdl'));
    expect(r.ok).toBe(true);
    expect(r.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(r.vriScene.version).toBe('PB-VRI-v1');
    expect(r.vriScene.layers.length).toBeGreaterThan(0);
  });

  it('stops at the scene when no scale is given', () => {
    const r = compileAsset(src('sword.scdl'));
    expect(r.vriScene).not.toBeNull();
    expect(r.raster).toBeNull();
  });

  it('rasterizes when a scale is given', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 4 });
    expect(r.raster.width).toBe(r.vriScene.width * 4);
    expect(r.raster.height).toBe(r.vriScene.height * 4);
    expect(r.raster.data.some(b => b !== 0)).toBe(true);
  });

  it('can skip VRI entirely', () => {
    const r = compileAsset(src('sword.scdl'), { vri: false, scale: 4 });
    expect(r.packet).not.toBeNull();
    expect(r.vriScene).toBeNull();
    expect(r.raster).toBeNull();
  });

  it('is deterministic across runs', () => {
    const a = compileAsset(src('sword.scdl'), { scale: 4 });
    const b = compileAsset(src('sword.scdl'), { scale: 4 });
    expect(a.lineage).toEqual(b.lineage);
    expect(Array.from(a.raster.data)).toEqual(Array.from(b.raster.data));
  });

  it('forwards VRI options through the boundary', () => {
    const plain = compileAsset(src('celestial-sword.scdl'), { scale: 2 });
    const quant = compileAsset(src('celestial-sword.scdl'), { scale: 2, vri: { quantize: true } });
    expect(plain.vriScene.provenance.quantizationMode).toBe('off');
    expect(quant.vriScene.provenance.quantizationMode).toBe('luminance-band');
    expect(quant.lineage.raster.digest).not.toBe(plain.lineage.raster.digest);
  });
});

describe('compileAsset — lineage', () => {
  it('records a chain from packet to bytes', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 4 });
    expect(r.lineage.contract).toBe(LINEAGE_CONTRACT);
    expect(r.lineage.packet.id).toBe(r.packet.id);
    expect(r.lineage.vriScene.checksum).toBe(r.vriScene.checksum);
    expect(r.lineage.raster.digest).toMatch(/^[0-9a-f]{8}$/);
    expect(r.lineage.raster.scale).toBe(4);
  });

  it('accepts a caller-supplied digest function', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 2, digest: sha256 });
    expect(r.lineage.raster.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.lineage.raster.digest).toBe(sha256(r.raster.data));
  });

  it('verifies a lineage against its own artifacts', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 2 });
    expect(verifyLineage(r)).toEqual({ ok: true, mismatches: [] });
  });

  it('detects a raster that no longer matches its recorded digest', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 2 });
    // Simulate an artifact edited after the fact.
    const tampered = { ...r, raster: { ...r.raster, data: r.raster.data.map((b, i) => (i === 0 ? b ^ 0xFF : b)) } };
    const v = verifyLineage(tampered);
    expect(v.ok).toBe(false);
    expect(v.mismatches.map(m => m.stage)).toContain('raster');
  });

  it('detects a scene swapped under a recorded lineage', () => {
    const a = compileAsset(src('sword.scdl'), { scale: 2 });
    const b = compileAsset(src('celestial-sword.scdl'), { scale: 2 });
    const swapped = { ...a, vriScene: b.vriScene };
    const v = verifyLineage(swapped);
    expect(v.ok).toBe(false);
    expect(v.mismatches.map(m => m.stage)).toContain('vriScene');
  });

  it('links a different scene to a different digest', () => {
    const a = compileAsset(src('sword.scdl'), { scale: 2 });
    const b = compileAsset(src('celestial-sword.scdl'), { scale: 2 });
    expect(a.lineage.vriScene.checksum).not.toBe(b.lineage.vriScene.checksum);
    expect(a.lineage.raster.digest).not.toBe(b.lineage.raster.digest);
  });
});

describe('compileAsset — construction gate', () => {
  it('records construction identity when one is supplied', () => {
    const r = compileAsset(src('sword.scdl'), { construction: gateSpec() });
    expect(r.ok).toBe(true);
    expect(r.lineage.construction.id).toBe('pipeline-gate-probe');
    expect(r.lineage.construction.checksum).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
    expect(r.lineage.construction.resultChecksum).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
  });

  it('marks the link as a gate, not a derivation', () => {
    // Solved geometry does not yet flow into the SCDL AST. The field records
    // that honestly rather than implying the packet descends from the solve.
    const r = compileAsset(src('sword.scdl'), { construction: gateSpec() });
    expect(r.lineage.construction.link).toBe(CONSTRUCTION_LINK.GATE);
  });

  it('refuses the whole asset when a constraint is false', () => {
    // `boss` is detached from `body`; requiring a connected assembly cannot hold.
    const broken = {
      ...gateSpec(),
      validation: { ...VALIDATION, requireConnectedAssembly: true, connectionTolerance: 0.01 },
    };
    const r = compileAsset(src('sword.scdl'), { construction: broken });
    expect(r.ok).toBe(false);
    expect(r.packet).toBeNull();
    expect(r.raster).toBeNull();
    expect(r.diagnostics.construction.passed).toBe(false);
  });

  it('refusal happens before any pixels exist', () => {
    const broken = { ...gateSpec(), canvas: { width: 0, height: 64 } };
    const r = compileAsset(src('sword.scdl'), { construction: broken, scale: 8 });
    expect(r.ok).toBe(false);
    expect(r.vriScene).toBeNull();
    expect(r.raster).toBeNull();
  });

  it('leaves construction null when none is supplied', () => {
    expect(compileAsset(src('sword.scdl')).lineage.construction).toBeNull();
  });
});

describe('compileAsset — diagnostics', () => {
  it('surfaces VRI unrendered declarations through the boundary', () => {
    const r = compileAsset(src('sword.scdl'), {
      vri: { atmosphere: { fog: null, bloom: { threshold: 0.7, radius: 3, intensity: 0.5 }, grading: null } },
    });
    expect(r.diagnostics.vri.unrenderedDeclarations.map(d => d.field)).toContain('atmosphere.bloom');
  });

  it('surfaces palette coverage through the boundary', () => {
    // lightning-sword paints every part one flat colour, so no material swap
    // can express form on it. moonlit-shrine-forest spans its ramps properly.
    const flat = compileAsset(src('lightning-sword.scdl'));
    const spread = compileAsset(src('moonlit-shrine-forest.scdl'));
    expect(flat.diagnostics.vri.paletteCoverage.every(c => c.flat)).toBe(true);
    expect(spread.diagnostics.vri.paletteCoverage.every(c => c.flat)).toBe(false);
  });

  it('reports SCDL errors without throwing', () => {
    const r = compileAsset('this is not valid scdl at all');
    expect(r.ok).toBe(false);
    expect(r.diagnostics.scdl.errorCount).toBeGreaterThan(0);
  });
});

describe('compileAsset — animation frames', () => {
  // shrine-bell is a 3-frame swing loop whose f1/f2 have identical cell counts.
  const bell = () => src('shrine-bell.scdl');

  it('carries every frame of a loop through the boundary', () => {
    const r = compileAsset(bell(), { scale: 2 });
    expect(r.ok).toBe(true);
    expect(r.frames.length).toBe(3);
    expect(r.frameLoop.loop).toBe('swing');
    for (const f of r.frames) {
      expect(f.packet.geometry.coordinates.length).toBeGreaterThan(0);
      expect(f.vriScene.version).toBe('PB-VRI-v1');
      expect(f.raster.width).toBeGreaterThan(0);
    }
  });

  it('gives each frame its own packet, scene, and raster identity', () => {
    const r = compileAsset(bell(), { scale: 2 });
    const unique = (xs) => new Set(xs).size === xs.length;
    expect(unique(r.frames.map(f => f.packet.id))).toBe(true);
    expect(unique(r.frames.map(f => f.vriScene.checksum))).toBe(true);
    expect(unique(r.lineage.frames.map(f => f.raster.digest))).toBe(true);
  });

  it('treats the top-level packet as shorthand for frame 0, not a separate asset', () => {
    const r = compileAsset(bell(), { scale: 2 });
    expect(r.packet.id).toBe(r.frames[0].packet.id);
    expect(r.vriScene.checksum).toBe(r.frames[0].vriScene.checksum);
    expect(r.diagnostics.vri.frames).toBe(3);
  });

  it('always exposes a single-element frames array for a still asset', () => {
    const r = compileAsset(src('sword.scdl'), { scale: 2 });
    expect(r.frames.length).toBe(1);
    expect(r.frames[0].packet.id).toBe(r.packet.id);
    expect(r.frameLoop).toBeNull();
  });

  it('verifies the lineage of later frames, not only frame 0', () => {
    const r = compileAsset(bell(), { scale: 2 });
    expect(verifyLineage(r)).toEqual({ ok: true, mismatches: [] });

    // swap frame 2's pixels for frame 1's — frame 0 still agrees, so a
    // frame-0-only check would call this clean.
    const tampered = {
      ...r,
      frames: r.frames.map((f, i) => (i === 2 ? { ...f, raster: r.frames[1].raster } : f)),
    };
    const v = verifyLineage(tampered);
    expect(v.ok).toBe(false);
    expect(v.mismatches.map(m => m.stage)).toContain('frames[2].raster');
  });

  it('notices a frame going missing entirely', () => {
    const r = compileAsset(bell(), { scale: 2 });
    const v = verifyLineage({ ...r, frames: r.frames.slice(0, 2) });
    expect(v.ok).toBe(false);
    expect(v.mismatches.map(m => m.stage)).toContain('frames');
  });
});
