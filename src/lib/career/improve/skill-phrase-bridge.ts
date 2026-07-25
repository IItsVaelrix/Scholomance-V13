/**
 * Skill Phrase Bridge — tiered evidence, not a flat phrase list (spec §4.3).
 *
 * The critical correction: a phrase match is not proof of a skill. The bridge returns a
 * **tier** governed by an explicit evidence law per skill (seeded in
 * `./data/skill-evidence-law.ts`). Deterministic and explainable — no ML. Unknown skills
 * fall back to label-token exact match = demonstrated, else none (never a speculative
 * adjacent).
 */
import { resolveEvidenceLaw } from './data/skill-evidence-law.js';
import type { EvidenceTier, Requirement } from './types.js';

export interface BridgeResult {
  tier: EvidenceTier;
  /** The phrase in the bullet that produced the tier (empty for `none`). */
  matchedPhrase: string;
}

/** True when `needle` occurs in `haystack` (both lowercased). Word-boundary for plain
 *  alphanumeric tokens, substring otherwise (handles `pl/sql`, `t-sql`, multi-word phrases). */
function termOccurs(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  if (!n) return false;
  if (/^[a-z0-9]+$/.test(n)) {
    const re = new RegExp(`(?:^|[^a-z0-9])${n}(?:[^a-z0-9]|$)`, 'i');
    return re.test(haystack);
  }
  return haystack.includes(n);
}

function firstMatch(haystack: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    if (termOccurs(haystack, term)) return term.trim();
  }
  return null;
}

/** Function words that carry no evidence weight inside a requirement phrase. */
const PHRASE_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'to', 'at', 'by',
]);

/** Lowercase alphanumeric tokens (keeps `c++`, `c#`, `pl/sql` splits predictable). */
function tokenize(text: string): string[] {
  return String(text ?? '').toLowerCase().match(/[a-z0-9+#]+/g) ?? [];
}

/**
 * Crude, deterministic suffix stem — enough to unify the inflections that actually appear
 * between a JD noun and a résumé verb ("training" ⇄ "trained", "communications" ⇄
 * "communication", "reports" ⇄ "reporting"). Deliberately NOT a full stemmer: no
 * dictionary, no doubled-consonant restoration, no `-er`/`-ion` stripping (which would
 * collapse "customer"→"custom" and merge unrelated terms). Two passes so a doubly
 * inflected form ("trainings") reduces the same as a singly inflected one.
 */
export function stemToken(token: string): string {
  let word = token;
  for (let pass = 0; pass < 2; pass += 1) {
    const before = word;
    if (word.length > 4 && word.endsWith('ies')) {
      word = word.slice(0, -3) + 'y';
    } else if (word.length > 4 && /(?:s|x|z|ch|sh)es$/.test(word)) {
      word = word.slice(0, -2);
    } else if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
      word = word.slice(0, -1);
    } else if (word.length > 4 && word.endsWith('ing')) {
      word = word.slice(0, -3);
    } else if (word.length > 3 && word.endsWith('ed')) {
      word = word.slice(0, -2);
    }
    if (word === before) break;
  }
  return word;
}

/** Shortest token length at which a prefix relation is treated as a match. */
const MIN_PREFIX_LENGTH = 4;

/**
 * True when two surface tokens denote the same thing. Stem equality handles inflection;
 * the bidirectional prefix rule (the same one `sqlite-graph-port.tokenOverlapScore` uses
 * for occupation search) handles derivations like "develop" ⇄ "developer". Short tokens
 * ("sql", "erp") require exact stem equality so a prefix can never widen them.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stemToken(a);
  const sb = stemToken(b);
  if (sa === sb) return true;
  if (sa.length < MIN_PREFIX_LENGTH || sb.length < MIN_PREFIX_LENGTH) return false;
  return sa.startsWith(sb) || sb.startsWith(sa);
}

interface PhraseCoverage {
  /** Requirement content tokens that found a match in the bullet. */
  covered: number;
  /** Total requirement content tokens considered. */
  total: number;
  /** True when the matching bullet tokens form an unbroken run. */
  contiguous: boolean;
  /** The bullet's own surface tokens that produced the matches, in bullet order. */
  matchedPhrase: string;
}

const EMPTY_COVERAGE: PhraseCoverage = {
  covered: 0,
  total: 0,
  contiguous: false,
  matchedPhrase: '',
};

