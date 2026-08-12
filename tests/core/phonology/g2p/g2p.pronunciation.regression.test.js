// @vitest-environment node
/**
 * G2P PRONUNCIATION REGRESSION — the guard that did not exist.
 * ========================================================================
 * THIS FILE MUST RUN IN THE NODE ENVIRONMENT. Do not remove the docblock above.
 *
 * `vite.config.js` sets `environment: 'jsdom'` for the suite, and
 * `cmu.phoneme.engine.js` guards its loader with
 * `const isBrowser = typeof window !== "undefined"` — so under jsdom
 * `CmuPhonemeEngine.init()` returns false WITHOUT READING THE DICTIONARY, and
 * `loadCmuEntries()` swallows that into an empty array.
 *
 * With no dictionary the compound and substring generators produce nothing,
 * rule-based letter guesses win by default, and the PHONOTACTIC juror — the
 * only one that reads its input — is constructed with `[]` and degrades to a
 * constant like the other four. Measured 2026-08-12: every phonology test was
 * passing against that degraded path, never against the real pipeline.
 *
 * Measured 2026-08-12: a one-line change to `generateCandidates` altered the
 * pronunciation of 88% of sampled words — HOUSE became `AH0 M Y UW1 Z`,
 * BUILDER became `AH0 D AH1 L T ER0 IY0` — and ALL 77 phonology tests still
 * passed. The existing juror tests assert `isValidVote(vote)`, and a constant
 * is a valid vote, so the suite could not tell a working pipeline from one
 * emitting "adultery" for BUILDER.
 *
 * That is a check that cannot fail. These are the two checks that can.
 *
 *   1. GOLDEN OUTPUT — known words, pinned to CMU truth, through the WHOLE
 *      pipeline including the jury. Catches any change to candidate
 *      generation, ranking, juror weighting or aggregation that moves a
 *      pronunciation.
 *
 *   2. JUROR DISCRIMINATION — a characterisation of what the jurors actually
 *      do today. Three of them return a byte-identical vote for every input.
 *      That is recorded here so it cannot change silently in either direction.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runG2PJury } from '../../../../codex/core/phonology/g2p/g2p.adapter.js';
import { CmuPhonemeEngine } from '../../../../codex/core/phonology/cmu.phoneme.engine.js';
import {
  createPhonotacticJuror,
  createSyntacticJuror,
  createSemanticJuror,
  createGraphJuror,
  createHHMJuror,
} from '../../../../codex/core/phonology/g2p/jurors/index.js';

/**
 * Verified against `CmuPhonemeEngine._entriesByWord` on 2026-08-12. These are
 * dictionary truth, not the pipeline's opinion of it — the point of the test is
 * that the pipeline must keep agreeing with the dictionary.
 */
const GOLDEN = Object.freeze([
  ['HOUSE', 'HH AW1 S'],
  ['RENDER', 'R EH1 N D ER0'],
  ['MARKET', 'M AA1 R K AH0 T'],
  ['SCANNER', 'S K AE1 N ER0'],
  ['BUILDER', 'B IH1 L D ER0'],
]);

describe('G2P pronunciation regression (golden output)', () => {
  for (const [word, expected] of GOLDEN) {
    it(`${word} resolves to CMU truth through the full jury pipeline`, async () => {
      const { verdict } = await runG2PJury(word);
      const winner = verdict?.winner?.phonemes?.join(' ') ?? null;
      expect(winner).toBe(expected);
    });
  }

  it('a dictionary word is never out-voted into an unrelated pronunciation', async () => {
    // The specific failure this pins: the jury overriding an exact compound
    // decomposition with a phonotactically-plausible but semantically unrelated
    // retrieval. HOUSE -> "amuse" is the observed shape of that bug.
    const { verdict } = await runG2PJury('HOUSE');
    const winner = verdict?.winner?.phonemes?.join(' ') ?? '';
    expect(winner).not.toContain('Y UW1 Z');
    expect(winner.split(' ')).toHaveLength(3);
  });

  it('is deterministic across repeated runs', async () => {
    const runs = await Promise.all([0, 1, 2].map(() => runG2PJury('BUILDER')));
    const winners = runs.map((r) => r.verdict?.winner?.phonemes?.join(' '));
    expect(new Set(winners).size).toBe(1);
  });
});

