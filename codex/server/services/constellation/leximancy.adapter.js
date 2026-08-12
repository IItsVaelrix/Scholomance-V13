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
/**
 * Would this stem double its final consonant before a vowel-initial suffix?
 *
 * The 1-1-1 rule: one syllable, one final consonant, one vowel before it.
 * `cop` -> `copping`, `star` -> `starring`. Polysyllables (`visit`) and stems
 * ending in a consonant cluster (`build`) do not double, so their plain `ing`
 * derivations are legitimate.
 *
 * `w`, `x` and `y` never double, which is why they are excluded.
 */
function wouldDoubleFinal(stem) {
  if (!/^[a-z]+$/.test(stem)) return false;
  const syllables = stem.match(/[aeiouy]+/g) || [];
  if (syllables.length !== 1) return false;
  return /[^aeiouwxy][aeiou][^aeiouwxy]$/.test(stem);
}

/**
 * Lemmas that could genuinely have produced this surface form.
 *
 * Identity rows are skipped — they are the surface itself, already looked up.
 * A plain `ing`/`ed` concatenation is rejected when the stem would have
 * doubled, which is the only thing separating `cope` from `cop`.
 *
 * @returns {string[]} distinct lemmas, never including the surface
 */
function expandLemmas(lemmaAdapter, surface) {
  if (!lemmaAdapter || typeof lemmaAdapter.lookupForms !== 'function') return [];
  let forms = [];
  try { forms = lemmaAdapter.lookupForms(surface) || []; } catch { return []; }

  const out = [];
  for (const f of forms) {
    const lemma = String(f?.lemma || '').toLowerCase();
    const transform = String(f?.transformId || '');
    if (!lemma || lemma === String(surface).toLowerCase()) continue;
    if (transform === 'identity') continue;
    /**
     * An irregular form was tabulated, not derived, so no spelling rule applies
     * and it is trusted as recorded (`went` -> `go`).
     */
    if (!f.irregular && !/drop_e/.test(transform) && wouldDoubleFinal(lemma)) continue;
    if (!out.includes(lemma)) out.push(lemma);
  }
  return out;
}

export function analyzeLeximancy(lexiconAdapter, contentToken, phraseContext, lemmaAdapter = null) {
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

  /**
   * MORPHOLOGICAL EXPANSION — `coping` should be able to reach `cope`.
   *
   * `lookupToken` is a SURFACE form and always has been, so an inflected query
   * only ever found a lexeme that happens to share its spelling. `coping`
   * returned the masonry noun; `cope` was unreachable.
   *
   * This ADDS the lemma's entries rather than replacing the surface's, because
   * replacing them is wrong far more often than it is right: `building`,
   * `meeting`, `painting` and `drawing` all carry an `identity` row at
   * confidence 1.0, and a user typing `building` means the noun. Preferring the
   * verb lemma would fix one word and break a dozen.
   *
   * ─── WHY THE TRANSFORM MATTERS ─────────────────────────────────────────────
   *
   * `lemma_form` stores EVERY derivation it can generate, undisambiguated:
   *
   *   coping -> cop    verb.progressive.ing      <- wrong: cop+ing is "copping"
   *   coping -> cope   verb.progressive.drop_e   <- right
   *
   * Both carry morphological_confidence 0.85, so confidence cannot separate
   * them, and `lookupForms` orders alphabetically — `cop` comes FIRST. Taking
   * the first lemma would resolve `coping` to `cop`, `hoping` to `hop` and
   * `staring` to `star`, which is worse than not lemmatising at all.
   *
   * The 1-1-1 rule settles it: a monosyllabic stem ending consonant-vowel-
   * consonant DOUBLES that consonant before a vowel-initial suffix. `cop` would
   * have produced `copping`, so `cop` cannot be the source of `coping` and is
   * rejected. `visit` (polysyllabic) and `build` (ends `ld`) do not double, so
   * `visiting` and `building` keep their verb lemmas.
   */
  const lemmaCandidates = expandLemmas(lemmaAdapter, lookupToken);
  const entries = (lexiconAdapter.lookupWord(lookupToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
  for (const lemma of lemmaCandidates) {
    if (entries.length >= MAX_ENTRIES) break;
    for (const e of lexiconAdapter.lookupWord(lemma, MAX_ENTRIES) || []) {
      if (entries.length >= MAX_ENTRIES) break;
      /**
       * Dedupe on the ENTRY ID. An entry carries `headword`/`id`, never
       * `lemma` — keying on a field that does not exist makes every comparison
       * `undefined === undefined`, which collapses to a pos check and discards
       * every added entry as a duplicate.
       */
      if (!entries.some((x) => x.id === e.id)) entries.push(e);
    }
  }
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
  /** Glosses naming a PERSON, PLACE or titled work rather than a kind of thing. */
  const namedEntityGlosses = new Set();
  try {
    /**
     * The partition must cover the LEMMAS too, not just the surface. A sense
     * reached through `cope` is absent from `coping`'s partition, so it would
     * keep its entry pos — and the entry for `cope` is pos `n`, which shipped
     * "succeed in doing, achieving..." as a noun.
     */
    for (const token of [lookupToken, ...lemmaCandidates]) {
      const instances = lexiconAdapter.lookupInstanceSynsets?.(token) || new Set();
      for (const group of lexiconAdapter.lookupLexicalEntries?.(token, 40) || []) {
        for (const sense of group.senses || []) {
          const gloss = String(sense?.gloss || '').trim();
          if (!gloss) continue;
          if (!posByGloss.has(gloss)) posByGloss.set(gloss, group.pos);
          if (sense.synsetId && instances.has(String(sense.synsetId))) namedEntityGlosses.add(gloss);
        }
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
  /**
   * ONE GLOSS, ONE INTERPRETATION. The surface entry and its lemma's entry are
   * distinct rows that share senses — `coping` and `cope` both carry "brick
   * that is laid sideways at the top of a wall" — so entry-level dedupe is not
   * enough and the same reading would be offered twice.
   */
  const seenGloss = new Set();
  const kept = raw.filter((r) => {
    if (!r.gloss || seenGloss.has(r.gloss)) return false;
    seenGloss.add(r.gloss);
    return true;
  });
  if (kept.length === 0) {
    return { ...empty, warnings: [`No glossed sense for "${lookupToken}"`], lookupToken, compoundUsed };
  }
  /**
   * A NAMED ENTITY IS THE LAST THING A WORD MEANS.
   *
   * `hoping` reached `hope`, whose first WordNet noun sense is Bob Hope the
   * comedian — an INSTANCE, at sense_rank 1, tied with "a specific instance of
   * feeling hopeful". Neither pos nor rank separates them, so the page led with
   * a person when the user asked about a feeling.
   *
   * Someone querying a proper noun directly still reaches it: this only demotes
   * within an already-assembled set, it never removes. The sort is STABLE, so
   * every other ordering the lexicon produced survives untouched — this is a
   * demotion, not a re-ranking, and its blast radius is exactly the entities.
   */
  const ordered = kept
    .map((r, i) => ({ r, i, entity: namedEntityGlosses.has(r.gloss) ? 1 : 0 }))
    .sort((a, b) => a.entity - b.entity || a.i - b.i)
    .map((x) => x.r);
  const capped = ordered.slice(0, MAX_INTERPRETATIONS);

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
