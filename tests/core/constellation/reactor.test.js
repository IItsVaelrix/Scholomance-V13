import { describe, it, expect } from 'vitest';
import { BONDS, LIFTS } from '../../../codex/core/constellation/compose.js';
import { constructionByBond } from '../../../codex/core/constellation/grimoire/index.js';
import {
  measure,
  protectOk,
  productiveTypes,
  deadEndBonds,
  fireability,
  shuffledControls,
  percentile,
  rng,
} from '../../../codex/core/constellation/grimoire/reactor.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  familyPurity,
  autopsyBond,
  liftOnlySpan,
} from '../../../codex/core/constellation/grimoire/construction-families.js';

describe('reactor — structural analysis of the grammar', () => {
  /**
   * THE HALF-BUILT CONSTRUCTION. `CONJ+ADJ→CONJADJ` shipped without its
   * completion `ADJ+CONJADJ→ADJ`, so `CONJADJ` reached nothing and the bridge
   * could only move span/root cosmetics. The one-at-a-time reactor could not
   * have caught it: the completion cannot fire without the bridge, so it is
   * guaranteed NO-GAIN when reacted alone.
   *
   * This is the check that makes the repair permanent.
   */
  it('has no dead-end bonds — every result type can reach a spanning S', () => {
    const dead = deadEndBonds(BONDS, LIFTS);
    expect(
      dead.map((d) => `${d.signature} (result ${d.result} consumed by nothing)`),
    ).toEqual([]);
  });

  it('counts unary lifts as productive paths, not just bonds', () => {
    // NC is consumed by no bond; it reaches S only via NC → N → NP.
    expect(BONDS.some((b) => b[0] === 'NC' || b[1] === 'NC')).toBe(true);
    const withoutLifts = productiveTypes(BONDS, []);
    const withLifts = productiveTypes(BONDS, LIFTS);
    expect(withLifts.has('NC')).toBe(true);
    expect(withoutLifts.has('NC')).toBe(false);
  });

  it('keeps the adjectival coordination pair together', () => {
    const bridge = constructionByBond('CONJ', 'ADJ', 'CONJADJ');
    const complete = constructionByBond('ADJ', 'CONJADJ', 'ADJ');
    expect(bridge).toBeTruthy();
    expect(complete).toBeTruthy();
    // Dropping either one makes the other structurally inert.
    const withoutComplete = BONDS.filter((b) => !(b[0] === 'ADJ' && b[1] === 'CONJADJ'));
    expect(deadEndBonds(withoutComplete, LIFTS).map((d) => d.signature))
      .toEqual(['CONJ|ADJ|CONJADJ']);
  });

  it('reports an unfireable candidate as unfireable, not as NO-GAIN', () => {
    const observed = new Set(['ADJ', 'NP', 'VP', 'S']);
    const completion = { left: 'ADJ', right: 'CONJADJ', result: 'ADJ' };
    const verdict = fireability(completion, observed);
    expect(verdict.fireable).toBe(false);
    expect(verdict.missing).toEqual(['CONJADJ']);

    // With its sibling bridge in the same slate, it is merely paired-only.
    const slate = [{ left: 'CONJ', right: 'ADJ', result: 'CONJADJ' }];
    const paired = fireability(completion, observed, slate);
    expect(paired.fireable).toBe(false);
    expect(paired.pairedOnly).toBe(true);
  });
});

describe('reactor — events budget', () => {
  /**
   * The abort must be verdict-preserving: it may only fire where the events
   * floor would have rejected the trial anyway. A budget that could abort a
   * passing trial would silently turn a discovery into an EXPLODE.
   */
  it('rejects a budget-aborted trial exactly as the events floor would', () => {
    const base = {
      spanRecall: 0.77, nsubjRecall: 0.92, meanEvents: 85, maxEvents: 5000, threw: false,
    };
    const aborted = {
      spanRecall: 0, nsubjRecall: 0, meanEvents: Infinity, maxEvents: 9000,
      threw: false, budgetExceeded: true,
    };
    const verdict = protectOk(base, aborted);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('events-budget');
    // Same rejection the full sweep would have produced via the floor.
    const fullSweep = { ...aborted, budgetExceeded: false };
    expect(protectOk(base, fullSweep).ok).toBe(false);
  });

  it('leaves an ordinary trial untouched', () => {
    const base = {
      spanRecall: 0.77, nsubjRecall: 0.92, meanEvents: 85, maxEvents: 5000, threw: false,
    };
    const fine = {
      spanRecall: 0.78, nsubjRecall: 0.93, meanEvents: 88, maxEvents: 5200,
      threw: false, budgetExceeded: false,
    };
    expect(protectOk(base, fine).ok).toBe(true);
  });

  it('measure aborts once cumulative events pass the budget', () => {
    const records = [
      { tokens: [{ id: 1, form: 'the', head: 2, deprel: 'det' }, { id: 2, form: 'man', head: 0, deprel: 'root' }] },
      { tokens: [{ id: 1, form: 'dogs', head: 2, deprel: 'nsubj' }, { id: 2, form: 'ran', head: 0, deprel: 'root' }] },
    ];
    const posMap = new Map([['the', ['n']], ['man', ['n']], ['dogs', ['n']], ['ran', ['v']]]);
    const full = measure(records, posMap, BONDS);
    expect(full.budgetExceeded).toBe(false);
    const aborted = measure(records, posMap, BONDS, { eventsBudget: 0 });
    expect(aborted.budgetExceeded).toBe(true);
    expect(aborted.meanEvents).toBe(Infinity);
  });
});

