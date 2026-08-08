/**
 * AGGREGATION FOR THE TREEBANK REPORT.
 *
 * Coverage is one number and it hides three. A sentence that spans as S with
 * the wrong subject is a success under coverage and a failure under both of the
 * others, so they are reported side by side and never collapsed.
 */
import { OUTCOME } from './failure-diagnosis.js';

const ratio = (part, whole) => (whole === 0 ? 0 : part / whole);

/**
 * @param {Array<object>} rows one per sentence; see the plan's Interfaces block
 * @returns {object} the report
 */
export function summarize(rows) {
  const all = rows || [];
  const n = all.length;
  const parsed = all.filter((r) => r.outcome === OUTCOME.PARSED);
  const failures = all.filter((r) => r.outcome !== OUTCOME.PARSED);

  /**
   * DECISION IS NULL, NOT ZERO, WHEN IT COULD NOT BE TAKEN. Substituting a
   * number here would print a metric for a measurement nobody made.
   */
  const undecidable = all.some((r) => r.decided === null);
  const decision = undecidable ? null : ratio(all.filter((r) => r.decided === true).length, n);

  const byUpos = new Map();
  for (const r of all) {
    const key = r.rootUpos || 'NONE';
    if (!byUpos.has(key)) byUpos.set(key, []);
    byUpos.get(key).push(r);
  }
  const byRootUpos = [...byUpos.entries()]
    .map(([upos, group]) => ({
      upos,
      n: group.length,
      coverage: ratio(group.filter((r) => r.outcome === OUTCOME.PARSED).length, group.length),
      containment: ratio(group.filter((r) => r.contained === true).length, group.length),
    }))
    .sort((a, b) => b.n - a.n);

  const ablation = {
    bothFine: parsed.filter((r) => !r.overGenerated).length,
    overGenerated: parsed.filter((r) => r.overGenerated).length,
    tagging: all.filter((r) => r.outcome === OUTCOME.LEXICAL).length,
    grammar: all.filter(
      (r) => r.outcome === OUTCOME.GRAMMAR || r.outcome === OUTCOME.ROOT_TYPE_MISMATCH,
    ).length,
  };

  const counts = new Map();
  for (const r of failures) {
    const labels = new Set((r.categories || []).map((c) => c.label));
    for (const label of labels) {
      if (!counts.has(label)) {
        const first = (r.categories || []).find((c) => c.label === label);
        counts.set(label, { label, deprel: first.deprel, failures: 0, soleCause: 0 });
      }
      const entry = counts.get(label);
      entry.failures += 1;
      /**
       * THE FALSIFIABLE PREDICTION. A sentence whose whole frontier is this one
       * category is a sentence that a bond for it would unblock. A sentence
       * with a mixed frontier needs more than one fix and must not be promised.
       */
      if (labels.size === 1) entry.soleCause += 1;
    }
  }
  const categories = [...counts.values()].sort(
    (a, b) => b.failures - a.failures || a.label.localeCompare(b.label),
  );

  const withCategory = failures.filter((r) => (r.categories || []).length > 0);
  const totalCauses = withCategory.reduce(
    (sum, r) => sum + new Set(r.categories.map((c) => c.label)).size,
    0,
  );

  return {
    n,
    coverage: ratio(parsed.length, n),
    containment: ratio(all.filter((r) => r.contained === true).length, n),
    decision: n === 0 ? 0 : decision,
    byRootUpos,
    ablation,
    categories,
    classifier: {
      failures: failures.length,
      withCategory: withCategory.length,
      meanCauses: withCategory.length === 0 ? 0 : totalCauses / withCategory.length,
    },
    nonProjective: all.reduce((sum, r) => sum + (r.nonProjective || 0), 0),
  };
}
