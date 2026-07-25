/**
 * Frame Provenance — the honesty invariant for a draft that has no `before`.
 *
 * `assertClaimPreserved` compares a rewrite against the bullet it came from. A drafted NEW
 * bullet has no such source, so this invariant takes its place:
 *
 *   every content token in the draft must originate in the JD clause it was lifted from,
 *   the frame's own scaffolding, or a value the candidate typed into a slot.
 *
 * That makes it mechanically impossible for the tool to introduce a noun that is neither
 * the employer's word nor the candidate's — which is what lets the card be one-step.
 */
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel.js';
import type { HonestyVerdict } from '../types.js';
import type { PhraseFrame } from '../jd-phrase-frame.js';

/** Closed-class words that may always appear (mirrors the token-provenance guard). */
const CLOSED_CLASS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that',
  'this', 'these', 'those', 'their', 'our', 'my', 'your', 'its', 'into', 'onto',
  'across', 'through', 'within', 'during', 'toward', 'towards', 'alongside', 'using',
  'via', 'per', 'each', 'all', 'any', 'some', 'no', 'not', 'than', 'then', 'so',
  'such', 'including', 'include', 'includes', 'etc', 'percent', 'percentage',
  'million', 'thousand', 'billion', 'hundred', 'dozen', 'more', 'less', 'fewer',
  'over', 'under', 'up', 'down', 'out', 'off',
]);

function contentTokens(text: string): string[] {
  return (String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || []).map((t) =>
    t.replace(/[.]+$/g, '')
  );
}

export function assertFrameProvenance(
  after: string,
  frame: PhraseFrame,
  slotValues: readonly string[] = []
): HonestyVerdict {
  const text = String(after ?? '');
  if (text.includes(INPUT_SENTINEL)) {
    return { ok: false, reason: 'unfilled_slot' };
  }

  const allowed = new Set<string>();
  for (const tok of contentTokens(frame.sourceClause)) allowed.add(tok);
  for (const tok of contentTokens(frame.text)) allowed.add(tok);
  for (const value of slotValues) {
    for (const tok of contentTokens(value)) allowed.add(tok);
  }

  for (const tok of contentTokens(text)) {
    if (!tok) continue;
    if (allowed.has(tok)) continue;
    if (CLOSED_CLASS.has(tok)) continue;
    return { ok: false, reason: 'unprovenanced_frame_token' };
  }
  return { ok: true };
}
