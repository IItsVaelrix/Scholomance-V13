/**
 * Deterministic lexical fallback result.
 *
 * Used when the graph worker is unavailable, errors, or is cancelled mid-flight:
 * the UI always receives a well-formed `CareerGraphAnalysis` in `lexical` mode
 * rather than nothing. Carries a diagnostic so the degraded mode is visible.
 */
import type { CareerGraphAnalysis, CareerGraphDiagnostic } from './contracts';
import { CAREER_POLICY_BUNDLE } from './policies';

export const FALLBACK_ARTIFACT_ID = 'career-graph:lexical-fallback';

export function buildLexicalFallback(diagnostic?: CareerGraphDiagnostic): CareerGraphAnalysis {
  return {
    artifactId: FALLBACK_ARTIFACT_ID,
    policy: CAREER_POLICY_BUNDLE,
    occupations: [],
    skills: [],
    diagnostics: diagnostic
      ? [diagnostic]
      : [
          {
            code: 'FALLBACK_LEXICAL',
            severity: 'warning',
            message: 'Career graph unavailable; lexical fallback engaged.',
          },
        ],
    mode: 'lexical',
  };
}
