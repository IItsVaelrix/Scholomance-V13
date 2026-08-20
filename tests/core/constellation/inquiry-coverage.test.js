/**
 * CONSTELLATION — probe-blind coverage on the sem-inquiry-2 substrate
 *
 * Production change that would make these fail: calling a transport-dark
 * packet (status:measured, null scores) flat; swallowing a measured split
 * the probe refused; emitting a Ballistics winner; or writing a selection.
 *
 * Two maps, never merged:
 *   semantic         — probe incompleteness (the judge)
 *   instrumentation  — whether the packet faithfully exposes the axis
 *
 * measured-unwarranted is incompleteness evidence: investigate this
 * region. It is not evidence the rejected candidate should have won.
 */
import { describe, it, expect } from 'vitest';

import { analyzeSemanticInquiry } from '../../../codex/server/services/constellation/semanticInquiry.adapter.js';
import {
  MIN_COVERAGE_SPLIT,
  classifyInquiryCoverage,
} from '../../../codex/core/constellation/inquiry-coverage.js';

function supportedFixture() {
  const adapter = {
    __unsafe: { connected: true },
    lookupWord: () => [{
      headword: 'knight',
      pos: 'n',
      senses: [
        { gloss: 'a mounted soldier serving under a feudal lord', pos: 'n' },
        { gloss: 'the period of darkness between sunset and sunrise', pos: 'n' },
      ],
    }],
    extractGloss: ([s]) => s?.gloss || '',
    lookupRelated: () => ({ broader: [{ lemma: 'soldier' }], narrower: [], akin: [{ lemma: 'cavalier' }] }),
    lookupAntonyms: () => [],
    lookupLexicalEntries: () => [{
      pos: 'n',
      senses: [
        { synsetId: 'oewn-knight-n-1', gloss: 'a mounted soldier serving under a feudal lord', examples: [] },
        { synsetId: 'oewn-knight-n-2', gloss: 'the period of darkness between sunset and sunrise', examples: [] },
      ],
    }],
  };
  const phonology = { async ready() { return true; }, variants: () => [['K', 'N', 'AY1', 'T']] };
  const identity = {
    kind: 'word',
    intent: 'literary',
    tokenCount: 3,
    tokens: ['feudal', 'mounted', 'knight'],
    primaryContentToken: 'knight',
  };
  const leximancy = {
    interpretations: [
      { id: 'oewn-knight-n-1', gloss: 'a mounted soldier serving under a feudal lord' },
      { id: 'oewn-knight-n-2', gloss: 'the period of darkness between sunset and sunrise' },
    ],
  };
  return { adapter, phonology, identity, leximancy };
}

const run = (fixture, options) =>
  analyzeSemanticInquiry(fixture.adapter, fixture.identity, fixture.leximancy, fixture.phonology, options);

function packet({
  bound = true,
  warranted = false,
  reason = 'eliminated',
  ballistics = null,
  receiptDigests = [],
} = {}) {
  return {
    bound,
    selection: { warranted, reason, senseId: null, gloss: null, overlap: null },
    ballistics,
    receiptDigests,
  };
}

function measured(scores, extras = {}) {
  return {
    status: 'measured',
    embedding: { kind: 'phonotopographic', version: 'tq-phoneme-v2', dimensions: 256 },
    scores: scores.map((semanticScore, i) => ({ senseId: `s${i}`, semanticScore })),
    degraded: [],
    ...extras,
  };
}

