/**
 * Second asset crossing — proves the wire projection generalizes.
 *
 * Slice 1 proved one asset (holy_fire_claymore, 788 coords, 24 fields).
 * Slice 2 proves a structurally different asset: pixelbrain-painted-basic
 * has 2 coordinates, MISSING most fields (no emphasis, no energies, no
 * partId, no shading, no motifRole, no squareAmpClass, no source, no
 * structuralEnergy, no localContrastDelta, no nx/ny, no isRim/isMotif).
 *
 * The wire must handle absent fields gracefully — zero-fill scalars,
 * ABSENT_ID for null categoricals, zero-fill energy channels — without
 * inventing data the packet does not contain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPythonWire, serializeWirePacket, assertNoNulls } from '../../../../codex/core/blender-bridge/wire.js';
import { ABSENT_ID } from '../../../../codex/core/blender-bridge/intern.js';
import { renderSCD64, classifyDivergence } from '../../../../codex/core/blender-bridge/render-scd64.js';
import { mintReceipt, compareReceipts, hashPixelBuffer } from '../../../../codex/core/blender-bridge/receipt.js';

const asset1 = JSON.parse(readFileSync('output/holy_fire_claymore.pbrain', 'utf8'));
const asset2 = JSON.parse(readFileSync('tests/fixtures/godot-export/pixelbrain-painted-basic.pbrain', 'utf8'));

describe('second asset: pixelbrain-painted-basic', () => {
  it('has a different structure from the first asset', () => {
    expect(asset2.coordinates).toHaveLength(2);
    expect(asset2.canvas.width).toBe(2);
    expect(asset2.canvas.height).toBe(2);
    // This asset is missing most fields
    const c = asset2.coordinates[0];
    expect(c.emphasis).toBeUndefined();
    expect(c.energies).toBeUndefined();
    expect(c.partId).toBeUndefined();
    expect(c.shading).toBeUndefined();
    expect(c.structuralEnergy).toBeUndefined();
  });

  it('projects to a valid wire with 2 coordinates', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    expect(wire.coordinateCount).toBe(2);
    expect(wire.positions.x).toHaveLength(2);
    expect(wire.positions.y).toHaveLength(2);
    expect(wire.attributes.pb_emphasis).toHaveLength(2);
  });

  it('zero-fills absent scalar fields', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    // emphasis is absent → quantize(0, 1e6) = 0
    expect(wire.attributes.pb_emphasis).toEqual([0, 0]);
    expect(wire.attributes.pb_structural_energy).toEqual([0, 0]);
    expect(wire.attributes.pb_local_contrast_delta).toEqual([0, 0]);
  });

  it('maps absent categoricals to ABSENT_ID', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    // partId is absent → intern lookup returns ABSENT_ID (-1)
    expect(wire.attributes.pb_part_id).toEqual([ABSENT_ID, ABSENT_ID]);
    expect(wire.attributes.pb_shading).toEqual([ABSENT_ID, ABSENT_ID]);
    expect(wire.attributes.pb_motif_role).toEqual([ABSENT_ID, ABSENT_ID]);
  });

  it('zero-fills all energy channels', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    for (let t = 0; t < 8; t++) {
      expect(wire.energy[String(t)]).toEqual([0, 0]);
    }
  });

  it('preserves the colors that DO exist', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    // First coord: #FFD166 = 0xFFD166 = 16765286
    expect(wire.colors.color[0]).toBe(0xFFD166);
    // Second coord: #FFFFFF = 0xFFFFFF = 16777215
    expect(wire.colors.color[1]).toBe(0xFFFFFF);
  });

  it('contains no nulls anywhere', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    expect(() => assertNoNulls(wire)).not.toThrow();
  });

  it('serializes deterministically', () => {
    const a = serializeWirePacket(asset2, { colorPolicy: 'EXACT' });
    const b = serializeWirePacket(asset2, { colorPolicy: 'EXACT' });
    expect(a).toBe(b);
  });

  it('produces a different wire from the first asset', () => {
    const w1 = serializeWirePacket(asset1, { colorPolicy: 'EXACT' });
    const w2 = serializeWirePacket(asset2, { colorPolicy: 'EXACT' });
    expect(w1).not.toBe(w2);
  });
});

describe('second asset: receipt minting', () => {
  it('mints a receipt from a simulated claim', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    const pixels = Buffer.from('fake-pixel-data-for-asset-2');
    const hash = hashPixelBuffer(pixels);

    const claim = {
      engine: 'blender',
      packetId: wire.packetId,
      sourceChecksum: wire.sourceChecksum,
      synthClass: 'RASTER',
      observed: {
        resolutionX: 2,
        resolutionY: 2,
        engine: 'CYCLES',
        device: 'CPU',
        seed: 7,
        samples: 64,
        blenderVersion: '5.2.0',
        buildHash: 'fbe6228777e7',
      },
    };

    const receipt = mintReceipt(claim, hash);
    expect(receipt.scd64).toMatch(/^[0-9A-F]{64}$/);
    expect(receipt.pixelDumpHash).toBe(hash);
  });

  it('two receipts from the same asset and pixels yield REPRODUCED', () => {
    const wire = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    const pixels = Buffer.from('identical-pixels');
    const hash = hashPixelBuffer(pixels);

    const claim = {
      engine: 'blender',
      packetId: wire.packetId,
      sourceChecksum: wire.sourceChecksum,
      synthClass: 'RASTER',
      observed: { resolutionX: 2, resolutionY: 2, seed: 7, samples: 64 },
    };

    const r1 = mintReceipt(claim, hash);
    const r2 = mintReceipt(claim, hash);
    const result = compareReceipts(r1, r2);
    expect(result.verdict).toBe('REPRODUCED');
    expect(result.pixelMatch).toBe(true);
  });

  it('receipts from different assets yield different SCD64s', () => {
    const w1 = toPythonWire(asset1, { colorPolicy: 'EXACT' });
    const w2 = toPythonWire(asset2, { colorPolicy: 'EXACT' });
    const pixels = Buffer.from('same-pixels');
    const hash = hashPixelBuffer(pixels);

    const claim1 = {
      engine: 'blender', packetId: w1.packetId, sourceChecksum: w1.sourceChecksum,
      synthClass: 'RASTER', observed: { resolutionX: 160, resolutionY: 160, seed: 7, samples: 64 },
    };
    const claim2 = {
      engine: 'blender', packetId: w2.packetId, sourceChecksum: w2.sourceChecksum,
      synthClass: 'RASTER', observed: { resolutionX: 2, resolutionY: 2, seed: 7, samples: 64 },
    };

    const r1 = mintReceipt(claim1, hash);
    const r2 = mintReceipt(claim2, hash);
    expect(r1.scd64).not.toBe(r2.scd64);

    const div = classifyDivergence(r1.scd64, r2.scd64);
    // SCENE_GRAPH and FRAME_SYS should differ (different packets, different resolution)
    expect(div.differentBlocks).toContain('SCENE_GRAPH');
    expect(div.differentBlocks).toContain('FRAME_SYS');
  });
});

describe('determinism replay', () => {
  it('100-iteration replay of second asset wire is identical', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(serializeWirePacket(asset2, { colorPolicy: 'EXACT' }));
    }
    expect(new Set(results).size).toBe(1);
  });
});
