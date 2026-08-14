// @vitest-environment node
/**
 * THE COLOR DRAGON, CLOSED.
 *
 * ─── WHY THE DOCBLOCK ABOVE IS LOAD-BEARING ─────────────────────────────────
 *
 * This file MUST run in node. The repository's default vitest environment is
 * jsdom, which defines `window` — and `cmu.phoneme.engine.js` refuses to load
 * the dictionary whenever `window` is defined. Without that directive, even the
 * SERVER route test gets browser behaviour: `canonical` comes back false and the
 * assertion that the endpoint serves dictionary truth fails.
 *
 * That is not a quirk of the harness. It is the defect reproducing itself inside
 * its own regression test, which is exactly how it survived undetected: a suite
 * running under jsdom exercises the broken branch and then agrees with itself.
 *
 * The browser had no pronunciation dictionary — `cmu.phoneme.engine.js` returns
 * `false` from `init()` whenever `window` is defined — so UI code that called
 * `analyzeWord` derived phonemes by splitting letters while the server used the
 * real dictionary. Measured 2026-08-13:
 *
 *     SILENCE   server  S AY1 L AH0 N S    browser  S IH0 L EH1 N K
 *
 * These tests hold the seam that ends it: the server answers, the UI transports
 * and caches, and a miss is NULL rather than a fabrication.
 *
 * THE HARDEST ASSERTION HERE IS THE FIRST ONE. Under jsdom `window` is defined,
 * so a test suite naturally exercises the broken branch and agrees with itself —
 * that is precisely why this went undetected. A test that only checked "some
 * analysis comes back" would pass on the guess.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import Fastify from 'fastify';
import {
  createPhonologyTransport,
  primePhonology,
  phonologyStatus,
  normalizeWord,
  __resetPhonologyTransport,
} from '../../../src/lib/phonology.transport.js';
import { phonologyRoutes } from '../../../codex/server/routes/phonology.routes.js';
import { PhonemeEngine } from '../../../codex/core/phonology/phoneme.engine.js';

const WORDS = ['SILENCE', 'LUMINOUS', 'SHADOW', 'WOUND'];

/** The server's own answers, which are the truth this seam must carry. */
function serverAnalyses(words) {
  const out = {};
  for (const word of words) {
    const detailed = PhonemeEngine._resolveWordAnalysisDetailed(word);
    out[word] = {
      word,
      phonemes: detailed?.analysis?.phonemes ?? [],
      vowelFamily: detailed?.analysis?.vowelFamily ?? null,
      source: detailed?.diagnostics?.source ?? 'unknown',
      canonical: ['cmu_dictionary', 'word_override'].includes(detailed?.diagnostics?.source),
    };
  }
  return out;
}

const fetchServing = payload => async () => ({ ok: true, json: async () => payload });

describe('phonology transport', () => {
  beforeEach(() => __resetPhonologyTransport());

  it('returns NULL for an unprimed word instead of guessing', () => {
    // The entire defect in one assertion. A plausible fabrication here is what
    // let the UI colour words by letter-splitting for as long as it did.
    const ui = createPhonologyTransport(PhonemeEngine, { isBrowser: true });
    expect(ui.getAnalysis('SILENCE')).toBeNull();
    expect(ui.getAnalysisDeep('SILENCE')).toBeNull();
  });

  it('serves exactly what the server computed, once primed', async () => {
    const analyses = serverAnalyses(WORDS);
    const ui = createPhonologyTransport(PhonemeEngine, { isBrowser: true });
    await primePhonology(WORDS, { fetch: fetchServing({ analyses, dictionaryAvailable: true }) });

    for (const word of WORDS) {
      expect(ui.getAnalysis(word).phonemes, `${word} diverged from the server`)
        .toEqual(analyses[word].phonemes);
      expect(ui.getAnalysis(word).vowelFamily).toBe(analyses[word].vowelFamily);
    }
  });

  it('carries the canonical flag, so a guess is never mistaken for the dictionary', async () => {
    const analyses = {
      REAL: { word: 'REAL', phonemes: ['R', 'IY1', 'L'], vowelFamily: 'IY', source: 'cmu_dictionary', canonical: true },
      ZZQX: { word: 'ZZQX', phonemes: ['Z', 'Z', 'K', 'S'], vowelFamily: 'AH', source: 'heuristic_fallback', canonical: false },
    };
    const ui = createPhonologyTransport(PhonemeEngine, { isBrowser: true });
    await primePhonology(['REAL', 'ZZQX'], { fetch: fetchServing({ analyses }) });

    expect(ui.isCanonical('REAL')).toBe(true);
    expect(ui.isCanonical('ZZQX')).toBe(false);
  });

  it('reports a failed prime instead of silently serving nothing', async () => {
    const ui = createPhonologyTransport(PhonemeEngine, { isBrowser: true });
    const primed = await primePhonology(['SILENCE'], { fetch: async () => ({ ok: false, status: 503 }) });

    expect(primed).toBe(0);
    expect(ui.getAnalysis('SILENCE')).toBeNull();
    // A blank the UI can explain, rather than one it must invent a story for.
    expect(phonologyStatus().lastError).toContain('503');
  });

  it('does not crash a render path when the network throws', async () => {
    const primed = await primePhonology(['SILENCE'], { fetch: async () => { throw new Error('offline'); } });
    expect(primed).toBe(0);
    expect(phonologyStatus().lastError).toBe('offline');
  });

  it('delegates to the core engine on the server, where the dictionary exists', () => {
    const server = createPhonologyTransport(PhonemeEngine, { isBrowser: false });
    const analysis = server.getAnalysis('SILENCE');
    expect(analysis?.phonemes?.length).toBeGreaterThan(0);
  });

  it('normalizes keys the same way the server does', () => {
    expect(normalizeWord('  Silence, ')).toBe('SILENCE');
    expect(normalizeWord("don't")).toBe('DONT');
  });
});

