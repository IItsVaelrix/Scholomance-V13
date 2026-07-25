/**
 * Reorder rule (spec §4.5), hardened by the entry-aware correction.
 *
 * `type: 'structure'`; emits `MoveBulletOperation`s keyed on STABLE BULLET ID, never on
 * text. Promotes high-weight-supported bullets to the front of THEIR OWN EMPLOYMENT ENTRY
 * and flags JD-irrelevant ones. NEVER edits bullet text (zero fabrication surface).
 *
 * Entry-aware correction: bullets are grouped by `entryId`, not by section. A move's
 * `entryId` is set and every anchor (`before/afterBulletId`) lives in the same entry, so
 * `sourceBullet.entryId === targetBullet.entryId` always holds — a bullet can be promoted
 * within its own role only; it can never cross an employer boundary and leave its title
 * and date behind "like luggage on the wrong carousel".
 *
 * Move suggestions carry `target.sectionId` but NO span, so the span-overlap conflict
 * detector never pits a move against a text rewrite on the same bullet — an accepted
 * rewrite and a later reorder coexist (the move resolves by bulletId, unaffected by the
 * edit's span shift).
 */
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { ResumeDocument } from '../../parser/types.js';
import type { EvidenceMap, ResumeBullet, MoveBulletOperation } from '../types.js';

/** Relevance score for a bullet: max requirement weight it supports (demonstrated full,
 *  adjacent half). Zero means the JD never asks about it. */
function bulletRelevance(
  bulletId: string,
  map: EvidenceMap
): number {
  let score = 0;
  for (const entry of map) {
    const support = entry.bullets.find((b) => b.bulletId === bulletId);
    if (!support) continue;
    const factor = support.tier === 'demonstrated' ? 1 : 0.5;
    score = Math.max(score, entry.requirement.weight * factor);
  }
  return score;
}

function labelFor(bulletId: string, map: EvidenceMap): string | null {
  let best: { weight: number; label: string } | null = null;
  for (const entry of map) {
    const support = entry.bullets.find((b) => b.bulletId === bulletId);
    if (!support) continue;
    const label = entry.requirement.canonicalLabel || entry.requirement.term;
    if (!best || entry.requirement.weight > best.weight) {
      best = { weight: entry.requirement.weight, label };
    }
  }
  return best?.label ?? null;
}

/**
 * Plan the minimal sequence of move ops that transforms `currentOrder` into `targetOrder`,
 * scoped to a single entry (`entryId`). Applied in order, each op removes its bullet and
 * reinserts it (front, or after an anchor) — every anchor is in the same entry.
 */
export function planMoves(
  currentOrder: string[],
  targetOrder: string[],
  entryId = ''
): MoveBulletOperation[] {
  const order = [...currentOrder];
  const moves: MoveBulletOperation[] = [];
  for (let i = 0; i < targetOrder.length; i++) {
    const want = targetOrder[i];
    const curIdx = order.indexOf(want);
    if (curIdx === i) continue;
    order.splice(curIdx, 1);
    order.splice(i, 0, want);
    if (i === 0) moves.push({ bulletId: want, entryId });
    else moves.push({ bulletId: want, entryId, afterBulletId: targetOrder[i - 1] });
  }
  return moves;
}

/** The entry a bullet belongs to (falls back to its section for headerless bullets). */
function entryKeyOf(bullet: ResumeBullet): string {
  return bullet.entryId || bullet.sectionId;
}

export function reorderRule(
  map: EvidenceMap,
  bullets: ResumeBullet[],
  _doc: ResumeDocument
): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  // Group bullets by ENTRY (not section), preserving document order. This is the core
  // entry-aware correction: reorder never crosses an employer boundary.
  const byEntry = new Map<string, ResumeBullet[]>();
  for (const bullet of bullets) {
    const key = entryKeyOf(bullet);
    const list = byEntry.get(key) || [];
    list.push(bullet);
    byEntry.set(key, list);
  }

  const anyRelevant = bullets.some((b) => bulletRelevance(b.id, map) > 0);

  for (const [entryId, entryBullets] of byEntry) {
    if (entryBullets.length < 2) continue;
    const sectionId = entryBullets[0].sectionId;

    const relevance = new Map(entryBullets.map((b) => [b.id, bulletRelevance(b.id, map)]));
    const currentOrder = entryBullets.map((b) => b.id);

    // Target: relevant bullets first (relevance desc, original ordinal asc for ties),
    // then irrelevant bullets in their original order — all WITHIN this entry.
    const relevant = entryBullets
      .filter((b) => (relevance.get(b.id) || 0) > 0)
      .sort((a, b) => {
        const diff = (relevance.get(b.id) || 0) - (relevance.get(a.id) || 0);
        if (diff !== 0) return diff;
        return currentOrder.indexOf(a.id) - currentOrder.indexOf(b.id);
      });
    const irrelevant = entryBullets.filter((b) => (relevance.get(b.id) || 0) === 0);
    const targetOrder = [...relevant.map((b) => b.id), ...irrelevant.map((b) => b.id)];

    if (targetOrder.join('|') === currentOrder.join('|')) continue;

    const moves = planMoves(currentOrder, targetOrder, entryId);
    const bulletById = new Map(entryBullets.map((b) => [b.id, b]));

    moves.forEach((move, idx) => {
      const bullet = bulletById.get(move.bulletId);
      if (!bullet) return;
      const rel = relevance.get(move.bulletId) || 0;
      const label = labelFor(move.bulletId, map);
      const reason =
        rel > 0
          ? `Promote this bullet — it demonstrates "${label ?? 'a JD requirement'}" (weight ${rel.toFixed(2)}).`
          : 'Reorder to surface JD-relevant content first.';

      suggestions.push({
        id: makeSuggestionId('structure', `${entryId}:move:${idx}`, `${move.bulletId}:${targetOrder.join(',')}`),
        type: 'structure',
        target: { sectionId },
        before: bullet.rawText,
        after: bullet.rawText, // text unchanged — this is a move, not an edit
        reason,
        evidence: [
          {
            source: 'analysis',
            rule: 'reorder',
            span: bullet.sourceSpan,
            text: label ?? move.bulletId,
            confidence: 0.7,
          },
        ],
        confidence: 0.7,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        editable: false,
        move,
      });
    });

    // Flag JD-irrelevant bullets (only when the JD actually asks for other things).
    if (anyRelevant) {
      for (const bullet of irrelevant) {
        suggestions.push({
          id: makeSuggestionId('structure', `${entryId}:flag`, bullet.id),
          type: 'structure',
          target: { sectionId },
          before: bullet.rawText,
          after: bullet.rawText,
          reason: 'The job description never asks about this — consider trimming it or moving it below JD-relevant content.',
          evidence: [
            {
              source: 'analysis',
              rule: 'reorder_flag',
              span: bullet.sourceSpan,
              text: bullet.rawText.slice(0, 40),
              confidence: 0.5,
            },
          ],
          confidence: 0.5,
          risk: 'low',
          requiresUserApproval: true,
          status: 'pending',
          editable: false,
        });
      }
    }
  }

  return suggestions;
}
