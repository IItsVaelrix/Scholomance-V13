/**
 * Merge JD-Advisor improvements into an existing suggestion list (spec §6).
 *
 * Two pipelines feed the review panel: `buildSuggestions` (keyword-gap prose, formatting,
 * graph classifications) and `buildImprovements` (the JD advisor's drafted/moved cards).
 * They are merged here so the panel never shows two cards for the same edit.
 *
 * Three dedupe layers, each catching a collision the others cannot:
 *
 *   1. ID — the same suggestion emitted twice.
 *   2. SPAN OVERLAP — two text edits touching the same résumé range.
 *   3. TERM-LEVEL SUPPRESSION — a drafted/moved improvement SUPERSEDES the prose-only
 *      `learning_gap` for the same requirement. Gap cards carry no span (nothing to
 *      overlap), so without this layer the candidate sees BOTH the old "add it in your
 *      own words" note AND the new actionable card for one requirement.
 *
 * Term matching is by content-token superset, not string equality: the prose gap names a
 * bare term ("apache airflow") while the drafted card quotes the whole JD clause
 * ("Experience with Apache Airflow for orchestration"). Equality would never match, so we
 * ask whether every content token of the gap's subject appears in some improvement's
 * subject. That is robust to term-vs-clause and term-vs-canonical-label wording drift.
 */
import type { ResumeSuggestion } from '../analysis/types.js';

/** Lowercased content tokens identifying what a card is about (evidence text + quoted label). */
function subjectTokens(s: ResumeSuggestion): Set<string> {
  const toks = new Set<string>();
  const addText = (t?: string) => {
    if (!t) return;
    for (const w of t.toLowerCase().match(/[a-z0-9+#]+/g) ?? []) toks.add(w);
  };
  for (const e of s.evidence) addText(e.text);
  const quoted = /"([^"]+)"/.exec(s.reason || '');
  if (quoted) addText(quoted[1]);
  return toks;
}

/**
 * True when some improvement already speaks for this gap's subject — i.e. an improvement
 * whose subject tokens cover every content token of the gap's quoted requirement label
 * (falling back to the gap's evidence text). Only `learning_gap` cards are suppressible;
 * every other type is kept.
 */
function coveredByImprovement(
  gap: ResumeSuggestion,
  improvementSubjects: Set<string>[]
): boolean {
  if (gap.type !== 'learning_gap') return false;
  // The gap's subject: its quoted requirement label, else its evidence text.
  let subject = subjectTokens(gap);
  if (subject.size === 0) return false;
  return improvementSubjects.some((imp) => {
    for (const tok of subject) {
      if (!imp.has(tok)) return false;
    }
    return true;
  });
}

export function mergeImprovements(
  existing: ResumeSuggestion[],
  improvements: ResumeSuggestion[]
): ResumeSuggestion[] {
  // Term-level suppression first: drop a prose gap an improvement already covers. Done
  // against the incoming improvements (the advisor's cards win — they are the ones with a
  // JD clause behind them), before the id/span merge below.
  const improvementSubjects = improvements.map(subjectTokens);
  const survivors = existing.filter((s) => !coveredByImprovement(s, improvementSubjects));

  const ids = new Set(survivors.map((s) => s.id));
  const spans = survivors
    .map((s) => s.target?.span)
    .filter((sp): sp is NonNullable<typeof sp> => !!sp)
    .map((sp) => ({ start: sp.start, end: sp.end }));
  const overlaps = (sp?: { start: number; end: number }) =>
    !!sp && spans.some((e) => e.start < sp.end && sp.start < e.end);

  const merged = [...survivors];
  for (const imp of improvements) {
    if (ids.has(imp.id)) continue;
    if (overlaps(imp.target?.span)) continue;
    merged.push(imp);
    ids.add(imp.id);
  }
  return merged;
}
