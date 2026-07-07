import { TIER_IDS } from './compendium.schema.js';
import { tokenizeVerse } from './compendium.tokens.js';

/**
 * @param {object} ctx
 */
export function detectDiscoveryTier(ctx) {
  const {
    verse = '',
    weave = '',
    bridge = null,
    grammarFactor = 1,
    statFactor = 1,
    discovery = 10,
    usedEntryIds = [],
    unlockedEntryIds = [],
  } = ctx;

  if (discovery < 8) return null;

  const verseTokens = tokenizeVerse(verse);
  const novel = verseTokens.filter((token) => token.length >= 6
    && !unlockedEntryIds.some((entryId) => entryId.includes(token.toLowerCase())));

  const offLabelObjects = ['FLESH', 'STONE', 'FIRE', 'SPIRIT'];
  const objects = (bridge?.objects || []).map((entry) => String(entry).toUpperCase());
  const weirdObject = objects.find((object) => !offLabelObjects.includes(object));

  let band = null;
  let amplifier = 0;
  let counsel = '';
  let entryId = null;
  let matchedLexemes = [];

  if (novel.length >= 2 && !usedEntryIds.includes('discovery.novel_lexeme')) {
    band = 'NOVEL_LEXEME';
    amplifier = 0.07;
    entryId = 'discovery.novel_lexeme';
    matchedLexemes = novel.slice(0, 3);
    counsel = 'Discovery NOVEL_LEXEME — fresh vocabulary rewarded.';
  } else if (weirdObject) {
    band = 'OFF_LABEL_OBJECT';
    amplifier = 0.06;
    entryId = 'discovery.off_label_object';
    matchedLexemes = [weirdObject];
    counsel = 'Discovery OFF_LABEL_OBJECT — unusual weave binding.';
  } else if (bridge?.chainType === 'MIXED') {
    band = 'WEIRD_CHAIN';
    amplifier = 0.05;
    entryId = 'discovery.weird_chain';
    counsel = 'Discovery WEIRD_CHAIN — mixed connector discipline.';
  }

  if (!band) return null;

  const repeatPenalty = usedEntryIds.includes(entryId) ? 0.4 : 1;
  return {
    tierId: TIER_IDS.DISCOVERY,
    band,
    entryId,
    matchedLexemes,
    rawSignal: 0.6,
    grammarFactor,
    statFactor,
    amplifier: amplifier * grammarFactor * statFactor * repeatPenalty,
    counsel,
  };
}

export const DISCOVERY_COMPENDIUM_ENTRIES = [
  { entryId: 'discovery.novel_lexeme', tierId: TIER_IDS.DISCOVERY, band: 'NOVEL_LEXEME', title: 'Novel Lexeme', statGates: { DISCOVERY: 8 } },
  { entryId: 'discovery.off_label_object', tierId: TIER_IDS.DISCOVERY, band: 'OFF_LABEL_OBJECT', title: 'Off-label Object', statGates: { DISCOVERY: 8 } },
  { entryId: 'discovery.weird_chain', tierId: TIER_IDS.DISCOVERY, band: 'WEIRD_CHAIN', title: 'Weird Chain', statGates: { DISCOVERY: 10 } },
];