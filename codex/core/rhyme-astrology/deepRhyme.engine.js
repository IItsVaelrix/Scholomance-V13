/**
 * Deep Rhyme Analysis Engine
 * Provides document-level rhyme analysis including multi-syllable matching,
 * internal rhymes, and rhyme connections.
 */

import { PhonemeEngine } from "../phonology/phoneme.engine.js";
import { RHYME_TYPES, RHYME_SUBTYPES } from "../constants/data/rhymeScheme.patterns.js";
import { normalizeVowelFamily } from "../phonology/vowelFamily.js";
import { buildRhymeKey, isPerfectRhyme } from "../phonology/rhymeDomain.js";
import { WORD_REGEX_GLOBAL } from "../constants/regex.js";
import { compileVerseToIR } from "../shared/truesight/compiler/compileVerseToIR.js";
import { buildResonanceFingerprint, rhymeBucketKeys, codaClassOf } from './resonanceFingerprint.js';
import { PhoneticSimilarity } from "../phonology/phoneticSimilarity.js";

/**
 * @typedef {object} WordPosition
 */

/**
 * @typedef {object} RhymeConnection
 */

/**
 * @typedef {object} LineAnalysis
 */

/**
 * @typedef {object} DocumentAnalysis
 */

const RHYME_THRESHOLD = 0.60;
const ASSONANCE_THRESHOLD = 0.45;
const STRESSED_ASSONANCE_SCORE = 0.62;
const MAX_FULL_PAIR_SCAN_OCCURRENCES = 2;

/**
 * A rhyme is something a reader HEARS. By the time you reach "behold" on line
 * 90, "bold" on line 1 is long gone from the ear — they do not rhyme in any
 * sense the reader experiences.
 *
 * Every other bound in this engine is a bound on WORK, not on distance: the
 * phrase bucket slides a window over BUCKET-MEMBERSHIP order, and the rhyme
 * group chains CONSECUTIVE OCCURRENCES. A bucket groups by rhyme fingerprint,
 * so "adjacent in the bucket" says nothing about "adjacent in the document" —
 * an -old family at the top of a poem chained straight to an -old family at the
 * bottom. That produced a wordweb that was both wrong (line 1 coloured as
 * rhyming with line 90) and enormous (long-range pairs were the dominant term
 * in the payload).
 *
 * This is the semantic failsafe those work-bounds never were: no connection of
 * any type may span more than this many lines. It is what makes connection
 * count genuinely O(n · window) instead of O(n · bucket-neighbours).
 */
export const MAX_CONNECTION_LINE_DISTANCE = 4;

/** True when two words sit close enough to be heard as a rhyme. */
function withinLineWindow(a, b) {
  const lineA = a?.lineIndex;
  const lineB = b?.lineIndex;
  if (!Number.isFinite(lineA) || !Number.isFinite(lineB)) return true;
  return Math.abs(lineA - lineB) <= MAX_CONNECTION_LINE_DISTANCE;
}
// Cross-line assonance: full pairwise scan for same-vowel buckets up to this
// size; larger buckets fall back to document-adjacent pairs only, bounding the
// pairwise work in vowel-dense text.
const ASSONANCE_BUCKET_FULL_SCAN_MAX = 16;
// findPhraseConnections buckets multi-token windows by Resonance Fingerprint
// (see the comment there), plus a head fingerprint and a vowel-slant key (see
// below). A rhyme-dense verse can still pile many windows into one bucket.
// The cap bounds work PER NODE, not bucket membership: earlier code kept only
// the bucket's first CAP members (`slice(0, CAP)`) and compared those with
// each other, which is a document-order recall bug — every member past the
// CAP'th was excluded from ALL comparisons, so a rhyme landing late in a long
// verse (e.g. the last stanza) was structurally unreachable, not merely
// under-recalled. The fix is a sliding window: every member i is compared
// against its next CAP neighbours (i+1 .. i+CAP, clamped to the bucket end).
// Every node in the bucket participates — none is excluded by its position —
// each node performs at most CAP comparisons, so total work per bucket is
// O(k * CAP) and total work across all buckets is O(n * CAP): the same hard
// bound as before, just without the position bias. phrase_compound is a
// derived convenience on top of the authoritative per-token signs, so
// trading some pair recall in a pathologically oversized bucket (neighbours
// beyond the window) for that bound is still the right call — but recall
// no longer depends on where in the document a window happens to sit.
// The old cap (16) was tuned down purely to satisfy an invented per-word
// multiple in tests/lib/deepRhyme.phrase-buckets.test.js (`< words * 8`),
// which is backwards — production code should not be fitted to an
// arbitrary test bound. With the document-order bias removed, the cap
// should be picked by its OWN merits: the highest value that (a) proves
// linear-ish scaling in tests/lib/deepRhyme.phrase-buckets.test.js and
// (b) keeps a live server request under the 5s target and clear of the OOM
// crash this endpoint used to hit at ~24,000 characters.
// Measured via POST /api/analysis/panels against a running server, cold
// (no cache), on the dense-verse fixture repeated to size:
//   32 -> OOM-crashes the server outright at 24,000 chars.
//   24 -> survives, but 24,000 chars takes ~17.7s.
//   16 -> survives; 3,000/6,000/12,000/24,000 chars take ~1.9s/2.8s/6.7s/
//         12.7s — over the 5s target at the top two sizes, but this is the
//         largest cap that does not crash, and lowering it further (8, 4,
//         2, 1 all measured) does not reliably close the remaining gap —
//         the residual cost past ~12,000 chars is dominated by something
//         other than this cap (out of this fix's scope; flagged for
//         follow-up) so shrinking the cap further only trades away real
//         recall for a target it can't fully hit anyway.
// The scaling PROPERTY the cap is responsible for does hold at 16: the
// dense-verse fixture's phrase_compound-per-word rate flattens as the text
// grows (4x -> 8x moves the rate ~1.27x, 8x -> 16x only ~1.13x — converging,
// not compounding — see tests/lib/deepRhyme.phrase-buckets.test.js), which
// is the real O(n * cap) signature. Exported so the test can assert against
// the cap itself instead of hardcoding a second copy of this number.
export const PHRASE_BUCKET_CANDIDATE_CAP = 16;
// scoreMultiSyllableMatch aligns phrases by SYLLABLE, from the last syllable
// backward, using PhoneticSimilarity's acoustic vowel-confusion table (AE~EH
// at 0.95, the exact "bastard"~"master" vowel; EY~EH at 0.80). An exact-hash
// tail bucket can never group AE with EH — they're different phonemes — so a
// real, scorable multi-syllable slant match is invisible to bucketing unless
// the bucket key itself is built from the SAME confusion table. 0.75 is the
// highest threshold that still keeps golden_rhymes.test.js's MF DOOM case
// (EH~IH at exactly 0.75) recallable; raising it to 0.78 drops that case.
const VOWEL_SLANT_THRESHOLD = 0.75;
const TRUESIGHT_RHYME_TYPES = new Set([
  ...Object.values(RHYME_TYPES).map(t => t.id),
  ...Object.values(RHYME_SUBTYPES || {}).map(t => t.id)
]);
const IGNORE_IDENTICAL_WORD_RHYMES = true;
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'than',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'it', 'its', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had', 'done',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as',
  'not', 'no', 'so', 'too', 'very', 'just', 'can', 'could', 'would', 'should',
  'will', 'shall', 'might', 'may', 'must',
]);
const SYNTAX_GATES = Object.freeze({
  ALLOW: 'allow',
  ALLOW_WEAK: 'allow_weak',
  SUPPRESS: 'suppress',
});

