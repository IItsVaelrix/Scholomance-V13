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

/** Truesight: a content word's dominant vowel family -> school -> colour.
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
    analyzeDeep?: (w: string) => any | null;
    getSchoolFromVowelFamily?: (f: string) => string | null;
  };
  const analysis = engine.analyzeDeep?.(clean) || null;
  const family = safeVowelFamily(analysis?.vowelFamily);
  const school = safeSchoolForFamily(engine, family);
  return { color: generateSchoolColor(school), school, analysis };
}

export function tokenTruesight(tokenData: any, fallbackWord: string): { color: string; school: string; analysis: any } | null {
  const clean = cleanVisualiserWord(fallbackWord);
  if (!clean) return null;
  // Let the backend decide what gets colored based on resonantCharStarts;
  // we do not ban VISUALISER_FUNCTION_WORDS here. If the backend gate allows a function word, it deserves color!
  const engine = PhonemeEngine as {
    getSchoolFromVowelFamily?: (f: string) => string | null;
    analyzeDeep?: (w: string) => any | null;
  };

  // Use the exact vowelFamily from the backend's syntax analysis if available.
  // The safe-guard chain is critical here: if the upstream `tokenData.vowelFamily`
  // is malformed, we fall through to the live engine, and if that also fails we
  // land on VOID. We never let a misfire become a NaN/Infinity-poisoned color.
  const liveAnalysis = engine.analyzeDeep?.(clean) || null;
  const family = safeVowelFamily(tokenData?.vowelFamily)
    || safeVowelFamily(tokenData?.rhymeFamily)
    || safeVowelFamily(liveAnalysis?.vowelFamily);
  const school = safeSchoolForFamily(engine, family);
  return { color: generateSchoolColor(school), school, analysis: tokenData || null };
}
