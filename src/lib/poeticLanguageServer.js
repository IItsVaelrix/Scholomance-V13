/**
 * PoeticLanguageServer (PLS)
 *
 * LSP-style orchestration layer that wires phonetic engines as competing
 * completion providers with a unified ranker. Pure JS — no React dependencies.
 *
 * Architecture:
 *   Cursor context → Generators (rhyme, prefix) produce candidates
 *                  → Scorers (meter, color) rank them
 *                  → Ranker merges weighted scores → ScoredCandidate[]
 */

import { RhymeIndex } from './pls/rhymeIndex.js';
import { rhymeProvider } from './pls/providers/rhymeProvider.js';
import { prefixProvider } from './pls/providers/prefixProvider.js';
import { synonymProvider } from './pls/providers/synonymProvider.js';
import { meterProvider } from './pls/providers/meterProvider.js';
import { colorProvider } from './pls/providers/colorProvider.js';
import { validityProvider } from './pls/providers/validityProvider.js';
import { democracyProvider } from './pls/providers/democracyProvider.js';
import { predictabilityProvider } from './pls/providers/predictabilityProvider.js';
import { rankCandidates, DEFAULT_WEIGHTS } from './pls/ranker.js';
import { 
  createTokenGraphSemanticRepo, 
  createTokenGraphSequenceRepo, 
  createRitualPredictionEngine, 
  processorBridge, 
  PhonemeEngine as CanonicalPhonemeEngine 
} from './engine.adapter.js';

function resolvePredictionSchool(phonemeEngine, analysis) {
  const vowelFamily = Array.isArray(analysis?.vowelFamily)
    ? analysis.vowelFamily[0]
    : analysis?.vowelFamily;
  if (!vowelFamily || typeof phonemeEngine?.getSchoolFromVowelFamily !== 'function') {
    return null;
  }
  return phonemeEngine.getSchoolFromVowelFamily(vowelFamily);
}

/**
 * @typedef {object} PLSContext
 * @property {string} prefix - Current partial word being typed (may be "")
 * @property {string|null} prevWord - Completed word immediately before cursor
 * @property {string|null} prevLineEndWord - Last word of previous non-empty line
 * @property {string[]} currentLineWords - All completed words on current line
 * @property {number|null} targetSyllableCount - Expected syllable count for this line (optional)
 * @property {number[]} priorLineSyllableCounts - Syllable counts of prior lines (for meter inference)
 * @property {{ rhymeAffinityScore?: number, constellationDensity?: number, internalRecurrenceScore?: number, phoneticNoveltyScore?: number } | null} [plsPhoneticFeatures]
 * @property {object} [syntaxContext] - Optional context for CODEx Judiciary { role, lineRole, stressRole, rhymePolicy, hhm? }
 */

/**
 * @typedef {object} ScoredCandidate
 * @property {string} token - The word
 * @property {number} score - Final combined score (0-1)
 * @property {object} scores - Per-provider raw scores { rhyme, meter, color, prefix, synonym, validity, democracy, predictability }
 * @property {string[]} badges - E.g., ["RHYME", "METER", "COLOR", "DEMOCRACY"]
 * @property {string} ghostLine - Completed line preview text
 */

export class PoeticLanguageServer {
  /**
   * @param {object} opts
   * @param {object} opts.phonemeEngine - PhonemeEngine instance
   * @param {object} opts.trie - TriePredictor instance
   * @param {object} [opts.spellchecker] - Spellchecker instance (optional)
   * @param {object|null} [opts.dictionaryAPI] - Scholomance dictionary API (optional)
  */
  constructor({ phonemeEngine, trie, spellchecker = null, dictionaryAPI = null }) {
    this.phonemeEngine = phonemeEngine;
    this.trie = trie;
    this.spellchecker = spellchecker;
    this.dictionaryAPI = dictionaryAPI;
    this.sequenceGraphRepo = createTokenGraphSequenceRepo({ trie });
    this.semanticGraphRepo = createTokenGraphSemanticRepo();
    this.ritualPredictionEngine = createRitualPredictionEngine({
      sequenceGraphRepo: this.sequenceGraphRepo,
      semanticGraphRepo: this.semanticGraphRepo,
      analyzeWord: (token) => this.phonemeEngine?.getAnalysis?.(token) || null,
      resolveSchool: (analysis) => resolvePredictionSchool(this.phonemeEngine, analysis),
    });
    this.rhymeIndex = new RhymeIndex();
    this.weights = { ...DEFAULT_WEIGHTS };
    this.ready = false;
  }

