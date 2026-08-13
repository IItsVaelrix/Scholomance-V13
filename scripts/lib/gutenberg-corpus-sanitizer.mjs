/**
 * PROJECT GUTENBERG CORPUS SANITIZER
 *
 * The raw transcription is immutable evidence. This module derives bounded
 * experiment segments from it without confusing typesetting, bibliographic
 * matter, or abbreviation punctuation for sentence syntax.
 *
 * PURE AND ZERO-I/O. Callers own file access and decide what accepted segments
 * mean. Every rejected paragraph or sentence candidate increments one declared
 * reason code; there is no uncounted filter branch.
 */

export const GUTENBERG_SANITIZATION_CONTRACT = 'SCHOL-GUTENBERG-SANITIZATION-v1';

export const SANITIZATION_REASON = Object.freeze({
  ILLUSTRATION: 'illustration',
  ASTERISM: 'asterism',
  HEADING: 'heading',
  MARKUP: 'markup',
  TOO_SHORT: 'tooShort',
  TOO_LONG: 'tooLong',
  NO_COMPOUND: 'noCompound',
  UNREADABLE: 'unreadable',
});

const REASONS = new Set(Object.values(SANITIZATION_REASON));

/** Titles whose period belongs to the name construction before them. */
const NAME_TITLES = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'rev', 'hon', 'capt', 'col', 'gen', 'lt',
  'sgt', 'messrs', 'mme', 'mlle',
]);

/** Abbreviations protected only when the following token is numeric/Roman. */
const ENUMERATION_ABBREVIATIONS = new Set(['no', 'vol', 'ch', 'fig', 'pp']);

/** Abbreviations protected mid-sentence, but permitted to end a sentence. */
const CONTINUATION_ABBREVIATIONS = new Set([
  'jr', 'sr', 'vs', 'etc', 'viz', 'ed', 'esq', 'inst', 'ult', 'i.e', 'e.g',
]);

export const PROTECTED_ABBREVIATIONS = Object.freeze([
  ...NAME_TITLES,
  ...ENUMERATION_ABBREVIATIONS,
  ...CONTINUATION_ABBREVIATIONS,
].sort());

const START_MARKERS = Object.freeze([
  '*** START OF THIS PROJECT GUTENBERG',
  '*** START OF THE PROJECT GUTENBERG',
]);
const END_MARKERS = Object.freeze([
  '*** END OF THIS PROJECT GUTENBERG',
  '*** END OF THE PROJECT GUTENBERG',
]);
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}', '_']);

