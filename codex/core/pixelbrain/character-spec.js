import { hashString } from './shared.js';
import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';

export const CHARACTER_SPEC_VERSION = 'CHARACTER-SPEC-v1';
const VALID_DIRECTIONS = Object.freeze(['south', 'east', 'north', 'west']);
const VALID_GENDERS = Object.freeze(['feminine', 'masculine', 'androgynous']);
const VALID_HEIGHT_CLASSES = Object.freeze(['short', 'average', 'tall']);
const VALID_BUILD_CLASSES = Object.freeze(['slender', 'average', 'stocky']);

function err(reason, context) {
  const e = new Error(`CHARACTER-SPEC-v1: ${reason}`);
  e.cause = context;
  return e;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback) {
  const n = Math.round(toFiniteNumber(value, fallback));
  return n > 0 ? n : fallback;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

function normalizeCanvas(canvas) {
  const width = toPositiveInt(canvas?.width, 32);
  const height = toPositiveInt(canvas?.height, 48);
  if (width <= 0 || height <= 0) {
    throw err('canvas.width and canvas.height must be positive integers', { canvas });
  }
  return Object.freeze({ width, height, gridSize: toPositiveInt(canvas?.gridSize ?? 1, 1) });
}

function normalizePresentation(raw) {
  if (!raw || typeof raw !== 'object') {
    return Object.freeze({ gender: 'androgynous', heightClass: 'average', buildClass: 'average' });
  }
  const gender = String(raw.gender || 'androgynous').trim();
  const heightClass = String(raw.heightClass || 'average').trim();
  const buildClass = String(raw.buildClass || 'average').trim();
  if (!VALID_GENDERS.includes(gender)) throw err(`presentation.gender must be one of: ${VALID_GENDERS.join(', ')}`, { gender });
  if (!VALID_HEIGHT_CLASSES.includes(heightClass)) throw err(`presentation.heightClass must be one of: ${VALID_HEIGHT_CLASSES.join(', ')}`, { heightClass });
  if (!VALID_BUILD_CLASSES.includes(buildClass)) throw err(`presentation.buildClass must be one of: ${VALID_BUILD_CLASSES.join(', ')}`, { buildClass });
  return Object.freeze({ gender, heightClass, buildClass });
}

function normalizeDirections(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return Object.freeze(['south', 'east', 'north', 'west']);
  const dirs = raw.map(d => String(d).trim().toLowerCase());
  for (const d of dirs) {
    if (!VALID_DIRECTIONS.includes(d)) throw err(`direction must be one of: ${VALID_DIRECTIONS.join(', ')}`, { direction: d });
  }
  return Object.freeze([...new Set(dirs)]);
}

function normalizeMaterials(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (MATERIAL_PALETTES[resolveMaterialId(value)]) {
      out[key] = String(value).trim();
    }
  }
  return Object.keys(out).length > 0 ? deepFreeze(out) : null;
}

function normalizeFace(rawParts) {
  if (!Array.isArray(rawParts)) return Object.freeze([]);
  const validIds = ['leftEye', 'rightEye', 'nose', 'mouth', 'leftEar', 'rightEar'];
  const seen = new Set();
  const out = [];
  for (const raw of rawParts) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '').trim();
    if (!id) throw err('face part id is required');
    if (!validIds.includes(id)) throw err(`face part id must be one of: ${validIds.join(', ')}`, { id });
    if (seen.has(id)) throw err(`duplicate face part id "${id}"`);
    seen.add(id);
    const profile = String(raw.profile || '').trim();
    if (!profile) throw err(`face part "${id}" profile is required`);
    out.push(deepFreeze({
      id,
      profile,
      params: raw.params && typeof raw.params === 'object' ? { ...raw.params } : Object.freeze({}),
      attach: raw.attach ? { parent: String(raw.attach.parent || 'body'), at: String(raw.attach.at || '') } : { parent: 'body', at: '' },
    }));
  }
  return Object.freeze(out);
}

function normalizeHair(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const profile = String(raw.profile || '').trim();
  if (!profile) return null;
  return deepFreeze({
    profile,
    params: raw.params && typeof raw.params === 'object' ? { ...raw.params } : Object.freeze({}),
    attach: raw.attach ? { parent: String(raw.attach.parent || 'body'), at: String(raw.attach.at || 'headTop') } : { parent: 'body', at: 'headTop' },
  });
}

