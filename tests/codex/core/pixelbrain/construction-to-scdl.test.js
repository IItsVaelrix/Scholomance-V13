/**
 * constructionToSCDLParts — the derivation path that makes CONSTRUCTION_LINK.DERIVED
 * reachable. Before this module existed, a construction could only GATE an asset
 * (a refusal stops the pipeline) without SUPPLYING its geometry — the 2026-09-03
 * verdict's named gap. Solved contours now become real SCDL `part` blocks that
 * the ordinary grammar parses: text, diffable, refusing through the same SCDL
 * diagnostics authored parts refuse through.
 */

import { describe, it, expect } from 'vitest';
import {
  constructionToSCDLParts, CONSTRUCTION_SCDL_CONTRACT,
} from '../../../../codex/core/pixelbrain/construction-to-scdl.js';
import { compileAsset, CONSTRUCTION_LINK } from '../../../../codex/core/pixelbrain/asset-pipeline.js';
import { compileSCDL } from '../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { createConstruction, trySolve } from '../../../../codex/core/pixelbrain/construction/index.js';

const SOLVED = {
  parts: {
    blade: { closedContour: [[1, 1], [5, 1], [5, 5], [1, 5]] },
    ribbon: { leftBank: [[0, 8], [4, 8]], rightBank: [[0, 10], [4, 10]] },
    spineOnly: { spine: [[0, 0], [1, 1], [2, 2]] },
    degenerate: { closedContour: [[2, 2], [4, 2], [3, 2]] }, // collinear after rounding
    empty: {},
  },
};

describe('constructionToSCDLParts', () => {
  it('maps closed contours and ribbons to polygon parts; records honest skips', () => {
    const r = constructionToSCDLParts(SOLVED, {
      colorByPart: { blade: '#FF0000', ribbon: 'blade_darksteel', spineOnly: '#00FF00', degenerate: '#0000FF', empty: '#FFFFFF' },
    });
    expect(r.contract).toBe(CONSTRUCTION_SCDL_CONTRACT);
    expect(r.parts.map(p => p.partId)).toEqual(['blade', 'ribbon']);
    expect(r.parts[0].scdlPartId).toBe('cg_blade');
    expect(r.parts[1].points).toEqual([[0, 8], [4, 8], [4, 10], [0, 10]]); // ribbon closed
    const reasons = Object.fromEntries(r.skipped.map(s => [s.partId, s.reason]));
    expect(reasons.spineOnly).toMatch(/no fill surface/);
    expect(reasons.degenerate).toMatch(/degenerate/);
    expect(reasons.empty).toMatch(/no closed contour/);
  });

  it('skips a part with no colour assigned — colour remains art direction, never defaulted', () => {
    const r = constructionToSCDLParts(SOLVED, { colorByPart: { blade: '#FF0000' } });
    expect(r.parts.map(p => p.partId)).toEqual(['blade']);
    expect(r.skipped.find(s => s.partId === 'ribbon').reason).toMatch(/no colour/);
  });

  it('is deterministic: same input, same bytes, same checksum', () => {
    const opts = { colorByPart: { blade: '#FF0000', ribbon: '#00FF00' } };
    const first = constructionToSCDLParts(SOLVED, opts);
    for (let i = 0; i < 50; i += 1) {
      const again = constructionToSCDLParts(SOLVED, opts);
      expect(again.source).toBe(first.source);
      expect(again.partsChecksum).toBe(first.partsChecksum);
    }
  });

  it('produces source the real SCDL grammar parses into coordinates', () => {
    const r = constructionToSCDLParts(SOLVED, { colorByPart: { blade: '#FF0000' } });
    const src = `asset derived canvas 8x8\npalette { }\n${r.source}\nexport png`;
    const compiled = compileSCDL(src, { strict: false });
    expect(compiled.fatal).toBeFalsy();
    const cells = compiled.packet.geometry.coordinates.filter(c => c.partId === 'cg_blade');
    expect(cells.length).toBeGreaterThanOrEqual(16); // the 4x4 contour interior
  });

  it('rejects a non-solved input instead of guessing', () => {
    expect(() => constructionToSCDLParts(null, {})).toThrow(/solved result/);
    expect(() => constructionToSCDLParts({ parts: null }, {})).toThrow(/solved result/);
  });

  // ── Integration through compileAsset ──────────────────────────────────────

  const orbSpec = {
    id: 'test-orb', canvas: { width: 16, height: 16 },
    anchors: { 'orb.center': [8, 8] },
    parts: [{ id: 'orb', primitive: { kind: 'ellipse', center: { anchor: 'orb.center' }, radiusX: 5, radiusY: 4 } }],
    constraints: [],
  };
  const baseSource = 'asset t canvas 16x16\npalette { c = #D4AF37 }\npart p material gold { rect 0 0 2 2 c }\nexport png';

  it('compileAsset derives construction geometry into the compiled packet (link: derived)', () => {
    const result = compileAsset(baseSource, {
      construction: orbSpec,
      deriveConstructionParts: { colorByPart: { orb: '#FF0000' } },
      scale: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.lineage.construction.link).toBe(CONSTRUCTION_LINK.DERIVED);
    expect(result.lineage.construction.partsChecksum).toMatch(/^[0-9a-f]{8}$/);
    expect(result.diagnostics.construction.derivedParts.partIds).toEqual(['orb']);
    // The derived disc actually reaches pixels: cells inside the orb are opaque.
    const W = result.raster.width;
    expect(result.raster.data[(8 * W + 8) * 4 + 3]).toBe(255);
  });

  it('without deriveConstructionParts the same construction still links as gate only', () => {
    const result = compileAsset(baseSource, { construction: orbSpec });
    expect(result.ok).toBe(true);
    expect(result.lineage.construction.link).toBe(CONSTRUCTION_LINK.GATE);
    expect(result.lineage.construction.partsChecksum).toBeUndefined();
  });

  it('refuses when derivation yields zero parts — never silently compiles nothing', () => {
    const result = compileAsset(baseSource, {
      construction: orbSpec,
      deriveConstructionParts: { colorByPart: {} }, // orb gets skipped: no colour
    });
    expect(result.ok).toBe(false);
    expect(String(result.errors[0].message)).toMatch(/produced zero parts/);
    expect(String(result.errors[0].message)).toMatch(/no colour/);
  });

  it('refuses deriveConstructionParts without a construction', () => {
    const result = compileAsset(baseSource, { deriveConstructionParts: { colorByPart: {} } });
    expect(result.ok).toBe(false);
    expect(String(result.errors[0].message)).toMatch(/requires options.construction/);
  });

  it('derivation is deterministic through the whole pipeline', () => {
    const opts = { construction: orbSpec, deriveConstructionParts: { colorByPart: { orb: '#FF0000' } }, scale: 2 };
    const a = compileAsset(baseSource, opts);
    const b = compileAsset(baseSource, opts);
    expect(a.lineage.construction.partsChecksum).toBe(b.lineage.construction.partsChecksum);
    expect(Array.from(a.raster.data)).toEqual(Array.from(b.raster.data));
  });

  it('works against a real solved construction packet, not just a plain object', () => {
    const packet = createConstruction(orbSpec);
    const solved = trySolve(packet);
    expect(solved.error).toBeNull();
    const r = constructionToSCDLParts(solved.result, { colorByPart: { orb: '#FF0000' } });
    expect(r.parts.length).toBe(1);
    expect(r.parts[0].op).toBe('polygon');
    expect(r.parts[0].points.length).toBeGreaterThanOrEqual(8);
  });
});
