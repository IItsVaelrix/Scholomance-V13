/**
 * Pure, deterministic Career Graph analysis.
 *
 * This is the exact retrieval + evidence pipeline the browser worker will run
 * against SQLite-WASM shards — here it runs against any `CareerGraphQueryPort`
 * (the seed in `./seed-graph.ts`, or `better-sqlite3`/WASM later). It reuses the
 * lawful algebra directly:
 *
 *   inferOccupations  →  (confirm target occupation)  →  buildSkillFrontier
 *                   →  classifySkill + requirementKind  →  assertEvidenceLaw
 *
 * Law invariants preserved:
 *  - The missing-skill law holds because `classifySkill` is used unmodified and
 *    `assertEvidenceLaw` re-checks every emitted classification at the boundary.
 *  - No top-level ATS pass probability or `overallScore` is produced.
 *  - Every concept carries provenance (`relationPath`, `sources`) and evidence
 *    spans derived deterministically from the posting + résumé text.
 *
 * The only refinement layered on top of `classifySkill` is the documented
 * `adjacent` band: a skill the posting gates as relevant, with *partial* résumé
 * evidence (resumeScore ≥ frozen `adjacent` threshold but < `demonstrated`), is
 * reported as `adjacent` rather than `missing`. This can never violate the
 * missing-skill law (an `adjacent` skill is, by construction, not `missing` and
 * carries résumé evidence) and it activates the otherwise-dead frozen `adjacent`
 * threshold. It is deterministic and does not touch `./evidence.ts`.
 */
import type {
  CareerGraphAnalysis,
  CareerGraphDiagnostic,
  CareerPolicyBundle,
  OccupationCandidate,
  SkillClassification,
  SkillClass,
} from './contracts';
import type { CareerGraphQueryPort, SkillRelationRow } from './reference-query';
import type { TextSpan } from '../parser/types';
import { inferOccupations, buildSkillFrontier } from './reference-query';
import {
  classifySkill,
  requirementKind,
  assertEvidenceLaw,
  DEFAULT_EVIDENCE_THRESHOLDS,
} from './evidence';
import { CAREER_POLICY_BUNDLE, CAREER_THRESHOLDS } from './policies';
import { SEED_ARTIFACT_ID } from './seed-graph';

export interface AnalyzeGraphInput {
  resumeText: string;
  jobDescriptionText: string;
  confirmedOccupationId?: string;
}

export interface AnalyzeGraphOptions {
  policy?: CareerPolicyBundle;
  artifactId?: string;
}

/** Diagnostic codes emitted by the seed/graph runtime. */
export const GRAPH_DIAGNOSTIC = {
  SEED_DEMO: 'SEED_GRAPH_DEMO',
  OCCUPATION_CONFIRMATION_REQUIRED: 'OCCUPATION_CONFIRMATION_REQUIRED',
  NO_OCCUPATION_MATCH: 'NO_OCCUPATION_MATCH',
} as const;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];
}

interface TermMatch {
  score: number;
  span: TextSpan | null;
}

/** First canonical span covering an occurrence of any term token, if present. */
function findSpan(haystack: string, termTokens: readonly string[]): TextSpan | null {
  const lowered = haystack.toLowerCase();
  for (const token of termTokens) {
    const idx = lowered.indexOf(token);
    if (idx >= 0) {
      return { coordinateSpace: 'canonical', start: idx, end: idx + token.length };
    }
  }
  return null;
}

/**
 * Deterministic lexical evidence of a skill term against a text. Score is the
 * fraction of the term's tokens present (single-token skill present → 1.0).
 */
function matchTerm(haystack: string, term: string): TermMatch {
  const termTokens = tokenize(term);
  if (termTokens.length === 0) return { score: 0, span: null };
  const haySet = new Set(tokenize(haystack));
  const matched = termTokens.filter((t) => haySet.has(t)).length;
  const score = matched / termTokens.length;
  return { score, span: score > 0 ? findSpan(haystack, termTokens) : null };
}

/** Normalize an O*NET importance/level pair into an occupation-relevance score. */
function occupationRelevance(importance: number, level: number): number {
  const norm = (importance / 5) * 0.6 + (level / 5) * 0.4;
  return Math.round(norm * 100) / 100;
}

/** Documented adjacent refinement (see module header). Law-safe by construction. */
function refineAdjacent(cls: SkillClass, resumeScore: number): SkillClass {
  if (cls === 'missing' && resumeScore >= CAREER_THRESHOLDS.skill.adjacent) {
    return 'adjacent';
  }
  return cls;
}

