/**
 * Regression cover for the geometry-precedence defect found while finalising
 * DR-2026-09-03-PIXELBRAIN-UX.
 *
 * `normalizeGeometry` preferred an inherited `geometry.coordinates` over an
 * explicitly supplied top-level `coordinates`, and every edit verb rebuilds with
 * `createPixelBrainAssetPacket({ ...packet, coordinates: edited })`. Result: a
 * packet spread silently ignored the edit and returned the pre-edit pixels, so
 * widenPauldrons / moveCore / remapTrimMaterial / transformRelativeToAnchor /
 * applyPolishDelta / cleanupOrphanPixels / enforceInnerStructuralRigidity /
 * applyDropShadow were all no-ops against a real packet. Nothing in the suite
 * noticed, because nothing asserted that an applied edit changes the art.
 */
import { describe, it, expect } from 'vitest';
import {
  createPixelBrainAssetPacket,
} from '../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';
import {
  widenPauldrons,
  moveCore,
  postForgeMetadata,
  hasInheritedEditId,
  describeEditFailures,
  POSTFORGE_PROVENANCE_KEY,
} from '../../../../codex/core/pixelbrain/edit-compiler.js';

const cell = (x, y, color = '#FF0000', partId = 'a') => ({ x, y, color, partId, material: 'source' });

function probePacket() {
  return createPixelBrainAssetPacket({
    canvas: { width: 8, height: 8 },
    coordinates: [cell(1, 1), cell(2, 1)],
    source: 'probe',
  });
}

describe('an edit that spreads a packet must actually replace its pixels', () => {
  it('top-level coordinates beat inherited geometry.coordinates', () => {
    const before = probePacket();
    const after = createPixelBrainAssetPacket({ ...before, coordinates: [cell(3, 3, '#0000FF')] });
    expect(after.geometry.coordinates).toHaveLength(1);
    expect(after.geometry.coordinates[0].x).toBe(3);
    expect(after.geometry.coordinates[0].color).toBe('#0000FF');
  });

  it('geometry.coordinates is still honoured when no explicit coordinates are given', () => {
    const before = probePacket();
    const roundTrip = createPixelBrainAssetPacket(JSON.parse(JSON.stringify(before)));
    expect(roundTrip.geometry.coordinates.length).toBe(before.geometry.coordinates.length);
  });

  it('contentDigest changes when the pixels change', () => {
    const before = probePacket();
    const after = createPixelBrainAssetPacket({ ...before, coordinates: [cell(3, 3, '#0000FF')] });
    expect(after.contentDigest).not.toBe(before.contentDigest);
  });

  it('contentDigest is recomputed, never inherited', () => {
    const before = probePacket();
    const after = createPixelBrainAssetPacket({ ...before, coordinates: [cell(3, 3, '#0000FF')] });
    expect(after.contentDigest).not.toBe(before.contentDigest);
    // stable for identical pixels regardless of construction path
    const same = createPixelBrainAssetPacket({
      canvas: { width: 8, height: 8 },
      coordinates: [cell(1, 1), cell(2, 1)],
      source: 'probe',
    });
    expect(same.contentDigest).toBe(before.contentDigest);
  });

  it('id is still inherited across an edit (documenting why contentDigest exists)', () => {
    const before = probePacket();
    const after = createPixelBrainAssetPacket({ ...before, coordinates: [cell(3, 3, '#0000FF')] });
    expect(after.id).toBe(before.id);
  });
});

describe('post-forge provenance chain', () => {
  it('appends one link per real edit and accumulates', () => {
    const base = createPixelBrainAssetPacket({
      canvas: { width: 24, height: 24 },
      coordinates: [
        { x: 8, y: 8, color: '#A58A2D', partId: 'left_pauldron', material: 'source' },
        { x: 16, y: 8, color: '#A58A2D', partId: 'right_pauldron', material: 'source' },
      ],
      source: 'probe',
    });
    const widened = widenPauldrons(base, 2);
    const moved = moveCore(widened, 1);
    const edits = moved.metadata.compatibility[POSTFORGE_PROVENANCE_KEY];
    expect(edits.map((e) => e.kind)).toEqual(['widen-part', 'move-part']);
    expect(edits[0].digestBefore).toBe(base.contentDigest);
    expect(hasInheritedEditId(moved)).toBe(true);
  });

  it('records the pixel move that the old precedence erased', () => {
    const base = createPixelBrainAssetPacket({
      canvas: { width: 24, height: 24 },
      coordinates: [{ x: 8, y: 8, color: '#A58A2D', partId: 'left_pauldron', material: 'source' }],
      source: 'probe',
    });
    const widened = widenPauldrons(base, 2);
    expect(widened.geometry.coordinates[0].x).toBe(6);
  });

  it('postForgeMetadata preserves unrelated metadata and is frozen', () => {
    const base = probePacket();
    const meta = postForgeMetadata(base, { kind: 'test-op', amount: 3 }, { keepMe: 'yes' });
    expect(meta.keepMe).toBe('yes');
    expect(Object.isFrozen(meta.compatibility[POSTFORGE_PROVENANCE_KEY])).toBe(true);
    expect(meta.compatibility[POSTFORGE_PROVENANCE_KEY][0].params).toEqual({ amount: 3 });
  });

  it('an input packet is never mutated', () => {
    const base = probePacket();
    const digestBefore = base.contentDigest;
    postForgeMetadata(base, { kind: 'test-op' });
    expect(base.contentDigest).toBe(digestBefore);
    expect(base.metadata?.compatibility?.[POSTFORGE_PROVENANCE_KEY]).toBeUndefined();
  });
});

describe('describeEditFailures', () => {
  it('names the offending cell instead of dumping the whole record', () => {
    const text = describeEditFailures([
      { code: 'OUT_OF_BOUNDS', cell: { x: -1, y: 10, partId: 'left_pauldron', color: '#A58A2D', /* … */ } },
    ]);
    expect(text).toBe('OUT_OF_BOUNDS at (-1,10 left_pauldron)');
    expect(text).not.toContain('#A58A2D');
  });

  it('truncates a long overflow list', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ code: 'OUT_OF_BOUNDS', cell: { x: i, y: 0 } }));
    const text = describeEditFailures(many, 4);
    expect(text.split(', ')).toHaveLength(4);
    expect(text).toMatch(/\+5 more$/);
  });

  it('handles a failure with no cell', () => {
    expect(describeEditFailures([{ code: 'NO_MATERIAL_AUTHORITY' }])).toBe('NO_MATERIAL_AUTHORITY');
  });

  it('widening past the canvas is rejected, loudly and briefly', () => {
    const wide = createPixelBrainAssetPacket({
      canvas: { width: 8, height: 8 },
      coordinates: [{ x: 1, y: 1, color: '#FFF', partId: 'left_pauldron', material: 'source' }],
      source: 'probe',
    });
    expect(() => widenPauldrons(wide, 5)).toThrow(/OUT_OF_BOUNDS at \(-4,1/);
  });
});
