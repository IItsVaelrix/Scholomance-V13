/**
 * Phase 3A — bounded complement ontology (PROPOSITIONAL / INFINITIVAL /
 * CLAUSAL / PARTICLE), its relation projection, and its composition rules.
 *
 * Waterfall law declaration (frozen before the rerun): this change is
 * expected to move `relationAvailable` (stage 1) and `namedCompleteRate`.
 * It is NOT expected to move `compatMappingAvailable` or
 * `actualCompatFire`: Phase 3A authors no COMPAT rows and no lexical
 * material. Fires cannot appear; 342 is the ceiling and the floor.
 *
 * Production change that would make these fail: encoding WHICH complement
 * derivation should be chosen (score must stay 0), projecting PARTICLE
 * over the live 'particle-of' relation, or inventing CLAUSAL uses.
 */
import { describe, expect, it } from 'vitest';

import {
  COMPLEMENT_ONTOLOGY_VERSION,
  COMPLEMENT_SLOTS,
  COMPLEMENT_TYPES,
  classifyComplement,
  projectComplementRelation,
} from '../../../../codex/core/constellation/semantic-particles/complement-ontology.js';
import {
  ends,
  projectRelation,
} from '../../../../codex/core/constellation/semantic-particles/feature-score.js';
import {
  composeMeanings,
  leafMeaning,
} from '../../../../codex/core/constellation/semantic-particles/compositional-semantics.js';
import {
  diagnoseT1Edge,
  rolesComplete,
} from '../../../../codex/core/constellation/semantic-particles/observe-coverage.js';
import { bondFamily } from '../../../../codex/core/constellation/semantic-particles/decision-bearing.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';

const provider = EXPERIMENTAL_FEATURE_PROVIDER;

function leaf(type, lemma, from = 0) {
  return {
    type,
    from,
    to: from + 1,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
    derivations: [],
  };
}

describe('ontology shape is bounded and frozen', () => {
  it('declares exactly four complement types with the five slots', () => {
    expect(COMPLEMENT_ONTOLOGY_VERSION).toBe('1.0.0');
    expect(Object.keys(COMPLEMENT_TYPES).sort()).toEqual([
      'CLAUSAL',
      'INFINITIVAL',
      'PARTICLE',
      'PROPOSITIONAL',
    ]);
    expect(COMPLEMENT_SLOTS).toEqual([
      'Governor',
      'Complement',
      'ComplementType',
      'ControlRelation',
      'Finite',
    ]);
    expect(Object.isFrozen(COMPLEMENT_TYPES)).toBe(true);
    for (const type of Object.values(COMPLEMENT_TYPES)) {
      expect(Object.isFrozen(type)).toBe(true);
    }
  });

  it('marks CLAUSAL reserved: declared, but no pair classifies into it in Phase 3A', () => {
    expect(COMPLEMENT_TYPES.CLAUSAL.status).toBe('RESERVED');
    const shapes = [
      ['VP', 'SBAR'], ['V', 'SBAR'], ['S', 'SBAR'], ['SBAR', 'S'],
      ['VP', 'INF'], ['V', 'INF'], ['VP', 'PRT'], ['V', 'PRT'],
      ['NP', 'VP'], ['PP', 'S'], ['TO', 'VP'], ['SUB', 'S'],
    ];
    for (const [l, r] of shapes) {
      const hit = classifyComplement(l, r);
      if (hit) expect(hit.complementType).not.toBe('CLAUSAL');
    }
  });
});

