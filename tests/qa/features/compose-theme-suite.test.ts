import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertThemeParity, collectTokenPaths } from '../../../src/core/compose/tokens/theme-parity';
import type { DTCGDictionary } from '../../../src/core/compose/tokens/index';

function loadTheme(name: 'dark' | 'light'): DTCGDictionary {
  const path = resolve(process.cwd(), `tokens/compose/themes/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as DTCGDictionary;
}

describe('Compose theme suite parity', () => {
  it('dark and light suites expose identical token paths', () => {
    const dark = loadTheme('dark');
    const light = loadTheme('light');
    const result = assertThemeParity(dark, light);
    expect(result).toEqual({ ok: true });
    expect(collectTokenPaths(dark).length).toBeGreaterThan(20);
  });

  it('light surfaces are pure white / near-white only', () => {
    const light = loadTheme('light');
    const surfaces = [
      light.color.surface.bg.$value,
      light.color.surface['bg-soft'].$value,
      light.color.surface.default.$value,
      light.color.surface.elevated.$value,
      light.color.surface.canvas.$value,
    ];
    for (const value of surfaces) {
      expect(['#ffffff', '#fafafa']).toContain(String(value).toLowerCase());
    }
  });
});
