import { TIER_IDS } from './compendium.schema.js';
import { matchLemmaBands } from './compendium.tokens.js';

const SONIC_LEMMAS = Object.freeze({
  resonance: 'RESONANCE', resonate: 'RESONANCE', harmonic: 'HARMONIC', chord: 'HARMONIC',
  dissonance: 'DISSONANCE', discord: 'DISSONANCE', clang: 'DISSONANCE',
  hush: 'HUSH', silence: 'HUSH', quiet: 'HUSH', mute: 'HUSH',
  cadence: 'CADENCE', rhythm: 'CADENCE', meter: 'CADENCE', pulse: 'CADENCE',
  feedback: 'FEEDBACK', echo: 'FEEDBACK', reverberate: 'FEEDBACK',
});

const BAND_AMPLIFIERS = Object.freeze({
  RESONANCE: 0.1, HARMONIC: 0.09, DISSONANCE: 0.11, HUSH: 0.08,
  CADENCE: 0.09, FEEDBACK: 0.1,
});

/**
 * @param {object} ctx
 */
export function detectSonicTier(ctx) {
  const {
    verseTokens = [],
    bridge = null,
    grammarFactor = 1,
    statFactor = 1,
    bapo = 10,
  } = ctx;

  const { band, matches } = matchLemmaBands(verseTokens, SONIC_LEMMAS);
  if (!band || !matches.length) return null;

  const utterBonus = (bridge?.syntax?.modifierPower || 1) > 1.1 ? 0.02 : 0;
  const bapoBonus = bapo >= 14 ? 0.02 : 0;
  const amplifier = ((BAND_AMPLIFIERS[band] || 0.09) + utterBonus + bapoBonus)
    * grammarFactor
    * statFactor;

  return {
    tierId: TIER_IDS.SONIC,
    band,
    entryId: `sonic.${band.toLowerCase()}`,
    matchedLexemes: matches,
    rawSignal: Math.min(1, matches.length / 2),
    grammarFactor,
    statFactor,
    amplifier,
    counsel: `Sonic ${band} — waveform language amplified the cast.`,
  };
}

export const SONIC_COMPENDIUM_ENTRIES = Object.entries(BAND_AMPLIFIERS).map(([band, amplifier]) => ({
  entryId: `sonic.${band.toLowerCase()}`,
  tierId: TIER_IDS.SONIC,
  band,
  title: band,
  baseAmplifier: amplifier,
  statGates: { SONIC: 8 },
}));