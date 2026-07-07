import { TIER_IDS } from './compendium.schema.js';
import { matchLemmaBands } from './compendium.tokens.js';

const ELEMENTAL_LEMMAS = Object.freeze({
  fire: 'FIRE', flame: 'FIRE', cinder: 'FIRE', ember: 'FIRE', blaze: 'FIRE', inferno: 'FIRE',
  water: 'WATER', brine: 'WATER', tide: 'WATER', rain: 'WATER', flood: 'WATER', torrent: 'WATER',
  air: 'AIR', wind: 'AIR', gust: 'AIR', gale: 'AIR', breath: 'AIR', storm: 'AIR',
  earth: 'EARTH', stone: 'EARTH', grit: 'EARTH', loam: 'EARTH', fault: 'EARTH', sediment: 'EARTH',
  iron: 'METAL', metal: 'METAL', copper: 'METAL', rust: 'METAL', alloy: 'METAL', oxide: 'METAL',
  rivet: 'METAL', anvil: 'METAL', filings: 'METAL', patina: 'METAL', plating: 'METAL',
  wood: 'WOOD', bark: 'WOOD', root: 'WOOD', thorn: 'WOOD', vine: 'WOOD',
  void: 'VOID', hollow: 'VOID', abyss: 'VOID', null: 'VOID', absence: 'VOID',
  lightning: 'LIGHTNING', volt: 'LIGHTNING', spark: 'LIGHTNING', thunder: 'LIGHTNING',
  ice: 'ICE', frost: 'ICE', freeze: 'ICE', rime: 'ICE', glacier: 'ICE',
  plasma: 'PLASMA', ionize: 'PLASMA', arc: 'PLASMA',
});

const OBJECT_BAND_AFFINITY = Object.freeze({
  FIRE: ['FIRE', 'SPIRIT'],
  WATER: ['FLESH', 'SPIRIT'],
  METAL: ['STONE', 'FLESH'],
  EARTH: ['STONE'],
  LIGHTNING: ['FIRE', 'SPIRIT'],
  ICE: ['FLESH', 'STONE'],
});

const BASE_AMPLIFIERS = Object.freeze({
  FIRE: 0.1, WATER: 0.09, AIR: 0.08, EARTH: 0.09, METAL: 0.11,
  WOOD: 0.08, VOID: 0.1, LIGHTNING: 0.11, ICE: 0.09, PLASMA: 0.12,
});

/**
 * @param {object} ctx
 */
export function detectElementalTier(ctx) {
  const { verseTokens = [], bridge = null, grammarFactor = 1, statFactor = 1 } = ctx;
  const { band, matches } = matchLemmaBands(verseTokens, ELEMENTAL_LEMMAS);
  if (!band || !matches.length) return null;

  const objects = (bridge?.objects || []).map((entry) => String(entry).toUpperCase());
  const affinity = OBJECT_BAND_AFFINITY[band] || [];
  const objectHit = objects.some((object) => affinity.includes(object));
  const base = BASE_AMPLIFIERS[band] || 0.08;
  const objectBonus = objectHit ? 0.03 : 0;
  const amplifier = (base + objectBonus) * grammarFactor * statFactor;

  return {
    tierId: TIER_IDS.ELEMENTAL,
    band,
    entryId: `elemental.${band.toLowerCase()}`,
    matchedLexemes: matches,
    rawSignal: Math.min(1, matches.length / 3),
    grammarFactor,
    statFactor,
    amplifier,
    counsel: objectHit
      ? `Elemental ${band} resonance — imagery matched weave object.`
      : `Elemental ${band} resonance — verse imagery charged the cast.`,
  };
}

export const ELEMENTAL_COMPENDIUM_ENTRIES = Object.entries(BASE_AMPLIFIERS).map(([band, amplifier]) => ({
  entryId: `elemental.${band.toLowerCase()}`,
  tierId: TIER_IDS.ELEMENTAL,
  band,
  title: `${band} Current`,
  baseAmplifier: amplifier,
  statGates: { VALCH: 8 },
}));