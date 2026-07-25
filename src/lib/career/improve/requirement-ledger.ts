/**
 * Requirement Ledger — extract weighted requirements from a job description (spec §4.2).
 *
 * Candidate requirement terms come from the EXISTING `keyword-matcher.ts` (stem-based
 * unigrams/bigrams, skills-lexicon aware). Weight combines: term frequency (from the
 * matcher), the resolved modality, and section position (requirements > nice-to-haves).
 * When a `graphPort` is present, terms are canonicalized against graph skill concepts so
 * "postgres"/"mysql"/"relational db" collapse to the canonical SQL concept; it degrades
 * cleanly to the seeded evidence-law canonicalization when the graph is off.
 *
 * Four admission gates decide what counts as a requirement at all. Each exists because
 * its absence produced measured bad advice on a realistic JD:
 *
 *   1. SCAFFOLDING — a phrase with no content word ("solid understanding") names nothing
 *      the candidate can demonstrate. It reached the SKILLS section verbatim.
 *   2. BOILERPLATE — occurrences under "Benefits"/"About us" describe the employer.
 *      "competitive salary" and "generous PTO" were being proposed as résumé content.
 *   3. EVIDENCE — a term with no locatable JD span (the matcher emits stemmed bigrams
 *      like "salary generous" whose surface never occurs) escapes every location-based
 *      check and cannot be quoted back to the candidate.
 *   4. NEGATION — "X is not required" must never become advice to add X. Checked BEFORE
 *      cues, since the old scan matched "required" inside "not required" and boosted the
 *      excluded skill by 1.5x.
 *
 * Modality is resolved per occurrence from the surrounding CLAUSE and aggregated by
 * PRECEDENCE, not sequence: folding cues with max-then-min made the same two sentences in
 * the opposite order yield a 2.1x different weight.
 */
import { analyzeKeywordGapStrict } from '../analysis/keyword-matcher.js';
import { STOPWORDS } from '../stopwords.js';
import { resolveEvidenceLaw } from './data/skill-evidence-law.js';
import { clauseAt } from './jd-clause.js';
import type { CareerGraphQueryPort } from '../graph/reference-query.js';
import type { CanonicalSkill, Requirement, RequirementModality } from './types.js';
import type { TextSpan } from '../parser/types.js';

const STRONG_CUES = ['required', 'must have', 'must-have', 'essential', 'mandatory', 'strong'];
const SOFT_CUES = ['plus', 'preferred', 'nice to have', 'nice-to-have', 'bonus', 'advantage'];

const REQUIRE_HEADINGS = ['require', 'qualif', 'must', 'essential', 'what you', 'responsib'];
const NICETOHAVE_HEADINGS = ['nice', 'preferred', 'bonus', 'plus', 'advantage', 'desirable'];

/**
 * Headings whose sections describe the EMPLOYER, not the candidate. Nothing under them is
 * a requirement, so terms appearing only here are dropped outright rather than
 * down-weighted — otherwise "competitive salary" and "generous PTO" enter the ledger and
 * the advisor proposes writing them into the résumé.
 *
 * Deliberately a tight allow-list matched against the heading text: an UNRECOGNIZED
 * heading keeps its terms. Missing a real requirement is recoverable; inventing one from
 * a perks list is not.
 */
const BOILERPLATE_HEADINGS = [
  'about us',
  'about the company',
  'about our company',
  'who we are',
  'why join',
  'why work',
  'our mission',
  'our culture',
  'company overview',
  'benefits',
  'perks',
  'what we offer',
  'compensation',
  'salary',
  'equal opportunity',
  'eeo',
  'how to apply',
];

/**
 * Words that describe the SHAPE of a requirement rather than its content. A JD says
 * "solid understanding of dimensional modeling" — the requirement is the modeling, and
 * "solid understanding" is scaffolding around it.
 *
 * Scoped to this module on purpose: the shared `STOPWORDS` set runs before n-gram
 * extraction and is a frozen cross-consumer contract, whereas these words are only
 * meaningless in the specific position of "a thing the JD requires". A phrase is dropped
 * only when EVERY token is scaffolding, so "prior fintech experience" and "sql skills"
 * survive on the strength of their one content word.
 */