function resolveAuthorityMode(options) {
  return options?.authorityMode === 'background' ? 'background' : 'blocking';
}

function createWordRegex() {
  return new RegExp(WORD_REGEX_GLOBAL.source, WORD_REGEX_GLOBAL.flags);
}

/**
 * Deep Rhyme Analysis Engine
 */
export class DeepRhymeEngine {
  constructor(phonemeEngine = PhonemeEngine) {
    this.engine = phonemeEngine;
    this.analysisCache = new Map();
    this.syntaxLayerContext = null;
    this.syntaxGateCounters = null;
    // Authoritative rhyme families pulled from the Scholomance Dictionary API
    // (POST /api/lexicon/lookup-batch returns word → rhyme_family). When a
    // family is present for both ends of a pair, it outranks the local
    // phoneme similarity threshold for `perfect`. Populated via
    // `primeRhymeFamilies(words, dictionaryAPI)` before the analysis runs.
    this.rhymeFamilyCache = new Map();
  }

  /**
   * Set a single word's authoritative rhyme family. Pass `null` to record a
   * confirmed no-family (e.g. dictionary confirmed the word exists but has no
   * recorded rhyme family) so the lookup won't be retried.
   */
  setRhymeFamily(word, family) {
    if (!word) return;
    const key = String(word).trim().toLowerCase();
    if (!key) return;
    this.rhymeFamilyCache.set(key, family || null);
  }

  /**
   * Bulk-set authoritative rhyme families from a `{ word: family }` map.
   * Convenience wrapper around `setRhymeFamily`.
   */
  setRhymeFamilies(map) {
    if (!map || typeof map !== 'object') return;
    for (const [word, family] of Object.entries(map)) {
      this.setRhymeFamily(word, family);
    }
  }

  /**
   * Get the cached authoritative rhyme family for a word, or `null` when the
   * cache has no record. The cache is intentionally untyped so callers can
   * distinguish "never looked up" from "looked up and had no family".
   */
  getRhymeFamily(word) {
    if (!word) return undefined;
    const key = String(word).trim().toLowerCase();
    if (!key) return undefined;
    return this.rhymeFamilyCache.has(key)
      ? this.rhymeFamilyCache.get(key)
      : undefined;
  }

  hasRhymeFamilyLookup(word) {
    if (!word) return false;
    const key = String(word).trim().toLowerCase();
    return this.rhymeFamilyCache.has(key);
  }

  /**
   * Populate the cache by calling `dictionaryAPI.lookupBatch(words)`. The
   * expected return shape is `{ families: { WORD: "FAMILY" } }` (Scholomance
   * Dictionary API). Words that already have a cached entry are skipped to
   * avoid a network round-trip on re-analysis. Failures degrade silently:
   * the engine falls back to its local phoneme scoring.
   *
   * @param {string[]} words — words to look up
   * @param {{ lookupBatch?: (words: string[]) => Promise<{ families?: Record<string,string> }> }} [dictionaryAPI]
   * @returns {Promise<{ requested: number, cached: number, families: number }>}
   */
  async primeRhymeFamilies(words, dictionaryAPI) {
    if (!dictionaryAPI || typeof dictionaryAPI.lookupBatch !== 'function') {
      return { requested: 0, cached: 0, families: 0 };
    }
    const unique = Array.from(new Set(
      (Array.isArray(words) ? words : [])
        .map((w) => String(w || '').trim())
        .filter(Boolean),
    ));
    const missing = unique.filter((w) => !this.rhymeFamilyCache.has(w.toLowerCase()));
    if (missing.length === 0) {
      return { requested: unique.length, cached: unique.length, families: 0 };
    }
    let payload;
    try {
      payload = await dictionaryAPI.lookupBatch(missing);
    } catch (err) {
      return { requested: unique.length, cached: unique.length - missing.length, families: 0, error: err?.message || String(err) };
    }
    const families = (payload && typeof payload === 'object' && payload.families) || {};
    let resolved = 0;
    for (const word of missing) {
      const entry = families[word] || families[word.toUpperCase()] || families[word.toLowerCase()] || null;
      const family = entry && typeof entry === 'object' ? entry.family : entry;
      this.setRhymeFamily(word, family);
      if (family) resolved += 1;
    }
    return { requested: unique.length, cached: unique.length, families: resolved };
  }

  /**
   * Clear the authoritative rhyme-family cache. Useful between documents or
   * when the dictionary API endpoint rotates.
   */
  clearRhymeFamilies() {
    this.rhymeFamilyCache.clear();
  }

  /**
   * Analyzes an entire document for rhyme patterns.
   * @param {string} text - Full document text.
   * @param {object} [options]
   * @returns {Promise<DocumentAnalysis>} Complete document analysis.
   */
  async analyzeDocument(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this.emptyDocumentAnalysis();
    }

    const syntaxLayer = options?.syntaxLayer?.enabled ? options.syntaxLayer : null;
    const cacheKey = `${String(options?.mode || 'balanced')}|syntax:${syntaxLayer ? '1' : '0'}|${text}`;
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    const allUniqueWords = [...new Set(text.match(createWordRegex()) || [])];
    // Prefer an explicit dictionaryAPI (self-sqlite in Node / bake) so a bare
    // primeAuthorityBatch() default fetch cannot wipe a successful sqlite prime.
    const dictionaryAPI = options?.dictionaryAPI || options?.scholomanceDictionaryAPI;
    if (typeof this.engine.ensureAuthorityBatch === 'function') {
      const authorityPromise = typeof this.engine.primeAuthorityBatch === 'function'
        ? this.engine.primeAuthorityBatch(allUniqueWords, dictionaryAPI)
        : this.engine.ensureAuthorityBatch(allUniqueWords, dictionaryAPI);
      if (resolveAuthorityMode(options) === 'blocking') {
        await authorityPromise;
      } else if (authorityPromise?.catch) {
        authorityPromise.catch(() => {});
      }
    }

    this.syntaxLayerContext = syntaxLayer;
    this.syntaxGateCounters = { enabled: Boolean(syntaxLayer), totalCandidates: 0, suppressedPairs: 0, weakenedPairs: 0, keptPairs: 0 };

