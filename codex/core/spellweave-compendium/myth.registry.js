import { TIER_IDS } from './compendium.schema.js';
import { matchLemmaBands } from './compendium.tokens.js';

const MYTH_LEMMAS = Object.freeze({
  titan: 'TITAN', colossus: 'TITAN', primordial: 'TITAN',
  feral: 'FERAL', beast: 'FERAL', hunt: 'FERAL',
  sacred: 'SACRED', hallow: 'SACRED', sanctify: 'SACRED',
  taboo: 'TABOO', forbidden: 'TABOO', profane: 'TABOO',
  stormheart: 'FERAL_LIGHT', ferryman: 'SACRED', tithe: 'TABOO',
});

const BAND_AMPLIFIERS = Object.freeze({
  TITAN: 0.14, FERAL: 0.11, SACRED: 0.12, TABOO: 0.13, FERAL_LIGHT: 0.15,
});

/**
 * @param {object} ctx
 */
export function detectMythTier(ctx) {
  const {
    verseTokens = [],
    grammarFactor = 1,
    statFactor = 1,
    myth = 10,
    encounterMythWeight = 0,
  } = ctx;

  const { band, matches } = matchLemmaBands(verseTokens, MYTH_LEMMAS);
  if (!band || !matches.length) return null;
  if (myth < 12 && encounterMythWeight < 0.5) return null;

  const weightBonus = encounterMythWeight * 0.04;
  const amplifier = ((BAND_AMPLIFIERS[band] || 0.11) + weightBonus)
    * grammarFactor
    * statFactor;

  return {
    tierId: TIER_IDS.MYTH,
    band,
    entryId: `myth.${band.toLowerCase()}`,
    matchedLexemes: matches,
    rawSignal: Math.min(1, matches.length / 2),
    grammarFactor,
    statFactor,
    amplifier,
    counsel: `Myth ${band} — archetypal weight pressed the encounter.`,
  };
}

export const MYTH_COMPENDIUM_ENTRIES = Object.entries(BAND_AMPLIFIERS).map(([band, amplifier]) => ({
  entryId: `myth.${band.toLowerCase()}`,
  tierId: TIER_IDS.MYTH,
  band,
  title: band,
  baseAmplifier: amplifier,
  statGates: { MYTH: 12 },
}));