describe('classifyInquiryCoverage — taxonomy', () => {
  it('exports the detection threshold by name, not as a buried literal', () => {
    expect(MIN_COVERAGE_SPLIT).toBe(0.01);
  });

  it('names a measured split the probe refused as probe-incompleteness evidence', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: false,
      reason: 'eliminated',
      ballistics: measured([0.81, 0.62]),
      receiptDigests: ['A'.repeat(64), 'B'.repeat(64)],
    }));
    expect(found.kind).toBe('measured-unwarranted');
    expect(found.opportunity).toBe(true);
    expect(found.semantic).toBe('measured-unwarranted');
    expect(found.instrumentation).toBe('exposed');
    expect(found.reason).toBe('eliminated');
    expect(found.split).toBeCloseTo(0.19, 6);
    expect(found.scoreCount).toBe(2);
    expect(found.receiptCount).toBe(2);
    expect(found.warranted).toBe(false);
    expect(found).not.toHaveProperty('winner');
    expect(found).not.toHaveProperty('preferredSense');
  });

  it('does not call a warranted pick a hole, even when the axis also splits', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: true,
      reason: 'supported',
      ballistics: measured([0.82, 0.72]),
    }));
    expect(found.kind).toBe('warranted');
    expect(found.semantic).toBe('warranted');
    expect(found.instrumentation).toBe('exposed');
    expect(found.opportunity).toBe(false);
  });

  it('does not invent a hole when the exposed axis is genuinely flat', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: false,
      reason: 'eliminated',
      ballistics: measured([0.5, 0.5 + MIN_COVERAGE_SPLIT / 2]),
    }));
    expect(found.kind).toBe('flat-unwarranted');
    expect(found.semantic).toBe('flat-unwarranted');
    expect(found.instrumentation).toBe('exposed');
    expect(found.opportunity).toBe(false);
    expect(found.split).toBeLessThan(MIN_COVERAGE_SPLIT);
  });

  it('names a measured packet with null scores unexposed, not flat', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: false,
      reason: 'eliminated',
      ballistics: measured([null, null]),
    }));
    expect(found.kind).toBe('unexposed-measurement');
    expect(found.instrumentation).toBe('unexposed');
    expect(found.semantic).toBeNull();
    expect(found.opportunity).toBe(false);
    expect(found.scoreCount).toBe(0);
    expect(found.split).toBeNull();
  });

  it('names a measured packet with one finite score unexposed, not flat', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: false,
      reason: 'eliminated',
      ballistics: measured([0.71, null]),
    }));
    expect(found.kind).toBe('unexposed-measurement');
    expect(found.instrumentation).toBe('unexposed');
    expect(found.semantic).toBeNull();
    expect(found.opportunity).toBe(false);
  });

  it('calls a bound query with no candidates dark, not an opportunity', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: false,
      reason: 'not_supported',
      ballistics: null,
    }));
    expect(found.kind).toBe('dark');
    expect(found.semantic).toBe('dark');
    expect(found.instrumentation).toBe('not-applicable');
    expect(found.opportunity).toBe(false);
    expect(found.split).toBeNull();
  });

  it('keeps the judge and the pipeline distinct when the instrument is dead', () => {
    const found = classifyInquiryCoverage(packet({
      warranted: true,
      reason: 'supported',
      ballistics: {
        status: 'unavailable',
        reason: 'embedding engine offline',
        embedding: null,
        scores: [],
        degraded: [],
      },
    }));
    expect(found.kind).toBe('unavailable');
    expect(found.instrumentation).toBe('unavailable');
    expect(found.semantic).toBe('warranted');
    expect(found.opportunity).toBe(false);
    expect(found.reason).toBe('embedding engine offline');
  });

  it('does not treat an unbound query as a lexicon hole', () => {
    const found = classifyInquiryCoverage(packet({
      bound: false,
      reason: 'not_bound',
      ballistics: null,
    }));
    expect(found.kind).toBe('unbound');
    expect(found.semantic).toBe('unbound');
    expect(found.instrumentation).toBe('not-applicable');
    expect(found.opportunity).toBe(false);
  });

  it('lets measurement change diagnosis without touching the verdict', () => {
    const selection = Object.freeze({
      warranted: false,
      reason: 'eliminated',
      senseId: null,
      gloss: null,
      overlap: null,
    });
    const before = JSON.stringify(selection);
    const flat = classifyInquiryCoverage({
      bound: true,
      selection,
      ballistics: measured([0.50, 0.50 + MIN_COVERAGE_SPLIT / 2]),
      receiptDigests: [],
    });
    const split = classifyInquiryCoverage({
      bound: true,
      selection,
      ballistics: measured([0.10, 0.90]),
      receiptDigests: [],
    });
    const flipped = classifyInquiryCoverage({
      bound: true,
      selection,
      ballistics: measured([0.90, 0.10]),
      receiptDigests: [],
    });

    expect(JSON.stringify(selection)).toBe(before);
    expect(flat.kind).toBe('flat-unwarranted');
    expect(split.kind).toBe('measured-unwarranted');
    expect(flipped.kind).toBe('measured-unwarranted');
    expect(split.split).toBeCloseTo(flipped.split, 6);
    expect(split).not.toHaveProperty('winner');
    expect(flipped).not.toHaveProperty('winner');
  });
});

