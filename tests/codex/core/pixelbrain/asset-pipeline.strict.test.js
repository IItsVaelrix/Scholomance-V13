import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAsset } from '../../../../codex/core/pixelbrain/asset-pipeline.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/fixtures/crimson-ooze-sphere.scdl'),
  'utf8',
);

describe('compileAsset strict default', () => {
  it('defaults to strict: true and refuses an unresolvable material rather than silently falling back', () => {
    const result = compileAsset(source, { scale: 1 });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => String(e.message || e).includes('crimson_ooze_material'))).toBe(true);
  });

  it('an explicit strict: false restores the old silent-fallback behaviour', () => {
    const result = compileAsset(source, { scale: 1, strict: false });
    expect(result.ok).toBe(true);
  });
});
