/**
 * SCDL Legacy Invariance — packet IDs of every shipped fixture are frozen.
 * If this file goes red, a change broke the Determinism Law for flat assets.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/scdl/fixtures'
);

const FROZEN_IDS = {
  'slime-sphere.scdl':                 ['pbasset_1e332fe6'],
  'crimson-ooze-sphere.scdl':          ['pbasset_06540f60'],
  'void_chestplate.scdl':              ['pbasset_3b9fbe42'],
  'env_test/env_test.scdl':            ['pbasset_0a47b8a8'],
  'void_acolyte/void_acolyte.scdl':    [
    'pbasset_2595caa6', 'pbasset_80c6dd3f', 'pbasset_d0d580c4', 'pbasset_b85c4328',
  ],
};

describe('legacy invariance — frozen packet IDs', () => {
  for (const [file, ids] of Object.entries(FROZEN_IDS)) {
    it(`${file} compiles to ${ids.join(', ')}`, () => {
      const source = readFileSync(join(FIXTURES, file), 'utf8');
      const result = compileSCDL(source);
      expect(result.ok).toBe(true);
      expect(result.framePackets.map(p => p.id)).toEqual(ids);
    });
  }
});
