/**
 * SCDL Compiler Tests — Pass pipeline
 */

import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { buildSCDLDiagnosticReport } from '../../../../../codex/core/pixelbrain/scdl/scdl.diagnostics.js';

const VALID_SOURCE = `
asset void_chestplate canvas 64x64

palette {
  void0 = #05060D
  gold2 = #D8B84C
  cyan2 = #00E5FF
}

part torso material voidsteel {
  fill void0
  rim gold2 at north west
}

part gem material cyan_glow {
  cell 31 18 cyan2
  glow radius 2
}

export json svg phaser
`.trim();

describe('SCDL Compiler — compileSCDL', () => {
  it('compiles a valid source to ok=true', () => {
    const result = compileSCDL(VALID_SOURCE);
    expect(result.ok).toBe(true);
    expect(result.ast).toBeTruthy();
    expect(result.packet).toBeTruthy();
  });

  it('never throws — always returns a result object', () => {
    expect(() => compileSCDL('')).not.toThrow();
    expect(() => compileSCDL(null)).not.toThrow();
    expect(() => compileSCDL('garbage @@@')).not.toThrow();
  });

  it('returns ok=false for empty source', () => {
    const result = compileSCDL('');
    expect(result.ok).toBe(false);
    expect(result.packet).toBeNull();
  });

  it('result has required shape', () => {
    const result = compileSCDL(VALID_SOURCE);
    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.regressionSeed).toBeTruthy();
  });

  it('packet has a stable id', () => {
    const result = compileSCDL(VALID_SOURCE);
    expect(typeof result.packet.id).toBe('string');
    expect(result.packet.id.length).toBeGreaterThan(0);
  });

  it('packet is the correct kind', () => {
    const result = compileSCDL(VALID_SOURCE);
    expect(result.packet.kind).toBe('pixelbrain.asset.v1');
  });

  it('resolves palette aliases in cell ops', () => {
    const src = `asset x canvas 8x8\npalette { c = #00FF00 }\npart a material source {\n  cell 0 0 c\n}\nexport json`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(true);
    const coords = result.packet.geometry.coordinates;
    const cell = coords.find(c => c.x === 0 && c.y === 0);
    expect(cell?.color).toBe('#00FF00');
  });

  it('emits a WARN for unknown material (not fatal)', () => {
    const src = `asset x canvas 8x8\npart a material does_not_exist {\n  cell 0 0 #FF0000\n}\nexport json`;
    const result = compileSCDL(src);
    // Should still compile — material warning is not fatal
    expect(result.ok).toBe(true);
    const warns = result.errors.filter(e => e.isWarn && e.isWarn());
    expect(warns.length).toBeGreaterThan(0);
  });

  it('errors on invalid hex color', () => {
    const src = `asset x canvas 8x8\npalette { c = #GGGGGG }\npart a material source {\n  cell 0 0 c\n}\nexport json`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(false);
    const errs = result.errors.filter(e => e.isError && e.isError());
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.label === 'SCDL-004')).toBe(true);
  });

  it('errors on out-of-bounds cell', () => {
    const src = `asset x canvas 4x4\npart a material source {\n  cell 99 99 #FF0000\n}\nexport json`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(false);
    const oob = result.errors.find(e => e.label === 'SCDL-007');
    expect(oob).toBeTruthy();
  });

  it('stores trace as intent (no cell output, no error)', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  trace outline from image.region("body")\n}\nexport json`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(true);
    const traceErrors = result.errors.filter(e => e.label === 'SCDL-007');
    expect(traceErrors).toHaveLength(0);
  });

  it('glow is stored as noise descriptor hint, not a cell', () => {
    const src = `asset x canvas 8x8\npart gem material source {\n  glow radius 3\n}\nexport json`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(true);
    // Should have a noiseDescriptor in the ast part
    const gemPart = result.ast.parts.find(p => p.id === 'gem');
    expect(gemPart?.noiseDescriptors?.length).toBeGreaterThan(0);
    expect(gemPart.noiseDescriptors[0].type).toBe('glow');
    expect(gemPart.noiseDescriptors[0].amplitude).toBe(3);
  });

  it('all diagnostics carry bytecodeString', () => {
    const src = `asset x canvas 4x4\npart a material source {\n  cell 99 99 #FF0000\n}\nexport json`;
    const result = compileSCDL(src);
    for (const d of result.diagnostics) {
      expect(typeof d.bytecodeString).toBe('string');
      expect(d.bytecodeString.startsWith('PB-ERR-v1')).toBe(true);
    }
  });

  it('regressionSeed captures source and checksum', () => {
    const result = compileSCDL(VALID_SOURCE);
    expect(result.regressionSeed.source).toBe(VALID_SOURCE);
    expect(result.regressionSeed.checksum).toBeTruthy();
  });

  it('strict mode treats WARNs as errors', () => {
    const src = `asset x canvas 8x8\npart a material unknown_material {\n  cell 0 0 #FF0000\n}\nexport json`;
    const normal = compileSCDL(src);
    const strict  = compileSCDL(src, { strict: true });
    expect(normal.ok).toBe(true);
    expect(strict.ok).toBe(false);
  });

  it('errors on unknown export target', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  cell 0 0 #FF0000\n}\nexport json unreal`;
    const result = compileSCDL(src);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.label === 'SCDL-010')).toBe(true);
  });

  it('diagnostic report output is deterministic for identical results', () => {
    const src = `asset x canvas 4x4\npart a material source {\n  cell 99 99 #FF0000\n}\nexport json`;
    const a = buildSCDLDiagnosticReport(compileSCDL(src));
    const b = buildSCDLDiagnosticReport(compileSCDL(src));
    expect(a).toEqual(b);
  });
});
