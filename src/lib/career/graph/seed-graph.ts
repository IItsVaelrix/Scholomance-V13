/**
 * Small, clearly-labeled Career Graph SEED dataset.
 *
 * ⚠️ PROVENANCE: This is a tiny demonstration seed — NOT the pinned O*NET 30.3 /
 * ESCO 1.2.1 corpus. It exists so the full Career Graph UI flow (occupation
 * confirmation → evidence-first skill classification) is exercisable in the
 * running app *today*, before the real SQLite-WASM shards are built (Tasks 4–6).
 *
 * Honesty guardrails:
 *  - Occupation codes use genuine public O*NET SOC identifiers (e.g. 15-1252.00).
 *  - Every emitted concept carries `sourceRelease: 'seed-demo'` and the analysis
 *    embeds a `SEED_GRAPH_DEMO` diagnostic + `career-graph:seed-demo` artifact id,
 *    so no result can be mistaken for the full, adjudicated corpus.
 *  - No checksums are fabricated; the seed manifest checksum is derived
 *    deterministically from this file's own canonical content.
 *
 * The seed implements the exact `CareerGraphQueryPort` from `./reference-query.ts`,
 * so the *same* deterministic retrieval algebra (`inferOccupations`,
 * `buildSkillFrontier`) runs here that will run against SQLite-WASM later.
 */
import type {
  OccupationRow,
  SkillRelationRow,
  CareerGraphQueryPort,
} from './reference-query';
import type { OccupationBucket, RequirementKind } from './contracts';

export const SEED_SOURCE_RELEASE = 'seed-demo' as const;
export const SEED_ARTIFACT_ID = 'career-graph:seed-demo' as const;

interface SeedSkill {
  conceptId: string;
  label: string;
  namespace: 'onet' | 'esco';
  requirementKind: RequirementKind;
  /** O*NET-style importance (1–5). */
  importance: number;
  /** O*NET-style level (1–5). */
  level: number;
}

interface SeedOccupation {
  conceptId: string;
  label: string;
  namespace: 'onet' | 'esco';
  socMajorGroup?: string;
  family: string;
  /** Extra alias phrases that should bucket as `alias` matches. */
  aliases: readonly string[];
  skills: readonly SeedSkill[];
}

