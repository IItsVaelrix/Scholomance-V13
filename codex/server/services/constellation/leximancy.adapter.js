import { corpusFreqToRarity } from '../../../core/constellation/rarity.js';

export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-3';

const MAX_ENTRIES = 5;
/** Upper bound on rendered senses so a hyper-polysemous word does not flood the panel. */
const MAX_INTERPRETATIONS = 12;
const MAX_EXAMPLES = 3;
const MAX_EXAMPLE_WORDS = 20;
const MAX_RELATIONS = 10;

/** Rank-ordinal display confidence over Leximancy's returned sense order. */
function rankConfidence(index, total) {
  const raw = 1 / (index + 1);
  let sum = 0;
  for (let i = 0; i < total; i += 1) sum += 1 / (i + 1);
  return Number((raw / sum).toFixed(2));
}

/** Reuse Leximancy's own gloss extractor on a single sense (it takes a sense array). */
function senseGloss(lexiconAdapter, sense) {
  return (lexiconAdapter.extractGloss?.([sense]) || '').trim();
}

/** Sense may be a bare string or an object carrying an `examples` array. */
function senseExamples(sense) {
  const list = sense && typeof sense === 'object' && Array.isArray(sense.examples) ? sense.examples : [];
  return list
    .filter((e) => typeof e === 'string' && e.trim())
    .slice(0, MAX_EXAMPLES)
    .map((e) => {
      const words = e.trim().split(/\s+/);
      return words.length <= MAX_EXAMPLE_WORDS ? e.trim() : `${words.slice(0, MAX_EXAMPLE_WORDS).join(' ')}…`;
    });
}

/** Deterministic order for a relation bucket: corpus frequency desc, then alphabetical. */
function sortRelation(lemmas, freqMap) {
  return [...new Set(lemmas)]
    .sort((a, b) => (freqMap.get(b) || 0) - (freqMap.get(a) || 0) || a.localeCompare(b))
    .slice(0, MAX_RELATIONS);
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
    etymology: null,
    ipa: null,
    rarity: null,
    relations: { broader: [], narrower: [], akin: [] },
  };
  if (!contentToken) return empty;

  const entries = (lexiconAdapter.lookupWord(contentToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  // Flatten senses into interpretations, carrying each sense's ENTRY provenance
  // (etymology / pronunciation) so a homograph's origin follows the selected sense.
  const raw = [];
  for (const entry of entries) {
    const provenance = { etymology: entry.etymology ?? null, ipa: entry.pronunciation ?? null };
    const senses = Array.isArray(entry.senses) ? entry.senses : [];
    if (senses.length === 0) {
      raw.push({ gloss: '', pos: entry.pos || '', examples: [], ...provenance });
      continue;
    }
    for (const sense of senses) {
      const pos = (sense && typeof sense === 'object' && sense.pos) || entry.pos || '';
      raw.push({ gloss: senseGloss(lexiconAdapter, sense), pos, examples: senseExamples(sense), ...provenance });
    }
  }
  let kept = raw.filter((r) => r.gloss);
  if (kept.length === 0) kept = raw;
  kept = kept.slice(0, MAX_INTERPRETATIONS);

  const interpretations = kept.map((r, i) => ({
    id: `${contentToken}.${r.pos || 'x'}.${i}`,
    gloss: r.gloss,
    confidence: rankConfidence(i, kept.length),
    pos: r.pos,
    examples: r.examples,
  }));

  const nearKin = (lexiconAdapter.lookupSynonyms?.(contentToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(contentToken, 20) || []).map((e) => e.lemma);

  let related = { broader: [], narrower: [], akin: [] };
  let relationsFailed = false;
  try {
    related = lexiconAdapter.lookupRelated?.(contentToken, 20) || related;
  } catch {
    relationsFailed = true;
  }
  const relBroader = (related.broader || []).map((e) => e.lemma).filter(Boolean);
  const relNarrower = (related.narrower || []).map((e) => e.lemma).filter(Boolean);
  const relAkin = (related.akin || []).map((e) => e.lemma).filter(Boolean);

  // One batched frequency call powers both rarity (head word) and relation ordering.
  const freqWords = [contentToken, ...relBroader, ...relNarrower, ...relAkin];
  const freqMap = lexiconAdapter.getCorpusFrequencies?.(freqWords) || new Map();
  const rarity = freqMap.size > 0 ? corpusFreqToRarity(freqMap.get(contentToken) || 0) : null;

  const relations = {
    broader: sortRelation(relBroader, freqMap),
    narrower: sortRelation(relNarrower, freqMap),
    akin: sortRelation(relAkin, freqMap),
  };

  let status;
  let selectedIndex;
  const warnings = [];
  if (interpretations.length === 1) {
    status = 'resolved';
    selectedIndex = 0;
  } else if (interpretations[0].pos !== interpretations[1].pos) {
    status = 'ambiguous';
    selectedIndex = null;
    warnings.push('Top senses span different parts of speech — ambiguity is data');
  } else {
    status = 'resolved';
    selectedIndex = 0;
  }
  const selectedInterpretationId = selectedIndex === null ? null : interpretations[selectedIndex].id;

  // Etymology/IPA descend from the selected entry; when ambiguous, from the top entry.
  const originItem = kept[selectedIndex === null ? 0 : selectedIndex] || kept[0] || {};

  return {
    status,
    selectedInterpretationId,
    interpretations,
    nearKin,
    counterfield,
    warnings,
    anchor: contentToken,
    etymology: originItem.etymology ?? null,
    ipa: originItem.ipa ?? null,
    rarity,
    relations,
    relationsFailed,
  };
}
