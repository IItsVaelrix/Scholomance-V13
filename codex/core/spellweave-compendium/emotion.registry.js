import { TIER_IDS } from './compendium.schema.js';
import { matchLemmaBands } from './compendium.tokens.js';

const EMOTION_LEMMAS = Object.freeze({
  rage: 'RAGE', fury: 'RAGE', wrath: 'RAGE', anger: 'RAGE', seethe: 'RAGE',
  fear: 'FEAR', dread: 'FEAR', terror: 'FEAR', panic: 'FEAR', tremble: 'FEAR',
  grief: 'GRIEF', sorrow: 'GRIEF', mourn: 'GRIEF', lament: 'GRIEF', weep: 'GRIEF',
  wonder: 'WONDER', awe: 'AWE', marvel: 'WONDER', astonish: 'WONDER',
  joy: 'JOY', delight: 'JOY', rejoice: 'JOY', gleam: 'JOY',
  disgust: 'DISGUST', revile: 'DISGUST', bile: 'DISGUST', rot: 'DISGUST',
  contempt: 'CONTEMPT', scorn: 'CONTEMPT', sneer: 'CONTEMPT',
});

const EMOTION_SCHOOLS = Object.freeze({
  RAGE: 'ALCHEMY',
  FEAR: 'PSYCHIC',
  GRIEF: 'VOID',
  WONDER: 'SONIC',
  AWE: 'SONIC',
  JOY: 'ALCHEMY',
  DISGUST: 'ALCHEMY',
  CONTEMPT: 'PSYCHIC',
});

const CHAIN_EMOTION_BONUS = Object.freeze({
  RAGE: 'SEQUENCE',
  FEAR: 'SUSTAINED',
  JOY: 'SIMULTANEOUS',
});

/**
 * @param {object} ctx
 */
export function detectEmotionTier(ctx) {
  const {
    verseTokens = [],
    bridge = null,
    grammarFactor = 1,
    statFactor = 1,
    dominantSchool = null,
  } = ctx;

  const { band, matches } = matchLemmaBands(verseTokens, EMOTION_LEMMAS);
  if (!band || !matches.length) return null;

  const school = EMOTION_SCHOOLS[band] || 'SONIC';
  const chainType = bridge?.chainType || 'SINGLE';
  const chainBonus = CHAIN_EMOTION_BONUS[band] === chainType ? 0.03 : 0;
  const schoolMatch = dominantSchool && dominantSchool === school ? 0.02 : -0.01;
  const base = 0.08 + chainBonus + schoolMatch;
  const amplifier = Math.max(0, base * grammarFactor * statFactor);

  return {
    tierId: TIER_IDS.EMOTION,
    band,
    entryId: `emotion.${band.toLowerCase()}`,
    matchedLexemes: matches,
    rawSignal: Math.min(1, matches.length / 2),
    grammarFactor,
    statFactor,
    amplifier,
    counsel: `Emotion ${band} feeds ${school} — ${chainType.toLowerCase()} weave ${chainBonus ? 'aligned' : 'partial'}.`,
    schoolBias: school,
  };
}

export const EMOTION_COMPENDIUM_ENTRIES = Object.keys(EMOTION_SCHOOLS).map((band) => ({
  entryId: `emotion.${band.toLowerCase()}`,
  tierId: TIER_IDS.EMOTION,
  band,
  title: `${band} Charge`,
  schoolAffinity: [EMOTION_SCHOOLS[band]],
  statGates: { BAPO: 8 },
}));