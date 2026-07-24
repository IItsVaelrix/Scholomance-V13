import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { AmplifyContext } from '../primitives.js';
import { capitalizeFirst, bulletPrefixLength } from '../primitives.js';
import { FILLER_PATTERNS } from '../data/verb-classes.js';

interface FillerHit {
  rule: string;
  offset: number;
  before: string;
  after: string;
}

/**
 * Capability 3b — hedge and wordiness removal.
 * `matchAll` iterates over a clone of each pattern's match state, so it never mutates
 * the module-level regex's `lastIndex` and can't loop on a zero-length match.
 */
export function fillerRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const hits: FillerHit[] = [];
    const claimed: Array<{ start: number; end: number }> = [];
    const leadingOffset = bulletPrefixLength(line.text);

    for (const { rule, pattern, after } of FILLER_PATTERNS) {
      for (const match of line.text.matchAll(pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const overlaps = claimed.some((c) => start < c.end && c.start < end);
        if (overlaps) continue;

        let before = match[0];
        let replacement = after;

        // A leading filler removed outright (empty replacement) would lowercase the
        // start of the bullet ("Successfully launched..." -> "launched..."). Extend
        // through the following word and capitalize it instead.
        if (replacement === '' && (start === 0 || start === leadingOffset)) {
          const following = /^[A-Za-z]+/.exec(line.text.slice(end));
          if (!following) continue;
          before = line.text.slice(start, end + following[0].length);
          replacement = capitalizeFirst(following[0]);
        }

        claimed.push({ start, end: start + before.length });
        hits.push({ rule, offset: start, before, after: replacement });
      }
    }

    hits.sort((a, b) => a.offset - b.offset);

    for (const hit of hits) {
      const span = {
        coordinateSpace: 'raw' as const,
        start: line.span.start + hit.offset,
        end: line.span.start + hit.offset + hit.before.length,
      };
      const targetKey = `${span.start}:${span.end}`;
      const id = makeSuggestionId('tighten', targetKey, `${hit.rule}:${hit.before}`);

      suggestions.push({
        id,
        type: 'tighten',
        target: { span },
        before: hit.before,
        after: hit.after,
        reason: hit.after
          ? `"${hit.before.trim()}" can be shortened to "${hit.after}" without losing meaning.`
          : `"${hit.before.trim()}" adds words without adding information — cut it.`,
        evidence: [
          {
            source: 'resume',
            rule: hit.rule,
            text: hit.before,
            span,
            confidence: 0.8,
          },
        ],
        confidence: 0.8,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  return suggestions;
}