function classifyFrontierSkill(
  relation: SkillRelationRow,
  confirmedOccupationId: string,
  resumeText: string,
  jobText: string
): SkillClassification {
  const jobMatch = matchTerm(jobText, relation.label);
  const resumeMatch = matchTerm(resumeText, relation.label);
  const occupationScore = occupationRelevance(relation.importance, relation.level);

  const evidence = {
    required: relation.requirementKind === 'required' && jobMatch.score > 0,
    preferred: relation.requirementKind === 'preferred' && jobMatch.score > 0,
    jobScore: jobMatch.score,
    occupationScore,
    resumeScore: resumeMatch.score,
    negated: false,
    outOfScope: false,
  };

  const rawClass = classifySkill(evidence, DEFAULT_EVIDENCE_THRESHOLDS);
  const classification = refineAdjacent(rawClass, resumeMatch.score);
  const requirement = requirementKind(evidence);

  const hasResumeEvidence =
    classification === 'demonstrated' || classification === 'adjacent';

  return {
    conceptId: relation.conceptId,
    label: relation.label,
    classification,
    requirement,
    relationPath: [confirmedOccupationId, relation.conceptId],
    sources: [relation.sourceRelease],
    jobEvidence: jobMatch.span ? [jobMatch.span] : [],
    resumeEvidence: hasResumeEvidence && resumeMatch.span ? [resumeMatch.span] : [],
    scores: {
      job: jobMatch.score,
      occupation: occupationScore,
      resume: resumeMatch.score,
      semantic: null,
    },
  };
}

function seedDemoDiagnostic(): CareerGraphDiagnostic {
  return {
    code: GRAPH_DIAGNOSTIC.SEED_DEMO,
    severity: 'info',
    message:
      'Running on the small Career Graph seed dataset (career-graph:seed-demo), ' +
      'not the full O*NET/ESCO corpus. Results demonstrate the evidence-first flow.',
  };
}

/**
 * Run a full Career Graph analysis against a query port. Deterministic for a
 * fixed port + input. Throws only if the evidence law is violated (which the
 * algebra here never does), so a throw indicates a real regression.
 */
export function analyzeCareerGraph(
  port: CareerGraphQueryPort,
  input: AnalyzeGraphInput,
  options: AnalyzeGraphOptions = {}
): CareerGraphAnalysis {
  const policy = options.policy ?? CAREER_POLICY_BUNDLE;
  const artifactId = options.artifactId ?? SEED_ARTIFACT_ID;
  const diagnostics: CareerGraphDiagnostic[] = [seedDemoDiagnostic()];

  const query = input.jobDescriptionText.trim() || input.resumeText.trim();
  const occupations: OccupationCandidate[] = inferOccupations(port, query, { policy });

  // No occupation could be inferred — return a coherent empty graph result.
  if (occupations.length === 0) {
    diagnostics.push({
      code: GRAPH_DIAGNOSTIC.NO_OCCUPATION_MATCH,
      severity: 'warning',
      message: 'No target occupation could be inferred from the posting text.',
    });
    return { artifactId, policy, occupations: [], skills: [], diagnostics, mode: 'graph' };
  }

  // Ambiguous target role: pause missing-skill analysis until the candidate
  // confirms. The UI keys off OCCUPATION_CONFIRMATION_REQUIRED.
  const confirmed = input.confirmedOccupationId
    ? occupations.find((o) => o.conceptId === input.confirmedOccupationId) ?? occupations[0]
    : occupations.length === 1
      ? occupations[0]
      : undefined;

  if (!confirmed) {
    diagnostics.push({
      code: GRAPH_DIAGNOSTIC.OCCUPATION_CONFIRMATION_REQUIRED,
      severity: 'info',
      message:
        'Multiple occupation families match this posting. Confirm the target role ' +
        'to release the missing-skill analysis.',
    });
    return { artifactId, policy, occupations, skills: [], diagnostics, mode: 'graph' };
  }

  // Confirmed target role: build the lawful skill frontier and classify.
  const frontier = buildSkillFrontier(port, [confirmed.conceptId], { policy });
  const skills = frontier.map((relation) =>
    classifyFrontierSkill(
      relation,
      confirmed.conceptId,
      input.resumeText,
      input.jobDescriptionText
    )
  );

  // Boundary guard: re-check the missing-skill law before handing to the UI.
  assertEvidenceLaw(skills);

  return {
    artifactId,
    policy,
    occupations: [confirmed],
    skills,
    diagnostics,
    mode: 'graph',
  };
}
