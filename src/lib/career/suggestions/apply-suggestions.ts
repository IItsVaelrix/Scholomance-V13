import type { ResumeDocument } from '../parser/types.js';
import type { ResumeSuggestion, SuggestionApplicationResult } from '../analysis/types.js';
import { detectSuggestionConflicts } from './detect-conflicts.js';
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';

interface TextEdit {
  suggestionId: string;
  start: number;
  end: number;
  replacementText: string;
}

export function applyAcceptedSuggestions(
  document: ResumeDocument,
  suggestions: ResumeSuggestion[]
): SuggestionApplicationResult {
  const applied: string[] = [];
  const skipped: Array<{
    suggestionId: string;
    reason:
      | 'rejected'
      | 'stale_span'
      | 'overlap'
      | 'missing_target'
      | 'conflict'
      | 'unfilled_input';
  }> = [];

  const rawText = document?.rawText || '';

  // 1. Separate accepted and non-accepted suggestions
  const acceptedSuggestions: ResumeSuggestion[] = [];

  for (const s of suggestions) {
    if (s.status !== 'accepted') {
      skipped.push({ suggestionId: s.id, reason: 'rejected' });
    } else {
      acceptedSuggestions.push(s);
    }
  }

  // 2. Detect conflicts among accepted suggestions
  const conflicts = detectSuggestionConflicts(acceptedSuggestions);

  const editsToApply: TextEdit[] = [];

  // 3. Process accepted suggestions
  for (const s of acceptedSuggestions) {
    if (conflicts.has(s.id)) {
      const reason = (conflicts.get(s.id) as any) || 'overlap';
      skipped.push({ suggestionId: s.id, reason });
      continue;
    }

    if (s.requiresInput === true && (s.after ?? '').includes(INPUT_SENTINEL)) {
      skipped.push({ suggestionId: s.id, reason: 'unfilled_input' });
      continue;
    }

    if (s.target?.span) {
      const { start, end } = s.target.span;
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        start < 0 ||
        end > rawText.length ||
        start > end
      ) {
        skipped.push({ suggestionId: s.id, reason: 'missing_target' });
        continue;
      }

      if (s.before !== undefined) {
        const actualBefore = rawText.slice(start, end);
        if (actualBefore !== s.before) {
          skipped.push({ suggestionId: s.id, reason: 'stale_span' });
          continue;
        }
      }

      editsToApply.push({
        suggestionId: s.id,
        start,
        end,
        replacementText: s.after ?? '',
      });
    } else if (s.target?.insertionPoint) {
      const point = s.target.insertionPoint;
      if (point === 'document_end') {
        const insertPos = rawText.length;
        const textToInsert = s.after
          ? rawText.endsWith('\n') || rawText.length === 0
            ? s.after
            : '\n\n' + s.after
          : '';

        editsToApply.push({
          suggestionId: s.id,
          start: insertPos,
          end: insertPos,
          replacementText: textToInsert,
        });
      } else if (point === 'before_section' || point === 'after_section') {
        const section = document.sections?.find((sec) => sec.id === s.target?.sectionId);
        if (!section || !section.span) {
          skipped.push({ suggestionId: s.id, reason: 'missing_target' });
          continue;
        }

        if (point === 'before_section') {
          const insertPos = section.span.start;
          const textToInsert = (s.after ?? '') + '\n';
          editsToApply.push({
            suggestionId: s.id,
            start: insertPos,
            end: insertPos,
            replacementText: textToInsert,
          });
        } else {
          // after_section
          const insertPos = section.span.end;
          const textToInsert = '\n' + (s.after ?? '');
          editsToApply.push({
            suggestionId: s.id,
            start: insertPos,
            end: insertPos,
            replacementText: textToInsert,
          });
        }
      } else {
        skipped.push({ suggestionId: s.id, reason: 'missing_target' });
      }
    } else {
      skipped.push({ suggestionId: s.id, reason: 'missing_target' });
    }
  }

  // 4. Sort edits by start DESCENDING
  editsToApply.sort((a, b) => b.start - a.start);

  // 5. Apply edits to rawText
  let updatedText = rawText;
  for (const edit of editsToApply) {
    updatedText =
      updatedText.slice(0, edit.start) +
      edit.replacementText +
      updatedText.slice(edit.end);
    applied.push(edit.suggestionId);
  }

  return {
    text: updatedText,
    applied,
    skipped,
  };
}
