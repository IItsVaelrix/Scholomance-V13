/**
 * Apply-time provenance — the guard that makes the UserFactLedger load-bearing.
 *
 * The ledger recorded candidate-supplied numbers but nothing ever read it: the only
 * `assertTokenProvenance` call ran at BUILD time, before the candidate had typed anything,
 * so it always saw an empty set of user-supplied values. The check that can actually fail
 * is at APPLY time, where the accepted `after` text is known: a number may reach the
 * résumé only if the source bullet already stated it or the candidate recorded it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { UserFactLedger } from '../../src/lib/career/improve/honesty/user-fact-ledger';
import SuggestionReviewPanel from '../../src/pages/Career/SuggestionReviewPanel';
import { makeImproveDoc } from './fixtures/career-improve-doc';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

const RAW = 'EXPERIENCE\nManaged the regional support queue';
const BULLET = 'Managed the regional support queue';

function suggestionWith(after: string): ResumeSuggestion {
  const doc = makeImproveDoc(RAW, 'experience', 'EXPERIENCE');
  const start = doc.rawText.indexOf(BULLET);
  return {
    id: 'suggestion:quantify:x:1',
    type: 'quantify',
    target: { span: { coordinateSpace: 'raw', start, end: start + BULLET.length } },
    before: BULLET,
    after,
    reason: 'test',
    evidence: [],
    confidence: 0.8,
    risk: 'medium',
    requiresUserApproval: true,
    status: 'accepted',
  };
}

describe('applyAcceptedSuggestions — token provenance', () => {
  it('refuses an accepted edit whose number the candidate never supplied', () => {
    const doc = makeImproveDoc(RAW, 'experience', 'EXPERIENCE');
    const sug = suggestionWith('Managed the regional support queue of 12 agents');

    const result = applyAcceptedSuggestions(doc, [sug]);

    expect(result.text).toBe(doc.rawText);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([
      { suggestionId: sug.id, reason: 'unprovenanced_number' },
    ]);
  });

  it('applies the same edit once the number is a recorded user-supplied fact', () => {
    const doc = makeImproveDoc(RAW, 'experience', 'EXPERIENCE');
    const sug = suggestionWith('Managed the regional support queue of 12 agents');
    const ledger = new UserFactLedger();
    ledger.record({
      value: '12',
      suggestionId: sug.id,
      slotId: `${sug.id}:slot:0`,
      acceptedAtRevision: 1,
    });

    const result = applyAcceptedSuggestions(doc, [sug], {
      userSuppliedValues: ledger.values(),
    });

    expect(result.applied).toEqual([sug.id]);
    expect(result.text).toContain('queue of 12 agents');
  });
});

describe('SuggestionReviewPanel — fact recording contract', () => {
  it('reports the filled text alongside the slot values when a fill-in is accepted', () => {
    // The page cannot re-read the suggestion from state here: the `onEdit` that fills the
    // sentinels is a state update that has not applied yet in this same event.
    const sug: ResumeSuggestion = {
      id: 'suggestion:quantify:y:1',
      type: 'quantify',
      target: { span: { coordinateSpace: 'raw', start: 0, end: BULLET.length } },
      before: BULLET,
      after: `${BULLET}, reducing backlog by ␟%`,
      reason: 'test',
      evidence: [],
      confidence: 0.8,
      risk: 'medium',
      requiresUserApproval: true,
      status: 'pending',
      requiresInput: true,
      inputSlots: [{ id: 'suggestion:quantify:y:1:slot:0', placeholder: 'percent', hint: 'e.g. 30' }],
    };

    const recorded: Array<{ id: string; values: Record<string, string>; after: string }> = [];
    render(
      <SuggestionReviewPanel
        suggestions={[sug]}
        onAccept={() => {}}
        onReject={() => {}}
        onEdit={() => {}}
        onAcceptAllLowRisk={() => {}}
        onRecordUserFacts={(id, values, after) => recorded.push({ id, values, after })}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. 30'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].values[sug.inputSlots![0].id]).toBe('30');
    expect(recorded[0].after).toBe(`${BULLET}, reducing backlog by 30%`);
  });
});

describe('SuggestionReviewPanel — entry choice on a drafted (Case A) card', () => {
  const suggestion: ResumeSuggestion = {
    id: 'sug:gap:1',
    type: 'learning_gap',
    after: 'Used Apache Airflow for orchestration, ␟',
    reason: 'The job description asks for "Apache Airflow" and your résumé does not mention it.',
    evidence: [],
    confidence: 0.6,
    risk: 'medium',
    requiresUserApproval: true,
    status: 'pending',
    requiresInput: true,
    requiresEntryChoice: true,
    inputSlots: [
      { id: 'sug:gap:1:slot:0', placeholder: 'the result', hint: 'the result it produced' },
    ],
    editable: true,
  };
  const entries = [
    { id: 'entry:exp:0', label: 'iQor — Support Lead' },
    { id: 'entry:exp:1', label: 'GC Services — Agent' },
  ];

  const renderPanel = (onAccept: ReturnType<typeof vi.fn>) =>
    render(
      <SuggestionReviewPanel
        suggestions={[suggestion]}
        entries={entries}
        onAccept={onAccept}
        onReject={() => {}}
        onAcceptAllLowRisk={() => {}}
      />
    );

  it('blocks Accept until both the blank and the entry are supplied', () => {
    const onAccept = vi.fn();
    renderPanel(onAccept);

    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('the result it produced'), {
      target: { value: 'cut runtime 40%' },
    });
    // Blank filled but no employer chosen yet — still locked.
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/which role/i), {
      target: { value: 'entry:exp:1' },
    });
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('reports the chosen entry on accept', () => {
    const onAccept = vi.fn();
    renderPanel(onAccept);

    fireEvent.change(screen.getByPlaceholderText('the result it produced'), {
      target: { value: 'cut runtime 40%' },
    });
    fireEvent.change(screen.getByLabelText(/which role/i), {
      target: { value: 'entry:exp:1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(onAccept).toHaveBeenCalledWith(
      'sug:gap:1',
      expect.objectContaining({ entryId: 'entry:exp:1' })
    );
  });
});
