/**
 * Move-aware application (spec §4.5 integration note), hardened entry-aware.
 *
 * `applyAcceptedSuggestions` models span rewrites and insertions, not moves. This module
 * is the additive extension that applies a move by `{ bulletId, entryId, beforeBulletId?,
 * afterBulletId? }`. The bullet's `sourceSpan` is validated for staleness but does NOT
 * control placement — so an earlier accepted rewrite cannot invalidate a later move.
 *
 * Entry-aware correction: the document is reconstructed section-by-section AND
 * entry-by-entry. Title and date lines are structural (never bullets) and stay at their
 * fixed line positions. Each entry's bullet "slots" are filled only with that entry's own
 * bullets in their post-move order — so a bullet can never leave its employment entry. A
 * move whose `entryId` disagrees with its bullet, or whose anchor lives in another entry,
 * is rejected as a `conflict` (moving between employers is mechanically impossible).
 *
 * Bullet rewrites are applied BY IDENTITY (span + `before` match to a bullet). Insertions
 * apply at section boundaries / document end. Non-bullet span rewrites fall back to a
 * `before`→`after` text match within a section.
 */
import type { ResumeDocument, ResumeSection, ResumeBullet, ResumeExperienceEntry } from '../parser/types.js';
import type { ResumeSuggestion, SuggestionApplicationResult } from '../analysis/types.js';
import { segmentEntries } from '../parser/segment-entries.js';
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';
import { assertNumericProvenance } from './honesty/token-provenance.js';

type SkipReason =
  | 'rejected'
  | 'stale_span'
  | 'overlap'
  | 'missing_target'
  | 'conflict'
  | 'unfilled_input'
  | 'unprovenanced_number';

interface EntryPlan {
  entryId: string;
  /** The entry's bullets in original document order. */
  bullets: ResumeBullet[];
  /** Final bullet-id order after moves (defaults to original order). */
  order: string[];
}

interface SectionPlan {
  section: ResumeSection;
  entries: EntryPlan[];
  /** Every bullet in the section (concatenated entries) — for rewrite matching. */
  bullets: ResumeBullet[];
  /** bulletId -> rewritten content text (only for bullets with an accepted rewrite). */
  rewritten: Map<string, string>;
  /** Non-bullet text patches keyed by section (fallback rewrites). */
  textPatches: Array<{ before: string; after: string }>;
}

/** Apply an entry's moves to its own bullet order. Cross-entry anchors are ignored
 *  (the move is later rejected as a conflict). */
function applyMovesToEntryOrder(originalOrder: string[], moves: ResumeSuggestion[], entryBulletIds: Set<string>): string[] {
  const order = [...originalOrder];
  for (const sug of moves) {
    const move = sug.move!;
    if (!entryBulletIds.has(move.bulletId)) continue;
    const idx = order.indexOf(move.bulletId);
    if (idx === -1) continue;
    order.splice(idx, 1);
    if (move.beforeBulletId && entryBulletIds.has(move.beforeBulletId)) {
      const anchor = order.indexOf(move.beforeBulletId);
      order.splice(anchor === -1 ? 0 : anchor, 0, move.bulletId);
    } else if (move.afterBulletId && entryBulletIds.has(move.afterBulletId)) {
      const anchor = order.indexOf(move.afterBulletId);
      order.splice(anchor === -1 ? order.length : anchor + 1, 0, move.bulletId);
    } else if (!move.beforeBulletId && !move.afterBulletId) {
      order.unshift(move.bulletId);
    } else {
      // Anchor named a bullet from another entry — refuse to move (reinsert in place).
      order.splice(idx, 0, move.bulletId);
    }
  }
  return order;
}

/** Reconstruct one section's text: title/date lines fixed; each entry's bullet slots
 *  filled with that entry's reordered bullets; rewrites applied by identity. */
