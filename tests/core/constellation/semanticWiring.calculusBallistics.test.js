/**
 * CONSTELLATION — Semantic Calculus × Semantic Ballistics wiring
 * =================================================================
 *
 * Two instruments enter the semantic inquiry channel, and each enters at the
 * place its law assigns it:
 *
 *   SEMANTIC BALLISTICS (codex/core/lexical-analysis/semanticBallistics.js)
 *   arrives as a SECOND EVIDENCE AXIS: per-candidate containment of the query
 *   context in each sense gloss, measured with the seeded tq-phoneme-v2
 *   phonotopographic embedding. It is shipped in the packet whether or not a
 *   sense is selected — evidence exists independent of verdicts. It NEVER
 *   touches the selection: the probe's f_tie_is_not_a_decision guarantees a
 *   unique gloss-overlap winner under `supported`, and a tie-breaker wired on
 *   top of that guarantee would be dead code wearing a feature's clothes.
 *
 *   SEMANTIC CALCULUS (observationReceipt / seal) arrives as SEALED REPLAY:
 *   one receipt digest per probe observation, so any reader can re-derive the
 *   verdict's evidence envelope offline. Production node has no TS loader, so
 *   the seal travels through receiptSeal.js — a server-safe .js island whose
 *   algorithmic isomorphism with the .ts original is pinned here.
 *
 * What is under test is not that the instruments run, but that they CANNOT
 * usurp: the falsifier-gated verdict must be byte-identical with and without
 * the wiring's opinion.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeSemanticInquiry,
  SEMANTIC_ADAPTER_VERSION,
} from '../../../codex/server/services/constellation/semanticInquiry.adapter.js';
import { makeReceipt, receiptDigest } from '../../../codex/core/semantic-calculus/observationReceipt.ts';
import { CONSTELLATION_SENSE_PROBE } from '../../../codex/core/constellation/semanticInquiry.js';
import { BALLISTIC_EMBEDDING } from '../../../codex/core/lexical-analysis/semanticBallistics.js';

/**
 * Fixture proven against the live adapter (explored before assertion):
 * two senses, one clearly overlapping the query, phonology settled to a single
 * pronunciation, one viable word — the exact recipe for a `supported` verdict.
 */
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

describe('adapter version', () => {
  it('declares the wired generation', () => {
    expect(SEMANTIC_ADAPTER_VERSION).toBe('sem-inquiry-2');
  });
});

describe('semantic ballistics — second evidence axis', () => {
  it('measures per-candidate containment on bound queries', async () => {
    const result = await run(supportedFixture());
    expect(result.ballistics).not.toBeNull();
    expect(result.ballistics.status).toBe('measured');
    expect(result.ballistics.embedding).toEqual({
      kind: BALLISTIC_EMBEDDING.kind,
      version: BALLISTIC_EMBEDDING.version,
      dimensions: BALLISTIC_EMBEDDING.dimensions,
    });
    expect(result.ballistics.scores).toHaveLength(2);
    for (const s of result.ballistics.scores) {
      expect(typeof s.semanticScore).toBe('number');
      expect(s.semanticScore).toBeGreaterThanOrEqual(0);
      expect(s.semanticScore).toBeLessThanOrEqual(1);
    }
  });

  it('is content-sensitive — a measurement that cannot vary is fake', async () => {
    const result = await run(supportedFixture());
    const [a, b] = result.ballistics.scores;
    // The soldier gloss contains "feudal mounted"; the darkness gloss does not.
    expect(a.semanticScore).not.toBeCloseTo(b.semanticScore, 3);
    expect(a.semanticScore).toBeGreaterThan(b.semanticScore);
  });

  it('is deterministic — two calls, byte-identical axis', async () => {
    const one = await run(supportedFixture());
    const two = await run(supportedFixture());
    expect(JSON.stringify(one.ballistics)).toBe(JSON.stringify(two.ballistics));
  });

  it('cannot usurp the verdict when containment disagrees with overlap', async () => {
    /**
     * THE ANTI-USURPATION MINIMAL PAIR, constructed empirically against the
     * real scorer (probed before being pinned): sense A shares exactly one
     * content word with the query ('dark'), sense B is a phonetic twin of the
     * whole context ('darke sylent mydnight' ≈ 'dark silent midnight') while
     * sharing ZERO exact tokens. Containment therefore favors B (0.813 vs
     * 0.737) while overlap favors A (1 vs 0). If ballistics ever leaks into
     * selection, this fixture catches it: the pick must stay A.
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
      tokenCount: 4,
      tokens: ['dark', 'silent', 'midnight', 'night'],
      primaryContentToken: 'night',
    };
    fixture.leximancy.interpretations = [
      { id: 'oewn-night-n-1', gloss: 'the dark time between sunset and sunrise' },
      { id: 'oewn-night-n-2', gloss: 'darke sylent mydnight' },
    ];

    const result = await run(fixture);
    // Containment genuinely disagrees with overlap here (otherwise the pair is
    // not testing anything). Candidate ids are harness-assigned (headword.pos.i).
    const [scoreA, scoreB] = result.ballistics.scores.map((s) => s.semanticScore);
    expect(scoreB).toBeGreaterThan(scoreA);
    // …and the verdict ignores it entirely: overlap evidence still selects A.
    expect(result.selection.warranted).toBe(true);
    expect(result.selection.senseId).toBe('oewn-night-n-1');
    // Selection carries no ballistic field — the boundary is structural.
    expect(Object.keys(result.selection).sort()).toEqual(
      ['gloss', 'overlap', 'reason', 'senseId', 'warranted'],
    );
  });

  it('still measures when the verdict is denied — evidence exists without a pick', async () => {
    /**
     * The tie fixture from semanticInquiry.test.js: equal overlaps eliminate the
     * hypothesis. The axis must still ship — a denied verdict with visible
     * measurements is honest; a denied verdict with no measurements is a wall.
     */
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [{
      headword: 'night',
      pos: 'n',
      senses: [
        { gloss: 'darkness and shadow', pos: 'n' },
        { gloss: 'shadow and darkness', pos: 'n' },
      ],
    }];
    fixture.identity = { ...fixture.identity, tokens: ['darkness', 'shadow', 'night'], primaryContentToken: 'night' };
    fixture.leximancy.interpretations = [
      { id: 'x-1', gloss: 'darkness and shadow' },
      { id: 'x-2', gloss: 'shadow and darkness' },
    ];

    const result = await run(fixture);
    expect(result.selection.warranted).toBe(false);
    expect(result.ballistics.status).toBe('measured');
    expect(result.ballistics.scores).toHaveLength(2);
  });

  it('reports unavailability loudly, never as a silent zero', async () => {
    const failing = () => { throw new Error('embedding engine offline'); };
    const result = await run(supportedFixture(), { scoreBallistics: failing });
    expect(result.ballistics.status).toBe('unavailable');
    expect(result.ballistics.reason).toMatch(/embedding engine offline/);
    // The verdict is untouched by the instrument's failure.
    expect(result.selection.warranted).toBe(true);
    expect(result.selection.senseId).toBe('oewn-knight-n-1');
  });

  it('is null when there are no candidates to score', async () => {
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [];
    fixture.adapter.lookupLexicalEntries = () => [];
    const result = await run(fixture);
    expect(result.ballistics).toBeNull();
  });
});

