import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';

const SOURCE = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8');

describe('SCDL v2 compiler vertical slice', () => {
  it('emits canonical bytecode, immutable IR, and a real asset packet', () => {
    const result = compileSCDLV2(SOURCE);
    expect(result.ok).toBe(true);
    expect(result.contract).toBe('SCDL-COMPILE-RESULT-v2');
    expect(result.bytecode.contract).toBe('SCDL-BC-v2');
    expect(result.package.contract).toBe('SCDL-PACKAGE-v2');
    expect(result.packet.kind).toBe('pixelbrain.asset.v1');
    expect(result.packet.id).toBe(`pbasset_${result.bytecode.programId.slice('scdlbc_'.length)}`);
    expect(result.packet.geometry.coordinates).toContainEqual(expect.objectContaining({ x: 1, y: 1, color: '#ffffff' }));
    expect(Object.isFrozen(result.package)).toBe(true);
  });

  it('is deterministic across repeated compilation', () => {
    const a = compileSCDLV2(SOURCE);
    const b = compileSCDLV2(SOURCE);
    expect(b.bytecode.text).toBe(a.bytecode.text);
    expect(b.bytecode.programId).toBe(a.bytecode.programId);
    expect(b.packet).toEqual(a.packet);
  });

  it.each(['', null, 'SCDL 2\n', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $x (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))', 'SCDL 2\n@'])('never throws and never emits partial output for %j', (source) => {
    expect(() => compileSCDLV2(source)).not.toThrow();
    const result = compileSCDLV2(source);
    expect(result.ok).toBe(false);
    expect(result.analysis).toBeNull();
    expect(result.bytecode).toBeNull();
    expect(result.package).toBeNull();
    expect(result.packet).toBeNull();
    expect(result.framePackets).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.errors.every((item) => typeof item.isError === 'function' && item.isError())).toBe(true);
    expect(result.diagnostics).toEqual(result.diagnosticReport.diagnostics);
  });

  it('compiles a leading-BOM minimal v2 program', () => {
    const source = '\uFEFFSCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\nLAYER ink ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }\n';
    const result = compileSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.languageVersion).toBe(2);
  });

  it('publishes resolved IR as analysis and records options.strict without warn-as-error', () => {
    const result = compileSCDLV2(SOURCE, { strict: true });
    expect(result.ok).toBe(true);
    expect(result.analysis).toEqual(expect.objectContaining({
      assetId: 'exact_orb',
      canvas: { width: 9, height: 9 },
    }));
    expect(result.analysis).not.toHaveProperty('symbols');
    expect(result.regressionSeed.options).toEqual({ strict: true });
    expect(result.regressionSeed.checksum).toBe(result.bytecode.programId);
    expect(result.packet.palette.sourcePalette[0].colors).toEqual([
      ...new Set(result.packet.geometry.coordinates.map((cell) => cell.color)),
    ]);
  });

  it('compiles the Phase 3 golden fixture fibonacci-bloom.scdl end-to-end', () => {
    const fixtureSource = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl'), 'utf8');
    const result = compileSCDLV2(fixtureSource);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.bytecode.programId).toBe('scdlbc_64c9884a');
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(result.package.verifiedBudget.limits.recursionDepth).toBe(16);
  });
});