function reconstructSection(plan: SectionPlan, rawText: string): string {
  const { section, entries, rewritten } = plan;
  const sectionText = rawText.slice(section.span.start, section.span.end);
  const lines = sectionText.split('\n');

  // Map each bullet to its line index within the section and its line prefix (marker/indent).
  const bulletLineIndex = new Map<string, number>();
  const bulletPrefix = new Map<string, string>();
  const bulletContent = new Map<string, string>();

  let cursor = 0;
  const lineStarts: number[] = [];
  for (let li = 0; li < lines.length; li++) {
    lineStarts.push(cursor);
    cursor += lines[li].length + 1;
  }

  for (const entry of entries) {
    for (const b of entry.bullets) {
      const bStart = b.sourceSpan.start - section.span.start;
      const bEnd = b.sourceSpan.end - section.span.start;
      for (let li = 0; li < lines.length; li++) {
        const lineStartInText = lineStarts[li];
        const lineEndInText = lineStartInText + lines[li].length;
        if (bStart >= lineStartInText && bEnd <= lineEndInText) {
          bulletLineIndex.set(b.id, li);
          bulletPrefix.set(b.id, lines[li].slice(0, bStart - lineStartInText));
          bulletContent.set(b.id, rewritten.get(b.id) ?? b.rawText);
          break;
        }
      }
    }
  }

  const outLines = [...lines];

  // Fill each entry's bullet slots (its own line positions) with its reordered bullets.
  for (const entry of entries) {
    const slotLineIndices = entry.bullets
      .map((b) => bulletLineIndex.get(b.id))
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);

    for (let k = 0; k < slotLineIndices.length && k < entry.order.length; k++) {
      const bulletId = entry.order[k];
      const li = slotLineIndices[k];
      const prefix = bulletPrefix.get(bulletId) ?? '';
      const content = bulletContent.get(bulletId) ?? '';
      outLines[li] = prefix + content;
    }
  }

  return outLines.join('\n');
}