describe('classifyInquiryCoverage — live adapter', () => {
  it('does not report the supported knight query as a hole', async () => {
    const result = await run(supportedFixture());
    expect(result.selection.warranted).toBe(true);
    const found = classifyInquiryCoverage(result);
    expect(found.kind).toBe('warranted');
    expect(found.semantic).toBe('warranted');
    expect(found.instrumentation).toBe('exposed');
    expect(found.opportunity).toBe(false);
  });

  it('does not mutate the inquiry packet it reads', async () => {
    const result = await run(supportedFixture());
    const before = JSON.stringify(result);
    classifyInquiryCoverage(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it('classifies an equal-overlap tie instead of dropping it', async () => {
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [{
      headword: 'night',
      pos: 'n',
      senses: [
        { gloss: 'darkness and shadow', pos: 'n' },
        { gloss: 'shadow and darkness', pos: 'n' },
      ],
    }];
    fixture.identity = {
      ...fixture.identity,
      tokens: ['darkness', 'shadow', 'night'],
      primaryContentToken: 'night',
    };
    fixture.leximancy.interpretations = [
      { id: 'x-1', gloss: 'darkness and shadow' },
      { id: 'x-2', gloss: 'shadow and darkness' },
    ];

    const result = await run(fixture);
    expect(result.selection.warranted).toBe(false);
    expect(result.ballistics.status).toBe('measured');

    const found = classifyInquiryCoverage(result);
    expect(['measured-unwarranted', 'flat-unwarranted']).toContain(found.kind);
    expect(found.semantic).toBe(found.kind);
    expect(found.instrumentation).toBe('exposed');
    expect(found.opportunity).toBe(found.kind === 'measured-unwarranted');
    expect(found.warranted).toBe(false);
    expect(found.scoreCount).toBe(2);
    expect(found.receiptCount).toBeGreaterThan(0);
  });

  it('finds probe incompleteness on a probe-blind split pair, not a winner', async () => {
    /**
     * Explored against the live adapter before pinning. Equal overlap of
     * zero (neither gloss shares a query token) so the probe eliminates.
     * Containment still prefers the phonetic twin (0.789 vs 0.730).
     * That is incompleteness evidence — investigate this region — not
     * evidence the phonetic twin should have been warranted.
     */
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [{
      headword: 'night',
      pos: 'n',
      senses: [
        { gloss: 'the dark time between sunset and sunrise', pos: 'n' },
        { gloss: 'darke sylent mydnight', pos: 'n' },
      ],
    }];
    fixture.adapter.lookupLexicalEntries = () => [{
      pos: 'n',
      senses: [
        { synsetId: 'oewn-night-n-1', gloss: 'the dark time between sunset and sunrise', examples: [] },
        { synsetId: 'oewn-night-n-2', gloss: 'darke sylent mydnight', examples: [] },
      ],
    }];
    fixture.identity = {
      kind: 'word',
      intent: 'literary',
      tokenCount: 3,
      tokens: ['silent', 'midnight', 'night'],
      primaryContentToken: 'night',
    };
    fixture.leximancy.interpretations = [
      { id: 'oewn-night-n-1', gloss: 'the dark time between sunset and sunrise' },
      { id: 'oewn-night-n-2', gloss: 'darke sylent mydnight' },
    ];
    fixture.phonology = { async ready() { return true; }, variants: () => [['N', 'AY1', 'T']] };

    const result = await run(fixture);
    expect(result.selection.warranted).toBe(false);
    const [scoreA, scoreB] = result.ballistics.scores.map((s) => s.semanticScore);
    expect(scoreB).toBeGreaterThan(scoreA);
    const found = classifyInquiryCoverage(result);
    expect(found.kind).toBe('measured-unwarranted');
    expect(found.semantic).toBe('measured-unwarranted');
    expect(found.instrumentation).toBe('exposed');
    expect(found.opportunity).toBe(true);
    expect(found.split).toBeGreaterThanOrEqual(MIN_COVERAGE_SPLIT);
    expect(found.receiptCount).toBeGreaterThan(0);
    expect(found).not.toHaveProperty('winner');
  });

  it('names a live bare-token measured-null packet unexposed, not flat', async () => {
    /**
     * Explored before pinning: the raw scorer splits bank's two glosses
     * against "bank" (Δ ≈ 0.018). The adapter packet ships
     * status:measured with null scores. That is an observability hole
     * in the pipeline, not a flat axis.
     */
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [{
      headword: 'bank',
      pos: 'n',
      senses: [
        { gloss: 'the sloping land beside a river', pos: 'n' },
        { gloss: 'a financial institution that accepts deposits', pos: 'n' },
      ],
    }];
    fixture.adapter.lookupLexicalEntries = () => [{
      pos: 'n',
      senses: [
        { synsetId: 'oewn-bank-n-1', gloss: 'the sloping land beside a river', examples: [] },
        { synsetId: 'oewn-bank-n-2', gloss: 'a financial institution that accepts deposits', examples: [] },
      ],
    }];
    fixture.identity = {
      kind: 'word',
      intent: 'literary',
      tokenCount: 1,
      tokens: ['bank'],
      primaryContentToken: 'bank',
    };
    fixture.leximancy.interpretations = [
      { id: 'oewn-bank-n-1', gloss: 'the sloping land beside a river' },
      { id: 'oewn-bank-n-2', gloss: 'a financial institution that accepts deposits' },
    ];
    fixture.phonology = { async ready() { return true; }, variants: () => [['B', 'AE1', 'NG', 'K']] };

    const result = await run(fixture);
    expect(result.selection.warranted).toBe(false);
    expect(result.ballistics.status).toBe('measured');
    expect(result.ballistics.scores.every((s) => s.semanticScore == null)).toBe(true);
    const found = classifyInquiryCoverage(result);
    expect(found.kind).toBe('unexposed-measurement');
    expect(found.instrumentation).toBe('unexposed');
    expect(found.semantic).toBeNull();
    expect(found.opportunity).toBe(false);
  });

  it('calls an empty lexicon dark', async () => {
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [];
    fixture.adapter.lookupLexicalEntries = () => [];
    const result = await run(fixture);
    expect(result.ballistics).toBeNull();
    const found = classifyInquiryCoverage(result);
    expect(found.kind).toBe('dark');
    expect(found.semantic).toBe('dark');
    expect(found.instrumentation).toBe('not-applicable');
    expect(found.opportunity).toBe(false);
  });

  it('calls a dead scorer unavailable without rewriting the verdict', async () => {
    const result = await run(supportedFixture(), {
      scoreBallistics: () => { throw new Error('embedding engine offline'); },
    });
    expect(result.selection.warranted).toBe(true);
    const found = classifyInquiryCoverage(result);
    expect(found.kind).toBe('unavailable');
    expect(found.instrumentation).toBe('unavailable');
    expect(found.semantic).toBe('warranted');
    expect(found.opportunity).toBe(false);
    expect(found.reason).toMatch(/embedding engine offline/);
  });
});
