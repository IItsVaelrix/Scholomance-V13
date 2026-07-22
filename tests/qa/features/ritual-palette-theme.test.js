import { describe, it, expect } from 'vitest';
import {
  getRitualPalette,
  ritualPaletteToCssVars,
  IDE_LIGHT_MANUSCRIPT,
} from '../../../src/data/schoolPalettes.js';

describe('getRitualPalette sun/moon theme swap (Illuminated Manuscript)', () => {
  it('defaults to dark skin surfaces', () => {
    const dark = getRitualPalette('SONIC');
    expect(dark.abyss).toBe('hsl(175, 20%, 6%)');
    expect(dark.ink).toBe('#f1efec');
  });

  it('uses porcelain/parchment/instrument materials in light', () => {
    const dark = getRitualPalette('SONIC', 'dark');
    const light = getRitualPalette('SONIC', 'light');
    expect(light.abyss).toBe(IDE_LIGHT_MANUSCRIPT.appBg);
    expect(light.panel).toBe(IDE_LIGHT_MANUSCRIPT.panelBg);
    expect(light.parchment).toBe(IDE_LIGHT_MANUSCRIPT.editorBg);
    expect(light.ink).toBe(IDE_LIGHT_MANUSCRIPT.textPrimary);
    expect(light.glow).toBe(IDE_LIGHT_MANUSCRIPT.accentGold);
    expect(light.primary).toBe(dark.primary);
  });

  it('injects manuscript CSS vars for the IDE wrapper in light', () => {
    const vars = ritualPaletteToCssVars(getRitualPalette('WILL', 'light'), 'light');
    expect(vars['--editor-bg']).toBe(IDE_LIGHT_MANUSCRIPT.editorBg);
    expect(vars['--gutter-bg']).toBe(IDE_LIGHT_MANUSCRIPT.gutterBg);
    expect(vars['--instrument-rail']).toBe(IDE_LIGHT_MANUSCRIPT.instrumentRail);
    expect(vars['--accent-cyan']).toBe(IDE_LIGHT_MANUSCRIPT.accentCyan);
    expect(vars['--accent-gold']).toBe(IDE_LIGHT_MANUSCRIPT.accentGold);
    expect(vars['--ritual-abyss']).toBe(IDE_LIGHT_MANUSCRIPT.appBg);
  });
});
