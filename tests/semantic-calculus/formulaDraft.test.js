/**
 * The promotion payload: deposit -> draft -> holes -> formula.
 *
 * The bottleneck was that writing a claim down cost an hour, so claims got
 * argued instead of stated — and an unstated claim can never be killed. The
 * compiler already mints the skeleton whenever it admits ignorance
 * (missingSlots: probeId, observations, falsifiers); this makes it fillable.
 *
 * The division of labour is the thing under test: the machine supplies
 * STRUCTURE, the human supplies CONTENT, the law supplies REFUSAL.
 */
import { describe, it, expect } from 'vitest';
import { compileSemanticIntent } from '../../codex/core/semantic-calculus/compiler.ts';
import { derivedUtterance } from '../../codex/core/semantic-calculus/utterance.ts';
import { emptyContext } from '../../codex/core/semantic-calculus/trustPartition.ts';
import {
  draftFromDeposit,
  formulaHoles,
  isPromotable,
  promoteDraft,
} from '../../codex/core/semantic-calculus/formulaDraft.ts';
import { evaluateHypotheses } from '../../codex/core/semantic-calculus/hypothesisStatus.js';
import { makeReceipt } from '../../codex/core/semantic-calculus/observationReceipt.ts';

const ctx = (over = {}) => ({ ...emptyContext(), ...over });

const depositFor = (utterance) => {
  const { act } = compileSemanticIntent({
    utterance: derivedUtterance(utterance),
    context: ctx({ user: { route: '/read' } }),
  });
  return act.investigationDeposit;
};

describe('an admission of ignorance mints a fillable formula', () => {
  it('a procedure gap deposits the slots a formula needs', () => {
    const deposit = depositFor('why does the renderer die while editing a long track');
    expect(deposit.missingSlots).toContain('probeId');
    expect(deposit.missingSlots).toContain('observations');
    expect(deposit.missingSlots).toContain('falsifiers');
  });

  it('the draft is seeded ONLY from what was said', () => {
    const draft = draftFromDeposit(depositFor('why does the renderer die while editing a long track'));
    expect(draft.id).toMatch(/^inquiry\./);
    expect(draft.keywords).toContain('renderer');
    expect(draft.patterns[0]).toContain('renderer');
    // The machine invents neither the evidence nor the way to kill the claim.
    expect(draft.observations).toEqual([]);
    for (const h of draft.hypotheses) expect(h.falsifiers).toEqual([]);
  });

  it('a draft is not a formula: it cannot promote while it has holes', () => {
    const draft = draftFromDeposit(depositFor('why does the renderer die while editing a long track'));
    expect(isPromotable(draft)).toBe(false);
    expect(() => promoteDraft(draft)).toThrow(/DRAFT_INCOMPLETE/);
  });
});

describe('the holes are a worklist, not a complaint', () => {
  it('names the missing observation and the unkillable claim', () => {
    const holes = formulaHoles(draftFromDeposit(depositFor('why does the flargle collapse under load')));
    expect(holes.some((h) => h.slot === 'observations')).toBe(true);
    const falsifierHole = holes.find((h) => h.slot === 'falsifiers');
    expect(falsifierHole).toBeTruthy();
    expect(falsifierHole.todo).toMatch(/WRONG/); // imperative and actionable
    expect(falsifierHole.hypothesisId).toBeTruthy(); // says WHICH claim
  });

  it('catches a falsifier aimed at evidence the probe never collects', () => {
    // The mistake made live: a falsifier asking for `phaserCanvasCount` from a
    // harness that returned `canvasCount`. It looks like rigour and cannot fire.
    const base = draftFromDeposit(depositFor('why does the flargle collapse under load'));
    const bad = {
      ...base,
      observations: [{ id: 'obs.real', description: 'a real look', harness: 'h', required: true }],
      hypotheses: [{
        id: 'h_x', claim: 'x', predictions: [], citeSeeds: [],
        falsifiers: [{ id: 'f_ghost', description: 'ghost', observationId: 'obs.never.collected', predicate: { op: 'truthy', path: 'a' } }],
      }],
    };
    const holes = formulaHoles(bad);
    expect(holes.some((h) => h.slot === 'observationId')).toBe(true);
    expect(() => promoteDraft(bad)).toThrow(/obs\.never\.collected/);
  });
});

describe('a FILLED draft promotes and reaches a verdict', () => {
  const filled = () => {
    const base = draftFromDeposit(depositFor('why does the renderer die while editing a long track'));
    return {
      ...base,
      observations: [
        { id: 'obs.heap', description: 'JS heap while editing', harness: 'devtools.heap', required: true },
      ],
      hypotheses: [
        {
          id: 'h_history_retains',
          claim: 'The undo stack retains every replaced node generation',
          predictions: [{
            id: 'p_heap_climbs', description: 'heap ratchets up', required: true,
            observationId: 'obs.heap', predicate: { op: 'gt', path: 'growthMb', value: 50 },
          }],
          falsifiers: [{
            id: 'f_heap_flat', description: 'heap is flat — nothing is retained',
            observationId: 'obs.heap', predicate: { op: 'lte', path: 'growthMb', value: 5 },
          }],
          citeSeeds: ['src/lib/lexical/TruesightPlugin.jsx'],
        },
      ],
    };
  };

  it('promotes once every hole is filled', () => {
    const draft = filled();
    expect(isPromotable(draft)).toBe(true);
    const formula = promoteDraft(draft, '1.0.0');
    expect(formula.version).toBe('1.0.0');
    expect(formula.maxRisk).toBe('read_only');
  });

  it('and the promoted formula can actually kill its own claim', () => {
    // The whole point: a formula born from an admission of ignorance is a real
    // instrument, not a record of one. Flat heap eliminates the hypothesis.
    const formula = promoteDraft(filled());
    const flat = [makeReceipt({ probeId: formula.id, observationId: 'obs.heap', result: { growthMb: 2 }, status: 'observed' })];
    expect(evaluateHypotheses(formula.hypotheses, flat).eliminated).toContain('h_history_retains');

    const climbing = [makeReceipt({ probeId: formula.id, observationId: 'obs.heap', result: { growthMb: 400 }, status: 'observed' })];
    expect(evaluateHypotheses(formula.hypotheses, climbing).supported).toContain('h_history_retains');
  });

  it('a crashed harness still refutes nothing', () => {
    const formula = promoteDraft(filled());
    const broken = [makeReceipt({ probeId: formula.id, observationId: 'obs.heap', result: {}, status: 'error' })];
    const e = evaluateHypotheses(formula.hypotheses, broken);
    expect(e.underdetermined).toContain('h_history_retains');
    expect(e.eliminated).not.toContain('h_history_retains');
  });
});
