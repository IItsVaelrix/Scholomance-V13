/**
 * Career Graph public contracts.
 *
 * These types are the single source of truth for the browser-local O*NET + ESCO
 * Career Graph. They are mirrored 1:1 by Zod boundary schemas in `./schemas.ts`
 * and frozen policy constants in `./policies.ts`, and are registered in
 * SCHEMA_CONTRACT.md (owned by Codex).
 *
 * Law invariants encoded here and enforced downstream:
 *  - O*NET and ESCO identities stay namespaced and distinct; a crosswalk edge is
 *    `mapped_to`, never `same_as`.
 *  - `relationPath` and `sources` carry provenance for every emitted concept.
 *  - An occupation-only skill can never be classified `missing`; posting (job)
 *    evidence is mandatory for a `missing` classification (enforced in evidence.ts).
 *  - No top-level ATS pass probability or `overallScore` is ever produced.
 */
import type { TextSpan } from '../parser/types';

/** Classification of a skill relative to the target occupation and the résumé. */
export type SkillClass =
  | 'demonstrated'
  | 'adjacent'
  | 'missing'
  | 'not_required'
  | 'ambiguous';

/** How strongly the source graph ties a skill to an occupation. */
export type RequirementKind = 'required' | 'preferred' | 'optional' | 'none';

/** Retrieval bucket that produced an occupation candidate (stable ordering). */
export type OccupationBucket = 'exact' | 'alias' | 'fts';

/** Analysis mode actually used to produce a result (descending capability). */
export type CareerGraphMode = 'graph_semantic' | 'graph' | 'lexical';

/**
 * Versioned, deterministic policy identity. Every analysis result embeds the
 * exact bundle that produced it so thresholds and formulas are auditable and
 * reproducible. `thresholdChecksum` is derived deterministically from the frozen
 * thresholds in `./policies.ts` — no timestamps or randomness participate.
 */
export interface CareerPolicyBundle {
  occupationInference: 'occupation-inference-v1';
  candidateFrontier: 'career-frontier-v1';
  relationTraversal: 'career-traversal-v1';
  shard: 'career-shard-v1';
  skillClassification: 'career-evidence-v1';
  scorecard: 'career-scorecard-v2';
  thresholdChecksum: string;
}

/** A scored occupation candidate retrieved from the graph (FTS5/graph first). */
export interface OccupationCandidate {
  /** Namespaced concept id, e.g. `onet:15-1252.00` or `esco:https://.../occupation/...`. */
  conceptId: string;
  label: string;
  namespace: 'onet' | 'esco';
  /** SOC major group code (O*NET), when known. */
  socMajorGroup?: string;
  /** Occupation family used for shard residency decisions. */
  family?: string;
  /** Retrieval score in [0, 1]. */
  score: number;
  /** Stable score bucket; ordering is bucket desc, score desc, conceptId asc. */
  bucket: OccupationBucket;
  /** Provenance path through `career_relation` edges. */
  relationPath: string[];
  /** Source release ids that contributed evidence. */
  sources: string[];
  /** Job-description evidence spans supporting this candidate. */
  jobEvidence: TextSpan[];
}

/** Decomposed, evidence-backed scores for a single skill. */
export interface SkillScores {
  /** Match strength against the job description (posting evidence). */
  job: number;
  /** Association strength with the confirmed target occupation. */
  occupation: number;
  /** Match strength against the résumé. */
  resume: number;
  /** Optional semantic rerank score; null when semantic mode did not run. */
  semantic: number | null;
}

/** A single classified skill with full provenance and evidence trails. */
export interface SkillClassification {
  conceptId: string;
  label: string;
  classification: SkillClass;
  requirement: RequirementKind;
  /** Provenance path through `career_relation` edges. */
  relationPath: string[];
  /** Source release ids that contributed this skill. */
  sources: string[];
  /** Posting (job-description) evidence spans. Mandatory for `missing`. */
  jobEvidence: TextSpan[];
  /** Résumé evidence spans (present only when demonstrated/adjacent). */
  resumeEvidence: TextSpan[];
  scores: SkillScores;
}

/** Structured, deterministic diagnostic emitted by the graph runtime. */
export interface CareerGraphDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

/** The complete, immutable result of a Career Graph analysis. */
export interface CareerGraphAnalysis {
  /** Deterministic artifact identity, e.g. `career-graph:onet-30.3:esco-1.2.1`. */
  artifactId: string;
  policy: CareerPolicyBundle;
  occupations: OccupationCandidate[];
  skills: SkillClassification[];
  diagnostics: CareerGraphDiagnostic[];
  mode: CareerGraphMode;
}

/** Sealed manifest describing a built canonical graph artifact. */
export interface CareerGraphManifest {
  artifactId: string;
  /** Schema policy id, e.g. `career-graph-schema-v1`. */
  policy: string;
  /** Source release ids included in the build. */
  sources: string[];
  conceptCount: number;
  relationCount: number;
  /** Deterministic build checksum (sorted source/schema/policy/row digests). */
  checksum: string;
}
