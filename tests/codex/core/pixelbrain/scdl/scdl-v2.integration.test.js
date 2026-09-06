import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const V2 = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8');
const V1 = 'asset x canvas 2x2\npart p material source { cell 0 0 #ffffff }\nexport json';

describe('SCDL public version router', () => {
  it('routes explicit v2 and unversioned legacy through one public function', () => {
    expect(compileSCDL(V2)).toMatchObject({ ok: true, languageVersion: 2, contract: 'SCDL-COMPILE-RESULT-v2' });
    expect(compileSCDL(V1)).toMatchObject({ ok: true });
    expect(compileSCDL(V1).contract).toBeUndefined();
  });

  it('does not reinterpret an unsupported SCDL header as v2', () => {
    const result = compileSCDL('SCDL 3\nASSET x');
    expect(result.languageVersion).not.toBe(2);
    expect(result.ok).toBe(false);
  });
});
