/**
 * Add-Section rule — the drafted SKILLS line is text that goes straight into a résumé.
 *
 * The requirement ledger emits overlapping n-grams ("web application", "application",
 * "web"), so listing every demonstrated requirement drafted a line that repeated the same
 * skill three times. Only the most specific phrase of an overlapping group is listed.
 */
import { describe, it, expect } from 'vitest';
import { addSectionRule } from '../../src/lib/career/improve/rules/add-section';
import type { EvidenceMap } from '../../src/lib/career/improve/types';
import { makeImproveDoc } from './fixtures/career-improve-doc';

function demonstrated(term: string, weight: number) {
  return {
    requirement: { term, weight, jdEvidence: [] },
    support: 'demonstrated' as const,
    bullets: [],
  };
}

describe('add-section rule — drafted SKILLS line', () => {
  it('lists only the most specific phrase of an overlapping group', () => {
    const doc = makeImproveDoc(
      'EXPERIENCE\nBuilt internal web applications and ran the reporting database',
      'experience',
      'EXPERIENCE'
    );
    const map: EvidenceMap = [
      demonstrated('web application', 0.9),
      demonstrated('application', 0.6),
      demonstrated('web', 0.5),
      demonstrated('database', 0.8),
      demonstrated('reporting', 0.4),
    ];

    const [sug] = addSectionRule(map, [], doc);
    expect(sug).toBeTruthy();
    const listed = sug.after!.split('\n')[1].split(', ');
    expect(listed).toEqual(['web application', 'database', 'reporting']);
  });
});