/** Genuine O*NET SOC codes; skills are namespaced descriptors for the seed. */
const SEED_OCCUPATIONS: readonly SeedOccupation[] = [
  {
    conceptId: 'onet:15-1252.00',
    label: 'Software Developers',
    namespace: 'onet',
    socMajorGroup: '15-1252',
    family: 'software',
    aliases: ['software engineer', 'application developer'],
    skills: [
      { conceptId: 'onet:skill:python', label: 'Python', namespace: 'onet', requirementKind: 'required', importance: 4.5, level: 4 },
      { conceptId: 'onet:skill:javascript', label: 'JavaScript', namespace: 'onet', requirementKind: 'required', importance: 4.2, level: 4 },
      { conceptId: 'onet:skill:sql', label: 'SQL', namespace: 'onet', requirementKind: 'preferred', importance: 3.8, level: 3 },
      { conceptId: 'onet:skill:react', label: 'React', namespace: 'onet', requirementKind: 'preferred', importance: 3.5, level: 3 },
      { conceptId: 'onet:skill:communication', label: 'Communication', namespace: 'onet', requirementKind: 'required', importance: 4.0, level: 4 },
      { conceptId: 'onet:skill:project-management', label: 'Project Management', namespace: 'onet', requirementKind: 'optional', importance: 3.0, level: 3 },
    ],
  },
  {
    conceptId: 'onet:15-1256.00',
    label: 'Software Quality Assurance Analysts',
    namespace: 'onet',
    socMajorGroup: '15-1256',
    family: 'software',
    aliases: ['qa engineer', 'software tester', 'quality assurance analyst'],
    skills: [
      { conceptId: 'onet:skill:testing', label: 'Software Testing', namespace: 'onet', requirementKind: 'required', importance: 4.8, level: 5 },
      { conceptId: 'onet:skill:sql', label: 'SQL', namespace: 'onet', requirementKind: 'preferred', importance: 3.5, level: 3 },
      { conceptId: 'onet:skill:python', label: 'Python', namespace: 'onet', requirementKind: 'preferred', importance: 3.2, level: 3 },
      { conceptId: 'onet:skill:communication', label: 'Communication', namespace: 'onet', requirementKind: 'required', importance: 4.0, level: 4 },
    ],
  },
  {
    conceptId: 'onet:15-2051.00',
    label: 'Data Scientists',
    namespace: 'onet',
    socMajorGroup: '15-2051',
    family: 'data',
    aliases: ['data scientist', 'machine learning engineer'],
    skills: [
      { conceptId: 'onet:skill:python', label: 'Python', namespace: 'onet', requirementKind: 'required', importance: 4.7, level: 5 },
      { conceptId: 'onet:skill:machine-learning', label: 'Machine Learning', namespace: 'onet', requirementKind: 'required', importance: 4.6, level: 4 },
      { conceptId: 'onet:skill:sql', label: 'SQL', namespace: 'onet', requirementKind: 'required', importance: 4.2, level: 4 },
      { conceptId: 'onet:skill:data-analysis', label: 'Data Analysis', namespace: 'onet', requirementKind: 'required', importance: 4.8, level: 5 },
      { conceptId: 'onet:skill:communication', label: 'Communication', namespace: 'onet', requirementKind: 'preferred', importance: 3.8, level: 3 },
    ],
  },
  {
    conceptId: 'onet:11-2021.00',
    label: 'Marketing Managers',
    namespace: 'onet',
    socMajorGroup: '11-2021',
    family: 'marketing',
    aliases: ['marketing manager', 'digital marketing lead'],
    skills: [
      { conceptId: 'onet:skill:marketing-strategy', label: 'Marketing Strategy', namespace: 'onet', requirementKind: 'required', importance: 4.7, level: 5 },
      { conceptId: 'onet:skill:seo', label: 'Search Engine Optimization', namespace: 'onet', requirementKind: 'preferred', importance: 3.9, level: 4 },
      { conceptId: 'onet:skill:communication', label: 'Communication', namespace: 'onet', requirementKind: 'required', importance: 4.5, level: 4 },
      { conceptId: 'onet:skill:data-analysis', label: 'Data Analysis', namespace: 'onet', requirementKind: 'preferred', importance: 3.3, level: 3 },
      { conceptId: 'onet:skill:project-management', label: 'Project Management', namespace: 'onet', requirementKind: 'required', importance: 4.0, level: 4 },
    ],
  },
];

/** Common posting filler that carry no occupation signal (deterministic). */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'is',
  'are', 'be', 'we', 'you', 'our', 'your', 'need', 'needed', 'must', 'have',
  'has', 'will', 'should', 'role', 'job', 'work', 'looking', 'hire', 'join',
  'team', 'candidate', 'candidates', 'experience', 'experienced', 'strong',
  'plus', 'etc', 'required', 'preferred',
]);

