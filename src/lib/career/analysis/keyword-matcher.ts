import { normalizeText, stem as baseStem } from '../text-utils.js';
import { STOPWORDS } from '../stopwords.js';
import { splitPhraseSegments } from '../keyword-gap.js';
import { ACRONYM_MAP } from '../acronyms.js';
import { TORQUE_MAP } from '../transmuter.js';
import type { MatchKind, KeywordHitResult, KeywordGapAnalysis } from './types';

const DEFAULT_TOP_K = 30;
const DEFAULT_MIN_LENGTH = 3;
const BASE_WEIGHT = Object.freeze({ unigram: 1.0, bigram: 2.0 });
const LEXICON_MULTIPLIER = 1.5;

const DEFAULT_SKILLS_LEXICON = Object.freeze([
  'javascript', 'typescript', 'python', 'java', 'react', 'node', 'sql',
  'aws', 'azure', 'docker', 'kubernetes', 'graphql', 'rest', 'api',
  'ci-cd', 'devops', 'git', 'agile', 'scrum', 'testing', 'design', 'data',
  'machine learning', 'leadership', 'analytics', 'cloud', 'security',
]);

const EXTRA_ALIASES: Record<string, string[]> = {
  'k8s': ['kubernetes'],
  'kubernetes': ['k8s'],
  'js': ['javascript'],
  'javascript': ['js'],
  'ts': ['typescript'],
  'typescript': ['ts'],
  'react': ['reactjs', 'react.js'],
  'node': ['nodejs', 'node.js'],
  'postgres': ['postgresql'],
  'postgresql': ['postgres'],
};

/**
 * Enhanced stemmer that cleans trailing punctuation and handles common suffixes like -ment.
 */
