import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SELECTOR_PATH = resolve(
  process.cwd(),
  'codex/core/pixelbrain/amp-substrate/amp-selector.js',
);

describe('AMP selector browser boundary', () => {
  it('keeps the pure selector free of the Node-only SQLite substrate', () => {
    const source = readFileSync(SELECTOR_PATH, 'utf8');

    expect(source).not.toContain("from './amp-substrate.db.js'");
    expect(source).not.toContain('better-sqlite3');
  });
});
