/**
 * BEHAVIOURAL FINGERPRINT — ask the program, not the test runner.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 *
 * The perturbation probe spent ~9 seconds per mutation because it asked vitest,
 * and vitest cold-starts a process, transforms modules and builds a jsdom
 * environment before it runs a single assertion. Measured on this repo: 84s of
 * wall time carrying 214s of environment construction against 132s of actual
 * test execution.
 *
 * But a test run answers TWO questions at once, and only one of them is
 * expensive:
 *
 *     did the behaviour change?     cheap  — call the functions and look
 *     did anyone NOTICE?            costly — needs the suites
 *
 * A mutation whose behaviour does not change cannot be noticed by any test, so
 * it never has to be paid for. This module answers the cheap question, in
 * process, by re-importing the mutated module under a cache-busting URL and
 * running a frozen corpus through it. Siblings (the CMU dictionary especially)
 * resolve without the query string and stay cached, so the dictionary loads once
 * for the whole run rather than once per mutation.
 *
 * ─── EQUALITY IS EXACT; QUANTIZATION ONLY RANKS ─────────────────────────────
 *
 * `changed` is decided by an exact per-word hash. TurboQuant is used ONLY to
 * score how far the behaviour moved, never to decide whether it moved.
 *
 * That line is not fastidiousness. The first version of this whole idea was a
 * similarity score over code text, and similarity cannot separate a thing from
 * its opposite when both are written in the same words — it ranked a correct
 * rethrow at 42.4% and a swallowed catch at 0.1%. The moment a threshold on
 * resemblance decides a verdict, that failure is back. A hash has no opinion.
 *
 * ─── WHAT THE MAGNITUDE BUYS ────────────────────────────────────────────────
 *
 * The probe's old `depth` was execution count: how often a line ran. That
 * cannot tell a mutation that corrupts 40% of all pronunciations from one that
 * shifts a single rare word — both may run 40,000 times. Divergence answers the
 * question that actually matters: how much damage went unnoticed.
 */

import { createHash } from 'node:crypto';

/**
 * A frozen corpus. Deterministic and ordered, because the fingerprint is a
 * positional vector — a corpus that changed between baseline and mutation would
 * report a difference that came from the corpus, not the code.
 *
 * Words are chosen to exercise distinct machinery rather than to be
 * representative English: irregular stress, silent letters, heteronyms, clusters
 * the letter-guesser gets wrong, and words absent from any dictionary.
 */
export const CORPUS = Object.freeze([
  'silence', 'luminous', 'shadow', 'colonel', 'thorough', 'record', 'orange',
  'rhythm', 'strength', 'knight', 'night', 'through', 'though', 'tough',
  'beautiful', 'adventure', 'remember', 'mystical', 'generation', 'university',
  'fire', 'liar', 'higher', 'choir', 'quire', 'hour', 'our', 'power',
  'water', 'daughter', 'laughter', 'slaughter', 'brought', 'bought',
  'machine', 'machinery', 'mechanic', 'mechanism', 'chaos', 'chasm',
  'psalm', 'salmon', 'almond', 'palm', 'calm', 'balm',
  'business', 'busy', 'buried', 'bury', 'berry', 'very', 'vary',
  'desert', 'dessert', 'present', 'produce', 'content', 'object', 'subject',
  'read', 'lead', 'tear', 'wind', 'bow', 'row', 'sow', 'live',
  'zzqxwv', 'blorptangle', 'xyzzyphon', 'grimthorne',
  'the', 'a', 'and', 'of', 'to', 'in', 'is', 'it',
]);

/**
 * Word PAIRS, because half this module is pairwise.
 *
 * A harness that only calls `analyzeWord` reports the entire coda-slant table
 * and every rhyme-scoring path as behaviourally inert — they are reached only
 * through `scoreMultiSyllableMatch`. That is not a finding about the code, it is
 * a finding about the harness, and it is the same error as judging a site by a
 * test suite that never executes it. Whatever the harness does not call, it must
 * not be allowed to call dead.
 */
