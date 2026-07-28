/**
 * mergeImprovements (spec §6) — the panel never shows two cards for the same edit.
 *
 * The interesting layer is term-level suppression: a drafted/moved advisor card supersedes
 * the prose-only `learning_gap` for the same requirement. The two pipelines word the same
 * requirement differently (the prose gap names a bare term; the drafted card quotes the
 * whole JD clause), so the match is by content-token coverage, not string equality.
 */
import { describe, it, expect } from 'vitest';
import { mergeImprovements } from '../../src/lib/career/suggestions/merge-improvements';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

function proseGap(term: string): ResumeSuggestion {
  return {
    id: `sug:learning_gap:${term}:missing:${term}`,
    type: 'learning_gap',
    reason: `The job description asks for "${term}", which does not appear in your résumé. Add it in your own words.`,
    evidence: [{ source: 'analysis', rule: 'keyword_gap', text: term, confidence: 0.8 }],
    confidence: 0.8,
    risk: 'low',
    requiresUserApproval: true,
    status: 'pending',
    editable: false,
  };
}

function draftedCard(label: string, clause: string): ResumeSuggestion {
  return {
    id: `sug:learning_gap:${label}:missing:${label}`,
    type: 'learning_gap',
    target: { insertionPoint: 'after_section' },
    after: `Used ${label}, ␟`,
    reason: `The job description asks for "${label}" and your résumé does not mention it.`,
    evidence: [{ source: 'job_description', rule: 'missing_evidence', text: clause, confidence: 0.6 }],
    confidence: 0.6,
    risk: 'medium',
    requiresUserApproval: true,
    status: 'pending',
    requiresInput: true,
    requiresEntryChoice: true,
    inputSlots: [{ id: 'slot:0', placeholder: 'the result', hint: 'the result it produced' }],
    editable: true,
  };
}

describe('mergeImprovements', () => {
  it('drops a suggestion whose id already exists', () => {
    const a = proseGap('airflow');
    const merged = mergeImprovements([a], [{ ...a }]);
    expect(merged).toHaveLength(1);
  });

  it('drops an improvement whose span overlaps an existing suggestion', () => {
    const span = { coordinateSpace: 'raw' as const, start: 10, end: 20 };
    const existing: ResumeSuggestion = {
      id: 'sug:keyword:x',
      type: 'keyword',
      target: { span },
      before: 'b',
      after: 'a',
      reason: 'r',
      evidence: [],
      confidence: 0.8,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
      editable: true,
    };
    const imp: ResumeSuggestion = {
      ...existing,
      id: 'sug:keyword:y',
      target: { span: { coordinateSpace: 'raw', start: 15, end: 25 } },
    };
    const merged = mergeImprovements([existing], [imp]);
    expect(merged.map((s) => s.id)).toEqual(['sug:keyword:x']);
  });

  it('suppresses a prose gap when a drafted card covers the same term (term vs clause)', () => {
    // The prose gap names the bare term; the drafted card quotes the whole JD clause.
    const gap = proseGap('apache airflow');
    const card = draftedCard('Apache Airflow', 'Experience with Apache Airflow for orchestration');
    const merged = mergeImprovements([gap], [card]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(card.id); // the actionable card wins
  });

  it('keeps a prose gap that no improvement covers', () => {
    const gap = proseGap('kubernetes');
    const card = draftedCard('Apache Airflow', 'Experience with Apache Airflow for orchestration');
    const merged = mergeImprovements([gap], [card]);
    expect(merged.map((s) => s.id).sort()).toEqual([gap.id, card.id].sort());
  });

  it('never suppresses a non-learning_gap card', () => {
    const keyword: ResumeSuggestion = {
      id: 'sug:keyword:sql',
      type: 'keyword',
      before: 'wrote postgres queries',
      after: 'wrote SQL/postgres queries',
      reason: 'Name "SQL" explicitly.',
      evidence: [{ source: 'resume', rule: 'vocabulary_injection', text: 'sql', confidence: 0.85 }],
      confidence: 0.85,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
      editable: true,
    };
    // An improvement that happens to mention SQL must not suppress a keyword rewrite.
    const card = draftedCard('SQL', 'Strong SQL skills are required');
    const merged = mergeImprovements([keyword], [card]);
    expect(merged.some((s) => s.id === keyword.id)).toBe(true);
  });
});
