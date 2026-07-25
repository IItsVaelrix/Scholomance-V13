/**
 * JD Improvement Advisor — shared types (spec §4).
 *
 * All logic under `src/lib/career/improve/` is pure and deterministic. These types are
 * the contract between the requirement ledger, the evidence bridge, the evidence map,
 * the four improvement rules, and the honesty guard (§5).
 */
import type { TextSpan, ResumeBullet, ResumeDocument, ResumeExperienceEntry } from '../parser/types.js';

export type { ResumeBullet, ResumeDocument, ResumeExperienceEntry };

/**
 * How the JD states a requirement. Resolved per occurrence from the clause around the
 * term, then aggregated by precedence (`required` > `preferred` > `unmarked` > `negated`)
 * so the verdict never depends on which occurrence the scanner happened to read last.
 *
 * `negated` requirements are dropped by `buildRequirementLedger` and therefore never reach
 * the rules: a JD that rules a skill OUT must not produce advice to add it.
 */
export type RequirementModality = 'required' | 'preferred' | 'unmarked' | 'negated';

/** A single weighted requirement extracted from the job description (spec §4.2). */
export interface Requirement {
  /** Surface term as it appears in the JD. */
  term: string;
  /** O*NET/ESCO skill concept id, when the graph canonicalizes it. */
  canonicalConceptId?: string;
  /** Canonical label, e.g. "SQL". */
  canonicalLabel?: string;
  /** How the JD states it. Never `negated` on a returned requirement. */
  modality: RequirementModality;
  /** Emphasis weight in [0, 1]: frequency + modality + section position. */
  weight: number;
  /** Where in the JD this requirement appears. */
  jdEvidence: TextSpan[];
}

/**
 * A skill already resolved against the built corpus. Structurally the identifying half of
 * `SkillClassification`, so a `CareerGraphAnalysis.skills[]` array satisfies it directly —
 * the advisor reuses the worker's resolution instead of re-querying the graph itself.
 */
export interface CanonicalSkill {
  conceptId: string;
  label: string;
}

/** The tiered evidence verdict for a single (requirement, bullet) pair (spec §4.3). */
export type EvidenceTier = 'demonstrated' | 'adjacent' | 'none';

/** The strongest evidence tier across a requirement's bullets (spec §4.4). */
export type RequirementSupport = 'demonstrated' | 'adjacent' | 'missing';

export interface RequirementBulletEvidence {
  bulletId: string;
  tier: 'demonstrated' | 'adjacent';
  matchedPhrase: string;
}

export interface RequirementEvidence {
  requirement: Requirement;
  support: RequirementSupport;
  bullets: RequirementBulletEvidence[];
}

export type EvidenceMap = RequirementEvidence[];

/**
 * A move operation keyed on stable bullet id, never on text (spec §4.5), hardened by the
 * entry-aware correction. `entryId` is the employment entry the bullet belongs to; the
 * apply engine enforces `sourceBullet.entryId === targetBullet.entryId` (and that any
 * `before/afterBulletId` anchor lives in the SAME entry), so a bullet can move within its
 * own entry only — moving it between employers is mechanically impossible.
 */
export interface MoveBulletOperation {
  bulletId: string;
  /** The entry the bullet belongs to. Moves never cross this boundary. */
  entryId: string;
  beforeBulletId?: string;
  afterBulletId?: string;
}

/**
 * Provenance for a fact the candidate typed into a required input slot (honesty
 * correction). A NUMBER may enter the résumé ONLY through a recorded user-input event —
 * never because it appeared somewhere inside mutable suggestion state. The token-
 * provenance guard (§5.1) refuses any numeric token in an `after` that is not already in
 * the `before` bullet and not recorded here.
 */
export interface UserSuppliedFact {
  /** The literal value the candidate entered (e.g. "10", "40%", "$120k"). */
  value: string;
  /** The suggestion whose input slot collected this value. */
  suggestionId: string;
  /** The specific input slot id. */
  slotId: string;
  /** The workspace revision at which the candidate accepted it. */
  acceptedAtRevision: number;
}

/**
 * Compact fact structure extracted from a bullet for claim preservation (spec §5.2).
 * The honesty gate asserts `before` and `after` claims match under a per-rule permit.
 */
export interface EvidenceClaim {
  subject: 'candidate';
  /** Head verb (lowercased stem-ish token). */
  action: string;
  /** What the action acts on, when present. */
  object?: string;
  /** A stated number and the noun it modifies. */
  quantity?: { value: string; bindsTo: string };
  /** Ownership/role derived from the verb — the core escalation guard. */
  role: 'owner' | 'contributor' | 'support';
  qualifiers: string[];
  sourceSpan: TextSpan;
}

/**
 * Per-rule transformation permit (spec §5.2). The three `false` fields are the hard
 * invariants: role must be preserved exactly, a number cannot move to a different
 * object, and no new object may be introduced.
 */
export interface TransformationPermit {
  mayReplaceActionVocabulary: boolean;
  mayReorderClauses: boolean;
  mayPromoteExistingMetric: boolean;
  mayChangeOwnership: false;
  mayChangeQuantityBinding: false;
  mayAddObject: false;
}

/** Result of a honesty-guard check. */
export interface HonestyVerdict {
  ok: boolean;
  /** Reason for rejection when `ok` is false (e.g. 'role_escalation'). */
  reason?: string;
}