const STRUCTURAL = Object.freeze([
  { reason: SANITIZATION_REASON.ILLUSTRATION, test: (t) => /^\[Illustration/i.test(t) },
  { reason: SANITIZATION_REASON.ASTERISM, test: (t) => /^(?:\s*\*\s*){3,}$/.test(t) },
  {
    reason: SANITIZATION_REASON.HEADING,
    test: (t) => /^(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\b/i.test(t) && t.length < 60,
  },
  {
    reason: SANITIZATION_REASON.MARKUP,
    test: (t) => [...t].every((character) => '_*[]{}<>|=+~-'.includes(character)),
  },
]);

function finiteInteger(value, field, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${field} must be a safe integer >= ${minimum}`);
  }
  return value;
}

export function createQuarantineLedger() {
  return {};
}

export function countQuarantine(ledger, reason, count = 1) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new TypeError('quarantine ledger must be an object');
  }
  if (!REASONS.has(reason)) throw new TypeError(`unknown sanitation reason: ${reason}`);
  finiteInteger(count, 'quarantine count', 1);
  ledger[reason] = (ledger[reason] ?? 0) + count;
  return ledger;
}

export function mergeQuarantine(target, source) {
  for (const [reason, count] of Object.entries(source || {})) {
    countQuarantine(target, reason, count);
  }
  return target;
}

/** Remove the licence wrapper while leaving the source string untouched. */
export function stripGutenbergWrapper(text) {
  const source = String(text ?? '');
  let start = 0;
  for (const marker of START_MARKERS) {
    const at = source.indexOf(marker);
    if (at === -1) continue;
    const newline = source.indexOf('\n', at);
    start = newline === -1 ? at + marker.length : newline + 1;
    break;
  }

  let end = source.length;
  for (const marker of END_MARKERS) {
    const at = source.indexOf(marker, start);
    if (at !== -1) { end = at; break; }
  }
  return source.slice(start, end).trim();
}

export function classifyStructuralParagraph(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return STRUCTURAL.find((rule) => rule.test(flat))?.reason ?? null;
}

function nextWord(text) {
  return String(text || '').match(/[A-Za-z0-9]+/)?.[0] ?? '';
}

/**
 * Lowercase words that can stand BETWEEN a name title and the name itself:
 * coordinators joining two titles, and nobiliary particles inside one name.
 */
const NAME_CONNECTORS = new Set([
  'and', 'or',
  'de', 'du', 'da', 'del', 'della', 'di', 'dos', 'das',
  'van', 'von', 'der', 'den', 'ten', 'ter', 'la', 'le', 'bin', 'ibn',
]);

/**
 * True when a lowercase connector introduces the rest of a name, so the title's
 * period is internal to the construction rather than a sentence boundary.
 *
 * Both shapes were found by rebuilding the 115k-row corpus and reading what was
 * left: `Mr. and Mrs. Bennet` accounted for 21 truncations and `Mr. de Ville`
 * for the last one. The connector alone is never enough — a capitalised word
 * must follow it — so `I saw the Dr. and left.` keeps its boundary.
 */
function continuesAName(followingText) {
  const match = String(followingText || '').match(/^\s*([A-Za-z&']+)\W+([A-Za-z]+)/);
  if (!match) return false;
  const [, connector, next] = match;
  if (connector !== '&' && !NAME_CONNECTORS.has(connector.toLowerCase())) return false;
  return /^[A-Z]/.test(next);
}

function dottedTail(text) {
  let withoutClosers = String(text || '').trimEnd();
  while (withoutClosers && CLOSERS.has(withoutClosers.at(-1))) {
    withoutClosers = withoutClosers.slice(0, -1).trimEnd();
  }
  if (!withoutClosers.endsWith('.')) return '';
  return withoutClosers.slice(0, -1).match(/([A-Za-z](?:[A-Za-z.]*)?)$/)?.[1] ?? '';
}

/**
 * True only when the period belongs to a bounded abbreviation construction in
 * the supplied context. Context matters: `etc.` may continue a sentence or end
 * one, while `Vol.` is protected only before a number/Roman volume label.
 */
export function endsWithProtectedAbbreviation(text, followingText = '') {
  const word = dottedTail(text);
  if (!word) return false;
  const following = nextWord(followingText);
  if (!following) return false;

  if (/^[A-Z]$/.test(word)) return /^[A-Z]/.test(following);
  const lower = word.toLowerCase();
  if (NAME_TITLES.has(lower)) {
    return /^[A-Z0-9]/.test(following) || continuesAName(followingText);
  }
  if (ENUMERATION_ABBREVIATIONS.has(lower)) return /^(?:\d+|[IVXLCDM]+)$/i.test(following);
  if (CONTINUATION_ABBREVIATIONS.has(lower)) return /^[a-z]/.test(following);
  return false;
}

/**
 * Sentence segmentation with closing-quote awareness and contextual period
 * protection. The output tiles all non-boundary text in order; nothing is
 * deleted here.
 */
export function segmentGutenbergParagraph(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return [];

  const out = [];
  let start = 0;
  let at = 0;
  while (at < flat.length) {
    if (!'.!?'.includes(flat[at])) { at += 1; continue; }

    let punctuationEnd = at + 1;
    while (punctuationEnd < flat.length && '.!?'.includes(flat[punctuationEnd])) {
      punctuationEnd += 1;
    }
    let segmentEnd = punctuationEnd;
    while (segmentEnd < flat.length && CLOSERS.has(flat[segmentEnd])) segmentEnd += 1;

    let nextStart = segmentEnd;
    while (nextStart < flat.length && /\s/.test(flat[nextStart])) nextStart += 1;
    if (nextStart === segmentEnd && nextStart < flat.length) {
      at = punctuationEnd;
      continue;
    }

    const punctuation = flat.slice(at, punctuationEnd);
    const candidate = flat.slice(start, segmentEnd);
    if (
      punctuation === '.'
      && endsWithProtectedAbbreviation(candidate, flat.slice(nextStart))
    ) {
      at = punctuationEnd;
      continue;
    }

    const sentence = candidate.trim();
    if (sentence) out.push(sentence);
    start = nextStart;
    at = nextStart;
  }

  const remainder = flat.slice(start).trim();
  if (remainder) out.push(remainder);
  return out;
}

/**
 * Derive experiment-ready segments with a complete exclusion ledger.
 *
 * `accept` may attach a value to an accepted segment or reject it with one of
 * the declared reason codes. This lets a paired experiment count scope filters
 * such as `noCompound` without hiding them inside caller control flow.
 */
export function sanitizeGutenbergText(text, options = {}) {
  const tokenize = options.tokenize;
  if (typeof tokenize !== 'function') throw new TypeError('tokenize must be a function');
  const minTokens = finiteInteger(options.minTokens ?? 0, 'minTokens', 0);
  const maxTokens = options.maxTokens ?? Number.MAX_SAFE_INTEGER;
  finiteInteger(maxTokens, 'maxTokens', minTokens);
  const accept = options.accept;
  if (accept != null && typeof accept !== 'function') throw new TypeError('accept must be a function');

  const quarantine = createQuarantineLedger();
  const segments = [];
  let paragraphs = 0;
  let sentenceCandidates = 0;
  const body = stripGutenbergWrapper(text);

  for (const paragraph of body.split(/\n\s*\n/)) {
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    paragraphs += 1;
    const structural = classifyStructuralParagraph(flat);
    if (structural) { countQuarantine(quarantine, structural); continue; }

    for (const sentence of segmentGutenbergParagraph(flat)) {
      sentenceCandidates += 1;
      const tokens = tokenize(sentence);
      if (!Array.isArray(tokens)) throw new TypeError('tokenize must return an array');
      if (tokens.length < minTokens) {
        countQuarantine(quarantine, SANITIZATION_REASON.TOO_SHORT);
        continue;
      }
      if (tokens.length > maxTokens) {
        countQuarantine(quarantine, SANITIZATION_REASON.TOO_LONG);
        continue;
      }

      const decision = accept ? accept({ text: sentence, tokens: [...tokens] }) : { accepted: true };
      if (!decision || decision.accepted !== true) {
        const reason = decision?.reason;
        countQuarantine(quarantine, reason);
        continue;
      }
      segments.push({ text: sentence, tokens: [...tokens], value: decision.value ?? null });
    }
  }

  const sentenceQuarantined = (quarantine[SANITIZATION_REASON.TOO_SHORT] ?? 0)
    + (quarantine[SANITIZATION_REASON.TOO_LONG] ?? 0)
    + (quarantine[SANITIZATION_REASON.NO_COMPOUND] ?? 0);
  if (segments.length + sentenceQuarantined !== sentenceCandidates) {
    throw new Error('sanitation accounting invariant failed: a sentence candidate vanished silently');
  }

  return Object.freeze({
    contract: GUTENBERG_SANITIZATION_CONTRACT,
    segments: Object.freeze(segments.map((segment) => Object.freeze(segment))),
    quarantine: Object.freeze({ ...quarantine }),
    counts: Object.freeze({
      paragraphs,
      sentenceCandidates,
      accepted: segments.length,
      sentenceQuarantined,
      structuralQuarantined: Object.entries(quarantine)
        .filter(([reason]) => ![
          SANITIZATION_REASON.TOO_SHORT,
          SANITIZATION_REASON.TOO_LONG,
          SANITIZATION_REASON.NO_COMPOUND,
        ].includes(reason))
        .reduce((sum, [, count]) => sum + count, 0),
    }),
  });
}
