/**
 * SQLite-backed `CareerGraphQueryPort`.
 *
 * This is the retrieval port that runs against the real, adjudicated corpus —
 * `better-sqlite3` in Node tests and SQLite-WASM in the browser worker. It is
 * engine-agnostic: it depends only on a `SqlSelect` callback (`(sql, params) =>
 * rows`), so the exact same SQL and scoring run in both environments.
 *
 * Residency, by construction rather than by row-copying:
 *   - `searchOccupations` reads the pinned `core` shard's FTS index (core holds
 *     every occupation concept, so any occupation resolves before a family
 *     shard is fetched).
 *   - `relatedSkills` reads whichever resident family shard owns the confirmed
 *     occupation. Family shards are self-contained — the build duplicates each
 *     referenced skill concept into the shard — so a family database answers
 *     the frontier query alone, with no cross-shard join.
 *
 * Scoring mirrors the seed port so bucketing/thresholds behave identically
 * whether the app runs on the seed or the corpus: FTS5 MATCH narrows the
 * candidate set cheaply, then each candidate is scored by query-token overlap
 * against its own label/aliases (not by bm25, which is not a 0..1 quantity).
 */
import type {
  CareerGraphQueryPort,
  OccupationRow,
  SkillRelationRow,
} from './reference-query';
import type { OccupationBucket, RequirementKind } from './contracts';

/** Minimal read interface over one shard database. */
export type SqlSelect = (sql: string, params: readonly unknown[]) => Record<string, unknown>[];

/** The 2-digit SOC major group that names an O*NET occupation's family shard. */
export function occupationFamily(externalIdOrConceptId: string): string | null {
  // Accept either a bare external id ("15-1252.00") or a namespaced concept id
  // ("onet:15-1252.00"); non-SOC ids (e.g. ESCO) have no family shard.
  const tail = externalIdOrConceptId.includes(':')
    ? externalIdOrConceptId.slice(externalIdOrConceptId.indexOf(':') + 1)
    : externalIdOrConceptId;
  const m = /^(\d{2})-/.exec(tail);
  return m ? m[1] : null;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'is',
  'are', 'be', 'we', 'you', 'our', 'your', 'need', 'needed', 'must', 'have',
  'has', 'will', 'should', 'role', 'job', 'work', 'looking', 'hire', 'join',
  'team', 'candidate', 'candidates', 'experience', 'experienced', 'strong',
  'plus', 'etc', 'required', 'preferred',
]);