describe('classifyComplement answers governor / complement / type / finite', () => {
  it('covers exactly the observed census bond shapes', () => {
    const cases = [
      { l: 'VP', r: 'SBAR', type: 'PROPOSITIONAL', gov: 'left', finite: null },
      { l: 'V', r: 'SBAR', type: 'PROPOSITIONAL', gov: 'left', finite: null },
      { l: 'S', r: 'SBAR', type: 'PROPOSITIONAL', gov: 'left', finite: null },
      { l: 'SBAR', r: 'S', type: 'PROPOSITIONAL', gov: 'right', finite: null },
      { l: 'VP', r: 'INF', type: 'INFINITIVAL', gov: 'left', finite: false },
      { l: 'V', r: 'INF', type: 'INFINITIVAL', gov: 'left', finite: false },
      { l: 'VP', r: 'PRT', type: 'PARTICLE', gov: 'left', finite: null },
      { l: 'V', r: 'PRT', type: 'PARTICLE', gov: 'left', finite: null },
    ];
    for (const c of cases) {
      const hit = classifyComplement(c.l, c.r);
      expect(hit, `${c.l}+${c.r}`).not.toBe(null);
      expect(hit.complementType).toBe(c.type);
      expect(hit.governorSide).toBe(c.gov);
      expect(hit.finite).toBe(c.finite);
      expect(hit.relation).toBe(`${c.type}_COMPLEMENT`);
      expect(hit.controlRelation).toBe(null);
      expect(Object.isFrozen(hit)).toBe(true);
    }
  });

  it('stays null for non-complement pairs (attachment, subordinator, apposition...)', () => {
    const negatives = [
      ['NP', 'VP'], ['DET', 'N'], ['TO', 'VP'], ['SUB', 'S'], ['SUB', 'VP'],
      ['PP', 'S'], ['PP', 'VP'], ['NPCOMMA', 'NP'], ['P', 'NP'],
      ['ADV', 'VP'], ['AUX', 'VP'], ['REL', 'S'], ['N', 'N'], ['ADJ', 'N'],
      ['S', 'S'], ['VP', 'VP'], ['SBAR', 'VP'], ['INF', 'VP'],
    ];
    for (const [l, r] of negatives) {
      expect(classifyComplement(l, r), `${l}+${r}`).toBe(null);
    }
  });
});

describe('projection split: ontology truth vs T1 projection decision', () => {
  it('classifies PARTICLE but does NOT project over the live particle-of relation', () => {
    expect(classifyComplement('VP', 'PRT').complementType).toBe('PARTICLE');
    expect(projectComplementRelation('VP', 'PRT')).toBe(null);
    expect(projectComplementRelation('V', 'PRT')).toBe(null);
    // The authored mapping stays on its existing key — re-keying would
    // orphan FEATURE_COMPAT rows and could delete live fires.
    expect(projectRelation('VP', 'PRT', 'right')).toBe('particle-of');
    expect(projectRelation('PRT', 'VP', 'left')).toBe('particle-of');
  });

  it('projects only PROPOSITIONAL and INFINITIVAL in Phase 3A', () => {
    expect(projectComplementRelation('VP', 'SBAR')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectComplementRelation('V', 'SBAR')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectComplementRelation('S', 'SBAR')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectComplementRelation('SBAR', 'S')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectComplementRelation('VP', 'INF')).toBe('INFINITIVAL_COMPLEMENT');
    expect(projectComplementRelation('V', 'INF')).toBe('INFINITIVAL_COMPLEMENT');
  });
});

describe('projectRelation: new projections + full regression of existing mappings', () => {
  it('projects complement relations for the six census clause pairs', () => {
    expect(projectRelation('VP', 'SBAR', 'right')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectRelation('V', 'SBAR', 'right')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectRelation('S', 'SBAR', 'right')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectRelation('SBAR', 'S', 'right')).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(projectRelation('VP', 'INF', 'right')).toBe('INFINITIVAL_COMPLEMENT');
    expect(projectRelation('V', 'INF', 'right')).toBe('INFINITIVAL_COMPLEMENT');
  });

  it('leaves EVERY pre-3A mapping byte-identical', () => {
    const regression = [
      ['N', 'V', 'right', 'subject-like'],
      ['N', 'V', 'left', 'object-like'],
      ['V', 'N', 'left', 'subject-like'],
      ['V', 'N', 'right', 'object-like'],
      ['NP', 'V', 'right', 'subject-like'],
      ['V', 'NP', 'left', 'subject-like'],
      ['PRON', 'V', 'right', 'subject-like'],
      ['V', 'PRON', 'left', 'subject-like'],
      ['N', 'ADJ', 'right', 'modified-by'],
      ['ADJ', 'N', 'right', 'modifies'],
      ['DET', 'N', 'right', 'determines'],
      ['N', 'DET', 'right', 'determines'],
      ['TO', 'V', 'right', 'infinitival-mark'],
      ['V', 'TO', 'right', 'infinitival-mark'],
      ['P', 'N', 'right', 'adposition-of'],
      ['N', 'P', 'right', 'adposition-of'],
      ['AUX', 'V', 'right', 'auxiliates'],
      ['V', 'AUX', 'right', 'auxiliates'],
      ['COP', 'ADJ', 'right', 'copular'],
      ['COP', 'N', 'right', 'copular'],
      ['ADJ', 'COP', 'right', 'copular'],
      ['PRT', 'V', 'right', 'particle-of'],
      ['V', 'PRT', 'right', 'particle-of'],
      ['VP', 'PRT', 'right', 'particle-of'],
      ['ADV', 'V', 'right', 'adverbial'],
      ['ADV', 'ADJ', 'right', 'adverbial'],
      ['V', 'ADV', 'right', 'adverbial'],
      ['ADJ', 'ADV', 'right', 'adverbial'],
      ['N', 'N', 'right', 'compound'],
      ['PROPN', 'PROPN', 'right', 'compound'],
      ['ADV', 'VP', 'right', 'adverbial'],
    ];
    for (const [a, b, side, expected] of regression) {
      expect(projectRelation(a, b, side), `${a}+${b}:${side}`).toBe(expected);
    }
  });

  it('still abstains on pairs no rule covers', () => {
    expect(projectRelation('PP', 'S', 'right')).toBe(null);
    expect(projectRelation('FRONTED', 'S', 'right')).toBe(null);
    expect(projectRelation('INV', 'NP', 'right')).toBe(null);
    expect(projectRelation('NPCOMMA', 'NP', 'right')).toBe(null);
    expect(projectRelation('SBAR', 'VP', 'right')).toBe(null);
    expect(projectRelation('S', 'INF', 'right')).toBe(null);
  });
});

