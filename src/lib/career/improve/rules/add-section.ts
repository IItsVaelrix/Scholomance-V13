/**
 * Add Missing Section rule (spec §4.5).
 *
 * `type: 'structure'` with `target.insertionPoint`; fires ONLY when the JD is
 * keyword-dense and no Skills section exists. Drafts a Skills line listing ONLY
 * requirements whose `support === 'demonstrated'` — a never-evidenced skill cannot appear
 * (that filter IS the honesty guard for this rule).
 */
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { ResumeDocument } from '../../parser/types.js';
import type { EvidenceMap, ResumeBullet } from '../types.js';

/** "Keyword-dense" = the JD yields at least this many distinct requirements. */
const KEYWORD_DENSE_THRESHOLD = 5;

export function addSectionRule(
  map: EvidenceMap,
  _bullets: ResumeBullet[],
  doc: ResumeDocument
): ResumeSuggestion[] {
  if (!doc?.sections) return [];

  // Only when no Skills section exists.
  const hasSkills = doc.sections.some((s) => s.kind === 'skills');
  if (hasSkills) return [];

  // Only when the JD is keyword-dense.
  if (map.length < KEYWORD_DENSE_THRESHOLD) return [];

  // List ONLY demonstrated requirements (deduped by canonical label, weight desc).
  const seen = new Set<string>();
  const labels: string[] = [];
  const sorted = [...map].sort((a, b) => b.requirement.weight - a.requirement.weight);
  for (const entry of sorted) {
    if (entry.support !== 'demonstrated') continue;
    const label = entry.requirement.canonicalLabel || entry.requirement.term;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  if (labels.length === 0) return []; // no demonstrated skills → nothing to draft

  // Drop any label wholly contained in a more specific one. The ledger mines overlapping
  // n-grams ("web application" / "application" / "web"), and listing all of them drafts a
  // line that names the same skill three times.
  const specific = labels.filter(
    (label) =>
      !labels.some(
        (other) =>
          other !== label &&
          new RegExp(`(?:^|\\s)${label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(
            other.toLowerCase()
          )
      )
  );

  const skillsBlock = `SKILLS\n${specific.join(', ')}`;

  // Insert before the experience section when present, else at document end.
  const experience = doc.sections.find((s) => s.kind === 'experience');
  const target = experience
    ? { sectionId: experience.id, insertionPoint: 'before_section' as const }
    : { insertionPoint: 'document_end' as const };

  return [
    {
      id: makeSuggestionId('structure', 'add_skills_section', labels.join(',')),
      type: 'structure',
      target,
      before: undefined,
      after: skillsBlock,
      reason: `The job description is keyword-dense but your résumé has no Skills section. Add one listing the ${labels.length} skill(s) you already demonstrate: ${labels.join(', ')}.`,
      evidence: labels.slice(0, 3).map((label) => ({
        source: 'analysis' as const,
        rule: 'add_section',
        text: label,
        confidence: 0.8,
      })),
      confidence: 0.8,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
      editable: true,
    },
  ];
}
