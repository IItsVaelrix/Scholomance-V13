import { TIER_IDS } from './compendium.schema.js';
import { countLemmaHits } from './compendium.tokens.js';

const RARITY_BANDS = Object.freeze([
  { band: 'UNCOMMON', lemmas: ['lacerate', 'fulminate', 'lambaste', 'cleave'], amplifier: 0.04 },
  { band: 'RARE_I', lemmas: ['petrichor', 'susurrus', 'crepuscular', 'lambent'], amplifier: 0.08 },
  { band: 'RARE_II', lemmas: ['sciamachy', 'marcescent', 'defenestrate', 'pettifog'], amplifier: 0.12 },
  { band: 'RARE_III', lemmas: ['omphaloskepsis', 'velleity', 'borborygmus'], amplifier: 0.15 },
  { band: 'ARCHAIC', lemmas: ['thou', 'whence', 'hath', 'doth', 'ere'], amplifier: 0.06 },
]);

/**
 * @param {object} ctx
 */
export function detectLexicalRarityTier(ctx) {
  const {
    verseTokens = [],
    grammarFactor = 1,
    statFactor = 1,
    verbosityPenalty = 1,
    codex = 10,
    ksyn = 10,
    syntaxShape = null,
  } = ctx;

  let best = null;
  for (const entry of RARITY_BANDS) {
    const matches = countLemmaHits(verseTokens, entry.lemmas);
    if (!matches.length) continue;

    const codexGate = entry.band === 'RARE_II' || entry.band === 'RARE_III'
      ? (codex >= 14 ? 1 : 0.6)
      : 1;
    const syntaxGate = entry.band === 'RARE_II'
      ? ((syntaxShape === 'PROBE' || syntaxShape === 'COMMAND') ? 1 : 0.75)
      : 1;
    const pairBonus = matches.length >= 2 && ksyn >= 16 ? 0.03 : 0;

    const amplifier = (entry.amplifier + pairBonus)
      * grammarFactor
      * statFactor
      * verbosityPenalty
      * codexGate
      * syntaxGate;

    if (!best || amplifier > best.amplifier) {
      best = {
        tierId: TIER_IDS.LEXICAL_RARITY,
        band: entry.band,
        entryId: `rarity.${matches[0].toLowerCase()}`,
        matchedLexemes: matches,
        rawSignal: Math.min(1, matches.length / 2),
        grammarFactor,
        statFactor,
        amplifier,
        counsel: `Lexical ${entry.band} — "${matches[0].toLowerCase()}" grammatically placed.`,
      };
    }
  }

  return best;
}

export const LEXICAL_COMPENDIUM_ENTRIES = RARITY_BANDS.flatMap((entry) => entry.lemmas.map((lemma) => ({
  entryId: `rarity.${lemma}`,
  tierId: TIER_IDS.LEXICAL_RARITY,
  band: entry.band,
  title: lemma,
  baseAmplifier: entry.amplifier,
  statGates: { CODEX: 10 },
})));