function cleanStem(token: string): string {
  if (!token) return '';
  let cleaned = token.toLowerCase().replace(/^[^a-z0-9+#-]+|[^a-z0-9+#-]+$/gi, '');
  if (!cleaned) return '';
  if (cleaned.length > 5 && cleaned.endsWith('ment')) {
    cleaned = cleaned.slice(0, -4); // e.g. management -> manage
  }
  return baseStem(cleaned);
}

function tokenize(normalized: string, minLength: number): string[] {
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((tok) => tok.replace(/^[^a-z0-9+#-]+|[^a-z0-9+#-]+$/gi, ''))
    .filter((tok) => tok.length >= minLength && !STOPWORDS.has(tok));
}

function buildStemSet(normalized: string, minLength: number): Set<string> {
  const set = new Set<string>();
  for (const tok of tokenize(normalized, minLength)) set.add(cleanStem(tok));
  return set;
}

function buildLexiconStemSet(skillsLexicon: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const entry of skillsLexicon) {
    if (typeof entry !== 'string') continue;
    for (const tok of normalizeText(entry).split(' ')) {
      if (tok) set.add(cleanStem(tok));
    }
  }
  return set;
}

function byWeightThenTerm(a: { weight: number; term: string }, b: { weight: number; term: string }): number {
  if (b.weight !== a.weight) return b.weight - a.weight;
  if (a.term < b.term) return -1;
  if (a.term > b.term) return 1;
  return 0;
}

function extractKeywords(
  segments: string[][],
  lexiconStems: Set<string>,
  includeBigrams: boolean
) {
  const counts = new Map<string, { term: string; kind: 'unigram' | 'bigram'; frequency: number }>();

  const bump = (term: string, kind: 'unigram' | 'bigram') => {
    const existing = counts.get(term);
    if (existing) existing.frequency += 1;
    else counts.set(term, { term, kind, frequency: 1 });
  };

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
    const stems = parts.map(cleanStem);
    const inSkillsLexicon = stems.some((s) => lexiconStems.has(s));
    const baseW = BASE_WEIGHT[kind];
    const weight = baseW * (1 + Math.log2(frequency)) * (inSkillsLexicon ? LEXICON_MULTIPLIER : 1);

    hits.push({
      term,
      stem: kind === 'unigram' ? stems[0] : stems.join(' '),
      stems,
      kind,
      frequency,
      weight,
      inSkillsLexicon,
    });
  }
  return hits;
}

function getAliasesForTerm(normTerm: string): string[] {
  const aliases: string[] = [];

  if (ACRONYM_MAP[normTerm as keyof typeof ACRONYM_MAP]) {
    aliases.push(ACRONYM_MAP[normTerm as keyof typeof ACRONYM_MAP]);
  }
  for (const [acr, exp] of Object.entries(ACRONYM_MAP)) {
    if (normalizeText(exp) === normTerm) {
      aliases.push(acr);
    }
  }

  if (EXTRA_ALIASES[normTerm]) {
    aliases.push(...EXTRA_ALIASES[normTerm]);
  }

  if (TORQUE_MAP[normTerm as keyof typeof TORQUE_MAP]) {
    aliases.push(TORQUE_MAP[normTerm as keyof typeof TORQUE_MAP]);
  }
  for (const [low, high] of Object.entries(TORQUE_MAP)) {
    if (high.toLowerCase() === normTerm) {
      aliases.push(low);
    }
  }

  return aliases;
}

function isAliasPresentInResume(normTerm: string, resumeText: string, normResume: string, resumeStems: Set<string>): boolean {
  const aliases = getAliasesForTerm(normTerm);
  if (aliases.length === 0) return false;

  for (const alias of aliases) {
    const normAlias = normalizeText(alias);
    if (!normAlias) continue;

    const regex = new RegExp(`(?:^|\\s|\\b)${normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|\\b|$)`, 'i');
    if (regex.test(resumeText) || regex.test(normResume)) {
      return true;
    }

    const aliasStems = normAlias.split(' ').map(cleanStem).filter(Boolean);
    if (aliasStems.length > 0 && aliasStems.every((s) => resumeStems.has(s))) {
      return true;
    }
  }

  return false;
}

export function analyzeKeywordGapStrict(
  resumeText: string,
  jobDescriptionText: string,
  options: {
    topK?: number;
    minLength?: number;
    includeBigrams?: boolean;
    skillsLexicon?: string[];
  } = {}
): KeywordGapAnalysis {
  const topK = Number.isInteger(options.topK) && options.topK! > 0 ? options.topK! : DEFAULT_TOP_K;
  const minLength =
    Number.isInteger(options.minLength) && options.minLength! > 0
      ? options.minLength!
      : DEFAULT_MIN_LENGTH;
  const includeBigrams = options.includeBigrams !== false;
  const skillsLexicon = Array.isArray(options.skillsLexicon)
    ? options.skillsLexicon
    : DEFAULT_SKILLS_LEXICON;

  const normResume = normalizeText(resumeText);
  const rawResumeLower = String(resumeText ?? '').toLowerCase();
  const resumeStems = buildStemSet(normResume, minLength);
  const lexiconStems = buildLexiconStemSet(skillsLexicon);

  const rawResumeSegments = splitPhraseSegments(resumeText);
  const resumeSegmentStems: string[][] = rawResumeSegments.map((seg) =>
    tokenize(normalizeText(seg), minLength).map(cleanStem)
  );

  const rawJdSegments = splitPhraseSegments(jobDescriptionText);
  const jdSegments = rawJdSegments
    .map((seg) => tokenize(normalizeText(seg), minLength))
    .filter((toks) => toks.length > 0);

  const allKeywords = extractKeywords(jdSegments, lexiconStems, includeBigrams).sort(byWeightThenTerm);
  const topCandidates = allKeywords.slice(0, topK);

  const matchedHits: KeywordHitResult[] = [];
  const missingHits: KeywordHitResult[] = [];
  const jobKeywords: KeywordHitResult[] = [];

  for (const cand of topCandidates) {
    const normTerm = normalizeText(cand.term);
    const rawTermLower = cand.term.toLowerCase().trim();
    const candStems = cand.stems;

    let kind: MatchKind = 'missing';

    // 1. Exact phrase check
    if (rawResumeLower.includes(rawTermLower) || (normTerm && normResume.includes(normTerm))) {
      kind = 'exact_phrase';
    } else {
      // 2. Contiguous run in phrase segment check
      let contiguousMatch = false;

      for (const segStems of resumeSegmentStems) {
        if (segStems.length < candStems.length) continue;

        for (let i = 0; i <= segStems.length - candStems.length; i++) {
          const window = segStems.slice(i, i + candStems.length);
          const isExactOrder = candStems.every((st, idx) => window[idx] === st);
          const isSetMatch = candStems.every((st) => window.includes(st)) && window.every((st) => candStems.includes(st));

          if (isExactOrder || isSetMatch) {
            contiguousMatch = true;
            break;
          }
        }
        if (contiguousMatch) break;
      }

      if (contiguousMatch) {
        kind = 'normalized_phrase';
      } else if (isAliasPresentInResume(normTerm, resumeText, normResume, resumeStems)) {
        // 3. Recognized alias check
        kind = 'recognized_alias';
      } else if (candStems.length > 1 && candStems.every((s) => resumeStems.has(s))) {
        // 4. Component only check
        kind = 'component_only';
      } else {
        // 5. Missing
        kind = 'missing';
      }
    }

    const matched = kind === 'exact_phrase' || kind === 'normalized_phrase' || kind === 'recognized_alias';

    const resultItem: KeywordHitResult = {
      term: cand.term,
      kind,
      weight: cand.weight,
      matched,
      inSkillsLexicon: cand.inSkillsLexicon,
    };

    jobKeywords.push(Object.freeze(resultItem));
    if (matched) {
      matchedHits.push(Object.freeze(resultItem));
    } else {
      missingHits.push(Object.freeze(resultItem));
    }
  }

  return Object.freeze({
    matched: Object.freeze(matchedHits),
    missing: Object.freeze(missingHits),
    jobKeywords: Object.freeze(jobKeywords),
  });
}
