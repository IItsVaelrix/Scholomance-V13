/**
 * CONSTELLATION — Semantic Calculus bridge
 *
 * Two things are under test, and the second is the one that matters:
 *   1. the probe is structurally lawful (binds correctly, is falsifiable)
 *   2. its falsifiers ACTUALLY FIRE on the evidence they were written for
 *
 * (2) is the point. A probe whose falsifiers cannot trigger is a check that
 * cannot fail — the pathology this whole layer exists to prevent — so each
 * hypothesis is driven to `eliminated` with real harness output, not asserted
 * about in the abstract.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSTELLATION_SENSE_PROBE,
  CONSTELLATION_INQUIRY_BIND,
  bindsConstellationInquiry,
} from '../../../codex/core/constellation/semanticInquiry.js';
import { collectSenseProbeDrafts } from '../../../codex/server/services/constellation/senseProbe.harness.js';
import { assertFalsifiable } from '../../../codex/core/semantic-calculus/probeRegistry.ts';
import { evaluateHypotheses } from '../../../codex/core/semantic-calculus/hypothesisStatus.js';
import { makeReceipt } from '../../../codex/core/semantic-calculus/observationReceipt.ts';

/** Seal drafts the way a wired caller would. */
const seal = (drafts) =>
  drafts.map((d) =>
    makeReceipt({
      probeId: CONSTELLATION_SENSE_PROBE.id,
      observationId: d.observationId,
      result: d.result,
      status: d.status,
    }),
  );

const evaluate = (drafts) => evaluateHypotheses(CONSTELLATION_SENSE_PROBE.hypotheses, seal(drafts));

/**
 * Fake adapter mirroring lexicon.sqlite.adapter's real shape: lookupWord returns
 * entries carrying `senses`, and extractGloss takes a sense ARRAY.
 */
function fakeAdapter({ senses = [], related = {}, antonyms = [], connected = true } = {}) {
  return {
    __unsafe: { connected },
    lookupWord: () => (senses.length ? [{ headword: 'knight', pos: 'n', senses }] : []),
    extractGloss: ([sense]) => (typeof sense === 'string' ? sense : sense?.gloss || ''),
    lookupRelated: () => ({ broader: [], narrower: [], akin: [], ...related }),
    lookupAntonyms: () => antonyms,
  };
}

describe('structural binding', () => {
  it('binds a literary word or phrase', () => {
    expect(bindsConstellationInquiry({ kind: 'word', intent: 'literary', tokenCount: 1 })).toBe(true);
    expect(bindsConstellationInquiry({ kind: 'phrase', intent: 'meta-query', tokenCount: 5 })).toBe(true);
  });

  it('does not bind a multiline draft or a craft instruction', () => {
    expect(bindsConstellationInquiry({ kind: 'multiline', intent: 'literary', tokenCount: 4 })).toBe(false);
    expect(bindsConstellationInquiry({ kind: 'word', intent: 'craft-instruction', tokenCount: 1 })).toBe(false);
  });

  it('refuses absurd or malformed input instead of interpreting noise', () => {
    expect(bindsConstellationInquiry({ kind: 'phrase', intent: 'literary', tokenCount: 99 })).toBe(false);
    expect(bindsConstellationInquiry({ kind: 'word', intent: 'literary', tokenCount: 0 })).toBe(false);
    expect(bindsConstellationInquiry(null)).toBe(false);
    expect(bindsConstellationInquiry({})).toBe(false);
  });

  it('binds on structure, never on an enumerated phrase list', () => {
    // The whole point: an utterance no pattern anticipated still binds.
    expect(bindsConstellationInquiry({ kind: 'phrase', intent: 'literary', tokenCount: 4 })).toBe(true);
    expect(CONSTELLATION_INQUIRY_BIND.kind).toContain('phrase');
  });
});

describe('probe lawfulness', () => {
  it('passes the calculus falsifiability gate', () => {
    expect(() => assertFalsifiable(CONSTELLATION_SENSE_PROBE)).not.toThrow();
  });

  it('is read-only — a literary query may never mint an execution capability', () => {
    expect(CONSTELLATION_SENSE_PROBE.maxRisk).toBe('read_only');
  });

  it('gives every prediction a predicate, so none can pass on mere collection', () => {
    for (const h of CONSTELLATION_SENSE_PROBE.hypotheses) {
      for (const p of h.predictions) {
        expect(p.predicate, `${h.id}/${p.id} has no predicate`).toBeTruthy();
      }
    }
  });
});

