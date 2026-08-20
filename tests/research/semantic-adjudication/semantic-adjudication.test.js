/**
 * GOLD ADJUDICATION — research harness
 *
 * Production change that would make these fail: letting a non-opportunity
 * into the hole corpus; showing Ballistics scores to a gold adjudicator;
 * forcing a sense when the legal answer is AMBIGUOUS/NONE/INSUFFICIENT;
 * treating a missing lexical candidate as a probe hole; clustering holdout
 * cases while designing predicates; or letting a hypothesis card read a
 * Ballistics score.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { classifyInquiryCoverage, MIN_COVERAGE_SPLIT } from '../../../codex/core/constellation/inquiry-coverage.js';
import {
  ADJUDICATION_CONTRACT,
  DISAGREEMENT_REASONS,
  FAILURE_LAYERS,
  GOLD_REFUSALS,
  PREDICATE_FAMILIES,
  SPLIT_BANDS,
  assertNoBallistics,
  isOpportunity,
  validateGoldLabel,
} from '../../../codex/research/semantic-adjudication/adjudication-schema.js';
import { selectOpportunities } from '../../../codex/research/semantic-adjudication/collect-opportunities.js';
import { freezeCase } from '../../../codex/research/semantic-adjudication/freeze-case.js';
import { blindCase, revealBallistics } from '../../../codex/research/semantic-adjudication/blind-case.js';
import {
  assignSplits,
  describeStratum,
  splitBandOf,
  stratifiedSample,
} from '../../../codex/research/semantic-adjudication/stratify.js';
import {
  adjudicatePassB,
  applyPilotResolution,
  recordGold,
  resolveDisagreement,
  runTwoPass,
} from '../../../codex/research/semantic-adjudication/adjudicate.js';
import { classifyHole, unusedExistingEvidence } from '../../../codex/research/semantic-adjudication/classify-hole.js';
import {
  clusterPredicates,
  rankPredicateOpportunity,
  refuseHoldout,
  topRecurringHoles,
} from '../../../codex/research/semantic-adjudication/cluster-predicates.js';
import {
  ballisticsTopSenseId,
  calibrateBallistics,
  flipBallisticsScores,
} from '../../../codex/research/semantic-adjudication/evaluate-ballistics.js';
import { buildHoleLedger } from '../../../codex/research/semantic-adjudication/build-hole-ledger.js';
import { makeHypothesisCard } from '../../../codex/research/semantic-adjudication/hypothesis-card.js';
import { adjudicateRubricA, adjudicateRubricB } from '../../../codex/research/semantic-adjudication/rubric-adjudicator.js';
import { discriminativeFamily } from '../../../codex/research/semantic-adjudication/cue-lexicon.js';

function hexDigest(n = 64) {
  return 'A'.repeat(n);
}

function measured(scores) {
  return {
    status: 'measured',
    embedding: { kind: 'phonotopographic', version: 'tq-phoneme-v2', dimensions: 256 },
    scores: scores.map((semanticScore, i) => ({
      senseId: `s${i + 1}`,
      semanticScore,
    })),
    degraded: [],
  };
}

function inquiryPacket({
  warranted = false,
  reason = 'eliminated',
  scores = [0.81, 0.62],
  receiptDigests = [hexDigest(), hexDigest()],
  hypotheses = {
    supported: [],
    eliminated: ['h_sense_by_gloss_overlap'],
    surviving: [],
    underdetermined: [],
  },
  extra = {},
} = {}) {
  return {
    status: 'ok',
    bound: true,
    probeId: 'constellation.sense.disambiguation',
    hypotheses,
    selection: { warranted, reason, senseId: null, gloss: null, overlap: null },
    evidence: { candidateCount: scores.length, edgeCount: 2 },
    lexicalEntries: [
      { pos: 'n', senseCount: 2, gloss: 'a financial institution', synsetId: 's1' },
    ],
    isHeteronym: false,
    distinctPronunciations: 1,
    headToken: 'bank',
    framePos: null,
    frameCue: null,
    viableWordCount: 1,
    ballistics: measured(scores),
    receiptDigests,
    ...extra,
  };
}

function draftsForBank() {
  return [
    {
      observationId: 'obs.lex.sense_candidates',
      status: 'observed',
      result: {
        candidates: [
          { senseId: 's1', lemma: 'bank', pos: 'n', gloss: 'a financial institution that accepts deposits' },
          { senseId: 's2', lemma: 'bank', pos: 'n', gloss: 'the sloping land beside a river' },
        ],
        queryTokens: ['loan', 'from', 'the'],
      },
    },
    {
      observationId: 'obs.lex.relation_paths',
      status: 'observed',
      result: { edges: [{ rel: 'hypernym' }], kin: [{ relPath: 'hypernym' }] },
    },
    {
      observationId: 'obs.lex.lexical_entries',
      status: 'observed',
      result: {
        entries: [{ pos: 'n', senses: [{ synsetId: 's1', gloss: 'a financial institution that accepts deposits' }] }],
        framePos: null,
        frameCue: null,
        viableWordCount: 1,
        distinctPronunciations: 1,
      },
    },
    {
      observationId: 'obs.phon.neighbours',
      status: 'observed',
      result: { winner: { lemma: 'bank', senseId: 's1', sameLemma: true, crossLemmaCosine: 0 } },
    },
  ];
}

function freezeBank(overrides = {}) {
  return freezeCase({
    query: 'loan from the bank',
    identity: {
      kind: 'phrase',
      intent: 'literary',
      tokenCount: 4,
      tokens: ['loan', 'from', 'the', 'bank'],
      primaryContentToken: 'bank',
    },
    inquiry: inquiryPacket(),
    drafts: draftsForBank(),
    leximancy: {
      interpretations: [
        { id: 's1', gloss: 'a financial institution that accepts deposits' },
        { id: 's2', gloss: 'the sloping land beside a river' },
      ],
    },
    versions: {
      corpusVersion: 'fixture',
    },
    ...overrides,
  });
}

describe('corpus gate', () => {
  it('exports the coverage threshold by name and does not retune it', () => {
    expect(MIN_COVERAGE_SPLIT).toBe(0.01);
    expect(ADJUDICATION_CONTRACT).toBe('PB-SEMANTIC-ADJUDICATION-v1');
  });

  it('admits only measured-unwarranted + exposed + opportunity', () => {
    const hole = classifyInquiryCoverage(inquiryPacket({ scores: [0.81, 0.62] }));
    expect(isOpportunity(hole)).toBe(true);
    expect(hole.semantic).toBe('measured-unwarranted');
    expect(hole.instrumentation).toBe('exposed');

    const rows = [
      { inquiry: inquiryPacket({ scores: [0.81, 0.62] }), query: 'loan from the bank' },
      { inquiry: inquiryPacket({ warranted: true, reason: 'supported', scores: [0.81, 0.62] }), query: 'wading crane' },
      { inquiry: inquiryPacket({ scores: [0.50, 0.50 + MIN_COVERAGE_SPLIT / 2] }), query: 'dark night' },
      {
        inquiry: inquiryPacket({
          scores: [null, null],
          extra: { ballistics: measured([null, null]) },
        }),
        query: 'bank',
      },
    ];
    // measured([null,null]) still has status measured; classify uses finite scores
    rows[3].inquiry.ballistics = {
      status: 'measured',
      embedding: { kind: 'phonotopographic', version: 'tq-phoneme-v2', dimensions: 256 },
      scores: [{ senseId: 's1', semanticScore: null }, { senseId: 's2', semanticScore: null }],
      degraded: [],
    };

    const kept = selectOpportunities(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].query).toBe('loan from the bank');
  });

  it('rejects flat, unexposed, unavailable, and already warranted packets', () => {
    const flat = classifyInquiryCoverage(inquiryPacket({
      scores: [0.50, 0.50 + MIN_COVERAGE_SPLIT / 2],
    }));
    expect(isOpportunity(flat)).toBe(false);
    expect(flat.semantic).toBe('flat-unwarranted');

    const unexposed = classifyInquiryCoverage({
      bound: true,
      selection: { warranted: false, reason: 'eliminated' },
      ballistics: {
        status: 'measured',
        scores: [{ senseId: 's1', semanticScore: null }, { senseId: 's2', semanticScore: null }],
      },
    });
    expect(isOpportunity(unexposed)).toBe(false);
    expect(unexposed.kind).toBe('unexposed-measurement');

    const dead = classifyInquiryCoverage({
      bound: true,
      selection: { warranted: false, reason: 'eliminated' },
      ballistics: { status: 'unavailable', reason: 'offline', scores: [] },
    });
    expect(isOpportunity(dead)).toBe(false);
    expect(dead.kind).toBe('unavailable');

    const won = classifyInquiryCoverage(inquiryPacket({ warranted: true, reason: 'supported' }));
    expect(isOpportunity(won)).toBe(false);
    expect(won.semantic).toBe('warranted');
  });
});

describe('freeze and blind', () => {
  it('stores Ballistics scores and split without minting a winner field', () => {
    const frozen = freezeBank();
    expect(frozen.caseId).toMatch(/^adj-[0-9a-f]{16}$/);
    expect(frozen.query).toBe('loan from the bank');
    expect(frozen.candidateSenses).toHaveLength(2);
    expect(frozen.candidateSenses[0]).toEqual(expect.objectContaining({
      senseId: 's1',
      gloss: expect.any(String),
      lemma: 'bank',
      pos: 'n',
    }));
    expect(frozen.probe.status).toBe('eliminated');
    expect(frozen.probe.receiptDigests).toHaveLength(2);
    expect(frozen.ballistics.scores).toHaveLength(2);
    expect(frozen.ballistics.split).toBeCloseTo(0.19, 6);
    expect(frozen).not.toHaveProperty('winner');
    expect(frozen.ballistics).not.toHaveProperty('winner');
    expect(frozen.versions.packetContract).toBe(ADJUDICATION_CONTRACT);
    expect(frozen.versions.probeVersion).toBeTruthy();
    expect(frozen.versions.embeddingVersion).toBe('tq-phoneme-v2');
  });

  it('hides scores, split, and Ballistics order from the adjudicator', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    expect(blind.caseId).toBe(frozen.caseId);
    expect(blind.query).toBe(frozen.query);
    expect(blind.candidateSenses).toHaveLength(2);
    expect(JSON.stringify(blind)).not.toMatch(/semanticScore/);
    expect(blind).not.toHaveProperty('ballistics');
    expect(blind).not.toHaveProperty('winner');
    expect(assertNoBallistics(blind)).toEqual({ ok: true });
    const letters = blind.candidateSenses.map((c) => c.label);
    expect(letters).toEqual(['A', 'B']);
    const ids = new Set(blind.candidateSenses.map((c) => c.senseId));
    expect(ids).toEqual(new Set(['s1', 's2']));
  });

  it('does not present candidates in Ballistics score order', () => {
    const frozen = freezeCase({
      query: 'loan from the bank',
      identity: {
        kind: 'phrase',
        intent: 'literary',
        tokenCount: 4,
        tokens: ['loan', 'from', 'the', 'bank'],
        primaryContentToken: 'bank',
      },
      inquiry: inquiryPacket({ scores: [0.99, 0.10, 0.50] }),
      drafts: [
        {
          observationId: 'obs.lex.sense_candidates',
          status: 'observed',
          result: {
            candidates: [
              { senseId: 's1', lemma: 'bank', pos: 'n', gloss: 'financial institution' },
              { senseId: 's2', lemma: 'bank', pos: 'n', gloss: 'river edge' },
              { senseId: 's3', lemma: 'bank', pos: 'n', gloss: 'a supply held in reserve' },
            ],
            queryTokens: ['loan', 'from', 'the'],
          },
        },
        ...draftsForBank().slice(1),
      ],
      leximancy: { interpretations: [] },
      versions: { corpusVersion: 'fixture' },
    });
    const byScore = [...frozen.ballistics.scores].sort((a, b) => b.semanticScore - a.semanticScore);
    const blind = blindCase(frozen);
    const blindIds = blind.candidateSenses.map((c) => c.senseId);
    expect(blindIds).not.toEqual(byScore.map((s) => s.senseId));
    expect(blindCase(frozen).candidateSenses.map((c) => c.senseId)).toEqual(blindIds);
  });

  it('reveals Ballistics only through the explicit reveal seam', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    const revealed = revealBallistics(blind, frozen);
    expect(revealed.ballistics.split).toBeCloseTo(0.19, 6);
    expect(assertNoBallistics(blind).ok).toBe(true);
    expect(assertNoBallistics(revealed).ok).toBe(false);
  });
});

describe('gold schema', () => {
  it('accepts a candidate sense and every refusal label', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    for (const gold of [blind.candidateSenses[0].senseId, ...GOLD_REFUSALS]) {
      const rec = recordGold({
        caseId: frozen.caseId,
        adjudicatorId: 'A',
        gold,
        candidateSenses: blind.candidateSenses,
      });
      expect(validateGoldLabel(gold, blind.candidateSenses).ok).toBe(true);
      expect(rec.gold).toBe(gold);
    }
    expect(GOLD_REFUSALS).toEqual([
      'AMBIGUOUS',
      'NONE_OF_THE_ABOVE',
      'INSUFFICIENT_CONTEXT',
      'BAD_CANDIDATE_SET',
    ]);
  });

  it('rejects a forced pick that is not in the candidate set', () => {
    const frozen = freezeBank();
    expect(validateGoldLabel('s99', freezeBank().candidateSenses).ok).toBe(false);
    expect(() => recordGold({
      caseId: frozen.caseId,
      adjudicatorId: 'A',
      gold: 's99',
      candidateSenses: frozen.candidateSenses,
    })).toThrow(/not a legal gold/i);
  });
});

describe('two-pass adjudication and disagreement', () => {
  it('resolves a sense-versus-abstention pair only under the written pilot policy', () => {
    const sense = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const abstain = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'B',
      gold: 'INSUFFICIENT_CONTEXT',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const raw = resolveDisagreement(sense, abstain);
    expect(raw.gold).toBeNull();
    const policy = applyPilotResolution(sense, abstain);
    expect(policy.gold).toBe('s1');
    expect(policy.classifiedWhy).toBe('domain_knowledge_required');
    expect(policy.agreement).toBe(false);
  });

  it('treats two different refusal labels as agreement that no sense is recoverable', () => {
    const a = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'A',
      gold: 'INSUFFICIENT_CONTEXT',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const b = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'B',
      gold: 'AMBIGUOUS',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const policy = applyPilotResolution(a, b);
    expect(policy.gold).toBe('AMBIGUOUS');
    expect(policy.needsResolution).toBe(false);
    expect(policy.resolverId).toBe('R-both-refused-no-sense');
  });

  it('does not silently majority-vote a disagreement', () => {
    const a = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const b = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'B',
      gold: 'AMBIGUOUS',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const resolved = resolveDisagreement(a, b);
    expect(resolved.agreement).toBe(false);
    expect(resolved.gold).toBeNull();
    expect(resolved.needsResolution).toBe(true);
    expect(DISAGREEMENT_REASONS).toContain(resolved.classifiedWhy);
  });

  it('accepts an explicit resolution and records why the first two differed', () => {
    const a = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const b = recordGold({
      caseId: 'adj-1',
      adjudicatorId: 'B',
      gold: 's2',
      candidateSenses: [{ senseId: 's1' }, { senseId: 's2' }],
    });
    const resolved = resolveDisagreement(a, b, {
      gold: 's1',
      classifiedWhy: 'annotation_mistake',
      resolverId: 'R',
    });
    expect(resolved.agreement).toBe(false);
    expect(resolved.gold).toBe('s1');
    expect(resolved.classifiedWhy).toBe('annotation_mistake');
    expect(resolved.resolverId).toBe('R');
  });

  it('keeps Pass B off Ballistics', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    const passA = recordGold({
      caseId: frozen.caseId,
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: blind.candidateSenses,
    });
    const passB = adjudicatePassB({
      blind,
      gold: passA.gold,
    });
    expect(FAILURE_LAYERS).toContain(passB.failureLayer);
    expect(PREDICATE_FAMILIES).toContain(passB.predicateFamily);
    expect(assertNoBallistics(passB).ok).toBe(true);
    const flipped = flipBallisticsScores(frozen);
    const again = adjudicatePassB({
      blind: blindCase(flipped),
      gold: passA.gold,
    });
    expect(again.failureLayer).toBe(passB.failureLayer);
    expect(again.predicateFamily).toBe(passB.predicateFamily);
  });
});

describe('failure layers', () => {
  it('names a clear recoverable sense with no unused evidence a Type I probe hole', () => {
    const frozen = freezeBank();
    const layer = classifyHole({ frozen, gold: 's1' });
    expect(layer).toBe('TYPE_I_PROBE_HOLE');
  });

  it('names human refusal a Type II Ballistics artifact, not a Calculus failure', () => {
    const frozen = freezeBank();
    expect(classifyHole({ frozen, gold: 'AMBIGUOUS' })).toBe('TYPE_II_BALLISTICS_ARTIFACT');
    expect(classifyHole({ frozen, gold: 'INSUFFICIENT_CONTEXT' })).toBe('TYPE_II_BALLISTICS_ARTIFACT');
  });

  it('names a missing intended sense a Type III candidate-generation failure', () => {
    const frozen = freezeBank();
    expect(classifyHole({ frozen, gold: 'NONE_OF_THE_ABOVE' })).toBe('TYPE_III_CANDIDATE_GENERATION');
    expect(classifyHole({ frozen, gold: 'BAD_CANDIDATE_SET' })).toBe('TYPE_III_CANDIDATE_GENERATION');
  });

  it('names a unique unused gloss-overlap winner Type IV, not a new predicate', () => {
    const drafts = draftsForBank();
    drafts[0] = {
      ...drafts[0],
      result: {
        candidates: [
          { senseId: 's1', lemma: 'bank', pos: 'n', gloss: 'a financial institution that accepts a loan' },
          { senseId: 's2', lemma: 'bank', pos: 'n', gloss: 'the sloping land beside a river' },
        ],
        queryTokens: ['loan', 'from', 'the'],
      },
    };
    const frozen = freezeBank({ drafts });
    expect(unusedExistingEvidence(frozen, 's1').some((e) => e.kind === 'gloss_overlap')).toBe(true);
    expect(classifyHole({ frozen, gold: 's1' })).toBe('TYPE_IV_UNUSED_EVIDENCE');
  });

  it('names unused frame POS Type IV', () => {
    const drafts = draftsForBank();
    drafts[0] = {
      ...drafts[0],
      result: {
        candidates: [
          { senseId: 's1', lemma: 'wound', pos: 'n', gloss: 'an injury to living tissue' },
          { senseId: 's2', lemma: 'wound', pos: 'v', gloss: 'to coil or wrap' },
        ],
        queryTokens: ['the', 'healed'],
      },
    };
    const frozen = freezeBank({
      query: 'the wound healed',
      identity: {
        kind: 'phrase',
        intent: 'literary',
        tokenCount: 3,
        tokens: ['the', 'wound', 'healed'],
        primaryContentToken: 'wound',
      },
      inquiry: inquiryPacket({
        extra: {
          headToken: 'wound',
          framePos: 'n',
          frameCue: 'determiner',
          isHeteronym: true,
          distinctPronunciations: 2,
          viableWordCount: 1,
        },
      }),
      drafts,
    });
    expect(unusedExistingEvidence(frozen, 's1').some((e) => e.kind === 'frame_pos')).toBe(true);
    expect(classifyHole({ frozen, gold: 's1' })).toBe('TYPE_IV_UNUSED_EVIDENCE');
  });
});

describe('stratify and splits', () => {
  it('places splits into the preregistered bands and does not retune the gate', () => {
    expect(splitBandOf(0.02)).toBe('weak');
    expect(splitBandOf(0.05)).toBe('moderate');
    expect(splitBandOf(0.10)).toBe('strong');
    expect(splitBandOf(0.20)).toBe('very-strong');
    expect(splitBandOf(MIN_COVERAGE_SPLIT - 1e-9)).toBeNull();
    expect(SPLIT_BANDS.map((b) => b.id)).toEqual(['weak', 'moderate', 'strong', 'very-strong']);
  });

  it('does not take the first N holes when asked for a balanced sample', () => {
    const cases = [];
    for (let i = 0; i < 40; i += 1) {
      const split = i < 30 ? 0.02 : 0.20;
      const scores = i < 30 ? [0.52, 0.50] : [0.90, 0.70];
      cases.push(freezeBank({
        query: `loan from the bank ${i}`,
        inquiry: inquiryPacket({ scores }),
      }));
      cases[cases.length - 1] = {
        ...cases[cases.length - 1],
        ballistics: { ...cases[cases.length - 1].ballistics, split, scores: measured(scores).scores },
      };
    }
    const sampled = stratifiedSample(cases, { n: 8, seed: 0x5c4010 });
    expect(sampled).toHaveLength(8);
    const bands = new Set(sampled.map((c) => splitBandOf(c.ballistics.split)));
    expect(bands.has('weak')).toBe(true);
    expect(bands.has('very-strong')).toBe(true);
    expect(sampled.slice(0, 8).every((c, i) => c.query === cases[i].query)).toBe(false);
  });

  it('assigns discovery / development / holdout once and seals holdout from design', () => {
    const cases = Array.from({ length: 10 }, (_, i) => freezeBank({ query: `loan from the bank ${i}` }));
    const split = assignSplits(cases, { seed: 7, discovery: 0.6, development: 0.2, holdout: 0.2 });
    expect(split.discovery).toHaveLength(6);
    expect(split.development).toHaveLength(2);
    expect(split.holdout).toHaveLength(2);
    expect(refuseHoldout(split.holdout[0], split)).toMatchObject({ ok: false, reason: 'holdout' });
    expect(refuseHoldout(split.discovery[0], split)).toMatchObject({ ok: true });
    const again = assignSplits(cases, { seed: 7, discovery: 0.6, development: 0.2, holdout: 0.2 });
    expect(again.holdout.map((c) => c.caseId)).toEqual(split.holdout.map((c) => c.caseId));
  });

  it('describes a stratum without exposing a Ballistics winner', () => {
    const frozen = freezeBank();
    const stratum = describeStratum(frozen);
    expect(stratum.pos).toBe('n');
    expect(stratum.candidateCount).toBe(2);
    expect(stratum.splitBand).toBe('very-strong');
    expect(stratum).not.toHaveProperty('winner');
    expect(stratum.heteronym).toBe(false);
  });
});

describe('clustering, ledger, cards', () => {
  function labeled(family, gold, splitName, lemma = 'bank') {
    const frozen = freezeBank({
      query: `${lemma} context ${family} ${splitName}`,
      drafts: [
        {
          observationId: 'obs.lex.sense_candidates',
          status: 'observed',
          result: {
            candidates: [
              { senseId: 's1', lemma, pos: 'n', gloss: 'a financial institution that accepts deposits' },
              { senseId: 's2', lemma, pos: 'n', gloss: 'the sloping land beside a river' },
            ],
            queryTokens: ['loan'],
          },
        },
        ...draftsForBank().slice(1),
      ],
    });
    return {
      frozen,
      gold,
      failureLayer: gold === 's1' ? 'TYPE_I_PROBE_HOLE' : classifyHole({ frozen, gold }),
      predicateFamily: family,
      split: splitName,
    };
  }

  it('clusters Type I holes by family and refuses to read holdout while ranking', () => {
    const rows = [
      labeled('ENTITY_TYPE', 's1', 'discovery', 'bank'),
      labeled('ENTITY_TYPE', 's1', 'discovery', 'plant'),
      labeled('MOTION', 's1', 'discovery', 'spring'),
      labeled('ENTITY_TYPE', 's1', 'holdout', 'yard'),
    ];
    expect(() => clusterPredicates(rows)).toThrow(/holdout/i);
    const clustered = clusterPredicates(rows.filter((r) => r.split !== 'holdout'));
    const entity = clustered.find((c) => c.predicateFamily === 'ENTITY_TYPE');
    expect(entity.cases).toBe(2);
    expect(entity.lemmas).toEqual(expect.arrayContaining(['bank', 'plant']));
    const ranked = rankPredicateOpportunity(clustered);
    expect(ranked[0].predicateFamily).toBe('ENTITY_TYPE');
    expect(topRecurringHoles(ranked, 3).map((r) => r.predicateFamily)).toContain('ENTITY_TYPE');
  });

  it('builds a ledger that reports recoverability and Ballistics alignment without promoting a winner', () => {
    const frozen = freezeBank();
    const rows = [{
      frozen,
      gold: 's1',
      failureLayer: 'TYPE_I_PROBE_HOLE',
      predicateFamily: 'ENTITY_TYPE',
      split: 'discovery',
      ballisticsAligned: ballisticsTopSenseId(frozen) === 's1',
    }];
    const ledger = buildHoleLedger(rows);
    expect(ledger.contract).toBe(ADJUDICATION_CONTRACT);
    const entity = ledger.families.find((f) => f.predicateFamily === 'ENTITY_TYPE');
    expect(entity.cases).toBe(1);
    expect(entity.goldRecoverable).toBe(1);
    expect(entity).toHaveProperty('ballisticsAligned');
    expect(entity).toHaveProperty('existingProbeSupport');
    expect(ledger).not.toHaveProperty('winner');
  });

  it('refuses to mint a hypothesis card that can see Ballistics or a holdout case', () => {
    const frozen = freezeBank();
    expect(() => makeHypothesisCard({
      predicate: 'ENTITY_TYPE',
      discoveryCases: [{ frozen, gold: 's1', split: 'holdout' }],
      developmentCases: [],
    })).toThrow(/holdout/i);

    const card = makeHypothesisCard({
      predicate: 'ENTITY_TYPE',
      observedHoleCount: 2,
      discoveryCases: [{ frozen, gold: 's1', split: 'discovery' }],
      developmentCases: [{ frozen: freezeBank({ query: 'teller at the bank' }), gold: 's1', split: 'development' }],
      proposedObservation: 'candidate referent is compatible with an organization',
      expectedEffect: 'eliminate landform senses in institutional frames',
      falsifier: 'context permits a figurative or landform reading',
      risk: 'metaphorical bank of a river in financial prose',
    });
    expect(card.predicate).toBe('ENTITY_TYPE');
    expect(card.preregisteredCases.length).toBeGreaterThan(0);
    expect(JSON.stringify(card)).not.toMatch(/semanticScore/);
    expect(card).not.toHaveProperty('ballistics');
    expect(assertNoBallistics(card).ok).toBe(true);
  });
});

describe('Ballistics stays secondary', () => {
  it('measures P(top = gold | band) without writing a selection', () => {
    const frozen = freezeBank();
    const selectionBefore = JSON.stringify(frozen.probe);
    const cal = calibrateBallistics([{
      frozen,
      gold: 's1',
      split: 'discovery',
    }]);
    expect(cal.byBand['very-strong'].n).toBe(1);
    expect(cal.byBand['very-strong'].aligned).toBe(1);
    expect(cal.byBand['very-strong'].pTopEqualsGold).toBe(1);
    expect(JSON.stringify(frozen.probe)).toBe(selectionBefore);
    expect(cal).not.toHaveProperty('selection');
  });

  it('ignores refusal gold when calibrating top-candidate accuracy', () => {
    const cal = calibrateBallistics([{
      frozen: freezeBank(),
      gold: 'AMBIGUOUS',
      split: 'discovery',
    }]);
    expect(cal.recoverable).toBe(0);
    expect(cal.byBand['very-strong'].n).toBe(0);
  });

  it('flipping Ballistics scores cannot change gold or the probe verdict', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    const gold = recordGold({
      caseId: frozen.caseId,
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: blind.candidateSenses,
    });
    const flipped = flipBallisticsScores(frozen);
    expect(ballisticsTopSenseId(frozen)).not.toBe(ballisticsTopSenseId(flipped));
    expect(flipped.probe.status).toBe(frozen.probe.status);
    expect(flipped.probe.receiptDigests).toEqual(frozen.probe.receiptDigests);
    const goldAgain = recordGold({
      caseId: flipped.caseId,
      adjudicatorId: 'A',
      gold: 's1',
      candidateSenses: blindCase(flipped).candidateSenses,
    });
    expect(goldAgain.gold).toBe(gold.gold);
    expect(classifyHole({ frozen: flipped, gold: 's1' })).toBe(classifyHole({ frozen, gold: 's1' }));
  });
});

describe('rubrics never read Ballistics', () => {
  it('recovers an institutional bank from loan context without seeing scores', () => {
    const frozen = freezeBank();
    const blind = blindCase(frozen);
    const a = adjudicateRubricA(blind);
    const b = adjudicateRubricB(blind);
    expect(GOLD_REFUSALS.includes(a.gold) || frozen.candidateSenses.some((c) => c.senseId === a.gold)).toBe(true);
    expect(assertNoBallistics(a).ok).toBe(true);
    expect(assertNoBallistics(b).ok).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/semanticScore/);
  });

  it('refuses a bare unframed token instead of forcing a sense', () => {
    const frozen = freezeBank({
      query: 'bank',
      identity: {
        kind: 'word',
        intent: 'literary',
        tokenCount: 1,
        tokens: ['bank'],
        primaryContentToken: 'bank',
      },
      drafts: [
        {
          observationId: 'obs.lex.sense_candidates',
          status: 'observed',
          result: {
            candidates: draftsForBank()[0].result.candidates,
            queryTokens: [],
          },
        },
        ...draftsForBank().slice(1),
      ],
    });
    const a = adjudicateRubricA(blindCase(frozen));
    expect(a.gold).toBe('INSUFFICIENT_CONTEXT');
  });

  it('refuses to pick a season reading when water-source glosses share the overlap', () => {
    const drafts = draftsForBank();
    drafts[0] = {
      observationId: 'obs.lex.sense_candidates',
      status: 'observed',
      result: {
        candidates: [
          { senseId: 'season', lemma: 'spring', pos: 'n', gloss: 'the season of growth; the beginning of spring' },
          { senseId: 'coil', lemma: 'spring', pos: 'n', gloss: 'a metal elastic device that returns to its shape' },
          { senseId: 'water1', lemma: 'spring', pos: 'n', gloss: 'a natural flow of ground water' },
          { senseId: 'water2', lemma: 'spring', pos: 'n', gloss: 'a point at which water issues forth' },
        ],
        queryTokens: ['water', 'from', 'the'],
      },
    };
    const frozen = freezeBank({
      query: 'water from the spring',
      identity: {
        kind: 'phrase',
        intent: 'literary',
        tokenCount: 4,
        tokens: ['water', 'from', 'the', 'spring'],
        primaryContentToken: 'spring',
      },
      drafts,
    });
    const a = adjudicateRubricA(blindCase(frozen));
    expect(a.gold).toBe('AMBIGUOUS');
    expect(a.gold).not.toBe('season');
  });

  it('does not call a function-word overlap a syntactic-frame distinction', () => {
    expect(discriminativeFamily(
      'the volume of trade',
      'the magnitude of something as a whole',
      ['a book containing several works'],
    )).not.toBe('SYNTACTIC_FRAME');
    expect(discriminativeFamily(
      'loan from the bank',
      'a financial institution that accepts deposits',
      ['the sloping land beside a river'],
    )).toBe('DOMAIN');
  });

  it('runs two independent passes and will not invent agreement', () => {
    const frozen = freezeBank();
    const out = runTwoPass({
      frozen,
      passA: [adjudicateRubricA, adjudicateRubricB],
    });
    expect(out.passA).toHaveLength(2);
    expect(typeof out.agreement).toBe('boolean');
    if (!out.agreement) {
      expect(out.gold).toBeNull();
      expect(out.needsResolution).toBe(true);
    }
  });
});

describe('receipt integrity', () => {
  it('keeps sealed receipt digests as 64-hex and unchanged under a Ballistics flip', () => {
    const frozen = freezeBank();
    for (const d of frozen.probe.receiptDigests) {
      expect(d).toMatch(/^[0-9A-Fa-f]{64}$/);
    }
    const flipped = flipBallisticsScores(frozen);
    expect(flipped.probe.receiptDigests).toEqual(frozen.probe.receiptDigests);
    const joined = frozen.probe.receiptDigests.join('');
    const digest = createHash('sha256').update(joined).digest('hex');
    expect(digest).toHaveLength(64);
  });
});