  /**
   * Build the rhyme candidate index from a word list.
   * Call once after corpus is loaded.
   * @param {string[]} wordList
   */
  async buildIndex(wordList) {
    // The bridge processor always uses the canonical PhonemeEngine. When a
    // caller injects a different engine (tests, custom configurations), the
    // rhymeIndex must be built with that injected engine for analysis parity.
    if (this.phonemeEngine !== CanonicalPhonemeEngine) {
      this.rhymeIndex.build(wordList, this.phonemeEngine);
      this.ready = true;
      return;
    }

    // V12 PERFORMANCE: Offload to Microprocessor Factory for "Instant" page load
    try {
      const serializedIndex = await processorBridge.execute('pls.index', { wordList });
      this.rhymeIndex.hydrate(serializedIndex);
    } catch (err) {
      console.warn('[PLS] Background indexing failed, falling back to main thread:', err);
      this.rhymeIndex.build(wordList, this.phonemeEngine);
    }
    this.ready = true;
  }

  /**
   * Main entry point. Returns scored and ranked candidates.
   * @param {PLSContext} context
   * @param {object} [options]
   * @param {number} [options.limit=10]
   * @param {object} [options.weights] - Override provider weights
   * @returns {Promise<ScoredCandidate[]>}
   */
  async getCompletions(context, options = {}) {
    if (!this.ready) return [];

    const { limit = 10, weights } = options;
    const effectiveWeights = weights ? { ...this.weights, ...weights } : this.weights;

    const engines = {
      phonemeEngine: this.phonemeEngine,
      trie: this.trie,
      spellchecker: this.spellchecker,
      rhymeIndex: this.rhymeIndex,
      dictionaryAPI: this.dictionaryAPI,
      sequenceGraphRepo: this.sequenceGraphRepo,
      semanticGraphRepo: this.semanticGraphRepo,
      ritualPredictionEngine: this.ritualPredictionEngine,
    };

    // Phase 1: Generators produce candidate pools
    const [rhymeResults, prefixResults, synonymResults] = await Promise.all([
      rhymeProvider(context, engines),
      prefixProvider(context, engines),
      this.dictionaryAPI
        ? synonymProvider(context, engines)
        : Promise.resolve([]),
    ]);

    const generatorResults = {
      rhyme: rhymeResults,
      prefix: prefixResults,
      synonym: synonymResults,
    };

    // Phase 2: Collect all unique candidates for scorers
    const allCandidates = [];
    const seen = new Set();
    for (const results of Object.values(generatorResults)) {
      for (const r of results) {
        if (!seen.has(r.token)) {
          seen.add(r.token);
          allCandidates.push({ token: r.token, score: 0, scores: {}, badge: null });
        }
      }
    }

    // Phase 3: Scorers rank the combined candidate pool
    const [meterResults, colorResults, validityResults, democracyResults, predictabilityResults] = await Promise.all([
      Promise.resolve(meterProvider(context, engines, allCandidates)),
      Promise.resolve(colorProvider(context, engines, allCandidates)),
      this.dictionaryAPI
        ? validityProvider(context, engines, allCandidates)
        : Promise.resolve(allCandidates),
      democracyProvider(context, engines, allCandidates),
      Promise.resolve(predictabilityProvider(context, engines, allCandidates)),
    ]);

    const scorerResults = {
      meter: meterResults,
      color: colorResults,
      validity: validityResults,
      democracy: democracyResults,
      predictability: predictabilityResults,
    };

    // Phase 4: Rank and return
    return rankCandidates(generatorResults, scorerResults, effectiveWeights, context, limit);
  }

  /** Get current provider weights. */
  getWeights() {
    return { ...this.weights };
  }

  /** Update weights at runtime. */
  setWeights(weights) {
    Object.assign(this.weights, weights);
  }
}
