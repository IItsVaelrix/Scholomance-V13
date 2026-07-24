/**
 * Career Graph evidence reconciliation and the missing-skill law.
 *
 * This module is the single authority for turning raw evidence signals into a
 * `SkillClass`. It is pure and deterministic: the same inputs always yield the
 * same classification. The cardinal invariant enforced here and re-checked by
 * `assertEvidenceLaw` is:
 *
 *   An occupation-only skill can NEVER be classified `missing`; posting
 *   (job-description) evidence is mandatory for a `missing` classification.
 *
 * The algebra below is the approved law from the Career Graph design and must not
 * be tuned against held-out labels without bumping the policy version.
 */
import type { RequirementKind, SkillClass, SkillClassification } from './contracts';
import { CAREER_THRESHOLDS } from './policies';

/** Thresholds consumed by the classification algebra. */
export interface EvidenceThresholds {
  /** job-description score gate for posting scope. */
  job: number;
  /** occupation-relevance gate. */
  occupation: number;
  /** résumé score gate for `demonstrated`. */
  resume: number;
}

/** Default thresholds derived from the frozen policy bundle. */
export const DEFAULT_EVIDENCE_THRESHOLDS: EvidenceThresholds = Object.freeze({
  job: CAREER_THRESHOLDS.skill.job,
  occupation: CAREER_THRESHOLDS.skill.occupation,
  resume: CAREER_THRESHOLDS.skill.demonstrated,
});

/** Raw evidence signals for a single skill relative to a posting and résumé. */
export interface EvidenceInput {
  /** The posting explicitly lists the skill as required. */
  required: boolean;
  /** The posting explicitly lists the skill as preferred/nice-to-have. */
  preferred: boolean;
  /** Match strength against the job description (posting evidence), 0–1. */
  jobScore: number;
  /** Association strength with the confirmed target occupation, 0–1. */
  occupationScore: number;
  /** Match strength against the résumé, 0–1. */
  resumeScore: number;
  /** The mention is negated (e.g. "no SQL required"). */
  negated: boolean;
  /** The mention is out of scope (e.g. in an unrelated boilerplate block). */
  outOfScope: boolean;
}

/**
 * Classify a skill. Approved algebra:
 *
 *  1. Negated or out-of-scope mentions are `not_required`.
 *  2. A posting gate must pass before a skill can be `missing`: an explicit
 *     requirement/preference, OR both a job-score and occupation-score gate.
 *     This is what forbids occupation-only skills from ever being `missing`.
 *  3. Without the posting gate, occupation-relevant skills are `not_required`
 *     and everything else is `ambiguous`.
 *  4. With the posting gate, a strong résumé match is `demonstrated`; otherwise
 *     the skill is genuinely `missing`.
 */
export function classifySkill(input: EvidenceInput, t: EvidenceThresholds): SkillClass {
  if (input.negated || input.outOfScope) return 'not_required';

  const postingGate =
    input.required ||
    input.preferred ||
    (input.jobScore >= t.job && input.occupationScore >= t.occupation);

  if (!postingGate) {
    return input.occupationScore >= t.occupation ? 'not_required' : 'ambiguous';
  }

  if (input.resumeScore >= t.resume) return 'demonstrated';
  return 'missing';
}

/** Derive a `RequirementKind` from the same evidence signals. */
export function requirementKind(input: EvidenceInput): RequirementKind {
  if (input.required) return 'required';
  if (input.preferred) return 'preferred';
  if (input.jobScore > 0 || input.occupationScore > 0) return 'optional';
  return 'none';
}

/**
 * Re-check the missing-skill law on a set of emitted classifications. Throws with
 * a deterministic, machine-readable code if any `missing` skill lacks posting
 * evidence. Intended as a boundary guard before a result is handed to the UI.
 */
export function assertEvidenceLaw(skills: readonly SkillClassification[]): void {
  for (const skill of skills) {
    if (skill.classification === 'missing' && skill.jobEvidence.length === 0) {
      throw new Error(
        `MISSING_SKILL_WITHOUT_POSTING_EVIDENCE:${skill.conceptId}`
      );
    }
  }
}
