export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-1';

const MAX_SENSES = 5;

/** Rank-ordinal display confidence over Leximancy's returned sense order. */
function rankConfidence(index, total) {
  const raw = 1 / (index + 1);
  let sum = 0;
  for (let i = 0; i < total; i += 1) sum += 1 / (i + 1);
  return Number((raw / sum).toFixed(2));
}

/**
 * @param {object} lexiconAdapter
 * @param {string|null} contentToken
 */
export function analyzeLeximancy(lexiconAdapter, contentToken) {
  const empty = {
    status: 'unsupported',
    selectedInterpretationId: null,
    interpretations: [],
    nearKin: [],
    counterfield: [],
    warnings: [],
    anchor: contentToken,
  };
  if (!contentToken) return empty;

  const entries = (lexiconAdapter.lookupWord(contentToken, MAX_SENSES) || []).slice(0, MAX_SENSES);
  if (entries.length === 0) {
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  const interpretations = entries.map((entry, i) => ({
    id: `${contentToken}.${entry.pos || 'x'}.${i}`,
    gloss: lexiconAdapter.extractGloss(entry.senses) || '',
    confidence: rankConfidence(i, entries.length),
    pos: entry.pos || '',
  }));

  const nearKin = (lexiconAdapter.lookupSynonyms?.(contentToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(contentToken, 20) || []).map((e) => e.lemma);

  let status;
  let selectedInterpretationId;
  const warnings = [];
  if (entries.length === 1) {
    status = 'resolved';
    selectedInterpretationId = interpretations[0].id;
  } else if (interpretations[0].pos !== interpretations[1].pos) {
    status = 'ambiguous';
    selectedInterpretationId = null;
    warnings.push('Top senses span different parts of speech — ambiguity is data');
  } else {
    status = 'resolved';
    selectedInterpretationId = interpretations[0].id;
  }

  return { status, selectedInterpretationId, interpretations, nearKin, counterfield, warnings, anchor: contentToken };
}
