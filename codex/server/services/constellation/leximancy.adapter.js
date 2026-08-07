import { corpusFreqToRarity } from '../../../core/constellation/rarity.js';

export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-4';

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
 * @param {{ compounds?: string[], intent?: string }} [phraseContext] - optional
 *   phrase-level context from analyzePhraseStructure. When a compound is present,
 *   the adapter attempts a compound lookup first, falling back to the head token.
 */
export function analyzeLeximancy(lexiconAdapter, contentToken, phraseContext) {
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
    phraseContext: phraseContext || null,
  };
  if (!contentToken) return empty;

  // When a compound is detected (e.g. "bright wound"), try looking up the
  // compound's head noun first for richer sense data, then fall back to the
  // primary content token.
  const compounds = phraseContext?.compounds || [];
  let lookupToken = contentToken;
  let compoundUsed = null;
  if (compounds.length > 0) {
    // Use the last compound's second word (the noun head) as a richer anchor
    const lastCompound = compounds[compounds.length - 1];
    const parts = lastCompound.split(/\s+/);
    const compoundNoun = parts[parts.length - 1];
    if (compoundNoun && compoundNoun !== contentToken) {
      const compoundEntries = lexiconAdapter.lookupWord(compoundNoun, 1) || [];
      if (compoundEntries.length > 0) {
        lookupToken = compoundNoun;
        compoundUsed = lastCompound;
      }
    }
  }

  const entries = (lexiconAdapter.lookupWord(lookupToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    // Fall back to the original content token if compound lookup failed
    if (lookupToken !== contentToken) {
      const fallback = (lexiconAdapter.lookupWord(contentToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
      if (fallback.length > 0) {
        lookupToken = contentToken;
        compoundUsed = null;
        return analyzeLeximancy(lexiconAdapter, contentToken, { ...phraseContext, compounds: [] });
      }
    }
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  /**
   * TRUE POS COMES FROM wordnet_lemma, NOT FROM THE ENTRY.
   *
   * Measured against scholomance_dict.sqlite: lookupWord('wound') returns ONE
   * entry with pos 'a' and all seven senses inside it, and the senses carry no
   * pos of their own. Every sense therefore inherited 'a' — "an injury to living
   * tissue" shipped as an adjective, and the POS-divergence branch below could
   * never fire, so a three-way split reported 'resolved'.
   *
   * lookupLexicalEntries keeps the partition. Joining on gloss text is the
   * honest join — ids are built independently on each side and can silently
   * disagree, the same reasoning semanticInquiry.adapter documents. A gloss that
   * does not join keeps the entry's pos, which is no worse than before.
   */
  const posByGloss = new Map();
  try {
    for (const group of lexiconAdapter.lookupLexicalEntries?.(lookupToken, 40) || []) {
      for (const sense of group.senses || []) {
        const gloss = String(sense?.gloss || '').trim();
        if (gloss && !posByGloss.has(gloss)) posByGloss.set(gloss, group.pos);
      }
    }
  } catch {
    // Best-effort: an unavailable partition leaves the entry's pos in place.
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
  /**
   * A SENSE WITH NO GLOSS IS NOT AN INTERPRETATION.
   *
   * The old fallback kept the un-glossed rows when every gloss was empty, and
   * the page then shipped a selected interpretation whose text was "" — an
   * answer-shaped blank. `the silent stars burn` rendered exactly that. When
   * nothing has a gloss there is nothing to report, and saying so is the honest
   * result.
   */
  const kept = raw.filter((r) => r.gloss);
  if (kept.length === 0) {
    return { ...empty, warnings: [`No glossed sense for "${lookupToken}"`], lookupToken, compoundUsed };
  }
  const capped = kept.slice(0, MAX_INTERPRETATIONS);

  const interpretations = capped.map((r, i) => {
    const pos = posByGloss.get((r.gloss || '').trim()) || r.pos;
    return {
      id: `${lookupToken}.${pos || 'x'}.${i}`,
      gloss: r.gloss,
      confidence: rankConfidence(i, capped.length),
      pos,
      examples: r.examples,
    };
  });

  const nearKin = (lexiconAdapter.lookupSynonyms?.(lookupToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(lookupToken, 20) || []).map((e) => e.lemma);

  let related = { broader: [], narrower: [], akin: [] };
  let relationsFailed = false;
  try {
    related = lexiconAdapter.lookupRelated?.(lookupToken, 20) || related;
  } catch {
    relationsFailed = true;
  }
  const relBroader = (related.broader || []).map((e) => e.lemma).filter(Boolean);
  const relNarrower = (related.narrower || []).map((e) => e.lemma).filter(Boolean);
  const relAkin = (related.akin || []).map((e) => e.lemma).filter(Boolean);

  // One batched frequency call powers both rarity (head word) and relation ordering.
  const freqWords = [lookupToken, ...relBroader, ...relNarrower, ...relAkin];
  const freqMap = lexiconAdapter.getCorpusFrequencies?.(freqWords) || new Map();
  const rarity = freqMap.size > 0 ? corpusFreqToRarity(freqMap.get(lookupToken) || 0) : null;

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
  const originItem = capped[selectedIndex === null ? 0 : selectedIndex] || capped[0] || {};

  return {
    status,
    selectedInterpretationId,
    interpretations,
    nearKin,
    counterfield,
    warnings,
    anchor: contentToken,
    lookupToken,
    compoundUsed,
    etymology: originItem.etymology ?? null,
    ipa: originItem.ipa ?? null,
    rarity,
    relations,
    relationsFailed,
    phraseContext: phraseContext || null,
  };
}
