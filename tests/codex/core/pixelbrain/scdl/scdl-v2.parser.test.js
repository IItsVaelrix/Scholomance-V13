import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { getSCDLV2Opcode, listSCDLV2Opcodes } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js';

const VALID = `SCDL 2
ASSET exact_orb
CANVAS WIDTH 9 HEIGHT 9
CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))
LAYER ink ORDER 10 {
  PAINT $orb FILL $ink RASTER MIDPOINT
}`;

describe('SCDL v2 parser', () => {
  it('builds a lossless CST and strict AST', () => {
    const result = parseSCDLV2(VALID);
    expect(result.ok).toBe(true);
    expect(result.cst.tokens.map((token) => token.raw).join('')).toBe(VALID);
    expect(result.ast.declarations.map((node) => node.kind)).toEqual([
      'VersionDeclaration', 'AssetDeclaration', 'CanvasDeclaration',
      'ConstDeclaration', 'ConstDeclaration', 'ConstDeclaration',
      'ShapeDeclaration', 'LayerDeclaration',
    ]);
    expect(Object.isFrozen(result.ast)).toBe(true);
  });

  it('reports a missing named operand without inventing a radius', () => {
    const result = parseSCDLV2(VALID.replace(' RADIUS (PX $two)', ''));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-PARSE-004' && d.expected.includes('RADIUS PX'))).toBe(true);
    expect(result.ast).toBeNull();
  });

  it('synchronizes at newline/block boundaries and reports two unknown statements', () => {
    const source = VALID.replace('CONST $two', 'WOBBLE $bad\nCONST $two').replace('CONST $ink', 'SPARKLE $bad\nCONST $ink');
    const result = parseSCDLV2(source);
    expect(result.diagnostics.filter((d) => d.code === 'SCDL-PARSE-001')).toHaveLength(2);
  });

  it('registry IDs are unique and metadata-complete', () => {
    const rows = listSCDLV2Opcodes();
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row).toEqual(expect.objectContaining({ mnemonic: expect.any(String), scope: expect.any(Array), operands: expect.any(Array), purity: expect.any(String), cost: expect.any(Number), capability: expect.any(String), version: expect.any(String), docs: expect.any(String) }));
    }
  });

  it('accepts compact layer blocks and repeated symbol declarations as syntax', () => {
    const source = `${VALID.replace(/LAYER[\s\S]*$/, 'CONST $two I32 2\nLAYER ink ORDER 10 { PAINT $orb FILL $ink RASTER MIDPOINT }')}`;
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.ast.declarations.filter((node) => node.kind === 'ConstDeclaration' && node.symbol === '$two')).toHaveLength(2);
    expect(result.ast.declarations.at(-1).body).toHaveLength(1);
  });

  it('rejects duplicate structural declarations but not duplicate symbols', () => {
    const result = parseSCDLV2(VALID.replace('ASSET exact_orb', 'ASSET exact_orb\nASSET duplicate'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter((d) => d.code === 'SCDL-PARSE-003')).toHaveLength(1);
    expect(result.ast).toBeNull();
  });

  it('rejects bytecode-only and lowercase opcodes in source', () => {
    const bytecode = parseSCDLV2(VALID.replace('CONST $two I32 (ADD 1 1)', 'BC.CONST $two'));
    const lowercase = parseSCDLV2(VALID.replace('SHAPE $orb', 'shape $orb'));
    expect(bytecode.diagnostics.some((d) => d.code === 'SCDL-PARSE-001' && d.received.includes('BC.CONST'))).toBe(true);
    expect(lowercase.diagnostics.some((d) => d.code === 'SCDL-PARSE-001' && d.received.includes('shape'))).toBe(true);
  });

  it.each([
    ['duplicate', '(CIRCLE CENTER $center CENTER $center RADIUS (PX $two))', 'SCDL-PARSE-005'],
    ['unknown', '(CIRCLE ORIGIN $center RADIUS (PX $two))', 'SCDL-PARSE-006'],
  ])('reports a %s named operand', (_label, replacement, code) => {
    const result = parseSCDLV2(VALID.replace('(CIRCLE CENTER $center RADIUS (PX $two))', replacement));
    expect(result.diagnostics.some((d) => d.code === code)).toBe(true);
    expect(result.ast).toBeNull();
  });

  it('reports an unbalanced layer without discarding the lossless CST', () => {
    const source = VALID.slice(0, -1);
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-PARSE-007')).toBe(true);
    expect(result.cst.tokens.map((token) => token.raw).join('')).toBe(source);
  });

  it('retains lexical diagnostics and returns no AST after a lexical error', () => {
    const result = parseSCDLV2(VALID.replace('ASSET exact_orb', 'ASSET exact_orb @'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-LEX-001')).toBe(true);
    expect(result.ast).toBeNull();
  });

  it('skips comments between tokens without breaking statement termination', () => {
    const source = VALID.replace('SCDL 2\n', 'SCDL 2 # pin the language version\n');
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('reports missing required structural declarations instead of proceeding without them', () => {
    const missingAsset = parseSCDLV2(VALID.replace('ASSET exact_orb\n', ''));
    expect(missingAsset.ok).toBe(false);
    expect(missingAsset.diagnostics.some((d) => d.code === 'SCDL-PARSE-004' && d.expected.includes('ASSET'))).toBe(true);
    expect(missingAsset.ast).toBeNull();

    const missingCanvas = parseSCDLV2(VALID.replace('CANVAS WIDTH 9 HEIGHT 9\n', ''));
    expect(missingCanvas.diagnostics.some((d) => d.code === 'SCDL-PARSE-004' && d.expected.includes('CANVAS'))).toBe(true);
  });

  it('exposes permanent frozen opcode metadata and a recursively frozen AST', () => {
    const rows = listSCDLV2Opcodes();
    expect(getSCDLV2Opcode('CIRCLE').id).toBe(0x0201);
    expect(getSCDLV2Opcode('circle')).toBeNull();
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(Object.isFrozen(rows[0].scope)).toBe(true);
    expect(Object.isFrozen(rows[0].operands)).toBe(true);
    expect(Object.isFrozen(rows[0].operands[0])).toBe(true);

    const result = parseSCDLV2(VALID);
    const layer = result.ast.declarations.at(-1);
    expect(Object.isFrozen(result.ast.declarations)).toBe(true);
    expect(Object.isFrozen(layer)).toBe(true);
    expect(Object.isFrozen(layer.body)).toBe(true);
    expect(Object.isFrozen(layer.body[0].named)).toBe(true);
  });
});
