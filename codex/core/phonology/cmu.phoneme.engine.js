/**
 * @typedef {import("./phoneme.engine").PhonemeAnalysis} PhonemeAnalysis
 */

import { ARPABET_VOWELS, VOWEL_TO_BASE_FAMILY } from "./phoneme.constants.js";
import { Syllabifier } from "./syllabifier.js";
import { normalizeVowelFamily } from "./vowelFamily.js";
import { buildRhymeKey } from "./rhymeDomain.js";

const isBrowser = typeof window !== "undefined";
const WORD_VARIANT_SUFFIX = /\(\d+\)$/;
const CMU_DICT_RELATIVE_PATH = "../../../node_modules/cmudict/lib/cmu/cmudict.0.7a";

function findLastVowelIndex(phones) {
  for (let i = phones.length - 1; i >= 0; i -= 1) {
    const base = phones[i].replace(/[0-9]/g, "");
    if (ARPABET_VOWELS.has(base)) return i;
  }
  return -1;
}

function toAnalysisFromPhones(phones) {
  if (!Array.isArray(phones) || phones.length === 0) return null;

  const phonemes = phones.map((phone) => String(phone).trim()).filter(Boolean);
  if (phonemes.length === 0) return null;

  const syllables = Syllabifier.syllabify(phonemes);
  const safeSyllables = syllables.length > 0 ? syllables : [phonemes];
  const stressedSyllable =
    safeSyllables.find((syllable) =>
      syllable.some((phone) => ARPABET_VOWELS.has(phone.replace(/[0-9]/g, "")) && /[12]$/.test(phone))
    ) || safeSyllables[0];

  const stressedVowel = stressedSyllable.find((phone) => ARPABET_VOWELS.has(phone.replace(/[0-9]/g, "")));
  const stressedBase = stressedVowel ? stressedVowel.replace(/[0-9]/g, "") : "AH";
  const vowelFamily = normalizeVowelFamily(VOWEL_TO_BASE_FAMILY[stressedBase] || stressedBase || "A") || "A";

  const lastSyllable = safeSyllables[safeSyllables.length - 1] || [];
  const lastVowelIndex = findLastVowelIndex(lastSyllable);
  const codaParts =
    lastVowelIndex >= 0
      ? lastSyllable
          .slice(lastVowelIndex + 1)
          .map((phone) => phone.replace(/[0-9]/g, ""))
          .filter(Boolean)
      : [];
  const coda = codaParts.length > 0 ? codaParts.join("") : null;

  // rhymeKey comes from the rhyme domain (rhymeDomain.js), NOT from
  // `${vowelFamily}-${coda}`. Those two fields are read off different syllables
  // — vowelFamily from the first stressed one, coda from the last — so stitching
  // them together produced a key that was right for monosyllables by accident
  // and wrong for everything else: "repulsive" keyed AH-V and collided with
  // "love", "understood" keyed AH-D and collided with "blood".
  //
  // vowelFamily and coda are kept as-is: they are the word's dominant vowel and
  // its final consonant cluster, which is what their consumers (school colour,
  // phonology panel) actually mean by them. Only the RHYME predicate moves.
  return {
    vowelFamily,
    phonemes,
    coda,
    rhymeKey: buildRhymeKey(phonemes) || `${vowelFamily}-${coda || "open"}`,
    syllableCount: safeSyllables.length,
  };
}

/**
 * ARPAbet is a CLOSED ALPHABET — measured on cmudict.0.7a, 850,379 phone token
 * slots draw on exactly 69 distinct values. But `split()` allocates a fresh
 * string per token, so `AH0` existed as ~30,000 separate heap objects rather
 * than 30,000 references to one.
 *
 * Interning through a pool collapses that: same Map<string, string[][]>, same
 * lookups, same values, but every occurrence of a phone is the SAME string
 * instance. Measured 2026-08-14: 60.2MB -> 40.9MB, a 19.3MB saving on a 1GB
 * machine whose live working set was ~224MB.
 *
 * The pool is per-parse and dies with it; only the 69 survivors are retained,
 * held by the entries that reference them.
 */
