/**
 * PARSER FAILURE ATLAS — research ledger
 *
 * Production change that would make these fail: putting a clean parse
 * into the atlas; calling ROOT_TYPE_MISMATCH a missing construction;
 * ranking TEST while designing plates; or writing a proposed bond onto
 * a frozen packet.
 */
import { describe, expect, it } from 'vitest';

import { OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';
import {
  ATLAS_CONTRACT,
  PLATES,
  plateOf,
  isAtlasCase,
} from '../../../codex/research/parser-failure-atlas/atlas-schema.js';
import { scoreRecord, selectAtlasCases } from '../../../codex/research/parser-failure-atlas/collect-failures.js';
import { freezeFailure } from '../../../codex/research/parser-failure-atlas/freeze-case.js';
import { plateAtlas, refuseTest } from '../../../codex/research/parser-failure-atlas/plate.js';
import { rankConstructionHoles, rankLeftoverTypes } from '../../../codex/research/parser-failure-atlas/rank-constructions.js';
import { buildAtlas } from '../../../codex/research/parser-failure-atlas/build-atlas.js';
import {
  INTERIOR_WATCHLIST,
  isClauseRootLabel,
  replicateInteriors,
} from '../../../codex/research/parser-failure-atlas/replicate-interiors.js';
import {
  PUNCT_FAMILIES,
  classifyPunctConstruction,
  clusterPunctuation,
} from '../../../codex/research/parser-failure-atlas/cluster-punctuation.js';

const molecule = (type, from, to) => ({ type, from, to, parts: [] });

const DOG = {
  sentId: 'ewt-dog-1',
  text: 'the dog barked',
  tokens: [
    { id: 1, form: 'the', lemma: 'the', upos: 'DET', head: 2, deprel: 'det' },
    { id: 2, form: 'dog', lemma: 'dog', upos: 'NOUN', head: 3, deprel: 'nsubj' },
    { id: 3, form: 'barked', lemma: 'bark', upos: 'VERB', head: 0, deprel: 'root' },
  ],
};

function scored({
  outcome = OUTCOME.GRAMMAR,
  overGenerated = false,
  categories = [{ deprel: 'root', label: 'root (VERB -> ROOT)', from: 0, to: 2 }],
  contained = false,
  decided = false,
  spanning = [],
  stable = [],
  molecules = [],
} = {}) {
  return {
    record: DOG,
    split: 'dev',
    gold: { subject: 'dog', verb: 'barked', rootUpos: 'VERB' },
    diagnosis: {
      outcome,
      overGenerated,
      categories,
      nonProjective: 0,
    },
    contained,
    decided,
    chart: {
      spanning,
      stable,
      molecules,
    },
  };
}

describe('plates', () => {
  it('exports the atlas contract and does not treat a clean parse as a case', () => {
    expect(ATLAS_CONTRACT).toBe('PB-PARSER-FAILURE-ATLAS-v1');
    expect(PLATES).toEqual([
      'LEXICAL',
      'GRAMMAR',
      'ROOT_TYPE_MISMATCH',
      'CONTAINMENT_MISS',
      'OVERGENERATED',
    ]);
    const clean = scored({
      outcome: OUTCOME.PARSED,
      contained: true,
      decided: true,
      spanning: [molecule('S', 0, 2)],
      stable: [molecule('S', 0, 2)],
    });
    expect(isAtlasCase(clean)).toBe(false);
    expect(plateOf(clean)).toBeNull();
  });

  it('keeps lexical, grammar, and root-type plates distinct', () => {
    expect(plateOf(scored({ outcome: OUTCOME.LEXICAL }))).toBe('LEXICAL');
    expect(plateOf(scored({ outcome: OUTCOME.GRAMMAR }))).toBe('GRAMMAR');
    expect(plateOf(scored({
      outcome: OUTCOME.ROOT_TYPE_MISMATCH,
      spanning: [molecule('NP', 0, 2)],
    }))).toBe('ROOT_TYPE_MISMATCH');
  });

  it('names a spanning S whose gold answer is absent a containment miss, not coverage', () => {
    const miss = scored({
      outcome: OUTCOME.PARSED,
      contained: false,
      spanning: [molecule('S', 0, 2)],
      stable: [molecule('S', 0, 2)],
    });
    expect(plateOf(miss)).toBe('CONTAINMENT_MISS');
    expect(isAtlasCase(miss)).toBe(true);
  });

  it('names a parse gold POS forbids OVERGENERATED, not a clean win', () => {
    const og = scored({
      outcome: OUTCOME.PARSED,
      overGenerated: true,
      contained: true,
      spanning: [molecule('S', 0, 2)],
      stable: [molecule('S', 0, 2)],
    });
    expect(plateOf(og)).toBe('OVERGENERATED');
  });
});

describe('collect and freeze', () => {
  it('drops successes and keeps every failure plate', () => {
    const rows = [
      scored({ outcome: OUTCOME.PARSED, contained: true, decided: true }),
      scored({ outcome: OUTCOME.GRAMMAR }),
      scored({ outcome: OUTCOME.LEXICAL }),
      scored({
        outcome: OUTCOME.PARSED,
        contained: false,
        spanning: [molecule('S', 0, 2)],
        stable: [molecule('S', 0, 2)],
      }),
    ];
    const kept = selectAtlasCases(rows);
    expect(kept).toHaveLength(3);
    expect(kept.map((r) => plateOf(r)).sort()).toEqual([
      'CONTAINMENT_MISS',
      'GRAMMAR',
      'LEXICAL',
    ]);
  });

  it('freezes location, gold, and leftover types without proposing a bond', () => {
    const frozen = freezeFailure(scored({
      outcome: OUTCOME.ROOT_TYPE_MISMATCH,
      categories: [],
      spanning: [molecule('NP', 0, 2), molecule('PUNCT', 2, 2)],
      molecules: [molecule('NP', 0, 2), molecule('N', 1, 1)],
    }));
    expect(frozen.caseId).toMatch(/^pfa-[0-9a-f]{16}$/);
    expect(frozen.plate).toBe('ROOT_TYPE_MISMATCH');
    expect(frozen.sentId).toBe('ewt-dog-1');
    expect(frozen.gold.verb).toBe('barked');
    expect(frozen.chart.leftoverTypes).toEqual(expect.arrayContaining(['NP']));
    expect(frozen.diagnosis.outcome).toBe(OUTCOME.ROOT_TYPE_MISMATCH);
    expect(frozen).not.toHaveProperty('proposedBond');
    expect(frozen).not.toHaveProperty('admitRoot');
    expect(frozen.versions.packetContract).toBe(ATLAS_CONTRACT);
  });

  it('scores a live compose fixture and does not call a spanning S a grammar hole', () => {
    const posMap = new Map([
      ['dog', ['n']],
      ['barked', ['v']],
    ]);
    const row = scoreRecord(DOG, posMap, { split: 'dev' });
    expect(row.gold.verb).toBe('barked');
    expect(row.gold.subject).toBe('dog');
    if (row.diagnosis.outcome === OUTCOME.PARSED) {
      expect(plateOf(row)).not.toBe('GRAMMAR');
    }
  });
});

describe('ranking and sealed test', () => {
  function grammarCase(label, deprel, split = 'dev', text = 'the dog barked') {
    return freezeFailure({
      ...scored({
        outcome: OUTCOME.GRAMMAR,
        categories: [{ deprel, label, from: 0, to: 2 }],
      }),
      record: { ...DOG, text, sentId: `${text}:${label}` },
      split,
    });
  }

  it('ranks a sole-cause construction above a mixed frontier and will not promise the mix', () => {
    const sole = [
      grammarCase('nsubj (NOUN -> VERB)', 'nsubj', 'dev', 'a'),
      grammarCase('nsubj (NOUN -> VERB)', 'nsubj', 'dev', 'b'),
      grammarCase('nsubj (NOUN -> VERB)', 'nsubj', 'train', 'c'),
    ];
    const mixed = freezeFailure({
      ...scored({
        outcome: OUTCOME.GRAMMAR,
        categories: [
          { deprel: 'nsubj', label: 'nsubj (NOUN -> VERB)', from: 0, to: 1 },
          { deprel: 'advcl', label: 'advcl (VERB -> VERB)', from: 2, to: 4 },
        ],
      }),
      record: { ...DOG, text: 'mixed', sentId: 'mixed' },
      split: 'dev',
    });
    const ranked = rankConstructionHoles([...sole, mixed]);
    expect(ranked[0].label).toBe('nsubj (NOUN -> VERB)');
    expect(ranked[0].failures).toBe(4);
    expect(ranked[0].soleCause).toBe(3);
    expect(ranked[0].promisedUnblock).toBe(3);
    const advcl = ranked.find((r) => r.deprel === 'advcl');
    expect(advcl.promisedUnblock).toBe(0);
  });

  it('refuses to rank TEST and will not treat leftover types as construction holes', () => {
    const testCase = grammarCase('nsubj (NOUN -> VERB)', 'nsubj', 'test', 'held-out');
    expect(refuseTest(testCase)).toMatchObject({ ok: false, reason: 'test' });
    expect(() => rankConstructionHoles([testCase])).toThrow(/test/i);

    const leftover = freezeFailure(scored({
      outcome: OUTCOME.ROOT_TYPE_MISMATCH,
      categories: [],
      spanning: [molecule('NP', 0, 2)],
    }));
    const leftovers = rankLeftoverTypes([leftover]);
    expect(leftovers[0].type).toBe('NP');
    expect(leftovers[0]).not.toHaveProperty('promisedUnblock');
  });

  it('builds an atlas that reports plates without admitting a root', () => {
    const cases = [
      freezeFailure(scored({ outcome: OUTCOME.GRAMMAR })),
      freezeFailure(scored({
        outcome: OUTCOME.ROOT_TYPE_MISMATCH,
        categories: [],
        spanning: [molecule('NP', 0, 2)],
      })),
    ].map((c) => ({ ...c, split: 'dev' }));
    const atlas = buildAtlas(cases);
    expect(atlas.contract).toBe(ATLAS_CONTRACT);
    expect(atlas.plates.GRAMMAR).toBe(1);
    expect(atlas.plates.ROOT_TYPE_MISMATCH).toBe(1);
    expect(atlas.constructions[0].label).toBe('root (VERB -> ROOT)');
    expect(atlas).not.toHaveProperty('admitRoot');
    expect(atlas.testOpened).toBe(false);
  });

  it('groups cases onto plates a reader can open', () => {
    const cases = [
      freezeFailure(scored({ outcome: OUTCOME.GRAMMAR })),
      freezeFailure(scored({ outcome: OUTCOME.LEXICAL, categories: [] })),
    ].map((c, i) => ({ ...c, split: 'dev', caseId: `pfa-${i}` }));
    const plated = plateAtlas(cases);
    expect(plated.GRAMMAR).toHaveLength(1);
    expect(plated.LEXICAL).toHaveLength(1);
    expect(plated.CONTAINMENT_MISS).toHaveLength(0);
  });
});

describe('interior replication', () => {
  it('does not treat root (* -> ROOT) as an interior construction hole', () => {
    expect(isClauseRootLabel('root (VERB -> ROOT)')).toBe(true);
    expect(isClauseRootLabel('root (NOUN -> ROOT)')).toBe(true);
    expect(isClauseRootLabel('punct (PUNCT -> NOUN)')).toBe(false);
    expect(INTERIOR_WATCHLIST).toEqual([
      'punct (PUNCT -> NOUN)',
      'punct (PUNCT -> PROPN)',
      'list (NUM -> NUM)',
      'nmod (NOUN -> NOUN)',
      'advmod (PART -> VERB)',
    ]);
  });

  it('reports whether watchlist interiors recur with similar promisedUnblock share', () => {
    const dev = [
      { label: 'root (VERB -> ROOT)', promisedUnblock: 67, failures: 71 },
      { label: 'punct (PUNCT -> NOUN)', promisedUnblock: 38, failures: 82 },
      { label: 'punct (PUNCT -> PROPN)', promisedUnblock: 30, failures: 45 },
      { label: 'list (NUM -> NUM)', promisedUnblock: 21, failures: 23 },
      { label: 'nmod (NOUN -> NOUN)', promisedUnblock: 19, failures: 30 },
      { label: 'advmod (PART -> VERB)', promisedUnblock: 17, failures: 54 },
    ];
    const train = [
      { label: 'root (VERB -> ROOT)', promisedUnblock: 400, failures: 420 },
      { label: 'punct (PUNCT -> NOUN)', promisedUnblock: 220, failures: 400 },
      { label: 'list (NUM -> NUM)', promisedUnblock: 140, failures: 150 },
      { label: 'punct (PUNCT -> PROPN)', promisedUnblock: 130, failures: 200 },
      { label: 'nmod (NOUN -> NOUN)', promisedUnblock: 110, failures: 180 },
      { label: 'advmod (PART -> VERB)', promisedUnblock: 90, failures: 240 },
    ];
    const rep = replicateInteriors({ dev, train });
    expect(rep.watchlist.every((w) => w.recurred)).toBe(true);
    expect(rep.watchlist.find((w) => w.label === 'punct (PUNCT -> NOUN)').dev.rank).toBe(1);
    expect(rep.watchlist.find((w) => w.label === 'punct (PUNCT -> NOUN)').train.rank).toBe(1);
    expect(rep.testOpened).toBe(false);
  });
});

describe('punctuation construction split', () => {
  function punctCase(tokens, from, extras = {}) {
    return {
      caseId: extras.caseId || tokens.join('-'),
      split: extras.split || 'dev',
      plate: 'GRAMMAR',
      text: tokens.join(' '),
      tokens,
      gold: { rootUpos: extras.rootUpos || 'NOUN', verb: extras.verb || tokens[0] },
      diagnosis: {
        outcome: 'GRAMMAR',
        categories: [{
          deprel: 'punct',
          label: extras.label || 'punct (PUNCT -> NOUN)',
          from,
          to: from,
        }],
      },
    };
  }

  it('splits punct into distinct constructions instead of one absorption bag', () => {
    expect(PUNCT_FAMILIES).toEqual([
      'QUOTE_FINAL',
      'APPOSITION',
      'FRAGMENT',
      'PARENTHETICAL',
      'LIST_PUNCT',
      'SENTENCE_FINAL',
      'HYPHEN_COMPOUND',
      'OTHER',
    ]);
    expect(classifyPunctConstruction(punctCase(['Al', '-', 'Jazeera', 'reported'], 1))).toBe('HYPHEN_COMPOUND');
    expect(classifyPunctConstruction(punctCase(['Fucking', 'bitches', '!', '"'], 3))).toBe('QUOTE_FINAL');
    expect(classifyPunctConstruction(punctCase(['John', ',', 'the', 'butcher', ',', 'left'], 1))).toBe('APPOSITION');
    expect(classifyPunctConstruction(punctCase(['A', 'lawsuit', '.'], 2, { rootUpos: 'NOUN' }))).toBe('FRAGMENT');
    expect(classifyPunctConstruction(punctCase(['Senate', 'term', '--', 'particularly'], 2))).toBe('PARENTHETICAL');
    expect(classifyPunctConstruction(punctCase(['-', 'UnleadedStocks.pdf'], 0))).toBe('LIST_PUNCT');
    expect(classifyPunctConstruction(punctCase(['apples', ',', 'pears', 'and', 'figs'], 1))).toBe('LIST_PUNCT');
    expect(classifyPunctConstruction(punctCase([
      'This', 'is', 'one', 'thought-provoking', 'film', '.',
    ], 5, { rootUpos: 'NOUN' }))).toBe('SENTENCE_FINAL');
  });

  it('promises unblock only inside a punct family, never across the bag', () => {
    const clustered = clusterPunctuation([
      punctCase(['Fucking', 'bitches', '!', '"'], 3, { caseId: 'q' }),
      punctCase(['A', 'lawsuit', '.'], 2, { caseId: 'f', rootUpos: 'NOUN' }),
      punctCase(['apples', ',', 'pears', 'and', 'figs'], 1, { caseId: 'l' }),
    ]);
    expect(clustered.QUOTE_FINAL.promisedUnblock).toBe(1);
    expect(clustered.FRAGMENT.promisedUnblock).toBe(1);
    expect(clustered.LIST_PUNCT.promisedUnblock).toBe(1);
    expect(clustered.bagPromisedUnblock).toBeUndefined();
    expect(() => clusterPunctuation([{ ...punctCase(['x', '.'], 1), split: 'test' }])).toThrow(/test/i);
  });
});