/** Distinct, stopword-free lowercase query tokens (deterministic order). */
export function queryTokens(query: string): string[] {
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
 * Build an FTS5 MATCH expression from free text: OR over the query tokens, each
 * quoted so punctuation and reserved words cannot inject FTS operators. Returns
 * `null` when there is nothing to match.
 */
export function buildFtsMatch(tokens: readonly string[]): string | null {
  if (tokens.length === 0) return null;
  // Double any embedded quote per FTS5 string-literal rules, then wrap.
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

const SEED_FTS_INCLUDE = 0.3;

/**
 * Fraction of query tokens with lexical support in the search text, counting a
 * token as matched when it shares a prefix with any search-text token in either
 * direction ("developer" ⇄ "develop"/"developers"). Real occupation prose is
 * morphologically noisy — exact token equality drops obvious matches — while a
 * prefix rule stays deterministic and needs no stemmer/dictionary.
 */
export function tokenOverlapScore(
  qTokens: readonly string[],
  searchText: string
): number {
  if (qTokens.length === 0) return 0;
  const sTokens = queryTokens(searchText);
  let matched = 0;
  for (const qt of qTokens) {
    if (sTokens.some((st) => st.startsWith(qt) || qt.startsWith(st))) matched += 1;
  }
  return Math.round((matched / qTokens.length) * 100) / 100;
}

function bucketFor(score: number, exact: boolean): OccupationBucket {
  if (exact) return 'exact';
  if (score >= 0.8) return 'alias';
  return 'fts';
}

const SEARCH_SQL = `
  SELECT c.id AS conceptId, c.preferred_label AS label, c.namespace,
         c.external_id AS externalId, c.description AS description
  FROM career_search_fts f
  JOIN career_concept c ON c.id = f.concept_id
  WHERE f.kind = 'occupation' AND career_search_fts MATCH ?
  ORDER BY bm25(career_search_fts)
  LIMIT ?
`;

const RELATED_SQL = `
  SELECT r.to_concept_id AS conceptId, c.preferred_label AS label, c.namespace,
         r.requirement_kind AS requirementKind,
         COALESCE(r.importance, 0) AS importance,
         COALESCE(r.level, 0) AS level,
         r.source_release AS sourceRelease,
         r.from_concept_id AS viaOccupation
  FROM career_relation r
  JOIN career_concept c ON c.id = r.to_concept_id
  WHERE r.predicate = 'requires_skill' AND r.from_concept_id = ?
  ORDER BY r.importance DESC, r.level DESC, r.to_concept_id ASC
  LIMIT ?
`;

export interface SqlGraphPortOptions {
  /** Read the pinned core shard (occupation FTS + concepts). */
  core: SqlSelect;
  /**
   * Resolve a resident family shard reader by 2-digit SOC group, or `null` when
   * that family is not resident. `relatedSkills` returns no rows for a
   * non-resident family rather than throwing, so a missing shard degrades to an
   * empty frontier instead of a crash.
   */
  family: (group: string) => SqlSelect | null;
}

/**
 * A `CareerGraphQueryPort` over resident shard databases. Pure given its
 * readers: identical inputs produce identical, deterministically-ordered rows.
 */
export function createSqlGraphPort(options: SqlGraphPortOptions): CareerGraphQueryPort {
  const { core, family } = options;

  function searchOccupations(query: string, limit: number): OccupationRow[] {
    const tokens = queryTokens(query);
    const match = buildFtsMatch(tokens);
    if (!match) return [];
    const lowered = query.toLowerCase();

    // Over-fetch candidates so post-scoring/thresholding still fills the bound.
    const candidates = core(SEARCH_SQL, [match, Math.max(limit * 4, limit)]);

    const rows: OccupationRow[] = [];
    for (const cand of candidates) {
      const label = String(cand.label ?? '');
      const conceptId = String(cand.conceptId ?? '');
      const externalId = String(cand.externalId ?? '');
      const description = String(cand.description ?? '');
      // Score against the same text FTS indexed (label + description), so an
      // occupation whose title is a near-miss ("Software Developers" vs
      // "developer") still scores on the descriptive tokens rather than being
      // dropped by exact-token mismatch.
      const exact = lowered.includes(label.toLowerCase());
      const score = exact ? 1.0 : tokenOverlapScore(tokens, `${label} ${description}`);
      if (!exact && score < SEED_FTS_INCLUDE) continue;

      rows.push({
        conceptId,
        label,
        namespace: cand.namespace === 'esco' ? 'esco' : 'onet',
        socMajorGroup: occupationFamily(externalId) ?? undefined,
        family: occupationFamily(externalId) ?? undefined,
        matchKind: bucketFor(score, exact),
        matchScore: score,
        sourceRelease: String(cand.namespace === 'esco' ? 'esco' : 'onet'),
      });
    }
    return rows.slice(0, limit);
  }

  function relatedSkills(occupationConceptId: string, limit: number): SkillRelationRow[] {
    const group = occupationFamily(occupationConceptId);
    // Non-SOC occupations (e.g. ESCO) keep their skill edges in core.
    const reader = group ? family(group) : core;
    if (!reader) return [];

    const rows = reader(RELATED_SQL, [occupationConceptId, limit]);
    return rows.map((r) => ({
      conceptId: String(r.conceptId ?? ''),
      label: String(r.label ?? ''),
      namespace: r.namespace === 'esco' ? 'esco' : 'onet',
      requirementKind: (r.requirementKind || 'optional') as RequirementKind,
      importance: Number(r.importance ?? 0),
      level: Number(r.level ?? 0),
      sourceRelease: String(r.sourceRelease ?? ''),
      viaOccupation: String(r.viaOccupation ?? occupationConceptId),
    }));
  }

  return { searchOccupations, relatedSkills };
}