function normalizeClothing(raw) {
  if (!Array.isArray(raw)) return Object.freeze([]);
  const seen = new Set();
  const out = [];
  for (const rawItem of raw) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const id = String(rawItem.id || '').trim();
    if (!id) throw err('clothing item id is required');
    if (seen.has(id)) throw err(`duplicate clothing id "${id}"`);
    seen.add(id);
    const profile = String(rawItem.profile || '').trim();
    if (!profile) throw err(`clothing "${id}" profile is required`);
    out.push(deepFreeze({
      id,
      profile,
      params: rawItem.params && typeof rawItem.params === 'object' ? { ...rawItem.params } : Object.freeze({}),
    }));
  }
  return Object.freeze(out);
}

function normalizeProfileParts(rawParts, fieldName) {
  if (!Array.isArray(rawParts)) return Object.freeze([]);
  const seen = new Set();
  const out = [];
  for (const raw of rawParts) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || '').trim();
    if (!id) throw err(`${fieldName} part id is required`);
    if (seen.has(id)) throw err(`duplicate ${fieldName} id "${id}"`);
    seen.add(id);
    const profile = String(raw.profile || '').trim();
    if (!profile) throw err(`${fieldName} "${id}" profile is required`);
    out.push(deepFreeze({
      id,
      profile,
      params: raw.params && typeof raw.params === 'object' ? { ...raw.params } : Object.freeze({}),
    }));
  }
  return Object.freeze(out);
}

export function normalizeCharacterSpec(input = {}) {
  if (!input || typeof input !== 'object') {
    throw err('spec must be an object', { input });
  }
  if (input.contract && input.contract !== CHARACTER_SPEC_VERSION) {
    throw err(`contract must be "${CHARACTER_SPEC_VERSION}"`, { contract: input.contract });
  }

  const id = String(input.id || '').trim();
  if (!id) throw err('id is required');

  const archetype = String(input.archetype || 'human').trim();
  const canvas = normalizeCanvas(input.canvas);
  const seed = toFiniteNumber(input.seed, 0) >>> 0;
  const bytecode = String(input.bytecode || '').trim();
  if (!bytecode) throw err('bytecode is required');

  const presentation = normalizePresentation(input.presentation);
  const directions = normalizeDirections(input.directions);
  const materials = normalizeMaterials(input.materials);

  const body = normalizeBody(input.body);
  const face = normalizeFace(input.face);
  const hair = normalizeHair(input.hair);
  const clothing = normalizeClothing(input.clothing);
  const accessories = normalizeProfileParts(input.accessories, 'accessory');
  const details = normalizeProfileParts(input.details, 'detail');
  const combatProfile = input.combatProfile && typeof input.combatProfile === 'object'
    ? deepFreeze({ ...input.combatProfile })
    : null;

  // First-class vectorWand support: Wand formula proposal for vectorized character art
  // Can be a full composite or single formula; forgeCharacter will route to vector path if present.
  const vectorWand = input.vectorWand && typeof input.vectorWand === 'object'
    ? deepFreeze({ ...input.vectorWand })
    : null;

  const spec = {
    contract: CHARACTER_SPEC_VERSION,
    id,
    class: 'character',
    archetype,
    canvas,
    seed,
    bytecode,
    presentation,
    directions,
    body,
    face,
    hair,
    clothing,
    accessories,
    details,
    ...(combatProfile ? { combatProfile } : {}),
    ...(materials ? { materials } : {}),
    ...(vectorWand ? { vectorWand } : {}),
  };

  return deepFreeze(spec);
}

function normalizeBody(raw) {
  if (!raw || typeof raw !== 'object') throw err('body is required');
  const profile = String(raw.profile || '').trim();
  if (!profile) throw err('body.profile is required');
  return deepFreeze({
    profile,
    params: raw.params && typeof raw.params === 'object' ? { ...raw.params } : Object.freeze({}),
  });
}

export function validateCharacterSpec(spec) {
  if (!spec || spec.contract !== CHARACTER_SPEC_VERSION) throw err('spec contract mismatch');

  // With vectorWand, body profile is optional (Wand provides the vector construction)
  if (!spec.vectorWand && !spec.body?.profile) {
    throw err('body.profile is required unless vectorWand is provided');
  }

  // Validate materials exist in registry
  if (spec.materials) {
    for (const [key, material] of Object.entries(spec.materials)) {
      if (!MATERIAL_PALETTES[resolveMaterialId(material)]) {
        throw err(`material "${material}" not found in registry`, { key, material });
      }
    }
  }

  return true;
}

export function hashCharacterSpec(spec) {
  if (!spec || typeof spec !== 'object') throw err('spec is required for hash');
  const canonical = sortKeysDeep(spec);
  const json = JSON.stringify(canonical);
  return `fnv1a_${hashString(json).toString(16).padStart(8, '0')}`;
}
