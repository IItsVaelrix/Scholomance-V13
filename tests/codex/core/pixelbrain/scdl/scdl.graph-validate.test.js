import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { validatePass } from '../../../../../codex/core/pixelbrain/scdl/passes/validate.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

function validate(source) {
  const { rawAst } = parseSCDL(source);
  const errors = [];
  validatePass(rawAst, errors);
  return errors;
}

describe('validate pass — scene-graph extensions', () => {
  it('SCDL-019 on scale 0', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 1 1 scale 0 }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.INVALID_TRANSFORM)).toBe(true);
  });

  it('SCDL-019 on instance missing at', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.INVALID_TRANSFORM)).toBe(true);
  });

  it('SCDL-009 when a group id collides with a part id at the same scope', () => {
    const errors = validate(`asset a canvas 8x8
part torso material gold { cell 0 0 #ffffff }
group torso at 0 0 { }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DUPLICATE_PART_ID)).toBe(true);
  });

  it('unknown op verbs inside def parts are caught', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { wobble 1 2 } }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_VERB)).toBe(true);
  });

  it('clean graph source validates with no errors', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 1 1 rotate 45 scale 1.5 mirror xy }
export json`);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
  });
});
