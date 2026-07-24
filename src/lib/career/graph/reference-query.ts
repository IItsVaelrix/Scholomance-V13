/**
 * Reference (Node-side) Career Graph retrieval logic.
 *
 * The graph is queried through a narrow `CareerGraphQueryPort` so the exact same
 * retrieval algebra runs against `better-sqlite3` in the build/evaluator and against
 * SQLite WASM in the browser worker. Retrieval is FTS5/graph-first and fully
 * deterministic: ordering is bucket desc, score desc, conceptId asc; deduplication
 * is by conceptId; the frontier is bounded by the policy `maxCandidates`.
 *
 * Vectors (Task 13) may only *reorder* the lawful frontier produced here; they may
 * never create concepts, relations, or classifications.
 */
import type {
  OccupationBucket,
  OccupationCandidate,
  RequirementKind,
} from './contracts';
import type { CareerPolicyBundle } from './contracts';
import { CAREER_THRESHOLDS } from './policies';

/** A raw occupation hit returned by the query port. */
export interface OccupationRow {
  conceptId: string;
  label: string;
  namespace: 'onet' | 'esco';
  socMajorGroup?: string;
  family?: string;
  matchKind: OccupationBucket;
  matchScore: number;
  sourceRelease: string;
}

/** A raw skill relation returned by bounded graph traversal. */
export interface SkillRelationRow {
  conceptId: string;
  label: string;
  namespace: 'onet' | 'esco';
  requirementKind: RequirementKind;
  importance: number;
  level: number;
  sourceRelease: string;
  /** The occupation concept id this relation was traversed from. */
  viaOccupation: string;
}

/** Narrow read port over the canonical graph (SQLite native or WASM). */
export interface CareerGraphQueryPort {
  searchOccupations(query: string, limit: number): OccupationRow[];
  relatedSkills(occupationConceptId: string, limit: number): SkillRelationRow[];
}

export interface InferOptions {
  policy: CareerPolicyBundle;
  /** Override the policy frontier bound. */
  limit?: number;
}

const BUCKET_RANK: Record<OccupationBucket, number> = { exact: 2, alias: 1, fts: 0 };

/** Deterministic total order: bucket desc, score desc, conceptId asc. */
export function compareOccupations(a: OccupationCandidate, b: OccupationCandidate): number {
  const bucketDiff = BUCKET_RANK[b.bucket] - BUCKET_RANK[a.bucket];
  if (bucketDiff !== 0) return bucketDiff;
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) return scoreDiff;
  if (a.conceptId < b.conceptId) return -1;
  if (a.conceptId > b.conceptId) return 1;
  return 0;
}

function toCandidate(row: OccupationRow): OccupationCandidate {
  return {
    conceptId: row.conceptId,
    label: row.label,
    namespace: row.namespace,
    socMajorGroup: row.socMajorGroup,
    family: row.family,
    score: row.matchScore,
    bucket: row.matchKind,
    relationPath: [row.conceptId],
    sources: [row.sourceRelease],
    jobEvidence: [],
  };
}

/**
 * Infer target occupations from a query. Deduplicates by conceptId (keeping the
 * strongest bucket/score), orders deterministically, and bounds the frontier.
 */
export function inferOccupations(
  port: CareerGraphQueryPort,
  query: string,
  options: InferOptions
): OccupationCandidate[] {
  const limit = options.limit ?? CAREER_THRESHOLDS.frontier.maxCandidates;
  const rows = port.searchOccupations(query, limit);

  const best = new Map<string, OccupationCandidate>();
  for (const row of rows) {
    const candidate = toCandidate(row);
    const existing = best.get(candidate.conceptId);
    if (!existing || compareOccupations(candidate, existing) < 0) {
      best.set(candidate.conceptId, candidate);
    }
  }

  return Array.from(best.values()).sort(compareOccupations).slice(0, limit);
}

/** Deterministic relation order: importance desc, level desc, conceptId asc. */
export function compareRelations(a: SkillRelationRow, b: SkillRelationRow): number {
  const importanceDiff = b.importance - a.importance;
  if (importanceDiff !== 0) return importanceDiff;
  const levelDiff = b.level - a.level;
  if (levelDiff !== 0) return levelDiff;
  if (a.conceptId < b.conceptId) return -1;
  if (a.conceptId > b.conceptId) return 1;
  return 0;
}

/**
 * Build the lawful skill frontier by bounded traversal from confirmed occupations.
 * Deduplicates by skill conceptId (keeping the highest-importance provenance) and
 * bounds the result. Deterministic for a fixed occupation order.
 */
export function buildSkillFrontier(
  port: CareerGraphQueryPort,
  occupationConceptIds: readonly string[],
  options: InferOptions
): SkillRelationRow[] {
  const limit = options.limit ?? CAREER_THRESHOLDS.frontier.maxCandidates;
  const seen = new Map<string, SkillRelationRow>();
  for (const occupationConceptId of occupationConceptIds) {
    for (const relation of port.relatedSkills(occupationConceptId, limit)) {
      const existing = seen.get(relation.conceptId);
      if (!existing || compareRelations(relation, existing) < 0) {
        seen.set(relation.conceptId, relation);
      }
    }
  }
  return Array.from(seen.values()).sort(compareRelations).slice(0, limit);
}
