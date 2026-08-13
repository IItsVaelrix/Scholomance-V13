/**
 * CANONICAL PHONOLOGY, SERVED.
 *
 * The browser has no pronunciation dictionary — `cmu.phoneme.engine.js` returns
 * `false` from `init()` whenever `window` is defined — so a UI that calls
 * `analyzeWord` locally derives phonemes by splitting letters. Measured:
 * SILENCE resolved to `S AY1 L AH0 N S` on the server and `S IH0 L EH1 N K` in
 * the browser, and 3 of 8 sampled words disagreed on the vowel family that
 * drives colour.
 *
 * This is the seam that ends the fork. The server owns the dictionary, so the
 * server answers, and the UI renders what it is told.
 *
 * The response NAMES ITS SOURCE per word — `cmu_dictionary`, `word_override`,
 * `heuristic_fallback` — because a caller must be able to tell canonical truth
 * from a rule-based guess. That distinction is the entire bug: it existed and
 * was not carried across the wire.
 */

import { z } from 'zod';

const CACHE_TTL_MS = 10 * 60 * 1_000;
const CACHE_MAX = 4_000;
const MAX_WORDS = 256;

const bodySchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(MAX_WORDS),
}).strict();

/** Normalized exactly as the engine normalizes, so a cache key cannot drift. */
export function normalizeWord(word) {
  return String(word ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

export async function phonologyRoutes(fastify, opts) {
  const engine = opts.phonemeEngine;
  if (!engine) throw new Error('phonologyRoutes requires a phonemeEngine');
  const cache = new Map();

  if (typeof engine.init === 'function') {
    try {
      await engine.init();
    } catch (error) {
      // A dictionary that will not load is reported, never swallowed: every
      // answer after this would be a heuristic guess wearing a server's badge.
      fastify.log.error({ err: error }, 'phoneme engine init failed; analyses will be degraded');
    }
  }

  fastify.post('/api/phonology/analyze', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'PB-ERR-v1-VALUE',
        message: 'Invalid phonology request.',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code, path: issue.path, message: issue.message,
        })),
      });
    }

    const analyses = {};
    for (const raw of parsed.data.words) {
      const word = normalizeWord(raw);
      if (!word) continue;

      const hit = cache.get(word);
      if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
        analyses[word] = hit.value;
        continue;
      }

      const detailed = typeof engine._resolveWordAnalysisDetailed === 'function'
        ? engine._resolveWordAnalysisDetailed(word)
        : null;
      const analysis = detailed?.analysis ?? (typeof engine.analyzeWord === 'function' ? engine.analyzeWord(word) : null);
      if (!analysis) continue;

      const value = {
        word,
        phonemes: Array.isArray(analysis.phonemes) ? analysis.phonemes : [],
        vowelFamily: analysis.vowelFamily ?? null,
        coda: analysis.coda ?? null,
        rhymeKey: analysis.rhymeKey ?? null,
        syllableCount: analysis.syllableCount ?? null,
        // THE FIELD THAT ENDS THE FORK. A caller that renders a guess as though
        // it were the dictionary is the defect; it cannot do that unknowingly now.
        source: detailed?.diagnostics?.source ?? 'unknown',
        canonical: detailed?.diagnostics?.source === 'cmu_dictionary'
          || detailed?.diagnostics?.source === 'word_override',
      };

      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(word, { cachedAt: Date.now(), value });
      analyses[word] = value;
    }

    return { analyses, dictionaryAvailable: engine.isDictionaryAvailable?.() ?? null };
  });
}

export default phonologyRoutes;