describe('ends(): governor features orient left, complement features right', () => {
  it('keeps the governor on the left slot for all complement orientations', () => {
    const govFeats = [{ kind: 'governor-marker', value: true }];
    const compFeats = [{ kind: 'complement-marker', value: true }];
    // VP + SBAR: governor left
    let o = ends('VP', 'SBAR', govFeats, compFeats);
    expect(o.left).toBe(govFeats);
    expect(o.right).toBe(compFeats);
    // S + SBAR: governor left
    o = ends('S', 'SBAR', govFeats, compFeats);
    expect(o.left).toBe(govFeats);
    // V + INF: governor left
    o = ends('V', 'INF', govFeats, compFeats);
    expect(o.left).toBe(govFeats);
    // SBAR + S: governor is the RIGHT child
    o = ends('SBAR', 'S', compFeats, govFeats);
    expect(o.left).toBe(govFeats);
    expect(o.right).toBe(compFeats);
    // INF + V (self is the complement): governor is the RIGHT child
    o = ends('INF', 'V', compFeats, govFeats);
    expect(o.left).toBe(govFeats);
    expect(o.right).toBe(compFeats);
  });
});

describe('composition naming describes the derivation without choosing it', () => {
  it('names VP + SBAR as propositional-complement with governor as surviving head', () => {
    const gov = leafMeaning(leaf('VP', 'say'));
    const comp = leafMeaning(leaf('SBAR', 'left'));
    const composed = composeMeanings(gov, comp, ['VP', 'SBAR', 'VP', 1]);
    expect(composed.rule).toBe('propositional-complement');
    const top = composed.readings[0];
    expect(top.roles.Governor).toBe('say');
    expect(top.roles.Complement).toBe('left');
    expect(top.roles.ComplementType).toBe('PROPOSITIONAL');
    expect(top.lemma).toBe('say');
    expect(top.type).toBe('VP');
  });

  it('names SBAR + S with the clause (right child) as governor', () => {
    const comp = leafMeaning(leaf('SBAR', 'left'));
    const gov = leafMeaning(leaf('S', 'surprised'));
    const composed = composeMeanings(comp, gov, ['SBAR', 'S', 'S', 1]);
    expect(composed.rule).toBe('propositional-complement');
    const top = composed.readings[0];
    expect(top.roles.Governor).toBe('surprised');
    expect(top.roles.Complement).toBe('left');
    expect(top.lemma).toBe('surprised');
  });

  it('names VP + INF and VP + PRT with the right complement types', () => {
    const inf = composeMeanings(
      leafMeaning(leaf('VP', 'want')),
      leafMeaning(leaf('INF', 'leave')),
      ['VP', 'INF', 'VP', 1],
    );
    expect(inf.rule).toBe('infinitival-complement');
    expect(inf.readings[0].roles.ComplementType).toBe('INFINITIVAL');
    expect(inf.readings[0].roles.Governor).toBe('want');
    expect(inf.readings[0].roles.Complement).toBe('leave');

    const prt = composeMeanings(
      leafMeaning(leaf('VP', 'gave')),
      leafMeaning(leaf('PRT', 'up')),
      ['VP', 'PRT', 'VP', 1],
    );
    expect(prt.rule).toBe('particle-complement');
    expect(prt.readings[0].roles.ComplementType).toBe('PARTICLE');
  });

  it('OBEYS the no-evidence law: complement composition scores exactly 0', () => {
    // Rich, real lexicon entries on both sides. Description, not preference.
    const pairs = [
      [leaf('VP', 'say'), leaf('SBAR', 'left'), ['VP', 'SBAR', 'VP', 1]],
      [leaf('V', 'think'), leaf('SBAR', 'ran'), ['V', 'SBAR', 'VP', 1]],
      [leaf('S', 'left'), leaf('SBAR', 'ran'), ['S', 'SBAR', 'S', 1]],
      [leaf('SBAR', 'ran'), leaf('S', 'left'), ['SBAR', 'S', 'S', 1]],
      [leaf('VP', 'want'), leaf('INF', 'run'), ['VP', 'INF', 'VP', 1]],
      [leaf('VP', 'gave'), leaf('PRT', 'up'), ['VP', 'PRT', 'VP', 1]],
    ];
    for (const [l, r, bond] of pairs) {
      const composed = composeMeanings(leafMeaning(l), leafMeaning(r), bond);
      for (const reading of composed.readings) {
        expect(reading.score, `${bond[0]}+${bond[1]}`).toBe(0);
      }
    }
  });

  it('unknown follows the governor, not the complement', () => {
    const darkGov = composeMeanings(
      leafMeaning(leaf('VP', 'qzxqzx')),
      leafMeaning(leaf('SBAR', 'left')),
      ['VP', 'SBAR', 'VP', 1],
    );
    expect(darkGov.readings[0].unknown).toBe(true);

    const darkComp = composeMeanings(
      leafMeaning(leaf('VP', 'say')),
      leafMeaning(leaf('SBAR', 'qzxqzx')),
      ['VP', 'SBAR', 'VP', 1],
    );
    expect(darkComp.readings[0].unknown).toBe(false);
    expect(darkComp.readings[0].roles.Governor).toBe('say');
  });

  it('keeps bondFamily on the complement family (no classification drift)', () => {
    expect(bondFamily(['VP', 'SBAR', 'VP', 1])).toBe('complement');
    expect(bondFamily(['S', 'SBAR', 'S', 1])).toBe('complement');
    expect(bondFamily(['SBAR', 'S', 'S', 1])).toBe('complement');
    expect(bondFamily(['VP', 'INF', 'VP', 1])).toBe('complement');
    expect(bondFamily(['VP', 'PRT', 'VP', 1])).toBe('complement');
  });
});

