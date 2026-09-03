// Structural enforcement (PDR F5): the extractor/stylizer separation is a
// mechanical fact about these two files, not a code-review convention.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const extractorSrc = readFileSync(resolve(repoRoot, 'codex/core/pixelbrain/vixel/stroke-extractor.js'), 'utf8');
const stylizerSrc = readFileSync(resolve(repoRoot, 'codex/core/pixelbrain/vixel/stroke-stylizer.js'), 'utf8');

describe('stroke extractor/stylizer structural boundary', () => {
  it('the extractor contains no hex color style constants', () => {
    expect(extractorSrc).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('the stylizer performs no coordinate arithmetic or adjacency discovery', () => {
    expect(stylizerSrc).not.toMatch(/\.x\s*[-+]|\.y\s*[-+]/); // no cell.x +/- N style neighbor math
    expect(stylizerSrc).not.toMatch(/new Map\(/);             // no adjacency index construction
  });
});
