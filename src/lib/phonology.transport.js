/**
 * PHONOLOGY TRANSPORT — the UI consumes truth, it does not derive it.
 *
 * ─── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 *
 * `engine.adapter.js` used to re-export the core `PhonemeEngine` straight into
 * the browser. But `cmu.phoneme.engine.js` returns `false` from `init()`
 * whenever `window` is defined, so the browser has NO pronunciation dictionary
 * and every call fell through to `splitToPhonemes` letter-guessing. Measured
 * 2026-08-13, same engine, the only difference being the runtime:
 *
 *     SILENCE    server  S AY1 L AH0 N S      browser  S IH0 L EH1 N K
 *     LUMINOUS   server  L UW1 M AH0 N AH0 S  browser  L AH0 M IH1 N AH0 S
 *
 * 3 of 8 sampled words disagreed on the vowel family that drives colour. Eight
 * UI sites derived phonemes this way, and nothing detected it: the tests run
 * under jsdom, where `window` is defined, so the suite exercised the broken
 * branch and agreed with itself.
 *
 * ─── HOW THIS ENDS IT ───────────────────────────────────────────────────────
 *
 * The server owns the dictionary, so the server answers. This transports the
 * answer and caches it. It derives nothing.
 *
 * A MISS IS NAMED, NEVER GUESSED. `analyzeWord` on an unprimed word returns
 * `null` rather than a plausible fabrication, because a caller that cannot tell
 * a guess from the dictionary is the whole defect. Call `primePhonology(words)`
 * before rendering, and read `phonologyStatus()` if you need to explain a blank.
 *
 * On the SERVER this module is inert: the core engine has its dictionary there,
 * so `analyzeWord` delegates straight to it.
 */

const cache = new Map();
let dictionaryAvailable = null;
let lastError = null;

const isBrowser = typeof window !== 'undefined';

/** Normalized exactly as the server normalizes, so keys cannot drift. */
export function normalizeWord(word) {
  return String(word ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Fetch canonical analyses for `words` and cache them.
 *
 * Returns the number of words primed. Failures are reported through
 * `phonologyStatus()` rather than thrown, because a rendering path must not
 * crash on a cold network — but the words stay UNPRIMED, so callers still get
 * `null` rather than a guess.
 */
export async function primePhonology(words, options = {}) {
  const wanted = [...new Set((Array.isArray(words) ? words : [words]).map(normalizeWord).filter(Boolean))]
    .filter((word) => !cache.has(word));
  if (wanted.length === 0) return 0;

  const fetchImpl = options.fetch ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    lastError = 'no fetch implementation available';
    return 0;
  }

  try {
    const response = await fetchImpl('/api/phonology/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: wanted }),
    });
    if (!response.ok) {
      lastError = `phonology endpoint returned ${response.status}`;
      return 0;
    }
    const payload = await response.json();
    dictionaryAvailable = payload?.dictionaryAvailable ?? dictionaryAvailable;
    let primed = 0;
    for (const [word, analysis] of Object.entries(payload?.analyses ?? {})) {
      cache.set(word, analysis);
      primed += 1;
    }
    lastError = null;
    return primed;
  } catch (error) {
    lastError = error?.message ?? String(error);
    return 0;
  }
}

/** What the UI may say about a blank: never "unknown word", which would be a lie. */
export function phonologyStatus() {
  return { primed: cache.size, dictionaryAvailable, lastError };
}

/** Test seam. Not for product code. */
export function __resetPhonologyTransport() {
  cache.clear();
  dictionaryAvailable = null;
  lastError = null;
}

/**
 * Builds the browser-facing engine.
 *
 * `coreEngine` is delegated to only when it genuinely holds a dictionary. In a
 * browser it does not, so the cache is the only source, and a miss is a miss.
 */
export function createPhonologyTransport(coreEngine, options = {}) {
  const browser = options.isBrowser ?? isBrowser;

  const fromCache = (word) => cache.get(normalizeWord(word)) ?? null;

  const analyzeWord = (word) => {
    if (!browser) return coreEngine?.analyzeWord?.(word) ?? null;
    return fromCache(word);
  };

  return {
    ...coreEngine,
    /**
     * THE CONSUME VERB. UI code calls this.
     *
     * `analyzeWord` / `analyzeDeep` are DERIVATION verbs, and innate rule
     * ARCH-0F0E treats a call to one in `src/` as a shadow computation — which
     * it was. Keeping a separate name means the tripwire still catches the next
     * person who reaches for the engine instead of the transport.
     */
    getAnalysis: (word) => (browser ? fromCache(word) : (coreEngine?.analyzeWord?.(word) ?? null)),
    getAnalysisDeep: (word) => (browser ? fromCache(word) : (coreEngine?.analyzeDeep?.(word) ?? null)),
    // IMMUNE_ALLOW: ui-shadow-computation — this file IS the boundary ARCH-0F0E
    // enforces. The legacy verbs are overridden rather than dropped on purpose:
    // `...coreEngine` would otherwise spread the RAW engine's `analyzeWord` back
    // into the browser and re-open the fork for any caller that had not migrated
    // to `getAnalysis`. The derivation below runs only on the server branch,
    // where the dictionary exists.
    analyzeWord,
    analyzeDeep: (word) => (browser ? fromCache(word) : (coreEngine?.analyzeDeep?.(word) ?? null)),
    /** True when the returned analysis came from the dictionary, not a rule. */
    isCanonical: (word) => Boolean(fromCache(word)?.canonical),
    primePhonology,
    phonologyStatus,
  };
}
