/**
 * Token Provenance — the necessary (but not sufficient) honesty invariant (spec §5.1).
 *
 * Every content word in `after` must come from: (1) the `before` bullet's tokens,
 * (2) the requirement's canonical label / bridge phrases (the `allowed` set), or
 * (3) the closed-class allowlist + the strong-verb set. An `after` introducing a content
 * word from none of these is discarded.
 *
 * Honesty correction (numbers): a NUMERIC token is legal only if it already appears in the
 * `before` bullet OR it is a recorded user-supplied value (`userSuppliedValues`, from the
 * UserFactLedger). The old blanket "any digit-bearing token is fine" rule let a rewrite
 * fabricate a metric out of nowhere; now a number enters the résumé only through a fact the
 * candidate already stated or explicitly typed into an input slot.
 */
import { STRONG_VERBS } from '../../amplify/data/verb-classes.js';
import type { HonestyVerdict } from '../types.js';

/** Closed-class words that may always appear (function words, connectors, units). */
const CLOSED_CLASS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that',
  'this', 'these', 'those', 'their', 'our', 'my', 'your', 'his', 'her', 'its',
  'into', 'onto', 'across', 'through', 'within', 'during', 'toward', 'towards',
  'alongside', 'using', 'via', 'per', 'each', 'all', 'any', 'some', 'no', 'not',
  'than', 'then', 'so', 'such', 'including', 'include', 'includes', 'etc',
  // common unit / quantifier tokens that rewording may introduce
  'percent', 'percentage', 'million', 'thousand', 'billion', 'hundred', 'dozen',
  'more', 'less', 'fewer', 'over', 'under', 'up', 'down', 'out', 'off',
]);

function contentTokens(text: string): string[] {
  return (String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || []).map((t) =>
    t.replace(/[.]+$/g, '')
  );
}

/**
 * Assert only the NUMBER rule: every numeric token in `after` is either already stated in
 * `baseline` or is a recorded user-supplied value.
 *
 * This is the apply-time half of the guard. The full `assertTokenProvenance` cannot run at
 * apply time — by then the candidate may have freely edited the text, and the per-rule
 * `allowed` vocabulary that justified the non-numeric tokens is long out of scope. Numbers
 * are the claim that must never be fabricated, and apply time is the only point where the
 * final text and the candidate's recorded facts are both known.
 */
export function assertNumericProvenance(
  baseline: string,
  after: string,
  userSuppliedValues: ReadonlySet<string> = new Set()
): HonestyVerdict {
  const baselineSet = new Set(contentTokens(baseline));
  for (const tok of contentTokens(after)) {
    if (!tok || !/^\d/.test(tok)) continue;
    if (baselineSet.has(tok)) continue;
    if (userSuppliedValues.has(tok)) continue;
    return { ok: false, reason: `unprovenanced_number:${tok}` };
  }
  return { ok: true };
}

/**
 * Assert every content word in `after` is traceable to `before`, the `allowed` set
 * (canonical label / bridge phrases), the closed-class allowlist, or the strong verbs.
 * Numeric tokens additionally require provenance: they must be in `before` or in
 * `userSuppliedValues` (recorded user-input events).
 */
export function assertTokenProvenance(
  before: string,
  after: string,
  allowed: readonly string[] = [],
  userSuppliedValues: ReadonlySet<string> = new Set()
): HonestyVerdict {
  const beforeSet = new Set(contentTokens(before));
  const allowedSet = new Set<string>();
  for (const phrase of allowed) {
    for (const tok of contentTokens(phrase)) allowedSet.add(tok);
  }

  const afterTokens = contentTokens(after);
  for (const tok of afterTokens) {
    if (!tok) continue;
    if (beforeSet.has(tok)) continue;
    if (allowedSet.has(tok)) continue;
    if (CLOSED_CLASS.has(tok)) continue;
    if (STRONG_VERBS.has(tok)) continue;
    // Numeric tokens require provenance: a number enters only via the before bullet or a
    // recorded user-supplied value — never from mutable suggestion state.
    if (/^\d/.test(tok)) {
      if (userSuppliedValues.has(tok)) continue;
      return { ok: false, reason: `unprovenanced_number:${tok}` };
    }
    return { ok: false, reason: `unprovenanced_token:${tok}` };
  }

  return { ok: true };
}
