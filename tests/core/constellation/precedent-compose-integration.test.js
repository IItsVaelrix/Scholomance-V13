/**
 * PRECEDENT AGAINST THE REAL CHART.
 *
 * `precedent.js` shipped complete and tested, and had no effect on anything: it
 * requires an injected case book, and nothing in the repository built one. Its
 * unit test proves the citation rules against hand-written molecule literals,
 * which cannot show that a ruling survives contact with the actual parser.
 *
 * This test runs precedent against genuine `compose()` output and through the
 * real `arbitrate()`, so it fails if the molecule shape drifts, if the category
 * vocabulary drifts, or if the cue envelope stops fitting the arbiter.
 *
 * ─── WHY `time flies` ──────────────────────────────────────────────────────
 *
 * The chart returns two stable parses for it, and BOTH are real English:
 * `time`(n) + `flies`(v), and the imperative `time`(v) + `flies`(n) — time the
 * flies. No derived scorer settles that, which is the documented gap precedent
 * exists to fill: topography scored 50% on attachment (chance), attraction
 * 86.1% against an 84.3% baseline. Authority is not a better guess than those,
 * it is a different kind of answer — a human ruled, and the ruling is cited.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compose } from '../../../codex/core/constellation/compose.js';
import { precedentCue, caseKey } from '../../../codex/core/constellation/precedent.js';
import { arbitrate } from '../../../codex/core/constellation/cue-arbiter.js';
import {
  assignmentOfMolecule,
  makeCase,
  recordRuling,
  loadCaseBook,
} from '../../../codex/server/services/constellation/precedent.adapter.js';

const TOKENS = ['time', 'flies'];
const POS = new Map([['time', ['n', 'v']], ['flies', ['n', 'v']]]);

const stableParses = () => compose(TOKENS, POS, { roots: ['S'] }).stable;

const RULING = makeCase({
  id: 'case-time-flies',
  tokens: TOKENS,
  // The nominal reading: `time` is the subject, `flies` its finite verb.
  ruling: { time: 'n', flies: 'v' },
  rationale: 'read as a statement about time, not as an order to time insects',
  authority: 'test fixture',
});

describe('precedent against real compose output', () => {
  it('confirms the chart really is contested here, or the test proves nothing', () => {
    const stable = stableParses();
    expect(stable.length).toBeGreaterThan(1);
    const distinct = new Set(
      stable.map((m) => JSON.stringify([...assignmentOfMolecule(m)].sort()))
    );
    // Two parses that assign the SAME categories would be a structural
    // ambiguity precedent cannot speak to — it rules on readings, not shapes.
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('cites the ruling and returns the molecule that matches it', () => {
    const stable = stableParses();
    const cue = precedentCue(TOKENS, stable, [RULING], assignmentOfMolecule);

    expect(cue.verdict).toBe('support');
    expect(cue.payload.citation).toBe('case-time-flies');
    expect(cue.payload.authority).toBe('test fixture');

    // The selected molecule genuinely carries the ruled reading — not merely
    // some molecule, which a cue that ignored the ruling would also return.
    const assigned = assignmentOfMolecule(cue.payload.molecule);
    expect(assigned.get('time')).toBe('n');
    expect(assigned.get('flies')).toBe('v');
  });

  it('would have selected the other parse had the human ruled the other way', () => {
    const imperative = makeCase({
      id: 'case-time-flies-imperative',
      tokens: TOKENS,
      ruling: { time: 'v', flies: 'n' },
      rationale: 'read as an order: time the flies',
      authority: 'test fixture',
    });
    const cue = precedentCue(TOKENS, stableParses(), [imperative], assignmentOfMolecule);

    expect(cue.verdict).toBe('support');
    const assigned = assignmentOfMolecule(cue.payload.molecule);
    expect(assigned.get('time')).toBe('v');
    expect(assigned.get('flies')).toBe('n');
  });

  it('wins the arbitration it is entered into, and names itself as the decider', () => {
    const cue = precedentCue(TOKENS, stableParses(), [RULING], assignmentOfMolecule);
    const ruling = arbitrate([cue]);
    expect(ruling.decidedBy).toBe('precedent');
  });

  /** No ruling is not a weak ruling. An empty book must produce no opinion. */
  it('abstains when nobody has ruled on this input', () => {
    expect(precedentCue(TOKENS, stableParses(), [], assignmentOfMolecule).verdict)
      .toBe('abstain');
  });

  it('abstains on a sentence one word different from the ruled one', () => {
    const other = ['time', 'flew'];
    const stable = compose(other, new Map([['time', ['n', 'v']], ['flew', ['v']]]), { roots: ['S'] }).stable;
    expect(precedentCue(other, stable, [RULING], assignmentOfMolecule).verdict).toBe('abstain');
  });

  /**
   * A ruling the grammar cannot produce is a DISAGREEMENT between the case book
   * and the chart. Abstaining keeps it visible; quietly returning the closest
   * molecule would hide it and would be retrieval by resemblance.
   */
  it('abstains when the ruling fits no parse the grammar offers', () => {
    const impossible = makeCase({
      id: 'case-impossible',
      tokens: TOKENS,
      ruling: { time: 'r', flies: 'r' },
      rationale: 'both adverbs — no such parse exists',
      authority: 'test fixture',
    });
    expect(precedentCue(TOKENS, stableParses(), [impossible], assignmentOfMolecule).verdict)
      .toBe('abstain');
  });
});

describe('case book store', () => {
  it('round-trips a ruling and re-rules without leaving two live answers', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'case-book-'));
    const bookPath = path.join(dir, 'book.json');
    try {
      expect(loadCaseBook(bookPath)).toEqual([]);

      recordRuling(RULING, bookPath);
      const loaded = loadCaseBook(bookPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe(caseKey(TOKENS));

      // Re-ruling the same input replaces it; two cases sharing a key would make
      // the winner depend on insertion order.
      recordRuling(
        makeCase({
          id: 'case-time-flies-revised',
          tokens: TOKENS,
          ruling: { time: 'v', flies: 'n' },
          rationale: 'revised on review',
          authority: 'test fixture',
        }),
        bookPath
      );
      const revised = loadCaseBook(bookPath);
      expect(revised).toHaveLength(1);
      expect(revised[0].id).toBe('case-time-flies-revised');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing or malformed book as empty rather than throwing', () => {
    expect(loadCaseBook('/nonexistent/path/book.json')).toEqual([]);
    expect(loadCaseBook(null)).toEqual([]);
  });

  it('refuses a case with no named authority', () => {
    expect(() => makeCase({ id: 'x', tokens: TOKENS, ruling: {}, authority: '' }))
      .toThrow(/authority/);
  });
});