describe('POST /api/phonology/analyze', () => {
  let app;
  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(phonologyRoutes, { phonemeEngine: PhonemeEngine });
  });

  it('answers with canonical phonemes and names its source', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/phonology/analyze', payload: { words: ['silence', 'Luminous'] },
    });
    expect(response.statusCode).toBe(200);
    const { analyses } = response.json();
    expect(analyses.SILENCE.canonical).toBe(true);
    expect(analyses.SILENCE.source).toBe('cmu_dictionary');
    expect(analyses.SILENCE.phonemes.join(' ')).toBe('S AY1 L AH0 N S');
    await app.close();
  });

  it('marks a rule-based guess as NOT canonical', async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/phonology/analyze', payload: { words: ['zzqxwv'] },
    });
    const { analyses } = response.json();
    expect(analyses.ZZQXWV.source).toBe('heuristic_fallback');
    expect(analyses.ZZQXWV.canonical).toBe(false);
    await app.close();
  });

  it('rejects an empty or oversized request rather than answering partially', async () => {
    const empty = await app.inject({ method: 'POST', url: '/api/phonology/analyze', payload: { words: [] } });
    expect(empty.statusCode).toBe(400);
    const huge = await app.inject({
      method: 'POST', url: '/api/phonology/analyze', payload: { words: Array(300).fill('a') },
    });
    expect(huge.statusCode).toBe(400);
    await app.close();
  });
});

/**
 * EVERY DOOR INTO THE UI, NOT JUST THE ONE I FIXED.
 *
 * The transport was installed in `engine.adapter.js` and the job was called
 * done. `src/lib/codex/textAnalysis.js` went on re-exporting the RAW core engine
 * to five hooks, and the core engine has no `getAnalysis` — so `usePredictor`
 * threw the instant it asked, and every PLS provider it feeds threw with it.
 *
 * Nothing caught it for two reasons worth naming:
 *
 *   1. ARCH-0F0E watches for a derivation VERB being CALLED in `src/`. A
 *      re-export is neither, so the sweep read clean at 1 hit while a ninth
 *      door stood open.
 *   2. Every provider test passed a HAND-WRITTEN double implementing
 *      `analyzeWord`. The providers migrated to `getAnalysis`; the doubles did
 *      not; the suites stayed green against an object production never uses.
 *
 * So these assertions deliberately import the REAL modules. A double cannot
 * answer the question they ask.
 */
describe('the UI cannot reach the raw engine through any door', () => {
  it('hands back the transport, not the core engine, from every import path', async () => {
    const [adapter, textAnalysis, core] = await Promise.all([
      import('../../../src/lib/engine.adapter.js'),
      import('../../../src/lib/codex/textAnalysis.js'),
      import('../../../codex/core/phonology/phoneme.engine.js'),
    ]);

    // The consume verb is the whole contract. Its absence is what threw.
    expect(typeof adapter.PhonemeEngine.getAnalysis).toBe('function');
    expect(typeof textAnalysis.PhonemeEngine.getAnalysis).toBe('function');

    // And the thing that must NOT be what the UI receives.
    expect(core.PhonemeEngine.getAnalysis).toBeUndefined();
    expect(textAnalysis.PhonemeEngine).not.toBe(core.PhonemeEngine);
  });

  it('shares ONE transport, so a primed cache serves every caller', async () => {
    const adapter = await import('../../../src/lib/engine.adapter.js');
    const textAnalysis = await import('../../../src/lib/codex/textAnalysis.js');
    // Two transports would each hold their own cache: `primePhonology` would
    // fill one and the other would answer every browser lookup with a miss —
    // silently, because a miss is a legitimate answer.
    expect(textAnalysis.PhonemeEngine).toBe(adapter.PhonemeEngine);
  });

  it('has no file under src/ re-exporting the core engine', async () => {
    const { execSync } = await import('node:child_process');
    const hits = execSync(
      "git grep -l \"export .*PhonemeEngine.* from .*codex/core/phonology/phoneme.engine\" -- src/ || true",
      { encoding: 'utf8', cwd: process.cwd() },
    ).split('\n').filter(Boolean);
    // `engine.adapter.js` imports the core engine to WRAP it, which is the
    // boundary itself; re-exporting it onward is what reopens the fork.
    expect(hits).toEqual([]);
  });
});
