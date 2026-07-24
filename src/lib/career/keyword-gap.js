/**
 * Resonance Alignment Engine — deterministic keyword-gap analysis.
 *
 * Compares a résumé against a target job description (JD) and reports which JD terms
 * the résumé is missing, with a heuristic 0–100 match score. Pure, read-only, frozen
 * output. No clocks, no randomness, no network, no PII persistence (PDR §5, §11).
 *
 * Dependency direction (PDR §6): this module imports the leaf `text-utils.js` and reads
 * `TORQUE_MAP` from `transmuter.js`. `transmuter.js` must never import this module.
 *
 * @typedef {Object} KeywordHit
 * @property {string}  term
 * @property {string}  stem
 * @property {'unigram'|'bigram'} kind
 * @property {number}  frequency
 * @property {number}  weight
 * @property {boolean} inSkillsLexicon
 * @property {boolean} matched
 *
 * @typedef {Object} TorqueConflict
 * @property {string} jobTerm
 * @property {string} torqueKey
 * @property {string} wouldReplaceWith
 *
 * @typedef {Object} KeywordGapReport
 * @property {1} schemaVersion
 * @property {number} score
 * @property {number} rawScore
 * @property {KeywordHit[]} matched
 * @property {KeywordHit[]} missing
 * @property {KeywordHit[]} jobKeywords
 * @property {TorqueConflict[]} torqueConflicts
 * @property {string[]} diagnostics
 * @property {Object} metadata
 */

import { normalizeText, stem } from './text-utils.js';
import { STOPWORDS } from './stopwords.js';
import { TORQUE_MAP } from './transmuter.js';

const DEFAULT_TOP_K = 30;
const DEFAULT_MIN_LENGTH = 3;
const BASE_WEIGHT = Object.freeze({ unigram: 1.0, bigram: 2.0 });
const LEXICON_MULTIPLIER = 1.5;

/**
 * Built-in seed skills lexicon (PDR §9). Terms here are weighted higher because
 * multi-domain hard skills are the strongest ATS signal. Stored as stems so lookups
 * are symmetric with extracted keyword stems. Phase 2 expands this.
 */
// Every entry must clear the default `minLength` (3) AFTER `normalizeText`/`stem`,
// otherwise it is dead config the analyzer can never consult. Hence the hyphenated
// 'ci-cd' (which normalizeText preserves) rather than the length-2 'ci'/'cd' tokens
// that tokenize() would drop before the lexicon is reached.
export const DEFAULT_SKILLS_LEXICON = Object.freeze([
  'javascript', 'typescript', 'python', 'java', 'react', 'node', 'sql',
  'aws', 'azure', 'docker', 'kubernetes', 'graphql', 'rest', 'api',
  'ci-cd', 'devops', 'git', 'agile', 'scrum', 'testing', 'design', 'data',
  'machine learning', 'leadership', 'analytics', 'cloud', 'security',
]);

/** Tokenizes normalized text into role-bearing tokens (stopwords + short tokens dropped). */
function tokenize(normalized, minLength) {
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter((tok) => tok.length >= minLength && !STOPWORDS.has(tok));
}

// Phrase/clause boundaries. We split the RAW text on these BEFORE normalizing so that a
// bigram never forms across a comma, semicolon, bullet, or sentence end — e.g.
// "inbound calls, ticketing systems" must not yield the phantom bigram "calls ticketing".
// A sentence period is `.` + whitespace; a bare `.` is left intact so "node.js" survives.
const SEGMENT_BOUNDARY_RE = /[,;:!?()[\]{}/|\n•·‣◦]+|\.\s+/;

/**
 * Splits raw text into trimmed, non-empty phrase segments on punctuation/clause
 * boundaries. The single source of truth for "where a phrase ends" — used both to keep
 * bigrams from crossing a boundary AND (by the pipeline) to detect unpunctuated runs.
 * @returns {string[]} raw segment strings
 */