describe('rolesComplete for complement rules', () => {
  it('is complete iff Governor and Complement are both bound', () => {
    const rules = ['propositional-complement', 'infinitival-complement', 'particle-complement'];
    for (const rule of rules) {
      expect(rolesComplete(rule, { Governor: 'say', Complement: 'left' })).toBe(true);
      expect(rolesComplete(rule, { Governor: 'say' })).toBe(false);
      expect(rolesComplete(rule, { Complement: 'left' })).toBe(false);
      expect(rolesComplete(rule, {})).toBe(false);
    }
  });
});

describe('Phase 3A cannot create fires (no COMPAT rows authored)', () => {
  it('projects relations but diagnoseT1Edge never reaches could-fire on them', () => {
    const pairs = [
      { lemma: 'say', type: 'VP', nb: { lemma: 'left', type: 'SBAR', side: 'right' } },
      { lemma: 'think', type: 'V', nb: { lemma: 'ran', type: 'SBAR', side: 'right' } },
      { lemma: 'left', type: 'S', nb: { lemma: 'ran', type: 'SBAR', side: 'right' } },
      { lemma: 'ran', type: 'SBAR', nb: { lemma: 'left', type: 'S', side: 'right' } },
      { lemma: 'want', type: 'VP', nb: { lemma: 'run', type: 'INF', side: 'right' } },
      { lemma: 'want', type: 'V', nb: { lemma: 'leave', type: 'INF', side: 'right' } },
    ];
    for (const p of pairs) {
      const edge = diagnoseT1Edge({ lemma: p.lemma, type: p.type }, p.nb, provider);
      expect(edge.relation, `${p.type}+${p.nb.type}`).not.toBe(null);
      expect(edge.status, `${p.type}+${p.nb.type}`).not.toBe('could-fire');
      expect(edge.score).toBe(null);
    }
  });

  it('is deterministic: identical inputs give identical classifications', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(classifyComplement('VP', 'SBAR'))
        .toEqual(classifyComplement('VP', 'SBAR'));
      expect(projectRelation('S', 'SBAR', 'right'))
        .toBe(projectRelation('S', 'SBAR', 'right'));
    }
  });
});