describe('semantic calculus — sealed replay', () => {
  it('ships one digest per probe observation, sorted and well-formed', async () => {
    const result = await run(supportedFixture());
    expect(result.receiptDigests).toHaveLength(CONSTELLATION_SENSE_PROBE.observations.length);
    const sorted = [...result.receiptDigests].sort();
    expect(result.receiptDigests).toEqual(sorted);
    for (const d of result.receiptDigests) {
      expect(d).toMatch(/^[0-9A-F]{64}$/);
    }
  });

  it('recomputes identically from the same drafts (sealed replay)', async () => {
    const one = await run(supportedFixture());
    const two = await run(supportedFixture());
    expect(one.receiptDigests).toEqual(two.receiptDigests);
  });

  it('receipts exist even when the verdict is denied', async () => {
    const fixture = supportedFixture();
    fixture.adapter.lookupWord = () => [];
    fixture.adapter.lookupLexicalEntries = () => [];
    const result = await run(fixture);
    expect(result.selection.warranted).toBe(false);
    expect(result.receiptDigests).toHaveLength(CONSTELLATION_SENSE_PROBE.observations.length);
  });

  it('unbound queries carry no receipts and no axis', async () => {
    const fixture = supportedFixture();
    fixture.identity = { kind: 'multiline', intent: 'literary', tokenCount: 4, tokens: ['a', 'b', 'c', 'd'], primaryContentToken: 'a' };
    const result = await run(fixture);
    expect(result.bound).toBe(false);
    expect(result.ballistics).toBeNull();
    expect(result.receiptDigests).toEqual([]);
  });
});

describe('seal island isomorphism', () => {
  it('receiptSeal.js and observationReceipt.ts mint identical digests', async () => {
    const { sealObservationDigest } = await import(
      '../../../codex/core/semantic-calculus/receiptSeal.js'
    );
    const cases = [
      { probeId: 'probe.constellation.sense', observationId: 'obs.lex.sense_candidates', result: { candidates: [{ senseId: 'a', gloss: 'x' }], queryTokens: ['q'] }, status: 'observed' },
      { probeId: 'probe.constellation.sense', observationId: 'obs.lex.relation_paths', result: { edges: [] }, status: 'observed' },
      { probeId: 'probe.constellation.sense', observationId: 'obs.lex.lexical_entries', result: null, status: 'error' },
      { probeId: 'probe.constellation.sense', observationId: 'obs.phon.neighbours', result: { winner: { sameLemma: true, crossLemmaCosine: 0 } }, status: 'observed' },
      // Order sensitivity of canonicalization (arrays keep author order).
      { probeId: 'p', observationId: 'o', result: { list: [3, 1, 2], nested: { b: 1, a: 2 } }, status: 'observed' },
      // -0 and integer boundaries.
      { probeId: 'p', observationId: 'o2', result: { z: -0, i: 42, f: 0.1 }, status: 'observed' },
    ];
    for (const c of cases) {
      const island = sealObservationDigest(c);
      const ts = receiptDigest(makeReceipt(c));
      expect(island, `digest mismatch for ${c.observationId}`).toBe(ts);
    }
  });
});