describe('reactor — purity formula', () => {
  it('scores a monolithic licensed bond as its licensed share', () => {
    const p = familyPurity([{ fam: 'compound', n: 100 }]);
    expect(p.licensedShare).toBe(1);
    expect(p.concentration).toBe(1);
    expect(p.purity).toBe(1);
  });

  it('punishes orphan firings through the licensed share', () => {
    const p = familyPurity([
      { fam: 'compound', n: 50 },
      { fam: 'juxtaposition-orphan', n: 50 },
    ]);
    expect(p.licensedShare).toBeCloseTo(0.5, 6);
    expect(p.concentration).toBe(1);
    expect(p.purity).toBeCloseTo(0.5, 6);
  });

  it('punishes scattered families through the concentration factor', () => {
    const monolithic = familyPurity([{ fam: 'compound', n: 100 }]);
    const scattered = familyPurity([
      { fam: 'compound', n: 25 },
      { fam: 'modifier', n: 25 },
      { fam: 'nmod', n: 25 },
      { fam: 'other:nsubj', n: 25 },
    ]);
    expect(scattered.licensedShare).toBe(1);
    expect(scattered.concentration).toBeCloseTo(0.25, 6);
    expect(scattered.purity).toBeLessThan(monolithic.purity);
  });

  it('returns null for a bond that never fired — unmeasured is not zero', () => {
    const p = familyPurity([]);
    expect(p.purity).toBeNull();
    expect(p.licensedShare).toBeNull();
    expect(p.firings).toBe(0);
  });

  it('excludes indirect gains from the family denominator', () => {
    const p = familyPurity([
      { fam: 'compound', n: 10 },
      { fam: 'gain-without-direct-firing', n: 90 },
    ]);
    expect(p.firings).toBe(10);
    expect(p.purity).toBe(1);
  });
});