export function applyMovesAndRewrites(
  document: ResumeDocument,
  suggestions: ResumeSuggestion[],
  options: { userSuppliedValues?: ReadonlySet<string> } = {}
): SuggestionApplicationResult {
  const applied: string[] = [];
  const skipped: Array<{ suggestionId: string; reason: SkipReason }> = [];
  const rawText = document?.rawText || '';

  const accepted = suggestions.filter((s) => {
    if (s.status !== 'accepted') {
      skipped.push({ suggestionId: s.id, reason: 'rejected' });
      return false;
    }
    return true;
  });

  // Unfilled-input guard applies to every accepted suggestion.
  const viable = accepted.filter((s) => {
    if ((s.after ?? '').includes(INPUT_SENTINEL)) {
      skipped.push({ suggestionId: s.id, reason: 'unfilled_input' });
      return false;
    }
    // Same number rule as the span path: no fabricated metric survives a move either.
    const numeric = assertNumericProvenance(
      s.before ?? rawText,
      s.after ?? '',
      options.userSuppliedValues
    );
    if (!numeric.ok) {
      skipped.push({ suggestionId: s.id, reason: 'unprovenanced_number' });
      return false;
    }
    return true;
  });

  const moveSugs = viable.filter((s) => s.move);
  const rewriteSugs = viable.filter((s) => !s.move && s.target?.span);
  const insertSugs = viable.filter((s) => !s.move && s.target?.insertionPoint);

  // Build per-section plans (entry-aware).
  const plans: SectionPlan[] = (document.sections || []).map((section) => {
    const entries: ResumeExperienceEntry[] = segmentEntries(section);
    const entryPlans: EntryPlan[] = entries.map((e) => ({
      entryId: e.id,
      bullets: e.bullets,
      order: e.bullets.map((b) => b.id),
    }));
    return {
      section,
      entries: entryPlans,
      bullets: entryPlans.flatMap((e) => e.bullets),
      rewritten: new Map<string, string>(),
      textPatches: [],
    };
  });
  const planBySectionId = new Map(plans.map((p) => [p.section.id, p]));

  // Apply bullet rewrites by identity (span + before match).
  for (const r of rewriteSugs) {
    const span = r.target!.span!;
    let matched = false;
    for (const plan of plans) {
      const bullet = plan.bullets.find(
        (b) => b.sourceSpan.start === span.start && b.sourceSpan.end === span.end
      );
      if (!bullet) continue;
      if (r.before !== undefined && rawText.slice(span.start, span.end) !== r.before) {
        continue; // stale — try text-match fallback below
      }
      plan.rewritten.set(bullet.id, r.after ?? '');
      applied.push(r.id);
      matched = true;
      break;
    }
    if (matched) continue;

    // Fallback: non-bullet span rewrite — apply by `before`→`after` text match within a section.
    if (r.before) {
      const plan = plans.find((p) => {
        const t = rawText.slice(p.section.span.start, p.section.span.end);
        return t.includes(r.before!);
      });
      if (plan) {
        plan.textPatches.push({ before: r.before, after: r.after ?? '' });
        applied.push(r.id);
        continue;
      }
    }
    skipped.push({ suggestionId: r.id, reason: 'stale_span' });
  }

  // Validate + apply moves, scoped per entry. A move whose entryId disagrees with its
  // bullet's entry (or whose anchor is in another entry) is a conflict — refused.
  const bulletEntry = new Map<string, string>();
  for (const plan of plans) {
    for (const entry of plan.entries) {
      for (const b of entry.bullets) bulletEntry.set(b.id, entry.entryId);
    }
  }

  const movesByEntry = new Map<string, ResumeSuggestion[]>();
  for (const m of moveSugs) {
    const move = m.move!;
    const ownerEntry = bulletEntry.get(move.bulletId);
    if (!ownerEntry) {
      skipped.push({ suggestionId: m.id, reason: 'missing_target' });
      continue;
    }
    // Enforce same-entry: the move's declared entryId must match the bullet's entry, and
    // any anchor must live in the same entry. Crossing an employer boundary is a conflict.
    const anchorOk =
      (!move.beforeBulletId || bulletEntry.get(move.beforeBulletId) === ownerEntry) &&
      (!move.afterBulletId || bulletEntry.get(move.afterBulletId) === ownerEntry);
    if ((move.entryId && move.entryId !== ownerEntry) || !anchorOk) {
      skipped.push({ suggestionId: m.id, reason: 'conflict' });
      continue;
    }
    const list = movesByEntry.get(ownerEntry) || [];
    list.push(m);
    movesByEntry.set(ownerEntry, list);
  }

  for (const plan of plans) {
    for (const entry of plan.entries) {
      const moves = movesByEntry.get(entry.entryId) || [];
      const ids = new Set(entry.bullets.map((b) => b.id));
      entry.order = applyMovesToEntryOrder(entry.bullets.map((b) => b.id), moves, ids);
    }
  }
  // Mark move suggestions applied (those that were scheduled into an entry).
  for (const m of moveSugs) {
    if (skipped.some((s) => s.suggestionId === m.id)) continue;
    if (movesByEntry.get(m.move!.entryId || bulletEntry.get(m.move!.bulletId) || '')?.includes(m)) {
      applied.push(m.id);
    } else if (bulletEntry.has(m.move!.bulletId)) {
      applied.push(m.id);
    } else {
      skipped.push({ suggestionId: m.id, reason: 'missing_target' });
    }
  }

  // Insertions keyed by section / document end.
  const beforeSection = new Map<string, string[]>();
  const afterSection = new Map<string, string[]>();
  const documentEnd: string[] = [];
  for (const ins of insertSugs) {
    const point = ins.target!.insertionPoint!;
    const text = ins.after ?? '';
    if (point === 'document_end') {
      documentEnd.push(text);
      applied.push(ins.id);
    } else if (point === 'before_section' && ins.target?.sectionId) {
      const list = beforeSection.get(ins.target.sectionId) || [];
      list.push(text);
      beforeSection.set(ins.target.sectionId, list);
      applied.push(ins.id);
    } else if (point === 'after_section' && ins.target?.sectionId) {
      const list = afterSection.get(ins.target.sectionId) || [];
      list.push(text);
      afterSection.set(ins.target.sectionId, list);
      applied.push(ins.id);
    } else {
      skipped.push({ suggestionId: ins.id, reason: 'missing_target' });
    }
  }

  // Reconstruct the document section by section (sections are contiguous over rawText).
  let result = '';
  for (const plan of plans) {
    const secId = plan.section.id;
    if (beforeSection.has(secId)) {
      for (const t of beforeSection.get(secId)!) result += t + '\n';
    }
    let sectionOut = reconstructSection(plan, rawText);
    for (const patch of plan.textPatches) {
      sectionOut = sectionOut.replace(patch.before, patch.after);
    }
    result += sectionOut;
    if (afterSection.has(secId)) {
      for (const t of afterSection.get(secId)!) result += '\n' + t;
    }
  }

  // If sections did not cover the whole rawText (rare), append any trailing remainder.
  const lastSection = plans[plans.length - 1]?.section;
  const coveredEnd = lastSection ? lastSection.span.end : 0;
  if (coveredEnd < rawText.length) {
    result += rawText.slice(coveredEnd);
  }

  if (documentEnd.length > 0) {
    const sep = result.endsWith('\n') || result.length === 0 ? '' : '\n\n';
    result += sep + documentEnd.join('\n\n');
  }

  return { text: result, applied, skipped };
}
