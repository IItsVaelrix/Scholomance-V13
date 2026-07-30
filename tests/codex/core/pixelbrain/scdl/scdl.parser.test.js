/**
 * SCDL Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseSCDL, tokenize } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const BASIC_SOURCE = `
asset void_chestplate canvas 64x64

palette {
  void0 = #05060D
  gold2 = #D8B84C
}

part torso material voidsteel {
  fill void0
  rim gold2 at north west
}

export json svg
`.trim();

describe('SCDL Parser — tokenizer', () => {
  it('tokenizes hex colours correctly', () => {
    const tokens = tokenize('color = #05060D');
    const hex = tokens.find(t => t.type === 'HEX');
    expect(hex).toBeTruthy();
    expect(hex.value).toBe('#05060D');
  });

  it('tokenizes malformed hex colours for SCDL diagnostics', () => {
    const tokens = tokenize('color = #GGGGGG');
    const badHex = tokens.find(t => t.type === 'BAD_HEX');
    expect(badHex).toBeTruthy();
    expect(badHex.value).toBe('#GGGGGG');
  });

  it('skips comments', () => {
    const tokens = tokenize('# this is a comment\nasset foo canvas 10x10');
    const comments = tokens.filter(t => t.type === 'COMMENT');
    expect(comments).toHaveLength(0);
    const idents = tokens.filter(t => t.type === 'IDENT');
    expect(idents[0].value).toBe('asset');
  });

  it('tokenizes dimension 64x64 correctly', () => {
    const tokens = tokenize('canvas 64x64');
    const int1 = tokens.find(t => t.type === 'INT' && t.value === '64');
    const xsep = tokens.find(t => t.type === 'X');
    expect(int1).toBeTruthy();
    expect(xsep).toBeTruthy();
  });

  it('tokenizes strings correctly', () => {
    const tokens = tokenize('image.region("body")');
    const str = tokens.find(t => t.type === 'STRING');
    expect(str?.value).toBe('body');
  });
});

describe('SCDL Parser — parseSCDL', () => {
  it('parses a valid asset declaration', () => {
    const { rawAst, errors } = parseSCDL(BASIC_SOURCE);
    expect(rawAst).toBeTruthy();
    expect(rawAst.asset).toBe('void_chestplate');
    expect(rawAst.canvas.width).toBe(64);
    expect(rawAst.canvas.height).toBe(64);
    const fatalErrors = errors.filter(e => e.severity === 'ERROR');
    expect(fatalErrors).toHaveLength(0);
  });

  it('parses the palette block', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.palette).toMatchObject({ void0: '#05060D', gold2: '#D8B84C' });
  });

  it('parses a part block with fill and rim', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.parts).toHaveLength(1);
    const torso = rawAst.parts[0];
    expect(torso.id).toBe('torso');
    expect(torso.material).toBe('voidsteel');
    const ops = torso.ops;
    expect(ops.some(o => o.op === 'fill')).toBe(true);
    expect(ops.some(o => o.op === 'rim')).toBe(true);
  });

  it('parses export targets', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.exports).toContain('json');
    expect(rawAst.exports).toContain('svg');
  });

  it('produces a checksum', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(typeof rawAst.checksum).toBe('string');
    expect(rawAst.checksum.length).toBeGreaterThan(0);
  });

  it('parses trace intent', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  trace outline from image.region("body")\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const traceOp = rawAst.parts[0].ops.find(o => o.op === 'trace');
    expect(traceOp).toBeTruthy();
    expect(traceOp.intent).toBe(true);
    expect(traceOp.source).toContain('body');
  });

  it('parses cell op', () => {
    const src = `asset x canvas 8x8\npart gem material source {\n  cell 3 5 #00E5FF\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const cellOp = rawAst.parts[0].ops.find(o => o.op === 'cell');
    expect(cellOp).toBeTruthy();
    expect(cellOp.x).toBe(3);
    expect(cellOp.y).toBe(5);
    expect(cellOp.colorRef?.value).toBe('#00E5FF');
  });

  it('parses glow op', () => {
    const src = `asset x canvas 8x8\npart gem material source {\n  glow radius 2\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const glowOp = rawAst.parts[0].ops.find(o => o.op === 'glow');
    expect(glowOp?.radius).toBe(2);
    expect(glowOp?.hint).toBe(true);
  });

  it('parses symmetry op', () => {
    const src = `asset x canvas 8x8\npart a material source {\n  symmetry x\n}\nexport json`;
    const { rawAst } = parseSCDL(src);
    const symOp = rawAst.parts[0].ops.find(o => o.op === 'symmetry');
    expect(symOp?.axis).toBe('x');
  });

  it('returns SCDL-AST-v1 contract', () => {
    const { rawAst } = parseSCDL(BASIC_SOURCE);
    expect(rawAst.contract).toBe('SCDL-AST-v1');
    expect(rawAst.version).toBe('1.2.0');
  });

  it('preserves malformed palette hex literals for compiler validation', () => {
    const src = `asset x canvas 8x8\npalette { bad = #GGGGGG }\npart a material source {\n  fill bad\n}\nexport json`;
    const { rawAst, errors } = parseSCDL(src);
    expect(errors.filter(e => e.severity === 'ERROR')).toHaveLength(0);
    expect(rawAst.palette.bad).toBe('#GGGGGG');
  });
});

describe('illegal characters are reported, not dropped', () => {
  const withHyphen = `
asset shrine-bell canvas 24x24
palette { a = #112233 }
part body material bronze { rect 2 2 4 4 a }
export json
`.trim();

  it('names the offending character at its own position', () => {
    const r = compileSCDL(withHyphen);
    const illegal = r.errors.filter(e => e.label === 'SCDL-022');
    expect(illegal.length).toBe(1);
    expect(illegal[0].severity).toBe('ERROR');
    expect(illegal[0].message).toContain('"-"');
    // `asset shrine-bell` — the hyphen is column 13 of line 1
    expect(illegal[0].loc).toEqual({ line: 1, col: 13 });
  });

  it('reports the root cause before the damage it causes downstream', () => {
    // The hyphen used to vanish and reappear as "Invalid canvas '0x0'" at col 1.
    const r = compileSCDL(withHyphen);
    expect(r.errors[0].label).toBe('SCDL-022');
  });

  it('does not mistake a negative number for an illegal character', () => {
    const r = compileSCDL(`
asset neg canvas 21x21
palette { a = #FFFFFF b = #CCCCCC c = #777777 d = #333333 e = #000000 }
part orb material bronze {
  sphere 10 10 radius 9 light -1 -1 a b c d e
  line -3 4 6 7 a
}
export json
`.trim());
    expect(r.ok).toBe(true);
    expect(r.errors.filter(e => e.label === 'SCDL-022')).toEqual([]);
  });

  it('collapses a run of illegal characters into one diagnostic', () => {
    const r = compileSCDL(`
asset my@@@asset canvas 8x8
part body material bronze { cell 1 1 #112233 }
export json
`.trim());
    const illegal = r.errors.filter(e => e.label === 'SCDL-022');
    expect(illegal.length).toBe(1);
    expect(illegal[0].message).toContain('"@@@"');
    expect(illegal[0].loc.col).toBe(9);
  });

  it('reports each distinct run separately', () => {
    const r = compileSCDL(`
asset a-b canvas 8x8
part c-d material bronze { cell 1 1 #112233 }
export json
`.trim());
    const illegal = r.errors.filter(e => e.label === 'SCDL-022');
    expect(illegal.length).toBe(2);
    expect(illegal.map(e => e.loc.line)).toEqual([1, 2]);
  });

  it('carries a decodable PB-ERR-v1 bytecode string', () => {
    const r = compileSCDL(withHyphen);
    const illegal = r.errors.find(e => e.label === 'SCDL-022');
    expect(illegal.bytecodeString).toContain('ARTIFA-1016');
  });
});

describe('palette diagnostics point at the palette', () => {
  const BAD_PALETTE = `
asset probe canvas 8x8

palette {
  good = #112233
  bad  = #C99A4Z
}

part body material bronze {
  rect 2 2 4 4 bad
}

export json
`.trim();

  it('reports a bad hex at the line the entry is written on', () => {
    const r = compileSCDL(BAD_PALETTE);
    const declaration = r.errors.find(e => e.label === 'SCDL-004' && !e.context.declaredAt);
    // `bad = #C99A4Z` is line 5; previously this reported line 1 (the asset decl)
    expect(declaration.loc.line).toBe(5);
    expect(declaration.loc.line).not.toBe(1);
  });

  it('reports the use site separately and cross-references the declaration', () => {
    const r = compileSCDL(BAD_PALETTE);
    const use = r.errors.find(e => e.label === 'SCDL-004' && e.context.declaredAt);
    expect(use.loc.line).toBe(9);           // `rect 2 2 4 4 bad`
    expect(use.context.declaredAt.line).toBe(5);
    expect(use.message).toContain('declared at line 5');
  });

  it('names the alias that is broken, not the op that used it', () => {
    const r = compileSCDL(BAD_PALETTE);
    for (const e of r.errors.filter(x => x.label === 'SCDL-004')) {
      expect(e.context.alias).toBe('bad');
    }
  });
});

describe('strict mode', () => {
  const UNKNOWN_MATERIAL = `
asset badmat canvas 8x8
palette { a = #112233 }
part body material totally_not_a_material { rect 2 2 4 4 a }
export json
`.trim();

  it('compiles clean by default even though the material silently fell back', () => {
    const r = compileSCDL(UNKNOWN_MATERIAL);
    expect(r.ok).toBe(true);
    expect(r.errors.some(e => e.label === 'SCDL-005')).toBe(true);
  });

  it('fails the compile when warnings are promoted', () => {
    const r = compileSCDL(UNKNOWN_MATERIAL, { strict: true });
    expect(r.ok).toBe(false);
  });

  it('does not invent failures for a clean source', () => {
    const clean = UNKNOWN_MATERIAL.replace('totally_not_a_material', 'bronze');
    expect(compileSCDL(clean, { strict: true }).ok).toBe(true);
  });
});
