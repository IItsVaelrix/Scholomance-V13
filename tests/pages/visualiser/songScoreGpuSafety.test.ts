import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../src/pages/Visualiser/BytecodeVisualiser.css'),
  'utf8',
);

describe('BytecodeVisualiser GPU-safe chart CSS', () => {
  it('does not animate CSS filter (Chrome Aw Snap / GPU exit 15)', () => {
    expect(css).not.toMatch(/@keyframes[^{]*\{[^}]*filter\s*:/);
    expect(css).not.toMatch(/\.bcv-spectral\.is-live\s*\{[^}]*animation:/);
    expect(css).not.toMatch(/bcv-grim-shimmer/);
  });

  it('uses opacity pulse for playhead accents instead', () => {
    expect(css).toMatch(/@keyframes bcv-grim-pulse/);
    expect(css).toMatch(/opacity:\s*0\.82/);
  });
});