describe('G2P juror discrimination (characterisation, not endorsement)', () => {
  // Two candidates that differ in every respect. A juror that reads its input
  // must score them differently on SOME axis.
  const CANDIDATE_A = Object.freeze({
    word: 'HOUSE', phonemes: ['HH', 'AW1', 'S'], source: 'compound', generatedBy: 'compound-v1', confidence: 1,
  });
  const CANDIDATE_B = Object.freeze({
    word: 'HOUSE', phonemes: ['AH0', 'M', 'Y', 'UW1', 'Z'], source: 'vector-nn', generatedBy: 'nn-v1', confidence: 0.4,
  });
  const CTX = Object.freeze({ role: 'content', stressRole: 'primary' });
  const NUMERIC = Object.freeze(['confidence', 'tokenWeight', 'stageSignal', 'syntaxModifier']);

  const fingerprint = (vote) => NUMERIC.map((f) => Number(vote[f]).toFixed(6)).join('|');

  /**
   * The real dictionary, not `[]`. Constructing PHONOTACTIC with an empty
   * corpus makes it a constant too, which would hide the one juror that works.
   */
  let cmuEntries = [];
  beforeAll(async () => {
    if (!CmuPhonemeEngine._available) await CmuPhonemeEngine.init();
    cmuEntries = Array.from(CmuPhonemeEngine._entriesByWord.entries());
    expect(cmuEntries.length).toBeGreaterThan(100000);
  });

  it('PHONOTACTIC reads its input and scores the two candidates differently', () => {
    const juror = createPhonotacticJuror(cmuEntries);
    const a = juror.vote(CANDIDATE_A, CTX);
    const b = juror.vote(CANDIDATE_B, CTX);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  /**
   * RECORDED DEFECT, 2026-08-12. These three jurors emit an identical vote for
   * every candidate of every word — measured over 200 words and 4,100 votes,
   * one distinct value on all four numeric axes. They hold 0.55 of the jury's
   * weight (SEMANTIC 0.20 + GRAPH 0.20 + HHM 0.15) and contribute no judgement.
   *
   * This asserts what they DO, not what they SHOULD do, so that implementing
   * any of them breaks this test and forces the author to delete the entry
   * deliberately rather than leaving a stub indistinguishable from a juror.
   *
   * It also explains why the veto added on 2026-08-07 has never fired: a
   * constant has nothing to object to.
   */
  const KNOWN_CONSTANT_JURORS = Object.freeze([
    ['SEMANTIC', createSemanticJuror],
    ['GRAPH', () => createGraphJuror(null)],
    ['HHM', createHHMJuror],
  ]);

  for (const [name, make] of KNOWN_CONSTANT_JURORS) {
    it(`${name} is currently a STUB — identical vote for unlike candidates`, () => {
      const juror = make();
      const a = juror.vote(CANDIDATE_A, CTX);
      const b = juror.vote(CANDIDATE_B, CTX);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(fingerprint(a)).toBe(fingerprint(b));
    });
  }

  it('SYNTACTIC keys on context rather than on the candidate', () => {
    const juror = createSyntacticJuror();
    // Same context, unlike candidates -> no discrimination.
    expect(fingerprint(juror.vote(CANDIDATE_A, CTX)))
      .toBe(fingerprint(juror.vote(CANDIDATE_B, CTX)));
    // Different context, same candidate -> it does move.
    const functionWord = juror.vote(CANDIDATE_A, { role: 'function', stressRole: 'none' });
    expect(fingerprint(juror.vote(CANDIDATE_A, CTX))).not.toBe(fingerprint(functionWord));
  });

  it('at most one juror in five can separate two candidates', () => {
    const jurors = [
      createPhonotacticJuror(cmuEntries),
      createSyntacticJuror(),
      createSemanticJuror(),
      createGraphJuror(null),
      createHHMJuror(),
    ];
    const discriminating = jurors.filter((j) => {
      const a = j.vote(CANDIDATE_A, CTX);
      const b = j.vote(CANDIDATE_B, CTX);
      return a && b && fingerprint(a) !== fingerprint(b);
    });
    // Raise this number when a juror is genuinely implemented. Lowering it
    // means a working juror was replaced by a stub.
    expect(discriminating).toHaveLength(1);
  });
});
