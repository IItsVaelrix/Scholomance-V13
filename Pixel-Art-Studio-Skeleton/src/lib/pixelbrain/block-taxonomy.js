/**
 * Block taxonomy tree: school → material tier → block variants.
 *
 * This is the canonical source of truth for blockId resolution.
 * World generators stamp each solid with a blockId at generation time;
 * GDScript reads it directly so _resolve_block_id() becomes a fallback only.
 *
 * Tier keys match materialId values from assignMaterial() in qbit-field.js:
 *   1=earth  2=stone  3=granite  4=crystal  5=rune
 *
 * Variant weights must sum to 1.0 per tier. Selection is cumulative-threshold
 * against a deterministic per-cell hash.
 */

export const BLOCK_TAXONOMY = Object.freeze({
  VOID: Object.freeze({
    1: Object.freeze([
      { id: 'voidstone_smooth',    weight: 0.42 },
      { id: 'voidstone_cracked',   weight: 0.38 },
      { id: 'voidstone_edge_dark', weight: 0.20 },
    ]),
    2: Object.freeze([
      { id: 'basalt_slab',      weight: 0.55 },
      { id: 'basalt_fractured', weight: 0.45 },
    ]),
    3: Object.freeze([
      { id: 'voidmetal_ore_large', weight: 0.62 },
      { id: 'voidmetal_ore_small', weight: 0.38 },
    ]),
    4: Object.freeze([
      { id: 'cyan_crystal_growth',   weight: 0.58 },
      { id: 'cyan_crystal_embedded', weight: 0.42 },
    ]),
    5: Object.freeze([{ id: 'path_rune_floor', weight: 1.0 }]),
  }),

  NECROMANCY: Object.freeze({
    1: Object.freeze([
      { id: 'grimstone_block', weight: 0.68 },
      { id: 'grimstone_mossy', weight: 0.32 },
    ]),
    2: Object.freeze([
      { id: 'peat_damp', weight: 0.52 },
      { id: 'peat_dry',  weight: 0.48 },
    ]),
    3: Object.freeze([{ id: 'ash_grass',    weight: 1.0 }]),
    4: Object.freeze([{ id: 'grimwood_log', weight: 1.0 }]),
    5: Object.freeze([{ id: 'ruins_brick',  weight: 1.0 }]),
  }),
});

// Schools without their own block set fall back to the named school's aesthetic.
export const SCHOOL_FALLBACK = Object.freeze({
  ABJURATION: 'VOID',
  SONIC:       'VOID',
  PSYCHIC:     'VOID',
  WILL:        'VOID',
  ALCHEMY:     'NECROMANCY',
  DIVINATION:  'NECROMANCY',
});

// FNV1a-inspired deterministic cell hash → [0, 1).
// Matches the hash3() used in generate-surface-world.mjs.
export function cellHash(x, y, z) {
  let h = 2166136261;
  h = (Math.imul(h ^ ((x + 374761393) & 0xffffffff), 16777619)) >>> 0;
  h = (Math.imul(h ^ ((y + 668265263) & 0xffffffff), 16777619)) >>> 0;
  h = (Math.imul(h ^ ((z + 2147483647) & 0xffffffff), 16777619)) >>> 0;
  return h / 4294967295;
}

function resolvedTiers(schoolId) {
  return BLOCK_TAXONOMY[schoolId]
    ?? BLOCK_TAXONOMY[SCHOOL_FALLBACK[schoolId]]
    ?? BLOCK_TAXONOMY.VOID;
}

function selectVariant(variants, hash) {
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (hash < cumulative) return v.id;
  }
  return variants[variants.length - 1].id;
}

/**
 * Resolve the canonical blockId for a voxel.
 * Call during world generation and stamp the result onto solid.blockId.
 *
 * @param {string} schoolId   - e.g. 'VOID', 'NECROMANCY', 'ALCHEMY'
 * @param {number} materialId - 1–5 from assignMaterial()
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {string}
 */
export function resolveBlockId(schoolId, materialId, x, y, z) {
  const tiers = resolvedTiers(schoolId);
  const variants = tiers[materialId];
  if (!variants || variants.length === 0) return 'voidstone_smooth';
  if (variants.length === 1) return variants[0].id;
  return selectVariant(variants, cellHash(x, y, z));
}