    const verseIR = compileVerseToIR(text, {
      phonemeEngine: this.engine,
      mode: options?.mode,
    });
    const lines = verseIR.lines.map((lineIR) => this.buildLineAnalysisFromIRLine(lineIR, verseIR.tokens));

    const endRhymeConnections = this.findEndRhymeConnections(lines);
    const internalRhymeConnections = lines.flatMap(l => l.internalRhymes);
    const crossLineAssonanceConnections = this.findCrossLineAssonanceConnections(lines, endRhymeConnections);
    const { connections: phraseConnections, windows: phraseWindows } = await this.findPhraseConnections(verseIR);
    const { rhymeGroups, schemePattern } = this.buildRhymeGroups(lines, endRhymeConnections);
    this.assignGroupLabels(endRhymeConnections, rhymeGroups);

    const allConnections = [...endRhymeConnections, ...internalRhymeConnections, ...crossLineAssonanceConnections, ...phraseConnections];
    const result = {
      lines,
      endRhymeConnections,
      internalRhymeConnections,
      allConnections,
      phraseWindows,
      rhymeGroups,
      schemePattern,
      syntaxSummary: syntaxLayer?.syntaxSummary || null,
      compiler: {
        verseIRVersion: verseIR.version,
        mode: verseIR.metadata?.mode || 'balanced',
        tokenCount: Number(verseIR.metadata?.tokenCount) || verseIR.tokens.length,
        lineCount: Number(verseIR.metadata?.lineCount) || verseIR.lines.length,
        maxWindowSyllables: Number(verseIR.metadata?.maxWindowSyllables) || undefined,
        maxWindowTokenSpan: Number(verseIR.metadata?.maxWindowTokenSpan) || undefined,
        syllableWindowCount: Number(verseIR.metadata?.syllableWindowCount) || verseIR.syllableWindows.length,
        lineBreakStyle: verseIR.metadata?.lineBreakStyle || 'none',
        offsetSemantics: verseIR.metadata?.offsetSemantics || undefined,
        graphemeAware: typeof verseIR.metadata?.graphemeAware === 'boolean' ? verseIR.metadata.graphemeAware : undefined,
        graphemeCount: Number(verseIR.metadata?.graphemeCount) || undefined,
        whitespaceFidelity: Boolean(verseIR.metadata?.whitespaceFidelity),
      },
      statistics: this.computeStatistics(lines, allConnections, this.syntaxGateCounters),
    };

