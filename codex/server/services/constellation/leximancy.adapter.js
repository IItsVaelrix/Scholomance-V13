export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-2';

const MAX_ENTRIES = 5;
/** Upper bound on rendered senses so a hyper-polysemous word does not flood the panel. */
const MAX_INTERPRETATIONS = 12;

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

  const entries = (lexiconAdapter.lookupWord(contentToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  // Flatten each entry's multiple senses into distinct interpretations (backend
  // rank order preserved) rather than collapsing to one gloss per lemma.
  const raw = [];
  for (const entry of entries) {
    const senses = Array.isArray(entry.senses) ? entry.senses : [];
    if (senses.length === 0) {
      raw.push({ gloss: '', pos: entry.pos || '' });
      continue;
    }
    for (const sense of senses) {
      const pos = (sense && typeof sense === 'object' && sense.pos) || entry.pos || '';
      raw.push({ gloss: senseGloss(lexiconAdapter, sense), pos });
    }
  }
  // Prefer senses that actually carry a gloss; keep the known word visible if none do.
  let kept = raw.filter((r) => r.gloss);
  if (kept.length === 0) kept = raw;
  kept = kept.slice(0, MAX_INTERPRETATIONS);

  const interpretations = kept.map((r, i) => ({
    id: `${contentToken}.${r.pos || 'x'}.${i}`,
    gloss: r.gloss,
    confidence: rankConfidence(i, kept.length),
    pos: r.pos,
  }));

  const nearKin = (lexiconAdapter.lookupSynonyms?.(contentToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(contentToken, 20) || []).map((e) => e.lemma);

  let status;
  let selectedInterpretationId;
  const warnings = [];
  if (interpretations.length === 1) {
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
