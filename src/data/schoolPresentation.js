import { SCHOOLS } from './schools.js';

const COMBAT_PALETTE_OVERRIDES = Object.freeze({
  SONIC: { primary: '#8a5bff', glow: '#b79bff', dark: '#1a0f33', accent: '#ffe27a' },
  VOID: { primary: '#9a6bff', glow: '#c8a2ff', dark: '#0c0c1a', accent: '#ff7ae0' },
  PSYCHIC: { primary: '#00e5ff', glow: '#9bf6ff', dark: '#04222b', accent: '#ffe27a' },
  ALCHEMY: { primary: '#ff3d8b', glow: '#ff9dc4', dark: '#2b0418', accent: '#ffd36e' },
  WILL: { primary: '#ffd400', glow: '#fff19b', dark: '#2b2200', accent: '#fff7cc' },
  NECROMANCY: { primary: '#22c55e', glow: '#4ade80', dark: '#052e16', accent: '#bbf7d0' },
  ABJURATION: { primary: '#06b6d4', glow: '#22d3ee', dark: '#083344', accent: '#cffafe' },
  DIVINATION: { primary: '#eab308', glow: '#facc15', dark: '#422006', accent: '#fef08a' },
});

const ARENA_COLOR_OVERRIDES = Object.freeze({
  SONIC: '#8a5bff',
  VOID: '#7a7aa6',
  PSYCHIC: '#00e5ff',
  ALCHEMY: '#ff3d8b',
  WILL: '#ffd400',
});

const SIGIL_HSL_OVERRIDES = Object.freeze({
  SONIC: { h: 265, s: 60, l: 55 },
  VOID: { h: 240, s: 15, l: 35 },
  PSYCHIC: { h: 195, s: 65, l: 50 },
  ALCHEMY: { h: 305, s: 60, l: 48 },
  WILL: { h: 30, s: 45, l: 55 },
});

const MATERIAL_OVERRIDES = Object.freeze({
  VOID: { skin: 'skin_voidborne', hair: 'hair_void', eyes: 'eye_void_glow' },
  PSYCHIC: { skin: 'skin_light', hair: 'hair_black', eyes: 'eye_blue' },
  SONIC: { skin: 'skin_medium', hair: 'hair_brown', eyes: 'eye_green' },
  ALCHEMY: { skin: 'skin_dark', hair: 'hair_red', eyes: 'eye_brown' },
  WILL: { skin: 'skin_light', hair: 'hair_blonde', eyes: 'eye_brown' },
});

const DEFAULT_MATERIALS = Object.freeze({
  skin: 'skin_medium',
  hair: 'hair_black',
  eyes: 'eye_brown',
});

export const SCHOOL_PRESENTATION_ORDER = Object.freeze(Object.keys(SCHOOLS));

function hexToPhaserInt(hex) {
  const normalized = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 0x888888;
  return Number.parseInt(normalized, 16);
}

function resolveSchoolId(schoolId, fallback = 'SONIC') {
  const normalized = String(schoolId || '').trim().toUpperCase();
  return SCHOOLS[normalized] ? normalized : fallback;
}

function buildPresentation(schoolId, index) {
  const school = SCHOOLS[schoolId];
  const combatPalette = COMBAT_PALETTE_OVERRIDES[schoolId] || {
    primary: school.color || '#888888',
    glow: school.color || '#aaaaaa',
    dark: '#111111',
    accent: '#ffffff',
  };
  const arenaColor = ARENA_COLOR_OVERRIDES[schoolId] || combatPalette.primary;
  const sigilHsl = SIGIL_HSL_OVERRIDES[schoolId] || school.colorHsl || { h: 0, s: 0, l: 50 };
  const materials = MATERIAL_OVERRIDES[schoolId] || DEFAULT_MATERIALS;

  return Object.freeze({
    id: schoolId,
    index,
    name: school.name,
    glyph: school.glyph,
    color: school.color,
    colorHsl: school.colorHsl,
    cssVar: `--school-${schoolId.toLowerCase()}`,
    cssGlowVar: `--school-${schoolId.toLowerCase()}-glow`,
    combatPalette: Object.freeze({ ...combatPalette }),
    arenaColor,
    arenaPhaserColor: hexToPhaserInt(arenaColor),
    phaserColor: hexToPhaserInt(combatPalette.primary),
    sigilHsl: Object.freeze({ ...sigilHsl }),
    materials: Object.freeze({ ...materials }),
  });
}

export const SCHOOL_PRESENTATION = Object.freeze(
  Object.fromEntries(
    SCHOOL_PRESENTATION_ORDER.map((schoolId, index) => [
      schoolId,
      buildPresentation(schoolId, index),
    ])
  )
);

export function getSchoolPresentation(schoolId, fallback = 'SONIC') {
  return SCHOOL_PRESENTATION[resolveSchoolId(schoolId, fallback)];
}

export function getSchoolCombatPalette(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).combatPalette;
}

export function getSchoolIndex(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).index;
}

export function getSchoolPhaserColor(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).phaserColor;
}

export function getSchoolArenaPhaserColor(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).arenaPhaserColor;
}

export function getSchoolSigilHsl(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).sigilHsl;
}

export function getSchoolMaterialDefaults(schoolId, fallback = 'SONIC') {
  return getSchoolPresentation(schoolId, fallback).materials;
}