const REQUIREMENT_SCAFFOLDING = new Set([
  'ability', 'able', 'background', 'basic', 'comfort', 'comfortable', 'competency',
  'deep', 'demonstrated', 'excellent', 'experience', 'experienced', 'expertise',
  'exposure', 'familiar', 'familiarity', 'good', 'great', 'hands', 'hands-on',
  'knowledge', 'level', 'minimum', 'plus', 'practical', 'preferred', 'prior', 'proficiency',
  'proficient', 'proven', 'record', 'required', 'skill', 'skills', 'solid', 'strong',
  'successful', 'track', 'understanding', 'willingness', 'year', 'years',
]);

/**
 * True when the phrase carries no content word — every token is scaffolding or a
 * connective. Such a phrase names no skill, task, or credential and must not become a
 * requirement: downstream it is quoted back to the candidate and written into their
 * SKILLS section verbatim.
 */
function isScaffoldingOnly(term: string): boolean {
  const tokens = String(term ?? '').toLowerCase().match(/[a-z0-9+#]+/g) ?? [];
  if (tokens.length === 0) return true;
  return tokens.every((t) => REQUIREMENT_SCAFFOLDING.has(t) || STOPWORDS.has(t));
}

/** Weight multiplier per resolved modality. `negated` scores 0 — it is dropped, not ranked. */
const MODALITY_MULTIPLIER: Record<RequirementModality, number> = {
  required: 1.5,
  preferred: 0.7,
  unmarked: 1,
  negated: 0,
};

/** Strongest-wins order. The first modality present across occurrences is the verdict. */
const MODALITY_PRECEDENCE: RequirementModality[] = ['required', 'preferred', 'unmarked', 'negated'];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cues match on word boundaries, never as substrings: "surplus" is not the soft cue
 * "plus", and "restrongly" is not "strong".
 */
function cueMatcher(cue: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(cue)}\\b`, 'i');
}
const STRONG_CUE_RE = STRONG_CUES.map(cueMatcher);
const SOFT_CUE_RE = SOFT_CUES.map(cueMatcher);

/** Negation markers. Checked BEFORE cues so "not required" can never read as "required". */
const NEGATOR_RE = /\b(?:not|no|never|nor|without|cannot|excluding)\b|n['’]t\b/i;

/** Modality of a single occurrence, from the clause around it. */
function occurrenceModality(clause: string): RequirementModality {
  if (NEGATOR_RE.test(clause)) return 'negated';
  if (STRONG_CUE_RE.some((re) => re.test(clause))) return 'required';
  if (SOFT_CUE_RE.some((re) => re.test(clause))) return 'preferred';
  return 'unmarked';
}

/**
 * Aggregate every occurrence into one modality by precedence.
 *
 * Precedence — not sequence — is what makes this stable: the previous implementation
 * folded cues with `Math.max` for strong and `Math.min` for soft, so the same two
 * sentences in the opposite order produced a 2.1x different weight.
 */
function resolveModality(text: string, spans: TextSpan[]): RequirementModality {
  if (spans.length === 0) return 'unmarked';
  const seen = new Set<RequirementModality>(
    spans.map((s) => occurrenceModality(clauseAt(text, s.start, s.end)))
  );
  for (const modality of MODALITY_PRECEDENCE) {
    if (seen.has(modality)) return modality;
  }
  return 'unmarked';
}

/**
 * All raw spans where `term` occurs in `text` (word-boundary for alnum terms).
 *
 * Matching is case-insensitive against the ORIGINAL text, never against a `toLowerCase()`
 * copy. Lowercasing is not length-preserving — "İ".toLowerCase() is two characters — so a
 * single such character shifts every later index by one. The spans are consumed as
 * original-text coordinates (quoted back to the candidate as JD evidence, and used to
 * locate the governing clause and section), so a lowercased search space silently drifts
 * every one of those reads.
 */
function findTermSpans(text: string, term: string, max = 8): TextSpan[] {
  const spans: TextSpan[] = [];
  const t = term.trim();
  if (!t) return spans;

  const pattern = /^[a-zA-Z0-9]+$/.test(t)
    ? `(?:^|[^a-zA-Z0-9])(${escapeRegExp(t)})(?:[^a-zA-Z0-9]|$)`
    : `(${escapeRegExp(t)})`;
  const re = new RegExp(pattern, 'gi');

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && spans.length < max) {
    const start = m.index + m[0].indexOf(m[1]);
    spans.push({ coordinateSpace: 'raw', start, end: start + m[1].length });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return spans;
}

/**
 * Is this line a section heading rather than a list item?
 *
 * A heading either ends with ':' ("Requirements:") or is caps-dominant ("REQUIREMENTS").
 * Length alone is not a heading test — that was the old rule, and in a bulleted JD the
 * nearest short line above a bullet is almost always the PREVIOUS BULLET, so a neighbour
 * saying "preferred" silently demoted its successor by 40%.
 */
function isHeadingLine(line: string): boolean {
  if (!line || line.length > 60) return false;
  if (line.endsWith(':')) return true;
  const letters = line.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/** Nearest preceding heading line for a given offset (lowercased), or ''. */
function precedingHeading(text: string, offset: number): string {
  const lines = text.slice(0, offset).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (isHeadingLine(line)) return line.toLowerCase();
  }
  return '';
}

/** Does this occurrence sit under an employer-description heading? */
function inBoilerplateSection(text: string, span: TextSpan): boolean {
  const heading = precedingHeading(text, span.start);
  if (!heading) return false;
  return BOILERPLATE_HEADINGS.some((h) => heading.includes(h));
}

/** Is this occurrence inside the heading line itself? "Benefits:" is a label, not a skill. */
function insideHeadingLine(text: string, span: TextSpan): boolean {
  const lineStart = text.lastIndexOf('\n', span.start) + 1;
  let lineEnd = text.indexOf('\n', span.end);
  if (lineEnd === -1) lineEnd = text.length;
  return isHeadingLine(text.slice(lineStart, lineEnd).trim());
}

function positionMultiplier(text: string, spans: TextSpan[]): number {
  if (spans.length === 0) return 1;
  const heading = precedingHeading(text, spans[0].start);
  if (NICETOHAVE_HEADINGS.some((h) => heading.includes(h))) return 0.6;
  if (REQUIRE_HEADINGS.some((h) => heading.includes(h))) return 1.3;
  return 1;
}

/** Build a term → { conceptId, label } map from the graph (best effort, deterministic). */
function buildGraphConceptMap(
  port: CareerGraphQueryPort,
  jdText: string
): Map<string, { conceptId: string; label: string }> {
  const map = new Map<string, { conceptId: string; label: string }>();
  try {
    const query = jdText.trim().slice(0, 80) || jdText.trim();
    const occupations = port.searchOccupations(query, 1);
    if (!occupations || occupations.length === 0) return map;
    const skills = port.relatedSkills(occupations[0].conceptId, 200) || [];
    for (const skill of skills) {
      const label = skill.label;
      const entry = { conceptId: skill.conceptId, label };
      map.set(label.toLowerCase(), entry);
      // Also index the evidence-law aliases of this label so postgres/mysql → SQL concept.
      const law = resolveEvidenceLaw(label);
      if (law) {
        for (const alias of law.aliases) map.set(alias.toLowerCase(), entry);
        map.set(law.canonicalLabel.toLowerCase(), entry);
      }
    }
  } catch {
    // Graph unavailable — degrade cleanly.
  }
  return map;
}

/**
 * Index an already-resolved canonical skill vocabulary the same way the graph map is
 * indexed: by label, plus the evidence-law aliases that canonicalize to that label. The
 * Career Graph worker resolves these against the built corpus, so they carry real concept
 * ids — unlike the seeded law's placeholders, which exist in no shard.
 */
function buildCanonicalSkillMap(
  skills: readonly CanonicalSkill[]
): Map<string, { conceptId: string; label: string }> {
  const map = new Map<string, { conceptId: string; label: string }>();
  for (const skill of skills) {
    if (!skill?.conceptId || !skill?.label) continue;
    const entry = { conceptId: skill.conceptId, label: skill.label };
    map.set(skill.label.toLowerCase(), entry);
    const law = resolveEvidenceLaw(skill.label);
    if (law) {
      for (const alias of law.aliases) map.set(alias.toLowerCase(), entry);
      map.set(law.canonicalLabel.toLowerCase(), entry);
    }
  }
  return map;
}

export function buildRequirementLedger(
  jdText: string,
  graphPort?: CareerGraphQueryPort,
  canonicalSkills?: readonly CanonicalSkill[]
): Requirement[] {
  const text = String(jdText ?? '');
  if (!text.trim()) return [];

  // Reuse the existing matcher to extract weighted JD candidate terms. With an empty
  // résumé every term is "missing", but `jobKeywords` carries the weighted JD terms.
  const gap = analyzeKeywordGapStrict('', text, { topK: 40 });

  // Corpus-resolved vocabulary wins over a live graph query, which wins over the seeded
  // law's placeholder ids.
  const graphConcepts = graphPort ? buildGraphConceptMap(graphPort, text) : null;
  const canonicalConcepts = canonicalSkills?.length
    ? buildCanonicalSkillMap(canonicalSkills)
    : null;

  const raw: Array<{ req: Requirement; rawWeight: number }> = [];

  for (const hit of gap.jobKeywords) {
    const term = hit.term;
    // A phrase with no content word names nothing the candidate could demonstrate.
    if (isScaffoldingOnly(term)) continue;
    // Employer-description occurrences are not evidence of a requirement, and a heading
    // word is a label rather than a skill.
    const spans = findTermSpans(text, term).filter(
      (s) => !inBoilerplateSection(text, s) && !insideHeadingLine(text, s)
    );
    // EVIDENCE LAW: no locatable JD span, no requirement. The matcher emits stemmed
    // bigrams whose surface never occurs in the JD ("salary generous"); unlocatable, they
    // escape negation, section, and position checks and cannot be quoted to the candidate.
    if (spans.length === 0) continue;
    const modality = resolveModality(text, spans);
    // A requirement the JD rules out is not a requirement. Dropping it here is the only
    // guarantee that no downstream rule can draft advice to add a skill the JD excluded.
    if (modality === 'negated') continue;
    const position = positionMultiplier(text, spans);
    const rawWeight = Math.max(0.0001, hit.weight) * MODALITY_MULTIPLIER[modality] * position;

    // Canonicalization: evidence law first (deterministic, offline), graph overrides id.
    const law = resolveEvidenceLaw(term);
    let canonicalLabel: string | undefined = law?.canonicalLabel;
    let canonicalConceptId: string | undefined = law?.conceptId;

    const key = (law?.canonicalLabel || term).toLowerCase();
    for (const source of [graphConcepts, canonicalConcepts]) {
      if (!source) continue;
      const hit = source.get(key) || source.get(term.toLowerCase());
      if (hit) {
        canonicalLabel = hit.label;
        canonicalConceptId = hit.conceptId;
      }
    }

    raw.push({
      rawWeight,
      req: {
        term,
        canonicalLabel,
        canonicalConceptId,
        modality,
        weight: 0, // normalized below
        jdEvidence: spans,
      },
    });
  }

  if (raw.length === 0) return [];

  const maxWeight = Math.max(...raw.map((r) => r.rawWeight));
  const requirements: Requirement[] = raw.map((r) => ({
    ...r.req,
    weight: maxWeight > 0 ? Math.min(1, r.rawWeight / maxWeight) : 0,
  }));

  // Deterministic order: weight desc, then term asc.
  requirements.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.term < b.term ? -1 : a.term > b.term ? 1 : 0;
  });

  return requirements;
}
