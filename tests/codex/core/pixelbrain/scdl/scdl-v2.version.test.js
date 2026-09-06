import { describe, expect, it } from 'vitest';
import { detectSCDLVersion } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.version.js';

describe('SCDL v2 explicit version law', () => {
  it('selects v2 only when the first significant declaration is exactly SCDL 2', () => {
    expect(detectSCDLVersion('\uFEFF\n# agent note\n  SCDL 2  \nASSET x')).toBe(2);
  });

  it.each([
    ['legacy source', 'asset x canvas 1x1'],
    ['unsupported version', 'SCDL 3\nASSET x'],
    ['near match', 'SCDL 2 extra\nASSET x'],
    ['wrong case', 'scdl 2\nASSET x'],
    ['non-string', null],
  ])('routes %s to legacy', (_label, source) => {
    expect(detectSCDLVersion(source)).toBe(1);
  });
});
