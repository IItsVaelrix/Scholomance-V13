/**
 * Item Foundry × VRI — production Door B.
 *
 * The 2026-09-03/04 verdicts named two production doors for the VRI engine:
 * Door A (SCDL CLI, wired 2026-09-03) and Door B (item-foundry.js, sequenced
 * for later). This suite pins Door B: the foundry's items render through the
 * SAME engine, with the SAME integrity machinery, opt-in and additive — the
 * foundry's standard outputs must not change shape or bytes because of it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forgeItemAsset, renderBundleVri } from '../../../../codex/core/pixelbrain/item-foundry.js';
import { verifyLineageChain, LINEAGE_CONTRACT } from '../../../../codex/core/pixelbrain/lineage-verify.js';
import { verifyLineage } from '../../../../codex/core/pixelbrain/asset-pipeline.js';

const SPEC = {
  contract: 'ITEM-SPEC-v1',
  id: 'vri-door-b-fixture',
  class: 'amulet',
  canvas: { width: 48, height: 48, gridSize: 1 },
  seed: 42,
  bytecode: 'VW-TEST-DOOR-B',
  parts: [
    { id: 'body', profile: 'frame.oval', params: { rx: 13, ry: 14 }, fill: { material: 'darksteel' } },
    { id: 'gem', profile: 'gem.round', attach: { parent: 'body', at: 'center' }, fill: { material: 'ruby' }, motif: { kind: 'facet' } },
  ],
};

function forge(opts = {}) {
  return forgeItemAsset(SPEC, { includeShader: false, includePng: false, ...opts });
}

describe('Item Foundry — VRI Door B', () => {
  it('renderBundleVri produces a PB-FOUNDRY-VRI-v1 result with scene, raster, png, lineage', () => {
    const result = renderBundleVri(forge(), { scale: 2 });
    expect(result.contract).toBe('PB-FOUNDRY-VRI-v1');
    expect(result.raster.width).toBe(96);
    expect(result.raster.height).toBe(96);
    expect(result.png.length).toBeGreaterThan(8);
    // PNG signature magic
    expect(Array.from(result.png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('maps part fills to real materials — unknown parts fall back to source, never an invented ramp', () => {
    const bundle = forge();
    const result = renderBundleVri(bundle, { scale: 1 });
    const geo = result.scene.layers.find(l => l.type === 'geometry');
    const materials = new Set(geo.payload.coordinates.map(c => c.material));
    expect(materials.has('darksteel')).toBe(true);
    expect(materials.has('ruby')).toBe(true);
    // Every coordinate carries SOME material (source as honest fallback).
    expect(geo.payload.coordinates.every(c => typeof c.material === 'string' && c.material.length > 0)).toBe(true);
  });

  it('carries a PB-ASSET-LINEAGE-v1 chain that both verifiers accept', () => {
    const result = renderBundleVri(forge(), { scale: 2 });
    expect(result.lineage.contract).toBe(LINEAGE_CONTRACT);
    expect(verifyLineageChain(result.lineage).ok).toBe(true);
    // Full byte-level verification also passes (result + lineage in hand).
    expect(verifyLineage({ lineage: result.lineage, packet: { id: result.lineage.packet.id }, vriScene: result.scene, raster: result.raster }).ok).toBe(true);
  });

  it('is deterministic across repeated renders', () => {
    const a = renderBundleVri(forge(), { scale: 2 });
    const b = renderBundleVri(forge(), { scale: 2 });
    expect(a.scene.checksum).toBe(b.scene.checksum);
    expect(a.lineage.raster.digest).toBe(b.lineage.raster.digest);
    expect(Array.from(a.raster.data)).toEqual(Array.from(b.raster.data));
  });

  it('strokes and synthetic relief are opt-in and each changes the raster', () => {
    const bundle = forge();
    const plain = renderBundleVri(bundle, { scale: 2 });
    const stroked = renderBundleVri(bundle, { scale: 2, strokes: true });
    const relieved = renderBundleVri(bundle, { scale: 2, relief: 'synthetic' });
    expect(Array.from(stroked.raster.data)).not.toEqual(Array.from(plain.raster.data));
    expect(Array.from(relieved.raster.data)).not.toEqual(Array.from(plain.raster.data));
    expect(relieved.scene.provenance.syntheticRelief).not.toBeNull();
  });

  it('forgeItemAsset: vri is null by default, present on includeVri, and never perturbs standard outputs', () => {
    const without = forge();
    expect(without.vri).toBeNull();

    const withVri = forge({ includeVri: true, vriRelief: 'synthetic', vriStrokes: true });
    expect(withVri.vri).not.toBeNull();
    expect(withVri.vri.contract).toBe('PB-FOUNDRY-VRI-v1');

    // Additive guarantee: the foundry's authoritative hashes and pixel outputs
    // are identical whether or not VRI was requested.
    expect(withVri.fills.hash).toBe(without.fills.hash);
    expect(withVri.motifs.hash).toBe(without.motifs.hash);
    expect(withVri.assetPacket.contentDigest).toBe(without.assetPacket.contentDigest);
  });

  it('refuses a missing bundle instead of rendering nothing', () => {
    expect(() => renderBundleVri(null)).toThrow(/bundle is required/);
    expect(() => renderBundleVri({})).toThrow(/bundle is required/);
  });

  it('a real production-shaped spec (slime-staff) renders through Door B', () => {
    const rawSpec = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/slime-staff.v1.json'), 'utf8'));
    const bundle = forgeItemAsset(rawSpec, { includeShader: false, includePng: false });
    const result = renderBundleVri(bundle, { scale: 1 });
    expect(result.raster.width).toBe(bundle.assetPacket.canvas.width);
    expect(verifyLineageChain(result.lineage).ok).toBe(true);
    // The staff actually painted pixels.
    const opaque = result.raster.data.reduce((n, v, i) => (i % 4 === 3 && v > 0 ? n + 1 : n), 0);
    expect(opaque).toBeGreaterThan(100);
  });
});