function parseCmuDictionary(rawText) {
  const entries = new Map();
  if (!rawText) return entries;
  const phonePool = new Map();
  const intern = (phone) => {
    const existing = phonePool.get(phone);
    if (existing !== undefined) return existing;
    phonePool.set(phone, phone);
    return phone;
  };

  const lines = String(rawText).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;

    const splitIndex = trimmed.indexOf("  ");
    if (splitIndex <= 0) continue;

    const rawWord = trimmed.slice(0, splitIndex).trim().toUpperCase();
    const phonesRaw = trimmed.slice(splitIndex + 2).trim();
    if (!rawWord || !phonesRaw) continue;

    const word = rawWord.replace(WORD_VARIANT_SUFFIX, "");
    if (!word) continue;

    const phones = phonesRaw.split(/\s+/)
      .map((phone) => phone.trim())
      .filter(Boolean)
      .map(intern);
    if (phones.length === 0) continue;

    if (!entries.has(word)) entries.set(word, []);
    entries.get(word).push(phones);
  }

  return entries;
}

/**
 * CMU dictionary lookup and parsing.
 * Browser-safe: no Node APIs are touched unless running server-side.
 */
export const CmuPhonemeEngine = {
  /** @type {Promise<boolean> | null} */
  _initPromise: null,
  /** @type {boolean} */
  _available: false,
  /**
   * WHY it is unavailable. A bare `false` was the Color Dragon: callers could
   * not tell "no dictionary in this runtime" from "this word is not a word", so
   * the UI rendered letter-guesses as though they were the dictionary. A reason
   * is what lets a caller refuse to guess. See innate rule ARCH-0F0D.
   */
  _unavailableReason: null,
  /** @type {Map<string, string[][]>} */
  _entriesByWord: new Map(),
  /** @type {Map<string, PhonemeAnalysis>} */
  _analysisCache: new Map(),

  clearCache() {
    this._analysisCache.clear();
  },

  async init() {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (isBrowser) {
        this._available = false;
        this._unavailableReason = 'no pronunciation dictionary in a browser runtime; '
          + 'consume /api/phonology/analyze instead of deriving locally';
        return false;
      }

      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const url = await import("node:url");
        const currentFile = url.fileURLToPath(import.meta.url);
        const dictPath = path.resolve(path.dirname(currentFile), CMU_DICT_RELATIVE_PATH);
        const raw = await fs.readFile(dictPath, "utf8");
        this._entriesByWord = parseCmuDictionary(raw);
        this._analysisCache.clear();
        this._available = this._entriesByWord.size > 0;
      } catch (error) {
        this._entriesByWord.clear();
        this._analysisCache.clear();
        this._available = false;
      }

      return this._available;
    })();

    return this._initPromise;
  },

  /** The named degradation, for a caller that must explain a blank. */
  unavailableReason() {
    return this._available ? null : this._unavailableReason;
  },

  isAvailable() {
    return Boolean(this._available && this._entriesByWord.size > 0);
  },

  /**
   * @param {string} word
   * @returns {PhonemeAnalysis | null}
   */
  /**
   * Every pronunciation CMU records for a spelling, not just the first.
   *
   * cmudict stores heteronyms as numbered variants — WOUND / WOUND(1),
   * BASS / BASS(1), LEAD / LEAD(1) — and the loader already collects them all.
   * analyzeWord() returns variants[0] only, so a word with two pronunciations was
   * indistinguishable from a word with one. That difference is the ONLY local
   * evidence that a spelling is more than one word: multiple parts of speech is
   * not it (bank n/v, crane n/v and bark n/v are each one word).
   *
   * @param {string} word
   * @returns {string[][]} one phoneme array per recorded variant; [] when unknown
   */
  pronunciationVariants(word) {
    if (!this.isAvailable()) return [];
    const upper = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!upper) return [];
    const variants = this._entriesByWord.get(upper);
    if (!Array.isArray(variants)) return [];
    return variants.filter((v) => Array.isArray(v) && v.length > 0).map((v) => [...v]);
  },

  analyzeWord(word) {
    if (isBrowser) return null;

    if (!this._initPromise) {
      // Fire-and-forget lazy load for Node callsites that skipped explicit init.
      void this.init();
    }

    if (!this.isAvailable()) return null;

    const upper = String(word || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!upper) return null;

    const cached = this._analysisCache.get(upper);
    if (cached) return cached;

    const variants = this._entriesByWord.get(upper);
    if (!Array.isArray(variants) || variants.length === 0) return null;

    const analysis = toAnalysisFromPhones(variants[0]);
    if (!analysis) return null;

    this._analysisCache.set(upper, analysis);
    return analysis;
  },
};