export function splitPhraseSegments(rawText) {
  return String(rawText ?? '')
    .split(SEGMENT_BOUNDARY_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Splits raw text into phrase segments, then normalizes + tokenizes each. Bigrams are
 * extracted within a segment only; unigrams still pool across all segments downstream.
 * @returns {string[][]} one token array per non-empty segment
 */
function segmentizeForKeywords(rawText, minLength) {
  return splitPhraseSegments(rawText)
    .map((segment) => tokenize(normalizeText(segment), minLength))
    .filter((toks) => toks.length > 0);
}

/** Builds a Set of every token stem in the text — the résumé match index. */
function buildStemSet(normalized, minLength) {
  const set = new Set();
  for (const tok of tokenize(normalized, minLength)) set.add(stem(tok));
  return set;
}

/**
 * Builds a Set of lexicon stems. A multi-word lexicon entry contributes the stem of
 * each of its component words, so a bigram keyword can match it component-wise.
 */
function buildLexiconStemSet(skillsLexicon) {
  const set = new Set();
  for (const entry of skillsLexicon) {
    if (typeof entry !== 'string') continue;
    for (const tok of normalizeText(entry).split(' ')) {
      if (tok) set.add(stem(tok));
    }
  }
  return set;
}

function baseWeight(kind) {
  return BASE_WEIGHT[kind];
}

/** weight = base(kind) * (1 + log2(frequency)) * (inLexicon ? 1.5 : 1)  (PDR §12.3) */
function computeWeight(kind, frequency, inSkillsLexicon) {
  return (
    baseWeight(kind) *
    (1 + Math.log2(frequency)) *
    (inSkillsLexicon ? LEXICON_MULTIPLIER : 1)
  );
}

/**
 * Stable total order (PDR §11.2): weight descending, then term ascending. Never relies
 * on insertion / Map-iteration order.
 */
function byWeightThenTerm(a, b) {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.term < b.term) return -1;
  if (a.term > b.term) return 1;
  return 0;
}

/**
 * Extracts weighted JD keyword candidates: unigrams + adjacent bigrams, frequency
 * aggregated by surface term, then weighted. Returns the full candidate list (unsorted
 * trimming happens in the caller after sorting).
 */
function extractKeywords(segments, lexiconStems, includeBigrams) {
  // term -> { term, kind, frequency }
  const counts = new Map();

  const bump = (term, kind) => {
    const existing = counts.get(term);
    if (existing) existing.frequency += 1;
    else counts.set(term, { term, kind, frequency: 1 });
  };

  // Unigrams pool across the whole JD; bigrams form only WITHIN a phrase segment, so no
  // pair straddles a comma/clause boundary.
  for (const tokens of segments) {
    for (let i = 0; i < tokens.length; i++) {
      bump(tokens[i], 'unigram');
      if (includeBigrams && i + 1 < tokens.length) {
        bump(`${tokens[i]} ${tokens[i + 1]}`, 'bigram');
      }
    }
  }

  const hits = [];
  for (const { term, kind, frequency } of counts.values()) {
    const parts = term.split(' ');
    const stems = parts.map(stem);
    const inSkillsLexicon = stems.some((s) => lexiconStems.has(s));
    hits.push({
      term,
      stem: kind === 'unigram' ? stems[0] : stems.join(' '),
      stems, // internal: component stems for matching; stripped before freeze
      kind,
      frequency,
      weight: computeWeight(kind, frequency, inSkillsLexicon),
      inSkillsLexicon,
      matched: false,
    });
  }
  return hits;
}

/**
 * A unigram matches if its stem is in the résumé set. A bigram matches if BOTH
 * component stems are present (adjacency not required) — recall over precision,
 * documented in PDR §12.4.
 */
function isMatched(hit, resumeStems) {
  if (hit.kind === 'unigram') return resumeStems.has(hit.stem);
  return hit.stems.every((s) => resumeStems.has(s));
}

function sumWeights(hits) {
  return hits.reduce((acc, h) => acc + h.weight, 0);
}

/** Strips internal-only fields and freezes a KeywordHit for the public report. */
function freezeHit(hit) {
  return Object.freeze({
    term: hit.term,
    stem: hit.stem,
    kind: hit.kind,
    frequency: hit.frequency,
    weight: hit.weight,
    inSkillsLexicon: hit.inSkillsLexicon,
    matched: hit.matched,
  });
}

/**
 * Detects torque conflicts (PDR §12.6): JD unigram keywords whose stem matches a
 * `TORQUE_MAP` key the transmuter would otherwise rewrite away. Stable order — the
 * input `jobKeywords` is already weight-sorted.
 *
 * @param {KeywordHit[]} jobKeywords
 * @param {Record<string,string>} torqueMap
 * @returns {TorqueConflict[]}
 */
export function detectTorqueConflicts(jobKeywords, torqueMap = TORQUE_MAP) {
  const byStem = new Map(); // stem(torqueKey) -> { key, value }
  for (const [low, high] of Object.entries(torqueMap)) {
    byStem.set(stem(low), { key: low, value: high });
  }
  const conflicts = [];
  for (const kw of jobKeywords) {
    if (kw.kind !== 'unigram') continue;
    const hit = byStem.get(kw.stem);
    if (hit) {
      conflicts.push(
        Object.freeze({ jobTerm: kw.term, torqueKey: hit.key, wouldReplaceWith: hit.value }),
      );
    }
  }
  return conflicts;
}

/**
 * Analyzes the résumé against the JD and returns a deterministic, frozen KeywordGapReport.
 *
 * @param {string} resumeText
 * @param {string} jobDescriptionText
 * @param {Object} [options]
 * @param {number}   [options.topK=30]
 * @param {number}   [options.minLength=3]
 * @param {boolean}  [options.includeBigrams=true]
 * @param {string[]} [options.skillsLexicon]
 * @returns {KeywordGapReport}
 */
export function analyzeKeywordGap(resumeText, jobDescriptionText, options = {}) {
  const topK = Number.isInteger(options.topK) && options.topK > 0 ? options.topK : DEFAULT_TOP_K;
  const minLength =
    Number.isInteger(options.minLength) && options.minLength > 0
      ? options.minLength
      : DEFAULT_MIN_LENGTH;
  const includeBigrams = options.includeBigrams !== false;
  const skillsLexicon = Array.isArray(options.skillsLexicon)
    ? options.skillsLexicon
    : DEFAULT_SKILLS_LEXICON;

  const diagnostics = [];

  const normalizedResume = normalizeText(resumeText);
  const normalizedJd = normalizeText(jobDescriptionText);
  const resumeStems = buildStemSet(normalizedResume, minLength);
  const lexiconStems = buildLexiconStemSet(skillsLexicon);
  // Segment the RAW JD on phrase boundaries so bigrams never cross a comma/clause break.
  const jdSegments = segmentizeForKeywords(jobDescriptionText, minLength);

  if (!normalizedResume) diagnostics.push('Résumé text is empty after normalization.');
  if (!normalizedJd) diagnostics.push('Job description is empty after normalization.');

  // Extract → sort by stable total order → trim to topK.
  const allKeywords = extractKeywords(jdSegments, lexiconStems, includeBigrams).sort(
    byWeightThenTerm,
  );
  const jobKeywords = allKeywords.slice(0, topK);

  if (allKeywords.length > topK) {
    diagnostics.push(
      `JD produced ${allKeywords.length} keyword candidates; scoring the top ${topK}.`,
    );
  }

  // Match each considered keyword against the résumé stem set.
  for (const kw of jobKeywords) kw.matched = isMatched(kw, resumeStems);

  const matched = jobKeywords.filter((kw) => kw.matched);
  const missing = jobKeywords.filter((kw) => !kw.matched);

  // Score — guard divide-by-zero (empty JD ⇒ 0, never NaN). PDR §12.5.
  const totalWeight = sumWeights(jobKeywords);
  const score = totalWeight > 0 ? Math.round((100 * sumWeights(matched)) / totalWeight) : 0;
  const rawScore =
    jobKeywords.length > 0 ? Math.round((100 * matched.length) / jobKeywords.length) : 0;

  if (jobKeywords.length === 0) {
    diagnostics.push('No scoreable JD keywords; score defaulted to 0.');
  }

  const torqueConflicts = detectTorqueConflicts(jobKeywords, TORQUE_MAP);
  if (torqueConflicts.length > 0) {
    diagnostics.push(
      `${torqueConflicts.length} JD keyword(s) conflict with the torque map and will be preserved.`,
    );
  }

  const report = {
    schemaVersion: 1,
    score,
    rawScore,
    matched: Object.freeze(matched.map(freezeHit)),
    missing: Object.freeze(missing.map(freezeHit)),
    jobKeywords: Object.freeze(jobKeywords.map(freezeHit)),
    torqueConflicts: Object.freeze(torqueConflicts),
    diagnostics: Object.freeze(diagnostics),
    metadata: Object.freeze({
      deterministic: true,
      topK,
      jdKeywordCount: allKeywords.length,
      resumeStemCount: resumeStems.size, // count of UNIQUE résumé stems, not raw tokens
    }),
  };

  return Object.freeze(report);
}