/** Lowercase token set used for FTS-style matching for one occupation. */
function keywordSet(occupation: SeedOccupation): Set<string> {
  const tokens = new Set<string>();
  const absorb = (text: string) => {
    for (const tok of text.toLowerCase().match(/[a-z0-9+#]+/g) ?? []) {
      tokens.add(tok);
    }
  };
  absorb(occupation.label);
  absorb(occupation.family);
  for (const alias of occupation.aliases) absorb(alias);
  for (const skill of occupation.skills) {
    absorb(skill.label);
    // Index the skill's short id too (e.g. `onet:skill:seo` → `seo`) so common
    // abbreviations match even when the label is spelled out.
    absorb(skill.conceptId);
  }
  return tokens;
}

const KEYWORD_SETS: ReadonlyMap<string, Set<string>> = new Map(
  SEED_OCCUPATIONS.map((o) => [o.conceptId, keywordSet(o)])
);

/** Distinct, stopword-free lowercase query tokens (deterministic ordering). */
function queryTokens(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of query.toLowerCase().match(/[a-z0-9+#]+/g) ?? []) {
    if (STOPWORDS.has(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/**
 * Seed inclusion threshold. The seed is a lexical stand-in for the real FTS5
 * port; the policy's production `fts` gate (0.5) governs the real ranking, while
 * the seed uses a slightly looser 0.3 so genuine multi-skill postings surface a
 * realistic candidate frontier for the confirmation flow.
 */
const SEED_FTS_INCLUDE = 0.3;

function bucketFor(score: number, exact: boolean, alias: boolean): OccupationBucket {
  if (exact) return 'exact';
  if (alias) return 'alias';
  if (score >= 0.8) return 'alias';
  return 'fts';
}

/**
 * Deterministic occupation search over the seed. Ordering/bucketing follows the
 * policy thresholds: a full-label match is `exact` (1.0); a recognized alias is
 * `alias` (0.85); otherwise token overlap ≥ 0.5 is an `fts` hit.
 */
export function searchSeedOccupations(query: string, limit: number): OccupationRow[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const lowered = query.toLowerCase();

  const rows: OccupationRow[] = [];
  for (const occupation of SEED_OCCUPATIONS) {
    const keywords = KEYWORD_SETS.get(occupation.conceptId)!;
    const exact = lowered.includes(occupation.label.toLowerCase());
    const alias = occupation.aliases.some((a) => lowered.includes(a.toLowerCase()));
    const matched = tokens.filter((t) => keywords.has(t)).length;
    const overlap = matched / tokens.length;

    let score: number;
    if (exact) score = 1.0;
    else if (alias) score = 0.85;
    else score = Math.round(overlap * 100) / 100;

    if (!exact && !alias && score < SEED_FTS_INCLUDE) continue;

    rows.push({
      conceptId: occupation.conceptId,
      label: occupation.label,
      namespace: occupation.namespace,
      socMajorGroup: occupation.socMajorGroup,
      family: occupation.family,
      matchKind: bucketFor(score, exact, alias),
      matchScore: score,
      sourceRelease: SEED_SOURCE_RELEASE,
    });
  }

  return rows.slice(0, limit);
}

/** Bounded skill traversal from a confirmed occupation. */
export function seedRelatedSkills(occupationConceptId: string, limit: number): SkillRelationRow[] {
  const occupation = SEED_OCCUPATIONS.find((o) => o.conceptId === occupationConceptId);
  if (!occupation) return [];
  return occupation.skills.slice(0, limit).map((skill) => ({
    conceptId: skill.conceptId,
    label: skill.label,
    namespace: skill.namespace,
    requirementKind: skill.requirementKind,
    importance: skill.importance,
    level: skill.level,
    sourceRelease: SEED_SOURCE_RELEASE,
    viaOccupation: occupation.conceptId,
  }));
}

/** A `CareerGraphQueryPort` backed by the in-memory seed dataset. */
export function createSeedGraphPort(): CareerGraphQueryPort {
  return {
    searchOccupations: searchSeedOccupations,
    relatedSkills: seedRelatedSkills,
  };
}

/** Deterministic counts for the sealed seed manifest. */
export function seedConceptCount(): number {
  const skills = new Set<string>();
  for (const o of SEED_OCCUPATIONS) for (const s of o.skills) skills.add(s.conceptId);
  return SEED_OCCUPATIONS.length + skills.size;
}

export function seedRelationCount(): number {
  return SEED_OCCUPATIONS.reduce((sum, o) => sum + o.skills.length, 0);
}
