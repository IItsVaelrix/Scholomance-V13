import type { ResumeSuggestion } from '../analysis/types.js';

export function detectSuggestionConflicts(
  suggestions: ResumeSuggestion[]
): Map<string, string> {
  const conflicts = new Map<string, string>();

  function getSpanRange(s: ResumeSuggestion): { start: number; end: number } | null {
    if (
      s.target?.span &&
      typeof s.target.span.start === 'number' &&
      typeof s.target.span.end === 'number'
    ) {
      return { start: s.target.span.start, end: s.target.span.end };
    }
    return null;
  }

  for (let i = 0; i < suggestions.length; i++) {
    const s1 = suggestions[i];
    const r1 = getSpanRange(s1);

    for (let j = i + 1; j < suggestions.length; j++) {
      const s2 = suggestions[j];
      const r2 = getSpanRange(s2);

      let isConflict = false;

      if (r1 && r2) {
        const overlaps =
          (r1.start < r2.end && r2.start < r1.end) ||
          (r1.start === r2.start && r1.end === r2.end) ||
          (r1.start === r1.end && r1.start >= r2.start && r1.start <= r2.end) ||
          (r2.start === r2.end && r2.start >= r1.start && r2.start <= r1.end);

        if (overlaps) {
          isConflict = true;
        }
      } else if (
        s1.target?.insertionPoint &&
        s2.target?.insertionPoint &&
        s1.target.insertionPoint === s2.target.insertionPoint &&
        s1.target.sectionId === s2.target.sectionId
      ) {
        isConflict = true;
      }

      if (isConflict) {
        conflicts.set(s1.id, 'overlap');
        conflicts.set(s2.id, 'overlap');
      }
    }
  }

  return conflicts;
}
