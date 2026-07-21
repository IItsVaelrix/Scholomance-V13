/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertThemeParity, collectTokenPaths } from '../../../src/core/compose/tokens/theme-parity';
import { applyDerivedTransforms } from '../../../src/core/compose/tokens/theme-transforms';
import { generateThemeCSS, PUBLIC_THEME_ALIASES } from '../../../src/core/compose/tokens/theme-css';
import type { DTCGDictionary } from '../../../src/core/compose/tokens/index';

function loadTheme(name: 'dark' | 'light'): DTCGDictionary {
  const themePath = resolve(process.cwd(), `tokens/compose/themes/${name}.json`);
  return JSON.parse(readFileSync(themePath, 'utf8')) as DTCGDictionary;
}

function luminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  const ch = [m[1], m[2], m[3]].map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
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

  it('light primary text on surface.bg meets 4.5:1', () => {
    const light = loadTheme('light');
    const ratio = contrast(
      String(light.color.text.primary.$value),
      String(light.color.surface.bg.$value),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
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

  it('checked-in compose-themes.css matches generateThemeCSS output', () => {
    const dark = loadTheme('dark');
    const light = loadTheme('light');
    const expected = generateThemeCSS(dark, light);
    const path = resolve(process.cwd(), 'src/lib/css/generated/compose-themes.css');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8').trim()).toBe(expected.trim());
  });
});

describe('Channel Zero light theme contract', () => {
  it('channel-zero light theme aliases Compose surfaces (no cream hsl(42…))', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css'),
      'utf8',
    );
    const lightIdx = css.indexOf("[data-theme='light']");
    expect(lightIdx).toBeGreaterThan(-1);
    const lightBlock = css.slice(lightIdx, lightIdx + 800);
    expect(lightBlock).not.toMatch(/hsl\(42\s/);
    expect(lightBlock).toMatch(/--cz-bg:\s*var\(--compose-color-surface-bg|--bg-void\)/);
  });
});
