import type { ResumeSection, ResumeBullet } from './types.js';
import { stableHash } from './identity-utils.js';
import { segmentEntryBullets } from './segment-entries.js';

/**
 * Bullet segmentation prerequisite for the JD Improvement Advisor (spec §4.1), made
 * entry-aware (entry-aware correction).
 *
 * Delegates to `segmentEntryBullets`, which recovers employment-entry structure: role
 * titles and date lines are STRUCTURAL and are never emitted as `ResumeBullet`; each
 * bullet is tagged with the `entryId` of the entry it belongs to. A bullet may move only
 * within its own entry (§4.5) — so achievements can never cross an employer boundary.
 *
 * For a section with no detectable headers (a plain list of bullets, or a non-experience
 * section), entry segmentation yields a single headerless entry, so the bullet list is
 * exactly the prior flat behavior — each bullet now additionally carries an `entryId`.
 *
 * The returned `rawText` is byte-identical to `rawText.slice(sourceSpan.start,
 * sourceSpan.end)`, so the apply guard's `before === rawText.slice(span)` check works
 * exactly. `sourceSpan` is in the section's (raw) coordinate space.
 */

/** Build the stable bullet id: sectionId + ordinal + content hash. */
export function makeBulletId(sectionId: string, ordinal: number, rawText: string): string {
  return `bullet:${sectionId}:${ordinal}:${stableHash(rawText)}`;
}

export function segmentBullets(section: ResumeSection): ResumeBullet[] {
  return segmentEntryBullets(section);
}

/** Segment every section of a document into bullets, in document order. */
export function segmentDocumentBullets(
  sections: readonly ResumeSection[]
): ResumeBullet[] {
  const out: ResumeBullet[] = [];
  for (const section of sections || []) {
    out.push(...segmentBullets(section));
  }
  return out;
}