    this.syntaxLayerContext = null;
    this.syntaxGateCounters = null;
    this.analysisCache.set(cacheKey, result);
    return result;
  }

  analyzeLine(lineText, lineIndex, charOffset = 0) {
    const verseIR = compileVerseToIR(lineText, { phonemeEngine: this.engine });
    const lineIR = verseIR.lines[0] || {
      lineIndex: 0,
      text: lineText,
      tokenIds: [],
    };

    const shiftedWords = lineIR.tokenIds.map((tokenId) => {
      const token = verseIR.tokens[tokenId];
      const shiftedCharStart = charOffset + token.charStart;
      return this.createLineWordFromToken(token, lineIndex, shiftedCharStart);
    });

    const internalRhymes = this.findInternalRhymes(shiftedWords);
    const totalSyllables = shiftedWords.reduce((sum, word) => sum + (Number(word?.syllableCount) || 0), 0);
    const stressPattern = shiftedWords
      .map((word) => String(word?.stressPattern || '').trim())
      .filter(Boolean)
      .join(' ');
    const endWord = shiftedWords.length > 0 ? shiftedWords[shiftedWords.length - 1] : null;

    return {
      lineIndex,
      text: lineText,
      words: shiftedWords,
      syllableTotal: totalSyllables,
      stressPattern,
      internalRhymes,
      endRhymeKey: endWord?.rhymeKey || null,
      endWord: endWord?.analysis || null,
    };
  }

  buildLineAnalysisFromIRLine(lineIR, tokens) {
    const words = lineIR.tokenIds.map((tokenId) => this.createLineWordFromToken(tokens[tokenId]));
    const internalRhymes = this.findInternalRhymes(words);
    const totalSyllables = words.reduce((sum, word) => sum + (Number(word?.syllableCount) || 0), 0);
    const stressPattern = words
      .map((word) => String(word?.stressPattern || '').trim())
      .filter(Boolean)
      .join(' ');
    const endWord = words.length > 0 ? words[words.length - 1] : null;

    return {
      lineIndex: lineIR.lineIndex,
      text: lineIR.text,
      words,
      syllableTotal: totalSyllables,
      stressPattern,
      internalRhymes,
      endRhymeKey: endWord?.rhymeKey || null,
      endWord: endWord?.analysis || null,
    };
  }

  createLineWordFromToken(token, overrideLineIndex = token.lineIndex, overrideCharStart = token.charStart) {
    const analysis = token?.analysis || null;
    const charEnd = overrideCharStart + String(token?.text || '').length;

    return {
      word: token.text,
      normalizedWord: String(token.normalizedUpper || token.normalized || '').toUpperCase(),
      vowelFamily: token.primaryStressedVowelFamily || token.terminalVowelFamily || null,
      rhymeKey: analysis?.rhymeKey || token.rhymeTailSignature || null,
      syllableCount: Number(token.syllableCount) || 0,
      stressPattern: String(token.stressPattern || ''),
      lineIndex: overrideLineIndex,
      wordIndex: token.tokenIndexInLine,
      charStart: overrideCharStart,
      charEnd,
      analysis,
      syntaxToken: this.getSyntaxToken(overrideLineIndex, token.tokenIndexInLine, overrideCharStart),
    };
  }

  getSyntaxToken(lineIndex, wordIndex, charStart) {
    const syntaxLayer = this.syntaxLayerContext;
    if (!syntaxLayer) return null;
    const identityKey = `${lineIndex}:${wordIndex}:${charStart}`;
    return syntaxLayer.tokenByIdentity?.get?.(identityKey) || syntaxLayer.tokenByCharStart?.get?.(charStart) || null;
  }

  async findPhraseConnections(verseIR) {
    const phraseNodes = [];
    // Dedup identical windows (same char span) up front. syllableWindows can
    // emit the same multi-token span repeatedly; without this the pairwise scan
    // below is O(dupWindows^2), producing tens of thousands of duplicate
    // phrase_compound connections (≈138k on a 500-word verse) that cost
    // analyzeDeep calls, memory, and downstream vectorization for no new signal.
    const seenWindowSpans = new Set();
    const multiTokenWindows = verseIR.syllableWindows.filter(w => {
      if (w.tokenSpan[0] === w.tokenSpan[1]) return false;
      const spanKey = `${w.charStart}:${w.charEnd}`;
      if (seenWindowSpans.has(spanKey)) return false;
      seenWindowSpans.add(spanKey);
      return true;
    });
    
    const phraseStrings = [...new Set(multiTokenWindows.map(w => 
        verseIR.rawText.substring(w.charStart, w.charEnd).replace(/[^A-Za-z]/g, '').toUpperCase()
    ))];
    
    if (typeof this.engine.primeG2PBatch === 'function' && phraseStrings.length > 0) {
        await this.engine.primeG2PBatch(phraseStrings);
    }
    
    for (const w of multiTokenWindows) {
        const tokenCount = w.tokenSpan[1] - w.tokenSpan[0] + 1;
        if (tokenCount > 4) continue;

        const phraseStr = verseIR.rawText.substring(w.charStart, w.charEnd);
        const cleanStr = phraseStr.replace(/[^A-Za-z]/g, '').toUpperCase();
        if (!cleanStr) continue;

        const analysis = this.engine.analyzeDeep(cleanStr);
        if (!analysis || analysis.syllableCount < 2) continue;

        const firstToken = verseIR.tokens[w.tokenSpan[0]];
        const lastToken = verseIR.tokens[w.tokenSpan[1]];
        if (!firstToken || !lastToken) continue;

        phraseNodes.push({
            word: phraseStr,
            analysis,
            lineIndex: firstToken.lineIndex,
            wordIndex: firstToken.tokenIndexInLine,
            charStart: w.charStart,
            charEnd: w.charEnd,
            tokenSpan: w.tokenSpan,
            syllableLength: analysis.syllableCount
        });
    }

    // Candidates come from the Resonance Fingerprint's rhyme-bearing blocks.
    // The old scan compared every window with every other — 1,335 of the 1,448
    // connections on the 75-word fixture, growing quadratically and OOM-killing
    // the server past ~12,000 chars. Bucketing only changes which pairs we LOOK
    // at; every emitted connection is still scored by scoreMultiSyllableMatch,
    // so no score and no colour can move.
    //
    // Two fingerprints per node, not one. `node.analysis` is G2P over the
    // WHOLE window concatenated into one pseudo-word ("bastard never" ->
    // BASTARDNEVER), and English compound stress then shifts primary stress
    // onto the LAST element — so extractRhymeTail (which anchors on the last
    // stressed vowel) anchors on "never", not "Bastard". A tail-only bucket
    // therefore only ever recalls rhymes anchored at a window's END (LINE ~
    // MIND). It structurally cannot recall a match anchored at a window's
    // START, e.g. "Bastard never" ~ "Master with an" — the driving rhyme is
    // BASTARD ~ MASTER, and neither word can ever be a window's tail (each is
    // the first token of every window it appears in, since windows only grow
    // rightward from a line's start position). scoreMultiSyllableMatch's own
    // sliding syllable alignment finds that match fine once the pair is a
    // candidate; bucketing just never proposed the pair. Fingerprinting the
    // window's FIRST TOKEN on its own (real per-word stress, untouched by the
    // compound-stress shift) and bucketing on THAT too closes the gap: the
    // tail fingerprint catches end-anchored rhymes, the head fingerprint
    // catches start-anchored ones, and a node lands in both bucket sets.
    // Exact-hash tail/head fingerprints still miss one class of real match:
    // scoreMultiSyllableMatch aligns phrases syllable-by-syllable from the
    // end, using an acoustic vowel-confusion table (AE~EH at 0.95 — the
    // "bastard"~"master" vowel, EH~IH at 0.75). A hash bucket keyed on the
    // literal nucleus phoneme can never group AE with EH; they're different
    // phonemes, full stop. So a third bucket keys each node's LAST SYLLABLE
    // by its vowel-confusion class (from the same PhoneticSimilarity table
    // the scorer itself uses) crossed with its coda manner-class, instead of
    // by exact nucleus identity — closing the gap for slant-vowel
    // multi-syllable matches that are otherwise invisible to bucketing.
    // scoreMultiSyllableMatch's own alignment is reverse-indexed from the last
    // syllable, and the syllable that actually drives a >=2-syllable match is
    // not always the very last one — e.g. "Birthdays was" ~ "champagne when"
    // matches on BOTH the last syllable (AE~EH, but with a coda mismatch:
    // S vs N) and the second-to-last (EY~EH, open-open coda, a clean class
    // match). Scanning only the last syllable would miss that second,
    // decisive position, so this checks up to the last VOWEL_SLANT_SYLLABLE_DEPTH
    // syllables — windows are capped at 4 tokens, so this stays cheap.
    const VOWEL_SLANT_SYLLABLE_DEPTH = 2;
    const vowelSlantKeys = (analysis) => {
      const syllables = Array.isArray(analysis?.syllables) ? analysis.syllables : [];
      if (!syllables.length) return [];
      const keys = [];
      const depth = Math.min(VOWEL_SLANT_SYLLABLE_DEPTH, syllables.length);
      for (let i = 0; i < depth; i += 1) {
        const syllable = syllables[syllables.length - 1 - i];
        const nucleusBase = String(syllable?.vowel || '').replace(/[0-9]/g, '');
        if (!nucleusBase) continue;
        const codaPhonemes = Array.isArray(syllable?.codaPhonemes) ? syllable.codaPhonemes : [];
        const lastCoda = codaPhonemes.length ? codaPhonemes[codaPhonemes.length - 1] : null;
        const cls = codaClassOf(lastCoda);
        const confusable = PhoneticSimilarity.getVowelConfusionSet(nucleusBase, VOWEL_SLANT_THRESHOLD);
        for (const v of confusable) keys.push(`VS${i}:${v}:${cls}`);
      }
      return keys;
    };

    const connections = [];
    const buckets = new Map();

    const addToBuckets = (node, keys, tag) => {
      for (const key of keys) {
        const bucketKey = `${tag}:${key}`;
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey).push(node);
      }
    };

    for (const node of phraseNodes) {
      const fingerprint = buildResonanceFingerprint(node.analysis?.phonemes || []);
      // A tailless token gets no fingerprint and therefore no bucket. Do NOT
      // bucket them together — that would collide every unknown token at once.
      addToBuckets(node, fingerprint ? rhymeBucketKeys(fingerprint) : [], 'tail');
      addToBuckets(node, vowelSlantKeys(node.analysis), 'vslant');
      // `sign` IS the fingerprint (Task 4): windows sharing a sign rhyme, so
      // the client groups by it and never recomputes phonetics. A tailless
      // token carries '' — it has no rhyme tail and cannot rhyme with anything.
      node.sign = fingerprint || '';

      const firstToken = verseIR.tokens[node.tokenSpan[0]];
      const headFingerprint = buildResonanceFingerprint(firstToken?.analysis?.phonemes || []);
      addToBuckets(node, headFingerprint ? rhymeBucketKeys(headFingerprint) : [], 'head');
    }

    const seenPairs = new Set();

    for (const [, groupNodes] of buckets) {
      if (groupNodes.length < 2) continue;
      // A rhyme-dense verse can pile hundreds of phrase nodes into one bucket
      // (e.g. every window ending on the same common vowel). phrase_compound
      // pairs are a derived convenience — the authoritative per-token signs
      // (Task 4) are what the client consumes — so we bound work with a
      // SLIDING WINDOW rather than truncating the bucket: every node i is
      // compared only against its next CAP neighbours (i+1 .. i+CAP). This
      // keeps the cap a bound on work PER NODE instead of on bucket
      // membership — no node is ever excluded from every comparison just
      // because of where it sits in document order (a plain `slice(0, CAP)`
      // truncation made every window past the CAP'th unreachable, which is a
      // recall bug, not a performance trade-off). Each node still does at
      // most CAP comparisons, so total work per bucket is O(k * CAP) and
      // total work across all buckets is O(n * CAP) — the same hard bound
      // that keeps a long verse from OOM-killing the server; every pair that
      // IS compared is still fully scored below.
      for (let i = 0; i < groupNodes.length; i += 1) {
        const windowEnd = Math.min(groupNodes.length, i + 1 + PHRASE_BUCKET_CANDIDATE_CAP);
        for (let j = i + 1; j < windowEnd; j += 1) {
          const nodeA = groupNodes[i];
          const nodeB = groupNodes[j];

          // The bucket is keyed by rhyme fingerprint, so two nodes adjacent HERE
          // may be ninety lines apart in the document. The sliding window above
          // bounds work; only this bounds distance.
          if (!withinLineWindow(nodeA, nodeB)) continue;

          // A node sits in several bands, so the same pair can surface more than once.
          const spanA = `${nodeA.charStart}:${nodeA.charEnd}`;
          const spanB = `${nodeB.charStart}:${nodeB.charEnd}`;
          const pairKey = spanA < spanB ? `${spanA}|${spanB}` : `${spanB}|${spanA}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          if (nodeA.charEnd > nodeB.charStart && nodeA.charStart < nodeB.charEnd) continue;
          if (nodeA.word.toLowerCase() === nodeB.word.toLowerCase()) continue;

          const match = this.engine.scoreMultiSyllableMatch(nodeA.analysis, nodeB.analysis);
          if (match && match.syllablesMatched >= 2 && match.score >= 0.6) {
            connections.push({
              type: 'phrase_compound',
              subtype: match.type || 'none',
              score: match.score,
              syllablesMatched: match.syllablesMatched,
              phoneticWeight: match.syllablesMatched * match.score,
              wordA: {
                lineIndex: nodeA.lineIndex,
                wordIndex: nodeA.wordIndex,
                charStart: nodeA.charStart,
                charEnd: nodeA.charEnd,
                word: nodeA.word
              },
              wordB: {
                lineIndex: nodeB.lineIndex,
                wordIndex: nodeB.wordIndex,
                charStart: nodeB.charStart,
                charEnd: nodeB.charEnd,
                word: nodeB.word
              },
              groupLabel: null,
              syntax: { gate: 'allow', multiplier: 1, reasons: ['phrase_connection'] }
            });
          }
        }
      }
    }
    // Returned, not stashed on `this`. DeepRhymeEngine is instantiated as a
    // module-level singleton in at least two places (multisyllabic_rhyme.js,
    // rhyme_quality.js), and this method awaits — so instance state written here
    // could be read by a different, concurrently-running document.
    const windows = phraseNodes.map((node) => ({
      charStart: node.charStart,
      charEnd: node.charEnd,
      sign: node.sign ?? '',
      syllableCount: node.syllableLength ?? 0,
    }));

    return { connections, windows };
  }

  findInternalRhymes(words) {
    const connections = [];
    if (words.length < 2) return connections;
    const buckets = this.buildPhoneticBuckets(words);
    const seenPairs = new Set();
    for (const [, groupWords] of buckets) {
      if (groupWords.length < 2) continue;
      this.collectGroupConnections(groupWords, connections, seenPairs);
    }
    return connections;
  }

  findEndRhymeConnections(lines) {
    const connections = [];
    const endWords = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const lastWord = lines[idx].words[lines[idx].words.length - 1];
      if (lastWord?.analysis) endWords.push({ ...lastWord, lineIndex: idx });
    }
    const buckets = this.buildPhoneticBuckets(endWords);
    const seenPairs = new Set();
    for (const [, groupWords] of buckets) {
      if (groupWords.length < 2) continue;
      this.collectGroupConnections(groupWords, connections, seenPairs);
    }
    return connections;
  }

  /**
   * Finds cross-line assonance connections for interior (non-end) words.
   * These are words that share stressed vowel families across different lines
   * but are not at the end of their lines, so they're invisible to
   * findEndRhymeConnections and findInternalRhymes.
   *
   * Only 2+ syllable words are considered as source anchors to avoid noise.
   * Monosyllabic words can be targets if paired with a multisyllabic anchor.
   */
  findCrossLineAssonanceConnections(lines, existingEndConnections = []) {
    const connections = [];

    // Track which charStarts are line-end words so we can skip already-covered pairs.
    const endWordCharStarts = new Set();
    for (const line of lines) {
      const lastWord = line.words[line.words.length - 1];
      if (lastWord) endWordCharStarts.add(lastWord.charStart);
    }

    // Build a set of already-evaluated pair keys from end-rhyme connections.
    const existingPairKeys = new Set();
    for (const conn of existingEndConnections) {
      existingPairKeys.add(this.getPairKey(conn.wordA, conn.wordB));
    }

    // Collect all words from all lines as candidates. Monosyllabic content
    // words now participate as anchors too (not only multisyllabic): a vowel
    // echo between short words is genuine assonance, and the tiered gate
    // renders assonance as a quiet tint, so the old noise-reduction
    // restriction is unnecessary. A per-family bucket cap bounds the work.
    const allWords = [];
    for (const line of lines) {
      for (const word of line.words) {
        if (!word.analysis) continue;
        allWords.push(word);
      }
    }

    if (allWords.length < 2) return connections;

    // Build stressed-vowel family buckets from every analyzed word.
    const stressBuckets = new Map();
    for (const word of allWords) {
      const family = this.getPrimaryStressedVowelFamily(word.analysis);
      if (!family) continue;
      if (!stressBuckets.has(family)) stressBuckets.set(family, []);
      stressBuckets.get(family).push(word);
    }

    const seenPairs = new Set(existingPairKeys);

    for (const [, groupWords] of stressBuckets) {
      if (groupWords.length < 2) continue;
      // Full pairwise scan for normal buckets; for very large same-vowel
      // buckets, fall back to document-adjacent pairs only to bound the work.
      const fullScan = groupWords.length <= ASSONANCE_BUCKET_FULL_SCAN_MAX;
      for (let i = 0; i < groupWords.length; i++) {
        const jEnd = fullScan ? groupWords.length : Math.min(groupWords.length, i + 2);
        for (let j = i + 1; j < jEnd; j++) {
          const wA = groupWords[i], wB = groupWords[j];

          // Skip same-line pairs — already handled by findInternalRhymes.
          if (wA.lineIndex === wB.lineIndex) continue;

          // Skip if BOTH are end-words — already handled by findEndRhymeConnections.
          if (endWordCharStarts.has(wA.charStart) && endWordCharStarts.has(wB.charStart)) continue;

          // Interior cross-line vowel echoes. Only the ones the scorer classes
          // as type:'assonance' (and that clear the gate's assonance floor)
          // tint; near/perfect-scored echoes are not promoted, keeping the
          // assonance palette from over-representing.
          this.pushConnectionIfValid(wA, wB, connections, seenPairs);
        }
      }
    }

    return connections;
  }

  collectGroupConnections(groupWords, out, seenPairs = new Set()) {
    if (!Array.isArray(groupWords) || groupWords.length < 2) return;
    if (groupWords.length <= MAX_FULL_PAIR_SCAN_OCCURRENCES) {
      for (let i = 0; i < groupWords.length; i++) {
        for (let j = i + 1; j < groupWords.length; j++) this.pushConnectionIfValid(groupWords[i], groupWords[j], out, seenPairs);
      }
      return;
    }
    for (let i = 1; i < groupWords.length; i++) this.pushConnectionIfValid(groupWords[i - 1], groupWords[i], out, seenPairs);
  }

  pushConnectionIfValid(wordA, wordB, out, seenPairs = new Set()) {
    if (!wordA?.analysis || !wordB?.analysis) return;
    // The single chokepoint for every word-pair connection — end rhyme, internal
    // rhyme, and cross-line assonance all arrive here, so the failsafe cannot be
    // bypassed by adding another caller.
    if (!withinLineWindow(wordA, wordB)) return;
    if (this.shouldSkipLexicalRepetition(wordA, wordB)) return;
    const normA = this.normalizeWord(wordA.word);
    const normB = this.normalizeWord(wordB.word);
    // When no syntax layer is present, filter function-function pairs early.
    // When a syntax layer is active, let the gate decide (it tracks suppressed/weakened counts
    // and grants the both_function_line_end_exception for end-rhyme pairs).
    if (!this.syntaxLayerContext && normA && normB && FUNCTION_WORDS.has(normA) && FUNCTION_WORDS.has(normB)) return;
    const pairKey = this.getPairKey(wordA, wordB);
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);
    const syntaxGate = this.evaluateSyntaxGate(wordA, wordB);
    if (syntaxGate) {
      this.recordSyntaxGateDecision(syntaxGate);
      if (syntaxGate.gate === SYNTAX_GATES.SUPPRESS) return;
    }
    const connection = this.scoreConnection(wordA, wordB, syntaxGate);
    if (this.isTruesightRhymeConnection(connection)) out.push(connection);
  }

  evaluateSyntaxGate(wordA, wordB) {
    const tokenA = wordA?.syntaxToken || null;
    const tokenB = wordB?.syntaxToken || null;
    if (!tokenA && !tokenB && !this.syntaxLayerContext && !FUNCTION_WORDS.has(this.normalizeWord(wordA?.word)) && !FUNCTION_WORDS.has(this.normalizeWord(wordB?.word))) return { gate: SYNTAX_GATES.ALLOW, multiplier: 1, reasons: ['no_syntax_layer_and_not_function'] };
    const normA = this.normalizeWord(wordA?.word);
    const normB = this.normalizeWord(wordB?.word);
    const aFunction = tokenA?.role === 'function' || (!tokenA && FUNCTION_WORDS.has(normA));
    const bFunction = tokenB?.role === 'function' || (!tokenB && FUNCTION_WORDS.has(normB));
    
    // We can't know line_end precisely without syntax tokens sometimes, but we have lineIndex
    const aLineEnd = tokenA ? tokenA.lineRole === 'line_end' : false;
    const bLineEnd = tokenB ? tokenB.lineRole === 'line_end' : false;
    const hasFunctionNonEnd = (aFunction && !aLineEnd) || (bFunction && !bLineEnd);
    const isInternalPair = wordA?.lineIndex === wordB?.lineIndex;
    const hasLineAnchor = aLineEnd || bLineEnd || !isInternalPair;
    const phoneticAffinity = this.evaluatePhoneticAffinity(wordA?.analysis, wordB?.analysis);
    if (aFunction && bFunction && !aLineEnd && !bLineEnd) return { gate: SYNTAX_GATES.SUPPRESS, multiplier: 0, reasons: ['both_function_non_terminal'] };
    if (aFunction && bFunction && aLineEnd && bLineEnd) return { gate: SYNTAX_GATES.ALLOW_WEAK, multiplier: 0.9, reasons: ['both_function_line_end_exception'] };
    
    // Stem overlap check (same root words like baking/baked)
    if (tokenA?.stem && tokenB?.stem && tokenA.stem === tokenB.stem) {
      return { gate: SYNTAX_GATES.ALLOW_WEAK, multiplier: 0.5, reasons: ['stem_overlap'] };
    }

    if (hasFunctionNonEnd) {
      if (phoneticAffinity.sharedStressedFamily && hasLineAnchor) return { gate: SYNTAX_GATES.ALLOW_WEAK, multiplier: 0.94, reasons: ['contains_function_non_terminal', 'phonetic_affinity_override'] };
      return { gate: SYNTAX_GATES.ALLOW_WEAK, multiplier: 0.88, reasons: ['contains_function_non_terminal'] };
    }
    return { gate: SYNTAX_GATES.ALLOW, multiplier: 1, reasons: ['default_allow'] };
  }

  evaluatePhoneticAffinity(analysisA, analysisB) {
    if (!analysisA || !analysisB) return { sharedRhymeKey: false, sharedTerminalFamily: false, sharedStressedFamily: false };
    const stressedA = this.getPrimaryStressedVowelFamily(analysisA), stressedB = this.getPrimaryStressedVowelFamily(analysisB);
    return { sharedRhymeKey: analysisA.rhymeKey === analysisB.rhymeKey, sharedTerminalFamily: this.getTerminalVowelFamily(analysisA) === this.getTerminalVowelFamily(analysisB), sharedStressedFamily: stressedA === stressedB };
  }

  recordSyntaxGateDecision(syntaxGate) {
    if (!this.syntaxGateCounters?.enabled) return;
    this.syntaxGateCounters.totalCandidates += 1;
    if (syntaxGate?.gate === SYNTAX_GATES.SUPPRESS) this.syntaxGateCounters.suppressedPairs += 1;
    else if (syntaxGate?.gate === SYNTAX_GATES.ALLOW_WEAK) this.syntaxGateCounters.weakenedPairs += 1;
    else this.syntaxGateCounters.keptPairs += 1;
  }

  isTruesightRhymeConnection(connection) {
    if (!connection) return false;
    if (!TRUESIGHT_RHYME_TYPES.has(connection.type)) return false;
    const threshold = connection.type === 'assonance' ? ASSONANCE_THRESHOLD : RHYME_THRESHOLD;
    return Number(connection.score) >= threshold;
  }

  shouldSkipLexicalRepetition(wordA, wordB) {
    if (!IGNORE_IDENTICAL_WORD_RHYMES) return false;
    const normalizedA = this.normalizeWord(wordA?.word), normalizedB = this.normalizeWord(wordB?.word);
    return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
  }

  normalizeWord(value) { return String(value || '').trim().toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, ''); }

  buildPhoneticBuckets(words) {
    const buckets = new Map();
    const addToBucket = (bucketKey, word) => {
      if (!bucketKey) return;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(word);
    };
    for (const word of words) {
      const analysis = word?.analysis;
      if (!analysis) continue;
      if (analysis.rhymeKey) addToBucket(`rhyme:${analysis.rhymeKey}`, word);
      const terminalVowel = this.getTerminalVowelFamily(analysis);
      if (terminalVowel) addToBucket(`vowel:${terminalVowel}`, word);
      const stressedVowel = this.getPrimaryStressedVowelFamily(analysis);
      if (stressedVowel) addToBucket(`stress:${stressedVowel}`, word);
    }
    return buckets;
  }

  getTerminalVowelFamilyRaw(analysis) {
    if (Array.isArray(analysis?.syllables) && analysis.syllables.length > 0) return analysis.syllables[analysis.syllables.length - 1]?.vowelFamily || null;
    return (typeof analysis?.rhymeKey === 'string' && analysis.rhymeKey.includes('-')) ? analysis.rhymeKey.split('-')[0] || null : null;
  }

  getPrimaryStressedVowelFamilyRaw(analysis) {
    if (!Array.isArray(analysis?.syllables) || analysis.syllables.length === 0) return this.getTerminalVowelFamilyRaw(analysis);
    const stressed = analysis.syllables.find((syl) => Number(syl?.stress) > 0) || analysis.syllables[0];
    return stressed?.vowelFamily || null;
  }

  getTerminalVowelFamily(analysis) {
    return normalizeVowelFamily(this.getTerminalVowelFamilyRaw(analysis));
  }

  getPrimaryStressedVowelFamily(analysis) {
    return normalizeVowelFamily(this.getPrimaryStressedVowelFamilyRaw(analysis));
  }

  calculatePhoneticWeight(analysis) {
    if (!analysis) return 0;
    const syllables = Array.isArray(analysis.syllables) ? analysis.syllables : [];
    const syllableWeight = Math.sqrt(syllables.length || 1);
    const stressWeight = syllables.reduce((acc, syl) => acc + (syl.stress > 0 ? 1.2 : 0.5), 0) / (syllables.length || 1);
    return syllableWeight * stressWeight;
  }

  getPairKey(wordA, wordB) {
    const idA = `${wordA.lineIndex}:${wordA.wordIndex}:${wordA.charStart}`, idB = `${wordB.lineIndex}:${wordB.wordIndex}:${wordB.charStart}`;
    return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
  }

  scoreStressedAssonance(analysisA, analysisB) {
    const stressedA = this.getPrimaryStressedVowelFamily(analysisA), stressedB = this.getPrimaryStressedVowelFamily(analysisB);
    return (stressedA && stressedB && stressedA === stressedB) ? STRESSED_ASSONANCE_SCORE : 0;
  }

  scoreConnection(wordA, wordB, syntaxGate = null) {
    const analysisA = wordA.analysis, analysisB = wordB.analysis;
    if (!analysisA || !analysisB) return null;
    const normalizedA = this.normalizeWord(wordA.word), normalizedB = this.normalizeWord(wordB.word);
    const isIdentity = normalizedA === normalizedB;
    // Rhyme-domain check FIRST. Two words rhyme iff their phoneme tails from the
    // last stressed vowel are identical — that is decidable, so it outranks any
    // similarity heuristic. This used to compare the dictionary's coarse
    // rhyme_family (the bare VOWEL family), which made every AY word a "perfect"
    // rhyme with every other AY word. See matchRhymeDomain.
    const rhymeDomainMatch = !isIdentity
      ? this.matchRhymeDomain(analysisA, analysisB)
      : null;
    const multiMatch = this.engine.scoreMultiSyllableMatch(analysisA, analysisB);
    const stressedAssonanceScore = multiMatch.syllablesMatched === 0 ? this.scoreStressedAssonance(analysisA, analysisB) : 0;
    if (!isIdentity && multiMatch.syllablesMatched === 0 && stressedAssonanceScore <= 0 && !rhymeDomainMatch) return null;
    let baseScore = Math.max(Number(multiMatch.score) || 0, stressedAssonanceScore);
    if (isIdentity) baseScore = 1.0;
    if (rhymeDomainMatch) {
      // The domains are identical, so this IS a perfect rhyme — not merely one
      // the heuristic undervalued. Score it as such. (The old code lifted a
      // coarse family match only to PERFECT.minScore, which then sat BELOW the
      // resonance gate's bar, so even a true rhyme could be censored.)
      baseScore = 1.0;
    }
    const multiplier = Number(syntaxGate?.multiplier);
    const connectionScore = baseScore * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
    const syllablesMatched = multiMatch.syllablesMatched > 0 ? multiMatch.syllablesMatched : (stressedAssonanceScore > 0 ? 1 : 0);
    const weightA = this.calculatePhoneticWeight(analysisA), weightB = this.calculatePhoneticWeight(analysisB);
    let type = 'consonance';
    let subtype = multiMatch.type;
    if (isIdentity) type = 'identity';
    else if (rhymeDomainMatch) {
      type = 'perfect';
      subtype = 'rhyme-domain';
    } else if (connectionScore >= RHYME_TYPES.PERFECT.minScore) {
      // The domains are NOT identical, so this cannot be a perfect rhyme however
      // high the similarity heuristic runs. A near-rhyme is the strongest honest
      // claim available. Letting the heuristic mint 'perfect' on its own is what
      // let a shared vowel family masquerade as a rhyme.
      type = 'near';
    }
    else if (connectionScore >= RHYME_TYPES.NEAR.minScore) type = 'near';
    else if (connectionScore >= RHYME_TYPES.SLANT.minScore) type = 'slant';
    else if (connectionScore >= RHYME_TYPES.ASSONANCE.minScore) type = 'assonance';
    return { type, subtype, score: connectionScore, syllablesMatched, phoneticWeight: (weightA + weightB) / 2, wordA: { lineIndex: wordA.lineIndex, wordIndex: wordA.wordIndex, charStart: wordA.charStart, charEnd: wordA.charEnd, word: wordA.word }, wordB: { lineIndex: wordB.lineIndex, wordIndex: wordB.wordIndex, charStart: wordB.charStart, charEnd: wordB.charEnd, word: wordB.word }, groupLabel: null, rhymeKey: rhymeDomainMatch || undefined, syntax: syntaxGate ? { gate: syntaxGate.gate || SYNTAX_GATES.ALLOW, multiplier: multiplier, reasons: Array.isArray(syntaxGate.reasons) ? syntaxGate.reasons : [] } : undefined };
  }

  /**
   * Look up the cached authoritative rhyme family for both words. Returns the
   * shared family string when both ends have a non-null family and they
   * match, otherwise `null`. Distinguishes "cache miss" (return null,
   * caller should fall back to local scoring) from "cache hit, no family"
   * (also null, but a different fallback story).
   */
  /**
   * DEPRECATED as a rhyme signal — kept only for callers that still want the
   * coarse family. `rhyme_family` is the bare VOWEL family ("AY", "IH", "U"),
   * which thousands of unrelated words share. See matchRhymeDomain.
   */
  matchDictionaryFamily(wordA, wordB) {
    const a = this.getRhymeFamily(wordA);
    const b = this.getRhymeFamily(wordB);
    if (a === undefined || b === undefined) return null; // at least one was never looked up
    if (!a || !b) return null;
    return a === b ? a : null;
  }

  /**
   * Do these two words RHYME? Compares the rhyme domain — the phoneme tail from
   * the last stressed vowel — which is the definition of a perfect rhyme.
   *
   * This replaces matchDictionaryFamily as the perfect-rhyme signal. That check
   * compared the dictionary's `rhyme_family`, i.e. the bare vowel family, and any
   * two words sharing it were FORCED to type 'perfect' at RHYME_TYPES.PERFECT
   * .minScore (0.92). So the engine asserted, at the strongest tier:
   *
   *   survival ~ liars ~ igniting   (all AY)     perfect 0.920
   *   still ~ isn't                 (both IH)    perfect 0.920
   *   skin ~ pretty                 (IH / IY)    perfect 0.920
   *   steady ~ against              (both EH)    perfect 0.920
   *
   * None of those rhyme. 108 such pairs were emitted for one 16-line verse, all
   * at the identical 0.920, and the only thing keeping them off the page was the
   * resonance gate's 0.95 bar — which then also blocked the REAL rhymes scoring
   * just under it. The gate was doing the scorer's job, badly.
   *
   * A shared vowel family is assonance. It is not a rhyme, and it must not be
   * typed as one. (gene BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK: a coarse
   * backend family must not outrank real phonology.)
   *
   * @returns {string|null} the shared rhyme key when they truly rhyme
   */
  matchRhymeDomain(analysisA, analysisB) {
    const a = analysisA?.phonemes;
    const b = analysisB?.phonemes;
    if (Array.isArray(a) && Array.isArray(b) && a.length > 0 && b.length > 0) {
      return isPerfectRhyme(a, b) ? buildRhymeKey(a) : null;
    }

    // No phonemes (a synthetic or partially-hydrated analysis). rhymeKey IS the
    // rhyme domain in string form, so equality of the key is the same predicate.
    // NOTE the difference from the old code: this compares the KEY (family + the
    // whole tail, "AA-RT"), never the bare FAMILY ("AA") — which is what let
    // every AY word rhyme with every other AY word.
    const keyA = analysisA?.rhymeKey;
    const keyB = analysisB?.rhymeKey;
    if (typeof keyA === 'string' && keyA.length > 0 && keyA === keyB) return keyA;
    return null;
  }

  buildRhymeGroups(lines, connections) {
    const rhymeGroups = new Map(), lineToGroup = new Map();
    let nextGroupIndex = 0;
    for (const conn of connections) {
      const lineA = conn.wordA.lineIndex, lineB = conn.wordB.lineIndex;
      const groupA = lineToGroup.get(lineA), groupB = lineToGroup.get(lineB);
      if (groupA === undefined && groupB === undefined) {
        const label = String.fromCharCode(65 + nextGroupIndex);
        lineToGroup.set(lineA, label); lineToGroup.set(lineB, label); rhymeGroups.set(label, [lineA, lineB]);
        nextGroupIndex++;
      } else if (groupA !== undefined && groupB === undefined) {
        lineToGroup.set(lineB, groupA); rhymeGroups.get(groupA).push(lineB);
      } else if (groupA === undefined && groupB !== undefined) {
        lineToGroup.set(lineA, groupB); rhymeGroups.get(groupB).push(lineA);
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lineToGroup.has(i) && lines[i].endWord) {
        const label = String.fromCharCode(65 + nextGroupIndex);
        lineToGroup.set(i, label); rhymeGroups.set(label, [i]);
        nextGroupIndex++;
      }
    }
    rhymeGroups.forEach((lineIndices) => lineIndices.sort((a, b) => a - b));
    const pattern = lines.map((_, i) => lineToGroup.get(i) || 'X').join('');
    return { rhymeGroups, schemePattern: pattern };
  }

  assignGroupLabels(connections, rhymeGroups) {
    for (const conn of connections) {
      for (const [label, lineIndices] of rhymeGroups) {
        if (lineIndices.includes(conn.wordA.lineIndex)) { conn.groupLabel = label; break; }
      }
    }
  }

  computeStatistics(lines, connections, syntaxGateCounters = null) {
    const stats = { totalLines: lines.length, totalWords: lines.reduce((sum, l) => sum + l.words.length, 0), totalSyllables: lines.reduce((sum, l) => sum + l.syllableTotal, 0), perfectCount: 0, nearCount: 0, slantCount: 0, internalCount: 0, multiSyllableCount: 0, endRhymeCount: 0, syntaxGating: { enabled: Boolean(syntaxGateCounters?.enabled), totalCandidates: Number(syntaxGateCounters?.totalCandidates) || 0, suppressedPairs: Number(syntaxGateCounters?.suppressedPairs) || 0, weakenedPairs: Number(syntaxGateCounters?.weakenedPairs) || 0, keptPairs: Number(syntaxGateCounters?.keptPairs) || 0 } };
    for (const conn of connections) {
      if (conn.type === 'perfect') stats.perfectCount++; else if (conn.type === 'near') stats.nearCount++; else if (conn.type === 'slant') stats.slantCount++;
      if (conn.syllablesMatched >= 2) stats.multiSyllableCount++;
      if (conn.wordA.lineIndex === conn.wordB.lineIndex) stats.internalCount++; else stats.endRhymeCount++;
    }
    return stats;
  }

  emptyDocumentAnalysis() { return { lines: [], endRhymeConnections: [], internalRhymeConnections: [], allConnections: [], phraseWindows: [], rhymeGroups: new Map(), schemePattern: '', syntaxSummary: null, compiler: null, statistics: { totalLines: 0, totalWords: 0, totalSyllables: 0, perfectCount: 0, nearCount: 0, slantCount: 0, internalCount: 0, multiSyllableCount: 0, endRhymeCount: 0, syntaxGating: { enabled: false, totalCandidates: 0, suppressedPairs: 0, weakenedPairs: 0, keptPairs: 0 } } }; }
  clearCache() { this.analysisCache.clear(); }
}

export const deepRhymeEngine = new DeepRhymeEngine();
