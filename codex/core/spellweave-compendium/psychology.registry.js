import { TIER_IDS } from './compendium.schema.js';
import { matchLemmaBands } from './compendium.tokens.js';

const PSYCH_LEMMAS = Object.freeze({
  fracture: 'FRACTURE', splinter: 'FRACTURE', schism: 'FRACTURE', split: 'FRACTURE',
  mirage: 'MIRAGE', illusion: 'MIRAGE', phantom: 'MIRAGE', veil: 'MIRAGE',
  obsession: 'OBSESSION', fixation: 'OBSESSION', compulsion: 'OBSESSION',
  dissociation: 'DISSOCIATION', detach: 'DISSOCIATION', unmoored: 'DISSOCIATION',
  paranoia: 'PARANOIA', suspect: 'PARANOIA', watchful: 'PARANOIA',
  possession: 'POSSESSION', inhabit: 'POSSESSION', usurp: 'POSSESSION',
  dream: 'DREAMLOGIC', dreamlogic: 'DREAMLOGIC', somnolent: 'DREAMLOGIC',
});

const BAND_AMPLIFIERS = Object.freeze({
  FRACTURE: 0.12,
  MIRAGE: 0.1,
  OBSESSION: 0.09,
  DISSOCIATION: 0.11,
  PARANOIA: 0.1,
  POSSESSION: 0.13,
  DREAMLOGIC: 0.1,
});

/**
 * @param {object} ctx
 */
export function detectPsychologyTier(ctx) {
  const { verseTokens = [], grammarFactor = 1, statFactor = 1, cinf = 10 } = ctx;
  const { band, matches } = matchLemmaBands(verseTokens, PSYCH_LEMMAS);
  if (!band || !matches.length) return null;

  const presentationBoost = (band === 'MIRAGE' || band === 'DREAMLOGIC') && cinf >= 14 ? 0.02 : 0;
  const base = (BAND_AMPLIFIERS[band] || 0.1) + presentationBoost;
  const amplifier = base * grammarFactor * statFactor;

  return {
    tierId: TIER_IDS.PSYCHOLOGY,
    band,
    entryId: `psychology.${band.toLowerCase()}`,
    matchedLexemes: matches,
    rawSignal: Math.min(1, matches.length / 2),
    grammarFactor,
    statFactor,
    amplifier,
    counsel: `Psychology ${band} — mind-fracture language breached the guard.`,
  };
}

export const PSYCHOLOGY_COMPENDIUM_ENTRIES = Object.entries(BAND_AMPLIFIERS).map(([band, amplifier]) => ({
  entryId: `psychology.${band.toLowerCase()}`,
  tierId: TIER_IDS.PSYCHOLOGY,
  band,
  title: band,
  baseAmplifier: amplifier,
  statGates: { PSYCH: 8 },
}));