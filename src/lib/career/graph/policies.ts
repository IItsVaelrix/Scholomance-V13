/**
 * Versioned, deterministic Career Graph policy constants.
 *
 * Every formula and threshold the graph runtime uses lives here so that IDs,
 * ordering, and policy bundles are fully reproducible. No timestamp or
 * `Math.random()` participates anywhere in this module.
 */
import type { CareerPolicyBundle } from './contracts';

/**
 * Frozen threshold bundle. The `thresholdChecksum` embedded in the policy bundle
 * is derived deterministically from the canonical JSON of this object, so any
 * change to a threshold changes the checksum and therefore the policy identity.
 */
export const CAREER_THRESHOLDS = Object.freeze({
  occupation: Object.freeze({
    /** Minimum retrieval score for an exact-id match bucket. */
    exact: 1.0,
    /** Minimum retrieval score for a recognized-alias bucket. */
    alias: 0.8,
    /** Minimum retrieval score for an FTS5 bucket. */
    fts: 0.5,
  }),
  skill: Object.freeze({
    /** résumé score at/above which a skill is `demonstrated`. */
    demonstrated: 0.6,
    /** résumé score at/above which a skill is `adjacent`. */
    adjacent: 0.3,
    /** job-description score at/above which a skill is in-scope for the posting. */
    job: 0.5,
  }),
  frontier: Object.freeze({
    /** Maximum candidates retained in the lawful frontier before reranking. */
    maxCandidates: 50,
    /** Maximum resident family shards (core + universal bridge stay pinned). */
    maxFamilyShards: 3,
  }),
});

/**
 * Deterministic FNV-1a (32-bit) hex digest. Pure and browser-safe — used only to
 * fingerprint the frozen thresholds so the policy identity is auditable.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Canonical JSON of the thresholds — stable key order via the frozen literal. */
const THRESHOLD_CANON = JSON.stringify(CAREER_THRESHOLDS);

/**
 * The single policy bundle embedded in every Career Graph analysis result.
 * Frozen so downstream code can rely on structural identity.
 */
export const CAREER_POLICY_BUNDLE: CareerPolicyBundle = Object.freeze({
  occupationInference: 'occupation-inference-v1',
  candidateFrontier: 'career-frontier-v1',
  relationTraversal: 'career-traversal-v1',
  shard: 'career-shard-v1',
  skillClassification: 'career-evidence-v1',
  scorecard: 'career-scorecard-v2',
  thresholdChecksum: fnv1aHex(THRESHOLD_CANON),
});

/** Schema policy id used by the canonical SQLite build (Task 5). */
export const CAREER_GRAPH_SCHEMA_POLICY = 'career-graph-schema-v1' as const;