/**
 * Coverage of one requirement phrase against a bullet's tokens.
 *
 * Contiguity is tracked because full coverage alone is not phrase evidence: tokens
 * scattered across a bullet ("customer" in one clause, "retention" in another) are the
 * loose co-occurrence match that `keyword-matcher` deliberately refuses. Here that case is
 * demoted to `adjacent` rather than credited as `demonstrated`.
 */
function phraseCoverage(phrase: string, bulletTokens: readonly string[]): PhraseCoverage {
  const phraseTokens = tokenize(phrase).filter((t) => !PHRASE_STOPWORDS.has(t));
  if (phraseTokens.length === 0) return EMPTY_COVERAGE;

  const matchedIndexes = new Set<number>();
  let covered = 0;
  for (const pt of phraseTokens) {
    const hit = bulletTokens.findIndex((bt) => tokensMatch(pt, bt));
    if (hit === -1) continue;
    covered += 1;
    matchedIndexes.add(hit);
  }
  if (covered === 0) return EMPTY_COVERAGE;

  const ordered = [...matchedIndexes].sort((a, b) => a - b);
  const span = ordered[ordered.length - 1] - ordered[0] + 1;

  return {
    covered,
    total: phraseTokens.length,
    contiguous: span === ordered.length,
    matchedPhrase: ordered.map((i) => bulletTokens[i]).join(' '),
  };
}

/** The strongest coverage across a requirement's canonical label and its surface term. */
function bestCoverage(phrases: readonly string[], bulletTokens: readonly string[]): PhraseCoverage {
  let best = EMPTY_COVERAGE;
  for (const phrase of phrases) {
    const cov = phraseCoverage(phrase, bulletTokens);
    const isFull = cov.total > 0 && cov.covered === cov.total && cov.contiguous;
    const bestIsFull = best.total > 0 && best.covered === best.total && best.contiguous;
    if (isFull && !bestIsFull) {
      best = cov;
    } else if (isFull === bestIsFull && cov.covered > best.covered) {
      best = cov;
    }
  }
  return best;
}

/**
 * Evaluate the evidence tier for a requirement against a single bullet's text.
 *
 * @param canonical the requirement (its canonicalLabel/term drives the evidence law)
 * @param bulletText the bullet's raw text
 */
export function bridgeEvidenceDetail(canonical: Requirement, bulletText: string): BridgeResult {
  const haystack = String(bulletText ?? '').toLowerCase();
  const label = (canonical.canonicalLabel || canonical.term || '').trim();
  const law = resolveEvidenceLaw(label) || resolveEvidenceLaw(canonical.term);

  // 1. A seeded authorship phrase is the strongest evidence there is.
  if (law) {
    const demonstrated = firstMatch(haystack, law.demonstrated);
    if (demonstrated) return { tier: 'demonstrated', matchedPhrase: demonstrated };
  }

  // 2. The skill's own name, present as a contiguous phrase (inflection tolerated). This
  //    runs even when a law exists: a law lists corroborating phrases, not the label
  //    itself, so law-only lookup scored an explicit "Leadership of ..." mention as `none`.
  const bulletTokens = tokenize(haystack);
  const phrases = label && label.toLowerCase() !== canonical.term?.toLowerCase()
    ? [label, canonical.term]
    : [label || canonical.term];
  const coverage = bestCoverage(phrases.filter(Boolean) as string[], bulletTokens);
  if (coverage.total > 0 && coverage.covered === coverage.total && coverage.contiguous) {
    return { tier: 'demonstrated', matchedPhrase: coverage.matchedPhrase };
  }

  // 3. A seeded adjacent phrase — related, but not proof of authorship.
  if (law) {
    const adjacent = firstMatch(haystack, law.adjacent);
    if (adjacent) return { tier: 'adjacent', matchedPhrase: adjacent };
  }

  // 4. Partial (or scattered) coverage of a MULTI-token requirement is adjacent: the bullet
  //    is in the right territory without stating the whole requirement. A single-token
  //    requirement has no partial state — it is present or it is not — so it can never
  //    reach here, preserving "never a speculative adjacent".
  if (coverage.total > 1 && coverage.covered > 0) {
    return { tier: 'adjacent', matchedPhrase: coverage.matchedPhrase };
  }

  return { tier: 'none', matchedPhrase: '' };
}

/** Spec-shaped convenience: just the tier. */
export function bridgeEvidence(canonical: Requirement, bulletText: string): EvidenceTier {
  return bridgeEvidenceDetail(canonical, bulletText).tier;
}