export const PAIRS = Object.freeze([
  ['night', 'light'], ['fire', 'higher'], ['time', 'rhyme'], ['orange', 'door hinge'],
  ['silence', 'violence'], ['water', 'daughter'], ['machine', 'routine'],
  ['strength', 'length'], ['mind', 'mine'], ['hand', 'hen'], ['cats', 'cat'],
  ['walked', 'walk'], ['sing', 'sink'], ['bomb', 'bop'], ['pass', 'past'],
  ['colonel', 'kernel'], ['knight', 'night'], ['zzqxwv', 'blorptangle'],
]);

/** Deterministic 32-bit hash of a value's canonical JSON form. */
function hashValue(value) {
  return createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

/**
 * Turns one analysis into numbers, positionally and deterministically.
 *
 * Strings become their hash mapped into [0,1) rather than an index into a table:
 * a table would have to be built from observed values, and a mutation that
 * produced a NEW value would silently extend it, making the vector's meaning
 * depend on the mutation it is supposed to be measuring.
 */
function encodeAnalysis(analysis) {
  if (!analysis) return [0, 0, 0, 0, 0];
  const hashUnit = (text) => {
    const digest = createHash('sha1').update(String(text ?? '')).digest();
    return digest.readUInt32BE(0) / 0xffffffff;
  };
  return [
    Number(analysis.syllableCount ?? 0),
    hashUnit(analysis.vowelFamily),
    hashUnit(analysis.rhymeKey),
    hashUnit((analysis.phonemes ?? []).join(' ')),
    hashUnit(analysis.coda),
  ];
}

/**
 * Runs the corpus through a freshly imported module and returns its fingerprint.
 *
 * `moduleUrl` must carry a cache-busting query for every call after the first,
 * or Node hands back the previously imported (unmutated) module and every
 * mutation reads as behaviourally inert — a probe that would report the whole
 * file as dead code.
 */
export async function fingerprint(moduleUrl, corpus = CORPUS) {
  const module = await import(moduleUrl);
  const engine = module.PhonemeEngine;
  if (!engine) throw new Error(`${moduleUrl} exports no PhonemeEngine`);
  await engine.ensureInitialized();

  const perWord = [];
  const vector = [];
  for (const word of corpus) {
    let analysis = null;
    let deep = null;
    // A mutation that makes the engine THROW is a behavioural change, not a
    // crashed experiment; recording the error shape keeps it in the vector
    // instead of aborting the run.
    try {
      analysis = engine.analyzeWord(word);
    } catch (error) {
      analysis = { threw: error.constructor.name };
    }
    try {
      deep = engine.analyzeDeep(word);
    } catch (error) {
      deep = { threw: error.constructor.name };
    }

    // The DIAGNOSTICS surface — found by a false inert at line 249, which lives
    // in `createPhoneticDiagnostics`. Reading only `analyzeWord` hides every
    // field that explains WHERE an answer came from (source, branch,
    // fallbackPath), and those fields are the repo's defence against a guess
    // wearing the dictionary's badge. A harness blind to them would call the
    // entire provenance layer inert.
    let diagnostics = null;
    try {
      const detailed = engine.analyzeWordWithDiagnostics(word);
      diagnostics = {
        source: detailed?.diagnostics?.source ?? null,
        branch: detailed?.diagnostics?.branch ?? null,
        fallbackPath: detailed?.diagnostics?.fallbackPath ?? null,
        authoritySource: detailed?.diagnostics?.authoritySource ?? null,
        usedAuthorityCache: detailed?.diagnostics?.usedAuthorityCache ?? null,
        unknownReason: detailed?.diagnostics?.unknownReason ?? null,
      };
    } catch (error) {
      diagnostics = { threw: error.constructor.name };
    }

    perWord.push(hashValue([analysis, deep?.syllables?.length ?? null, deep?.rhymeKey ?? null, diagnostics]));
    vector.push(...encodeAnalysis(analysis), Number(deep?.syllables?.length ?? 0));
  }

  // The pairwise surface: rhyme scoring, coda mutation, extended rhyme keys.
  const labels = corpus.map(word => `word:${word}`);
  for (const [left, right] of PAIRS) {
    let probe = null;
    try {
      const a = engine.analyzeDeep(left);
      const b = engine.analyzeDeep(right);
      probe = {
        match: engine.scoreMultiSyllableMatch(a, b),
        coda: engine.checkCodaMutation(a?.coda, b?.coda),
        keysA: engine.getExtendedRhymeKeys(a?.syllables ?? []),
        stressA: a?.syllables ? engine.getStressPattern(a.syllables) : null,
        rarityA: engine.calculateRarity(left, a?.phonemes ?? []),
      };
    } catch (error) {
      probe = { threw: error.constructor.name };
    }
    perWord.push(hashValue(probe));
    labels.push(`pair:${left}/${right}`);
    vector.push(
      Number(probe?.match?.score ?? 0),
      Number(probe?.match?.syllablesMatched ?? 0),
      probe?.coda ? 1 : 0,
    );
  }

  // THE AUTHORITY SURFACE — found by a failed prediction, not by design.
  //
  // The first version of this harness called only `analyzeWord`/`analyzeDeep`
  // and reported line 268 as behaviourally inert. vitest disagreed: inverting
  // that guard fails a test. Line 268 lives in `normalizeAuthorityBatchPayload`,
  // reached only when a dictionary override is applied — a subsystem the harness
  // never entered. `ensureAuthorityBatch` takes an injectable API, so a fake
  // drives it with no network and no nondeterminism.
  //
  // The general lesson is the one this probe keeps re-learning: a surface the
  // harness does not call must never be reported as a surface that does nothing.
  const overrides = ['orange', 'silence', 'zzqxwv'];
  const fakeDictionaryApi = {
    lookupBatch: async (words) => ({
      families: Object.fromEntries(
        words.map((word, index) => [word, index % 2 === 0
          ? { family: 'AY', phonemes: ['F', 'AY1', 'K'] }
          : 'EY']),                        // the string arm of the normalizer
      ),
    }),
  };
  try {
    await engine.ensureAuthorityBatch(overrides, fakeDictionaryApi);

    // THE STALE-MEMO PATH, in the order that actually breaks it. Analysing a
    // word FIRST fills WORD_CACHE from spelling; the authority arriving second
    // must evict that memo or the guess survives forever — the "bold stays
    // B AA1 L D" bug named in setAuthority's own docblock. Calling setAuthority
    // on a cold cache never exercises the eviction, which is why a false inert
    // appeared at line 458.
    engine.analyzeWord('bold');
    const accepted = engine.setAuthority('bold', { family: 'OW', phonemes: ['B', 'OW1', 'L', 'D'] });
    const refusedEmpty = engine.setAuthority('bold', {});
    const refusedBlank = engine.setAuthority('', { family: 'OW' });
    perWord.push(hashValue({ accepted, refusedEmpty, refusedBlank, after: engine.analyzeWord('bold') }));
    labels.push('authority:eviction/bold');

    engine.setAuthority('thorough', { family: 'OW', phonemes: ['TH', 'OW1'] });
  } catch (error) {
    perWord.push(hashValue({ authorityThrew: error.constructor.name }));
    labels.push('authority:setup');
  }
  for (const word of [...overrides, 'thorough']) {
    let after = null;
    try {
      after = engine.analyzeWord(word);
    } catch (error) {
      after = { threw: error.constructor.name };
    }
    perWord.push(hashValue(after));
    labels.push(`authority:${word}`);
    vector.push(...encodeAnalysis(after));
  }

  return { perWord, labels, vector: Float32Array.from(vector), corpusSize: perWord.length };
}

/**
 * Compares two fingerprints.
 *
 * `changed` counts words whose EXACT hash differs — no threshold, no distance.
 * `divergence` is that count as a fraction, which is the number a human can act
 * on: "this mutation changed the answer for 37% of the corpus and no test
 * failed."
 */
export function compare(baseline, mutated) {
  let changed = 0;
  const examples = [];
  for (let index = 0; index < baseline.perWord.length; index += 1) {
    if (baseline.perWord[index] !== mutated.perWord[index]) {
      changed += 1;
      if (examples.length < 5) examples.push(baseline.labels?.[index] ?? `#${index}`);
    }
  }
  return {
    moved: changed > 0,
    changed,
    total: baseline.perWord.length,
    divergence: changed / Math.max(1, baseline.perWord.length),
    examples,
  };
}
