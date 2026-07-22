import { SCHOOLS } from './schools.js';
import {
  resolveVerseIrColor,
  VERSE_IR_PALETTE_FAMILIES,
} from '../lib/truesight/color/pcaChroma.js';

/**
 * Universal Biophysical Teaching Palette.
 * Ritual UI skins support dark + light polarity via ThemeToggle (sun/moon).
 * Light IDE uses the Illuminated Manuscript material grammar (porcelain / parchment / instrument).
 */
function buildUniversalVowelPalette() {
  const result = {};

  VERSE_IR_PALETTE_FAMILIES.forEach((family) => {
    const data = resolveVerseIrColor(family);
    result[family] = {
      color: data.hex,
      viseme: data.viseme
    };
  });

  return Object.freeze(result);
}

/** The authoritative 7-color phonetic rainbow. */
const DEFAULT_VOWEL_COLORS = buildUniversalVowelPalette();

/** Fixed light-IDE manuscript materials (not school-tinted wash). */
export const IDE_LIGHT_MANUSCRIPT = Object.freeze({
  appBg: '#edf2f2',
  toolbarBg: '#f8faf9',
  panelBg: '#f5f8f7',
  editorBg: '#fffdf7',
  gutterBg: '#e2e9e8',
  /* Near-black lining — separates porcelain/parchment planes (no soft-grey mush). */
  borderSubtle: '#2a3233',
  borderStrong: '#141a1b',
  borderInk: '#0a0d0e',
  textPrimary: '#1f2d30',
  textSecondary: '#5f7074',
  textMuted: '#849397',
  textDisabled: '#a8b1b2',
  placeholder: '#9a9277',
  accentCyan: '#079b9b',
  accentCyanSoft: 'rgba(7, 155, 155, 0.12)',
  accentGold: '#a77b25',
  accentGoldSoft: '#e4d8b7',
  instrumentRail: '#353c49',
  instrumentBorder: '#4b5665',
});

/**
 * Returns the universal vowel-family color map.
 *
 * The teaching palette is school-invariant by design — the school only skins
 * the ritual/UI palette (see getRitualPalette), never the vowel-family colors.
 */
export function getUniversalVowelColors() {
  return DEFAULT_VOWEL_COLORS;
}

/**
 * Ritual/UI palette for a school skin.
 *
 * Same swap mechanism as Visual Skin: returns slots injected as `--ritual-*`
 * on the Read layout wrapper. School owns hue accents; light theme uses the
 * Illuminated Manuscript porcelain/parchment/instrument foundation.
 *
 * @param {string} [school]
 * @param {'dark' | 'light'} [theme='dark']
 */
export function getRitualPalette(school, theme = 'dark') {
  const schoolId = String(school || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
  const meta = SCHOOLS[schoolId] || { color: '#6548b8', colorHsl: { h: 265, s: 48, l: 50 } };
  const h = meta.colorHsl.h;
  const mode = theme === 'light' ? 'light' : 'dark';

  const accents = {
    primary: meta.color,
    secondary: `hsl(${(h + 72) % 360}, 60%, 55%)`,
    tertiary: `hsl(${(h + 148) % 360}, 50%, 45%)`,
    aurora_start: `hsl(${h}, 70%, 60%)`,
    aurora_end: `hsl(${(h + 45) % 360}, 60%, 50%)`,
  };

  if (mode === 'light') {
    const m = IDE_LIGHT_MANUSCRIPT;
    return {
      ...accents,
      // Porcelain shell + parchment destination (school hue reserved for accents)
      abyss: m.appBg,
      panel: m.panelBg,
      parchment: m.editorBg,
      ink: m.textPrimary,
      border: m.borderSubtle,
      // Brass glow for light identity; cyan stays in CSS for live/focus only
      glow: m.accentGold,
      glow_40: 'rgba(167, 123, 37, 0.22)',
      aurora_start: m.accentGold,
      aurora_end: m.accentCyan,
      secondary: m.textSecondary,
      tertiary: m.textMuted,
    };
  }

  return {
    ...accents,
    abyss: `hsl(${h}, 20%, 6%)`,
    panel: `hsl(${h}, 25%, 12%)`,
    parchment: '#e6e4da',
    ink: '#f1efec',
    border: `hsl(${h}, 30%, 30%)`,
    glow: `hsl(${h}, 80%, 75%)`,
    glow_40: `hsla(${h}, 80%, 75%, 0.40)`,
  };
}

/**
 * Same CSS custom-property map Visual Skin already injects on the layout wrapper.
 * Light mode also seeds manuscript tokens for IDE.css material layers.
 * @param {ReturnType<typeof getRitualPalette>} palette
 * @param {'dark' | 'light'} [theme='dark']
 */
export function ritualPaletteToCssVars(palette, theme = 'dark') {
  const base = {
    '--ritual-abyss': palette.abyss,
    '--ritual-panel': palette.panel,
    '--ritual-parchment': palette.parchment,
    '--ritual-ink': palette.ink,
    '--ritual-primary': palette.primary,
    '--ritual-secondary': palette.secondary,
    '--ritual-tertiary': palette.tertiary,
    '--ritual-border': palette.border,
    '--ritual-glow': palette.glow,
    '--ritual-aurora-start': palette.aurora_start,
    '--ritual-aurora-end': palette.aurora_end,
    '--active-school-glow': palette.glow_40,
  };

  if (theme !== 'light') return base;

  const m = IDE_LIGHT_MANUSCRIPT;
  return {
    ...base,
    '--app-bg': m.appBg,
    '--toolbar-bg': m.toolbarBg,
    '--panel-bg': m.panelBg,
    '--editor-bg': m.editorBg,
    '--gutter-bg': m.gutterBg,
    '--border-subtle': m.borderSubtle,
    '--border-strong': m.borderStrong,
    '--border-ink': m.borderInk,
    '--ritual-border': m.borderStrong,
    '--text-primary': m.textPrimary,
    '--text-secondary': m.textSecondary,
    '--text-muted': m.textMuted,
    '--text-disabled': m.textDisabled,
    '--light-placeholder': m.placeholder,
    '--accent-cyan': m.accentCyan,
    '--accent-cyan-soft': m.accentCyanSoft,
    '--accent-gold': m.accentGold,
    '--accent-gold-soft': m.accentGoldSoft,
    '--instrument-rail': m.instrumentRail,
    '--instrument-border': m.instrumentBorder,
    '--chrome-gold': m.accentGold,
    '--chrome-gold-text': m.accentGold,
    '--read-text-strong': m.textPrimary,
    '--read-text': m.textSecondary,
    '--read-text-muted': m.textMuted,
    '--read-text-faint': m.textDisabled,
  };
}

export {
  resolveVerseIrColor,
  VERSE_IR_PALETTE_FAMILIES,
};
