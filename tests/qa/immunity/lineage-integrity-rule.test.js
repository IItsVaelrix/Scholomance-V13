/**
 * LINEAGE-0F0D — Layer 1 defends the asset lineage chain at rest.
 *
 * Before this rule existed, verifyLineage()/verifyLineageChain() had ZERO
 * innate consumers — the 2026-09-04 VRIX verdict measured exactly that
 * (`codex/core/immunity/` contained no reference to them). The lineage chain
 * (construction -> packet -> VRI scene -> raster digest) is the asset
 * pipeline's integrity surface; immunity now scans its exported artifacts
 * (`-lineage.json` sidecars) with the SAME verifier the pipeline uses —
 * one source of truth (lineage-verify.js), no re-implementation.
 *
 * Pinned in both directions, per this suite's discipline: the shapes it must
 * catch, and the honest artifacts it must leave alone.
 */

import { describe, expect, it } from 'vitest';
import { INNATE_RULES } from '../../../codex/core/immunity/innate.rules.js';
import { getRepair } from '../../../codex/core/immunity/repair.recommendations.js';
import { compileAsset } from '../../../codex/core/pixelbrain/asset-pipeline.js';
import { verifyLineageChain } from '../../../codex/core/pixelbrain/lineage-verify.js';

const rule = id => INNATE_RULES.find(item => item.id === id);
const scan = (doc, path = 'assets/void_sword-lineage.json') =>
  Boolean(rule('LINEAGE-0F0D').detector(typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2), path));

const SOURCE = [
  'asset lineage_test canvas 12x12',
  'palette { c = #D4AF37 }',
  'part p material gold { rect 2 2 6 6 c }',
  'export png',
].join('\n');

function realSidecar() {
  const result = compileAsset(SOURCE, { scale: 2 });
  expect(result.ok).toBe(true);
  return {
    artifact: 'PB-ASSET-LINEAGE-SIDECAR-v1',
    asset: 'lineage_test',
    sourceFile: 'lineage_test.scdl',
    shading: 'vri',
    scale: 2,
    frames: result.frames.length,
    // JSON round-trip: the pipeline freezes its lineage, and a sidecar is JSON
    // anyway — tampering tests mutate this copy, not the frozen original.
    lineage: JSON.parse(JSON.stringify(result.lineage)),
  };
}

describe('LINEAGE-0F0D — rule metadata', () => {
  it('is registered with the dedicated immunity error code and a real repair key', () => {
    const r = rule('LINEAGE-0F0D');
    expect(r).toBeDefined();
    expect(r.errorCode).toBe(0x0F0D);
    expect(r.moduleId).toBe('IMMUNE');
    const repair = getRepair(r.repairKey);
    expect(repair.key).toBe(r.repairKey);
    expect(repair.title).not.toMatch(/unknown/i);
  });
});

describe('LINEAGE-0F0D — honest artifacts pass', () => {
  it('a genuinely exported lineage sidecar scans clean', () => {
    expect(scan(realSidecar())).toBe(false);
  });

  it('verifyLineageChain accepts a real pipeline lineage', () => {
    const result = compileAsset(SOURCE, { scale: 2 });
    expect(verifyLineageChain(result.lineage).ok).toBe(true);
  });

  it('non-lineage JSON files are ignored entirely', () => {
    expect(scan({ artifact: 'something-else', data: [1, 2, 3] })).toBe(false);
    expect(scan({ nothing: true })).toBe(false);
  });

  it('files outside the -lineage.json naming convention are never scanned', () => {
    const broken = realSidecar();
    broken.lineage.frames = [];
    expect(scan(broken, 'assets/void_sword.json')).toBe(false);
  });
});

describe('LINEAGE-0F0D — broken chains are caught', () => {
  it('flags a raster digest that is no longer a digest', () => {
    const sidecar = realSidecar();
    sidecar.lineage.raster.digest = 'not-a-digest';
    expect(scan(sidecar)).toBe(true);
  });

  it('flags an empty frames array (an animation silently dropped)', () => {
    const sidecar = realSidecar();
    sidecar.lineage.frames = [];
    expect(scan(sidecar)).toBe(true);
  });

  it('flags a frame row whose packet id disagrees with the shorthand', () => {
    const sidecar = realSidecar();
    sidecar.lineage.frames[0] = { ...sidecar.lineage.frames[0], packet: { id: 'pbasset_other' } };
    expect(scan(sidecar)).toBe(true);
  });

  it('flags a derived construction link that lost its partsChecksum', () => {
    const sidecar = realSidecar();
    sidecar.lineage.construction = {
      id: 'c1', checksum: 'sha256-canonical-v1:abc', resultChecksum: 'sha256-canonical-v1:def',
      link: 'derived', // promises a partsChecksum it does not carry
    };
    expect(scan(sidecar)).toBe(true);
  });

  it('flags an unknown construction link value', () => {
    const sidecar = realSidecar();
    sidecar.lineage.construction = {
      id: 'c1', checksum: 'x', resultChecksum: 'y', link: 'conjugated',
    };
    expect(scan(sidecar)).toBe(true);
  });

  it('flags a foreign contract string', () => {
    const sidecar = realSidecar();
    sidecar.lineage.contract = 'PB-ASSET-LINEAGE-v2';
    expect(scan(sidecar)).toBe(true);
  });

  it('flags an artifact that is not even JSON', () => {
    expect(scan('this is not json {{{')).toBe(true);
  });

  it('reports the concrete mismatch, not a bare refusal', () => {
    const sidecar = realSidecar();
    sidecar.lineage.raster.digest = 'zz';
    const result = rule('LINEAGE-0F0D').detector(JSON.stringify(sidecar), 'assets/x-lineage.json');
    expect(result.matched).toBe(true);
    expect(result.context.mismatches.some(m => m.stage === 'raster.digest')).toBe(true);
  });

  it('honours an explicit IMMUNE_ALLOW annotation', () => {
    const sidecar = realSidecar();
    sidecar.lineage.frames = [];
    const text = `IMMUNE_ALLOW: asset-lineage (fixture for a broken-chain drill)\n${JSON.stringify(sidecar)}`;
    expect(scan(text)).toBe(false);
  });
});