describe('autopsy — vacuous targets and borrowed types', () => {
  /** `police station` — two dual n/v nouns, the S+S artefact in miniature. */
  const POS = new Map([
    ['police', ['n', 'v']], ['station', ['n', 'v']], ['burned', ['v']],
  ]);
  const REC = {
    text: 'police station',
    tokens: [
      { id: 1, form: 'police', lemma: 'police', upos: 'NOUN', head: 2, deprel: 'compound' },
      { id: 2, form: 'station', lemma: 'station', upos: 'NOUN', head: 0, deprel: 'root' },
    ],
  };
  /** The same compound, given a predicate so `N+N` can be what closes the clause. */
  const REC_CLAUSE = {
    text: 'police station burned',
    tokens: [
      { id: 1, form: 'police', lemma: 'police', upos: 'NOUN', head: 2, deprel: 'compound' },
      { id: 2, form: 'station', lemma: 'station', upos: 'NOUN', head: 3, deprel: 'nsubj' },
      { id: 3, form: 'burned', lemma: 'burn', upos: 'VERB', head: 0, deprel: 'root' },
    ],
  };

  /**
   * THE VACUOUS NULL. `PROPN|PROPN|N` is already a law at head 1. Autopsied at
   * head 0 the baseline already contains the signature, so the trial chart
   * equals the base chart and every count is structurally zero — a null that
   * says nothing about the bond. `compose.js` allows one entry per signature
   * regardless of head, so vacuity is a signature property, not a head one.
   */
  it('flags a candidate whose signature is already law, at any head', () => {
    const r = autopsyBond(
      { left: 'PROPN', right: 'PROPN', result: 'N', head: 0 },
      [], POS, [['PROPN', 'PROPN', 'N', 1]],
    );
    expect(r.alreadyLaw).toBe(true);
    expect(r.lawHead).toBe(1);
  });

  it('does not flag a candidate whose signature is absent from the baseline', () => {
    const r = autopsyBond(
      { left: 'S', right: 'S', result: 'S', head: 0 },
      [], POS, [['PROPN', 'PROPN', 'N', 1]],
    );
    expect(r.alreadyLaw).toBe(false);
    expect(r.lawHead).toBeNull();
  });

  /**
   * A BORROWED TYPE. `police` is a one-token span that is only an `S` because
   * `V→VP` then the imperative `VP→S` promoted it. Nothing bonded inside it.
   */
  it('marks a one-token span that reached its type by lift alone', () => {
    const chart = composePacked(['police', 'station'], POS);
    const at = (type, from) => chart.molecules.find(
      (m) => m.type === type && m.from === from && m.to === from,
    );
    expect(liftOnlySpan(at('S', 0))).toBe(true);
    expect(liftOnlySpan(at('N', 0))).toBe(false);
  });

  /**
   * THE S+S VERDICT, MECHANISED. `S+S→S` scores its dominant licensed family as
   * `compound` — but both spans are dual n/v nouns wearing a clause type they
   * borrowed from the imperative lift. The autopsy must say so, or the next
   * reader repeats the misreading that this construction is clause juxtaposition.
   */
  it('counts firings where both spans wear a borrowed type', () => {
    const r = autopsyBond(
      { left: 'S', right: 'S', result: 'S', head: 0 },
      [REC], POS, [],
    );
    expect(r.materialGains).toBe(1);
    expect(r.firingsOnGains).toBe(1);
    expect(r.liftOnlyFirings).toBe(1);
    expect(r.liftOnlyShare).toBe(1);
    expect(r.families[0].fam).toBe('compound');
  });

  /**
   * THE CONFOUND. No lexical entry emits `S` — a one-token `S` is lifted by
   * definition. So a clausal bond scores ~100% borrowed no matter what the
   * grammar does, and the number stops being able to fail. `N` is emitted by
   * dual n/v atoms directly, so there the share is a real measurement.
   *
   * The report must say which case it is in rather than leave the reader to
   * mistake a structural floor for a finding.
   */
  it('flags a borrowed share that is floored by the type having no atom', () => {
    const r = autopsyBond(
      { left: 'S', right: 'S', result: 'S', head: 0 },
      [REC], POS, [],
    );
    expect(r.atomBearing).toEqual({ left: false, right: false });
    expect(r.borrowedFloored).toBe(true);
  });

  it('does not flag the floor when the bond types are carried by real atoms', () => {
    const r = autopsyBond(
      { left: 'N', right: 'N', result: 'N', head: 1 },
      [REC_CLAUSE], POS, [['NP', 'VP', 'S', 1]],
    );
    expect(r.atomBearing).toEqual({ left: true, right: true });
    expect(r.borrowedFloored).toBe(false);
  });

  it('does not charge a bond for spans that carry their own atom type', () => {
    const r = autopsyBond(
      { left: 'N', right: 'N', result: 'N', head: 1 },
      [REC_CLAUSE], POS, [['NP', 'VP', 'S', 1]],
    );
    expect(r.materialGains).toBe(1);
    expect(r.firingsOnGains).toBe(1);
    expect(r.liftOnlyFirings).toBe(0);
    expect(r.liftOnlyShare).toBe(0);
  });
});

describe('reactor — control arm', () => {
  it('is reproducible from the seed alone', () => {
    const types = ['NP', 'VP', 'S', 'N', 'PP', 'ADJ'];
    const a = shuffledControls(types, new Set(), { count: 10, seed: 7 });
    const b = shuffledControls(types, new Set(), { count: 10, seed: 7 });
    expect(a.map((x) => `${x.signature}|${x.head}`))
      .toEqual(b.map((x) => `${x.signature}|${x.head}`));
    expect(a).toHaveLength(10);
  });

  it('never emits an excluded bond', () => {
    const types = ['NP', 'VP', 'S'];
    const exclude = new Set(['NP|VP|S|0', 'NP|VP|S|1']);
    const controls = shuffledControls(types, exclude, { count: 20, seed: 3 });
    for (const c of controls) {
      expect(exclude.has(`${c.signature}|${c.head}`)).toBe(false);
    }
  });

  it('lcg stays in [0,1)', () => {
    const next = rng(42);
    for (let i = 0; i < 500; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('percentile returns null on an empty sample rather than zero', () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([1], 0.95)).toBe(1);
    expect(percentile([0, 1], 0.5)).toBeCloseTo(0.5, 6);
    expect(percentile([0, 10, 20, 30, 40], 0.5)).toBe(20);
  });
});
