import type { ResumeDocument } from '../parser/types.js';
import type { ResumeSuggestion } from '../analysis/types.js';
import { getAccomplishmentLines, type AmplifyContext } from './primitives.js';
import { quantificationRule } from './rules/quantification.js';
import { verbStrengthRule } from './rules/verb-strength.js';
import { weakConstructionRule } from './rules/weak-construction.js';
import { fillerRule } from './rules/filler.js';
import { repetitionRule } from './rules/repetition.js';

/** Fixed order — the identity contract depends on it. Do not sort the result. */
const RULES: ReadonlyArray<(ctx: AmplifyContext) => ResumeSuggestion[]> = [
  quantificationRule,
  verbStrengthRule,
  weakConstructionRule,
  fillerRule,
  repetitionRule,
];

/**
 * Amplify only, never add claims: every suggestion reshapes the candidate's own words,
 * and any suggestion needing a number asks them for it.
 */
export function buildAmplifications(document: ResumeDocument): ResumeSuggestion[] {
  const ctx: AmplifyContext = {
    document,
    lines: getAccomplishmentLines(document),
  };

  const suggestions: ResumeSuggestion[] = [];
  for (const rule of RULES) {
    suggestions.push(...rule(ctx));
  }
  return suggestions;
}
