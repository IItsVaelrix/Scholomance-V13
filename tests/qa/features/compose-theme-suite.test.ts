/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertThemeParity, collectTokenPaths } from '../../../src/core/compose/tokens/theme-parity';
import { applyDerivedTransforms } from '../../../src/core/compose/tokens/theme-transforms';
import { generateThemeCSS, PUBLIC_THEME_ALIASES } from '../../../src/core/compose/tokens/theme-css';
import type { DTCGDictionary } from '../../../src/core/compose/tokens/index';

function loadTheme(name: 'dark' | 'light'): DTCGDictionary {
  const themePath = resolve(process.cwd(), `tokens/compose/themes/${name}.json`);
  return JSON.parse(readFileSync(themePath, 'utf8')) as DTCGDictionary;
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

describe('Compose theme transforms and CSS emit', () => {
  it('applies glow-from-accent using suite glow opacity', () => {
    const light = applyDerivedTransforms(loadTheme('light'));
    const glow = light.derived['glow-accent'].$value as string;
    expect(glow).toMatch(/rgba?\(|hsla?\(|#/);
    expect(String(light.color.glow['accent-opacity'].$value)).toBe('0.12');
  });

  it('emits dark and light data-theme blocks with public aliases', () => {
    const css = generateThemeCSS(loadTheme('dark'), loadTheme('light'));
    expect(css).toContain(":root,\n[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
    expect(css).toContain('--compose-color-surface-bg:');
    expect(css).toContain('--bg-void: var(--compose-color-surface-bg)');
    expect(css).toContain('--ritual-abyss: var(--compose-color-surface-canvas)');
    expect(css).toContain('--compose-layout-chrome-ornament-opacity:');
    expect(PUBLIC_THEME_ALIASES['--bg-void']).toBe('--compose-color-surface-bg');
  });

  it('light block sets surface bg to #ffffff', () => {
    const css = generateThemeCSS(loadTheme('dark'), loadTheme('light'));
    const lightBlock = css.split("[data-theme='light']")[1];
    expect(lightBlock).toMatch(/--compose-color-surface-bg:\s*#ffffff/i);
  });
});
