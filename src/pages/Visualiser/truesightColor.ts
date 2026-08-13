import { PhonemeEngine, generateSchoolColor } from '../../lib/engine.adapter.js';

// Color hygiene: function words stay neutral so colour marks meaning, not noise.
export const VISUALISER_FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'than',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'it', 'its', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had', 'done',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as',
  'not', 'no', 'so', 'too', 'very', 'just', 'can', 'could', 'would', 'should',
  'will', 'shall', 'might', 'may', 'must', 'across', 'against', 'among', 'around',
  'before', 'behind', 'below', 'beside', 'between', 'beyond', 'during', 'over', 'under', 'until', 'etc'
]);

export function cleanVisualiserWord(word: string): string {
  return String(word || '').replace(/[^A-Za-z]/g, '');
}

// Defensive: a G2P misfire can produce a non-string `vowelFamily` (undefined,
// number, NaN-poisoned). The school resolver expects a string key, so we
// coerce and fall through to VOID if anything looks unsafe. This is the
// Prion #3 fix — G2P controls hue, not gate, and a bad hue must not become
// a bad "should this be colored at all?" signal.
function safeVowelFamily(raw: any): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.toLowerCase() === 'nan' || /^[\d.]+$/.test(trimmed)) return null;
  return trimmed;
}

function safeSchoolForFamily(engine: any, family: string | null): string {
  if (!family) return 'VOID';
  const resolved = engine?.getSchoolFromVowelFamily?.(family);
  if (typeof resolved === 'string' && resolved.length > 0) return resolved;
  return 'VOID';
}

/**
 * The family a word RHYMES on, taken from its rhymeKey.
 *
 * Truesight colour exists to make rhyme groups visible, and a word rhymes on its
 * FINAL syllable, not its loudest one. Keying hue off the stressed vowel broke
 * exactly the words the feature is for: "broadband" (B R AO1 D B AE2 N D) is
 * stressed AO but rhymes on AE, so it rendered DIVINATION-yellow while its own
 * perfect rhymes — hand, land, bland, command, demand — rendered WILL-red. The
 * rhyme was found, scored 1.0, and then painted out of its own group.
 *
 * rhymeKey is "<terminalFamily>-<coda>" ("AE-ND", "OW-LD", "AY-open"), so the
 * prefix is the family the rhyme is actually built on. Stress may season a word
 * (weight, glow, emphasis) but it does not get to choose the hue.
 */
function familyFromRhymeKey(rhymeKey: any): string | null {
  if (typeof rhymeKey !== 'string') return null;
  const prefix = rhymeKey.split('-')[0];
  return safeVowelFamily(prefix);
}

/** Truesight: a content word's RHYMING vowel family -> school -> colour.
 * Same law as tokenTruesight — hue groups rhymes, so it comes from the terminal
 * family, and the stressed family is only the fallback. If this path used a
 * different rule, a word would change colour depending on whether the server
 * analysis had landed yet.
 * School resolution goes through the engine's own resolver, which normalizes
 * alias families (OO -> UH, YUW -> UW, ...) before the school lookup — a raw
 * map hit would silently disagree with every normalized consumer. */
export function wordTruesight(word: string): { color: string; school: string; analysis: any } | null {
  const clean = cleanVisualiserWord(word);
  if (!clean) return null;
  if (VISUALISER_FUNCTION_WORDS.has(clean.toLowerCase())) return null;
  // Contractions: "I'm" → stem "i", "you're" → stem "you", etc.
  const apostrophe = String(word || '').indexOf("'");
  if (apostrophe > 0) {
    const stem = word.slice(0, apostrophe).replace(/[^A-Za-z]/g, '').toLowerCase();
    if (stem && VISUALISER_FUNCTION_WORDS.has(stem)) return null;
  }
  const engine = PhonemeEngine as {
    getAnalysisDeep?: (w: string) => any | null;
    getSchoolFromVowelFamily?: (f: string) => string | null;
  };
  const analysis = engine.getAnalysisDeep?.(clean) || null;
  const family = familyFromRhymeKey(analysis?.rhymeKey)
    || safeVowelFamily(analysis?.vowelFamily);
  const school = safeSchoolForFamily(engine, family);
  return { color: generateSchoolColor(school), school, analysis };
}

export type TokenTruesightOptions = {
  /**
   * When false (COLOR_DRAGON / gated Scribe+Visualiser path), refuse to invent
   * a vowel family via client G2P. Missing/malformed backend fields → VOID.
   * Default true preserves the Prion #3 safety net for ungated callers.
   */
  allowFrontendFallback?: boolean;
};

export function tokenTruesight(
  tokenData: any,
  fallbackWord: string,
  opts: TokenTruesightOptions = {},
): { color: string; school: string; analysis: any } | null {
  const clean = cleanVisualiserWord(fallbackWord);
  if (!clean) return null;
  // Let the backend decide what gets colored based on resonantCharStarts;
  // we do not ban VISUALISER_FUNCTION_WORDS here. If the backend gate allows a function word, it deserves color!
  const engine = PhonemeEngine as {
    getSchoolFromVowelFamily?: (f: string) => string | null;
    getAnalysisDeep?: (w: string) => any | null;
  };

  // Hue follows the RHYME, not the stress (see familyFromRhymeKey). The backend
  // supplies rhymeKey on every wordAnalysis; `rhymeFamily` is honoured first in
  // case a producer ever sends it directly. vowelFamily — the stressed family —
  // is only a last resort, for a token whose rhyme could not be resolved at all.
  //
  // The safe-guard chain is critical: if the upstream fields are malformed we
  // fall through to the live engine (unless allowFrontendFallback:false — gene
  // BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK), and if that also fails we land
  // on VOID. We never let a misfire become a NaN/Infinity-poisoned color.
  //
  // The live G2P pass is LAZY: in the common server-analyzed case the backend
  // family is present and usable, so we never run analyzeDeep at all. Computing
  // it eagerly (and discarding it) was a full G2P pass wasted per resonant word.
  const allowFrontendFallback = opts.allowFrontendFallback !== false;
  const backendFamily = safeVowelFamily(tokenData?.rhymeFamily)
    || familyFromRhymeKey(tokenData?.rhymeKey)
    || safeVowelFamily(tokenData?.vowelFamily);
  let family = backendFamily;
  if (!family && allowFrontendFallback) {
    family = familyFromRhymeKey(engine.getAnalysisDeep?.(clean)?.rhymeKey)
      || safeVowelFamily(engine.getAnalysisDeep?.(clean)?.vowelFamily);
  }
  const school = safeSchoolForFamily(engine, family);
  return { color: generateSchoolColor(school), school, analysis: tokenData || null };
}