describe('harness collects measurements, not conclusions', () => {
  it('reports raw glosses and raw tokens', () => {
    const adapter = fakeAdapter({
      senses: [{ gloss: 'a mounted soldier serving under a feudal lord', pos: 'n' }],
    });
    const [sense] = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['feudal', 'knight'],
    });

    expect(sense.status).toBe('observed');
    expect(sense.result.candidates[0].gloss).toMatch(/mounted soldier/);
    expect(sense.result.queryTokens).toEqual(['feudal', 'knight']);
    // No pre-computed judgement anywhere in the payload.
    const blob = JSON.stringify(sense.result);
    expect(blob).not.toMatch(/overlapCount|overlapDelta|allKin|score/i);
  });

  it('reports a DB outage as error, never as an empty observation', () => {
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: fakeAdapter({ connected: false }),
      headToken: 'knight',
      queryTokens: ['knight'],
    });
    expect(drafts[0].status).toBe('error');
    expect(drafts[1].status).toBe('error');
  });

  it('always returns one draft per declared observation', () => {
    const drafts = collectSenseProbeDrafts({ lexiconAdapter: fakeAdapter(), headToken: '', queryTokens: [] });
    expect(drafts.map((d) => d.observationId)).toEqual(
      CONSTELLATION_SENSE_PROBE.observations.map((o) => o.id),
    );
  });
});

describe('the falsifiers actually fire', () => {
  it('eliminates the sense hypothesis when no gloss overlaps the query', () => {
    const adapter = fakeAdapter({
      senses: [{ gloss: 'a mounted soldier serving under a feudal lord', pos: 'n' }],
    });
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['gravity', 'spiritual'], // shares nothing with the gloss
    });

    expect(evaluate(drafts).eliminated).toContain('h_sense_by_gloss_overlap');
  });

  it('eliminates it on a tie — a tie is not a disambiguation', () => {
    const adapter = fakeAdapter({
      senses: [
        { gloss: 'darkness and shadow', pos: 'n' },
        { gloss: 'shadow and darkness', pos: 'n' },
      ],
    });
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'night',
      queryTokens: ['darkness', 'shadow'],
    });

    expect(evaluate(drafts).eliminated).toContain('h_sense_by_gloss_overlap');
  });

  it('KNIGHT/NIGHT: eliminates the hypothesis when the winner is a phonetic twin', () => {
    // The harness measures phonotopographic similarity between headToken and the
    // winning lemma. tq-phoneme-v2 gives knight and night identical vectors, so a
    // sense channel drifting onto sound gets caught here rather than shipping a
    // homophone as meaning.
    const adapter = {
      __unsafe: { connected: true },
      lookupWord: () => [{ headword: 'night', pos: 'n', senses: [{ gloss: 'hours of darkness', pos: 'n' }] }],
      extractGloss: ([s]) => s?.gloss || '',
      lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
      lookupAntonyms: () => [],
    };
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['darkness', 'hours'],
    });

    const phon = drafts.find((d) => d.observationId === 'obs.phon.neighbours');
    expect(phon.status).toBe('observed');
    // The collision is real, not stipulated by the test.
    expect(phon.result.winner.crossLemmaCosine).toBeGreaterThanOrEqual(0.99);
    expect(evaluate(drafts).eliminated).toContain('h_sense_by_gloss_overlap');
  });

  it('REGRESSION: self-similarity must not fire the homophone falsifier', () => {
    /**
     * The winning sense normally belongs to the queried word, so its lemma IS the
     * head token and phonotopographicSimilarity returns 1.0. The first version of
     * the harness measured that, which fired f_homophone_capture on every query
     * and eliminated the sense hypothesis unconditionally — a falsifier that
     * always fires is as useless as one that never does.
     */
    const adapter = fakeAdapter({
      senses: [{ gloss: 'a mounted soldier serving under a feudal lord', pos: 'n' }],
    });
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['feudal', 'mounted', 'lord'],
    });

    const phon = drafts.find((d) => d.observationId === 'obs.phon.neighbours');
    expect(phon.result.winner.sameLemma).toBe(true);
    expect(phon.result.winner.crossLemmaCosine).toBe(0);
    expect(evaluate(drafts).eliminated).not.toContain('h_sense_by_gloss_overlap');
  });

  it('eliminates the near-kin hypothesis when the graph yields no edges', () => {
    const adapter = fakeAdapter({ senses: [{ gloss: 'a mounted soldier', pos: 'n' }] });
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['mounted', 'soldier'],
    });

    expect(evaluate(drafts).eliminated).toContain('h_near_kin_by_edge');
  });

  it('supports the sense hypothesis when the evidence genuinely separates', () => {
    const adapter = fakeAdapter({
      senses: [
        { gloss: 'a mounted soldier serving under a feudal lord', pos: 'n' },
        { gloss: 'the period of darkness between sunset and sunrise', pos: 'n' },
      ],
      related: { broader: [{ lemma: 'soldier' }], akin: [{ lemma: 'cavalier' }] },
    });
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: adapter,
      headToken: 'knight',
      queryTokens: ['feudal', 'mounted', 'lord'],
    });

    const evaluation = evaluate(drafts);
    expect(evaluation.eliminated).not.toContain('h_sense_by_gloss_overlap');
    expect(evaluation.eliminated).not.toContain('h_near_kin_by_edge');
  });

  it('a DB outage never eliminates a hypothesis — tool failure is not refutation', () => {
    const drafts = collectSenseProbeDrafts({
      lexiconAdapter: fakeAdapter({ connected: false }),
      headToken: 'knight',
      queryTokens: ['feudal'],
    });

    expect(evaluate(drafts).eliminated).toEqual([]);
  });
});
