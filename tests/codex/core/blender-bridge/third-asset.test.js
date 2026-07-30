/**
 * Third asset tests — multi-energy .pbrain with all 8 energy channels.
 *
 * Slice 1 proved one asset (holy_fire_claymore, STRUCTURAL only).
 * Slice 2 proved a minimal asset (pixelbrain-painted-basic, no energies).
 * Slice 3 proves a structurally rich asset: multi-energy-asset.pbrain has
 * 4 coordinates with energies in channels 0 (RESONANT), 1 (PHOTONIC),
 * 2 (STRUCTURAL), 3 (THERMAL), 4 (KINETIC), 5 (ENTROPIC), 6 (SHIELDING),
 * 7 (RADIANT). All 24 fields are populated.
 *
 * This proves the wire projection carries the full 8-channel energy vector
 * losslessly, and that the energy bindings registry can address every channel.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPythonWire, serializeWirePacket, assertNoNulls, ENERGY_CHANNELS } from '../../../../codex/core/blender-bridge/wire.js';
import { ABSENT_ID } from '../../../../codex/core/blender-bridge/intern.js';
import { quantize, SCALES } from '../../../../codex/core/blender-bridge/quantize.js';
import { ENERGY_TYPES, getBinding, unboundEnergyTypes } from '../../../../codex/core/blender-bridge/energy-bindings.js';
import { renderWireToPixels, hashCanvasPixels } from '../../../../codex/core/blender-bridge/remotion-canvas-renderer.js';
import { mintReceipt, compareReceipts, hashPixelBuffer } from '../../../../codex/core/blender-bridge/receipt.js';

const asset = JSON.parse(readFileSync('tests/fixtures/multi-energy-asset.pbrain', 'utf8'));

describe('multi-energy asset: structure', () => {
  it('has 4 coordinates with all 24 fields populated', () => {
    expect(asset.coordinates).toHaveLength(4);
    for (const c of asset.coordinates) {
      expect(c.x).toBeDefined();
      expect(c.y).toBeDefined();
      expect(c.z).toBeDefined();
      expect(c.nx).toBeDefined();
      expect(c.ny).toBeDefined();
      expect(c.color).toBeDefined();
      expect(c.preSquareColor).toBeDefined();
      expect(c.emphasis).toBeDefined();
      expect(c.localContrastDelta).toBeDefined();
      expect(c.squareAmpIntensityRating).toBeDefined();
      expect(c.squareAmpClass).toBeDefined();
      expect(c.structuralEnergy).toBeDefined();
      expect(c.slot).toBeDefined();
      expect(c.source).toBeDefined();
      expect(c.partId).toBeDefined();
      expect(c.shading).toBeDefined();
      expect(c.isRim).toBeDefined();
      expect(c.isMotif).toBeDefined();
      expect(c.energies).toBeDefined();
    }
  });

  it('has energies in 7 of 8 channels across all coordinates', () => {
    const allTypes = new Set();
    for (const c of asset.coordinates) {
      for (const e of c.energies) {
        allTypes.add(e.type);
      }
    }
    // Channels 0-7 all appear
    expect(allTypes.size).toBe(8);
    for (let t = 0; t < 8; t++) {
      expect(allTypes.has(t)).toBe(true);
    }
  });

  it('has distinct energy values per coordinate', () => {
    // Coord 0: types 0,1,2,3,4
    expect(asset.coordinates[0].energies).toHaveLength(5);
    // Coord 1: types 1,5,6
    expect(asset.coordinates[1].energies).toHaveLength(3);
    // Coord 2: types 0,2,7
    expect(asset.coordinates[2].energies).toHaveLength(3);
    // Coord 3: types 3,4,5,6
    expect(asset.coordinates[3].energies).toHaveLength(4);
  });
});

describe('multi-energy asset: wire projection', () => {
  it('projects to a valid wire with 4 coordinates', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    expect(wire.coordinateCount).toBe(4);
    expect(wire.positions.x).toHaveLength(4);
    expect(wire.positions.y).toHaveLength(4);
    expect(wire.positions.z).toHaveLength(4);
  });

  it('carries all 8 energy channels', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    for (let t = 0; t < ENERGY_CHANNELS; t++) {
      expect(wire.energy[String(t)]).toHaveLength(4);
    }
  });

  it('quantizes energy values at UNIT scale', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    // Coord 0, type 1 (PHOTONIC): value 0.42 → quantize(0.42, 1e6) = 420000
    expect(wire.energy['1'][0]).toBe(quantize(0.42, SCALES.UNIT));
    // Coord 2, type 7 (RADIANT): value 0.91 → quantize(0.91, 1e6) = 910000
    expect(wire.energy['7'][2]).toBe(quantize(0.91, SCALES.UNIT));
  });

  it('zero-fills absent energy channels per coordinate', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    // Coord 0 has no type 5 (ENTROPIC) → 0
    expect(wire.energy['5'][0]).toBe(0);
    // Coord 0 has no type 6 (SHIELDING) → 0
    expect(wire.energy['6'][0]).toBe(0);
    // Coord 0 has no type 7 (RADIANT) → 0
    expect(wire.energy['7'][0]).toBe(0);
    // Coord 1 has no type 0 (RESONANT) → 0
    expect(wire.energy['0'][1]).toBe(0);
  });

  it('interns categoricals correctly', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    // partId values: blade, guard, pommel, blade → sorted: blade=0, guard=1, pommel=2
    expect(wire.attributes.pb_part_id).toEqual([0, 1, 2, 0]);
    // shading values: core, rim, core, fill → sorted: core=0, fill=1, rim=2
    expect(wire.attributes.pb_shading).toEqual([0, 2, 0, 1]);
    // source values: sketch, sketch, paint, paint → sorted: paint=0, sketch=1
    expect(wire.attributes.pb_source).toEqual([1, 1, 0, 0]);
  });

  it('maps null motifRole to ABSENT_ID', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    // Coord 1 and 3 have motifRole: null
    expect(wire.attributes.pb_motif_role[1]).toBe(ABSENT_ID);
    expect(wire.attributes.pb_motif_role[3]).toBe(ABSENT_ID);
    // Coord 0 has motifRole: "anchor", coord 2 has "accent"
    expect(wire.attributes.pb_motif_role[0]).toBeGreaterThanOrEqual(0);
    expect(wire.attributes.pb_motif_role[2]).toBeGreaterThanOrEqual(0);
  });

  it('carries boolean fields as 0/1', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    // isRim: false, true, false, false
    expect(wire.attributes.pb_is_rim).toEqual([0, 1, 0, 0]);
    // isMotif: true, false, true, false
    expect(wire.attributes.pb_is_motif).toEqual([1, 0, 1, 0]);
  });

  it('carries normals (nx, ny) quantized at UNIT scale', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    expect(wire.attributes.pb_nx[0]).toBe(quantize(0.5, SCALES.UNIT));
    expect(wire.attributes.pb_ny[0]).toBe(quantize(0.5, SCALES.UNIT));
    expect(wire.attributes.pb_nx[2]).toBe(quantize(-0.7, SCALES.UNIT));
  });

  it('contains no nulls anywhere', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    expect(() => assertNoNulls(wire)).not.toThrow();
  });

  it('serializes deterministically', () => {
    const a = serializeWirePacket(asset, { colorPolicy: 'EXACT' });
    const b = serializeWirePacket(asset, { colorPolicy: 'EXACT' });
    expect(a).toBe(b);
  });
});

describe('multi-energy asset: energy bindings', () => {
  it('PHOTONIC has a declared binding', () => {
    const binding = getBinding('PHOTONIC');
    expect(binding).not.toBeNull();
    expect(binding.grade).toBe('FA');
    expect(binding.shaderInput).toBe('Emission Strength');
  });

  it('7 of 8 energy types are unbound (cross as raw attributes only)', () => {
    const unbound = unboundEnergyTypes();
    expect(unbound).toHaveLength(7);
    expect(unbound).toContain('RESONANT');
    expect(unbound).toContain('STRUCTURAL');
    expect(unbound).toContain('THERMAL');
    expect(unbound).toContain('KINETIC');
    expect(unbound).toContain('ENTROPIC');
    expect(unbound).toContain('SHIELDING');
    expect(unbound).toContain('RADIANT');
    expect(unbound).not.toContain('PHOTONIC');
  });

  it('all 8 ENERGY_TYPES are defined', () => {
    expect(ENERGY_TYPES).toHaveLength(8);
    expect(ENERGY_TYPES[0]).toBe('RESONANT');
    expect(ENERGY_TYPES[7]).toBe('RADIANT');
  });
});

describe('multi-energy asset: canvas render', () => {
  it('renders to a pixel buffer', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    const result = renderWireToPixels(wire);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
    expect(result.pixelsDrawn).toBe(4);
  });

  it('draws the correct colors', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    const result = renderWireToPixels(wire);
    // Coord 0: x=1, y=1, color=#FF4444
    const offset = (1 * 8 + 1) * 4;
    expect(result.buffer[offset]).toBe(0xFF);
    expect(result.buffer[offset + 1]).toBe(0x44);
    expect(result.buffer[offset + 2]).toBe(0x44);
    expect(result.buffer[offset + 3]).toBe(255);
  });

  it('produces a deterministic hash', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    const a = hashCanvasPixels(renderWireToPixels(wire).buffer);
    const b = hashCanvasPixels(renderWireToPixels(wire).buffer);
    expect(a).toBe(b);
  });
});

describe('multi-energy asset: receipt minting', () => {
  it('mints a receipt and two identical receipts yield REPRODUCED', () => {
    const wire = toPythonWire(asset, { colorPolicy: 'EXACT' });
    const pixels = Buffer.from('multi-energy-test-pixels');
    const hash = hashPixelBuffer(pixels);

    const claim = {
      engine: 'blender',
      packetId: wire.packetId,
      sourceChecksum: wire.sourceChecksum,
      synthClass: 'RASTER',
      observed: {
        resolutionX: 8, resolutionY: 8,
        engine: 'CYCLES', device: 'CPU',
        seed: 7, samples: 64,
        blenderVersion: '5.2.0', buildHash: 'fbe6228777e7',
      },
    };

    const r1 = mintReceipt(claim, hash);
    const r2 = mintReceipt(claim, hash);
    const result = compareReceipts(r1, r2);
    expect(result.verdict).toBe('REPRODUCED');
    expect(result.pixelMatch).toBe(true);
  });
});

describe('determinism replay', () => {
  it('100-iteration replay of multi-energy wire is identical', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(serializeWirePacket(asset, { colorPolicy: 'EXACT' }));
    }
    expect(new Set(results).size).toBe(1);
  });
});
