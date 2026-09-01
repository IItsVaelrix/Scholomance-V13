/**
 * Regression tests for the /savage-audit findings on the PixelBrain SCDL
 * pipeline (2026-08-30) and the follow-up cross-part boolean-op rework:
 *   - resolve-colors.pass.js silently defaulted an unrecognized colorRef.kind
 *     to '#000000' with no diagnostic.
 *   - lower-booleans.js pushed raw {code,message} objects into the shared
 *     errors array instead of SCDLError instances.
 *   - raster-core.js's path sampler couldn't parse SVG's legal concatenated
 *     arc-flag shorthand, desyncing every token after it.
 *   - union/subtract/intersect targeted auto-generated op ids an SCDL author
 *     can never type, so they always silently no-op'd. They now target
 *     sibling PART ids and resolve via geometry-amp.js's buildPartMask
 *     (see scdl.boolean-ops.test.js for full end-to-end coverage).
 */

import { describe, it, expect } from 'vitest';
import { resolveColorsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js';
import { resolveBooleanOpsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/lower-booleans.js';
import { rasterizePath, acceptAll } from '../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

describe('resolveColorsPass — unrecognized colorRef.kind', () => {
  it('errors (SCDL-025) instead of silently defaulting to black', () => {
    const ast = {
      graphMode: false,
      sourceLocation: { line: 1, col: 1 },
      palette: {},
      paletteLocations: {},
      parts: [{
        id: 'p', material: 'source',
        ops: [{ op: 'fill', colorRef: { kind: 'bogus', value: 'x' }, loc: { line: 2, col: 3 } }],
      }],
    };
    const errors = [];
    const resolved = resolveColorsPass(ast, errors);

    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_COLOR_REF_KIND)).toBe(true);
    expect(errors[0].isError()).toBe(true);
    expect(resolved.parts[0].ops[0].color).toBe('#000000');
  });
});

describe('resolveBooleanOpsPass — errors are real SCDLErrors', () => {
  // Both push sites in lower-booleans.js used to push plain {code,message}
  // literals, so compileSCDL's `e.isError()` call (no ternary guard) threw a
  // TypeError instead of the promised never-throws CompileResult. The
  // role-conflict case needs synthetic cells with an explicit `role` (plain
  // circle/rect ops never carry one without SemQuant annotations), so it's
  // unit-tested directly here; arity and full geometry combination are
  // covered end-to-end in scdl.boolean-ops.test.js.
  it('flags too few targets with a real SCDLError (SCDL-023), not a plain object', () => {
    const parts = [{ id: 'p', material: 'source', ops: [{ op: 'union', id: 'op:p:0:union', targets: ['a'], loc: { line: 1, col: 1 } }] }];
    const errors = [];
    resolveBooleanOpsPass(parts, errors);

    expect(errors).toHaveLength(1);
    expect(typeof errors[0].isError).toBe('function');
    expect(errors[0].isError()).toBe(true);
    expect(errors[0].code).toBe(SCDL_ERROR_CODES.BOOLEAN_OP_ARITY);
  });

  it('flags a semantic role conflict on intersect with a real SCDLError (SCDL-024)', () => {
    const parts = [
      { id: 'a', material: 'source', ops: [{ op: 'cell', x: 0, y: 0, color: '#fff', partId: 'a', role: 'body' }] },
      { id: 'b', material: 'source', ops: [{ op: 'cell', x: 0, y: 0, color: '#fff', partId: 'b', role: 'eye' }] },
      { id: 'c', material: 'source', ops: [{ op: 'intersect', id: 'op:c:0:intersect', targets: ['a', 'b'], loc: { line: 1, col: 1 } }] },
    ];
    const errors = [];
    resolveBooleanOpsPass(parts, errors);

    expect(errors).toHaveLength(1);
    expect(typeof errors[0].isWarn).toBe('function');
    expect(errors[0].isWarn()).toBe(true);
    expect(errors[0].code).toBe(SCDL_ERROR_CODES.SEMANTIC_ROLE_CONFLICT);
  });
});

describe('samplePath (via rasterizePath) — SVG arc flag shorthand', () => {
  it('parses concatenated arc flags ("013") the same as spaced-out flags ("0 1 3")', () => {
    // large-arc=0, sweep=1, x=3, y=4 either way.
    const compact  = { d: 'M0 0 L2 0 A3 3 0 013 4',   color: '#fff', loc: {} };
    const explicit = { d: 'M0 0 L2 0 A3 3 0 0 1 3 4', color: '#fff', loc: {} };

    const opsA = []; rasterizePath(compact, acceptAll, opsA);
    const opsB = []; rasterizePath(explicit, acceptAll, opsB);
    const norm = ops => ops.map(c => `${c.x},${c.y}`).sort().join('|');

    expect(opsA.length).toBeGreaterThan(0);
    expect(norm(opsA)).toBe(norm(opsB));
  });
});
