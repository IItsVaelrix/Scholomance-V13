// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wand-tokens.css', () => {
  it('defines shared voice tokens', () => {
    const css = readFileSync(new URL('../../../src/features/wand/wand-tokens.css', import.meta.url), 'utf8');
    for (const token of [
      '--wand-amethyst-rgb',
      '--wand-arc-blue-rgb',
      '--wand-gold-rgb',
      '--wand-title-glow',
      '--wand-quiet-text',
      '--wand-summary-text',
    ]) {
      expect(css).toContain(token);
    }
  });
});
