import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { AmplifyContext } from '../primitives.js';
import { FILLER_PATTERNS } from '../data/verb-classes.js';

interface FillerHit {
  rule: string;
  offset: number;
  before: string;
  after: string;
}

/**
 * Capability 3b — hedge and wordiness removal.
 * Patterns are module-level regexes with /g, so lastIndex is reset before every scan.
 */
export function fillerRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const hits: FillerHit[] = [];
    const claimed: Array<{ start: number; end: number }> = [];

    for (const { rule, pattern, after } of FILLER_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line.text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (match[0].length === 0) break;
        const overlaps = claimed.some((c) => start < c.end && c.start < end);
        if (overlaps) continue;
        claimed.push({ start, end });
        hits.push({ rule, offset: start, before: match[0], after });
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
