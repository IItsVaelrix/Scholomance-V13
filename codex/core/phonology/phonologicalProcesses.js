/**
 * Deterministic, ordered phonological rewrite rules for lightweight post-processing.
 * Rules operate over ARPAbet phone arrays and are intentionally conservative.
 */

import { VOWEL_TO_BASE_FAMILY } from './phoneme.constants.js';

function basePhone(phone) {
  return String(phone || "").replace(/[0-9]/g, "");
}

/**
 * @typedef {object} PhonologicalRuleTrace
 * @property {string} ruleId
 * @property {number} index
 * @property {string[]} before
 * @property {string[]} after
 */

/**
 * @typedef {object} ApplyProcessOptions
 * @property {boolean} [trace]
 */

/**
 * Canonical form for comparing two pronunciations of the SAME SPELLING.
 *
 * Allophones are projections off a canonical form, so "are these the same word?"
 * is decided by normalising both and comparing — not by set membership.
 *
 * What is collapsed: allophonic vowel variation, via VOWEL_TO_BASE_FAMILY, which
 * already folds AX into AH on exactly this reasoning ("schwa is the unstressed
 * allophone of the AH nucleus").
 *
 * What is NOT collapsed: stress. Stress is contrastive for a whole class of
 * heteronyms — REcord and reCORD share every phone and differ only in placement —
 * so stripping it would merge two words into one.
 *
 * Scope limit, deliberate: this covers REGULAR variation only. Irregular varietal
 * forms (schedule /ʃɛdjuːl/ vs /skɛdʒuːl/) are not projections of one canonical
 * form and must be treated as distinct forms, never smuggled through here.
 *
 * @param {string[]} phonemes ARPAbet, stress digits intact
 * @returns {string} comparable canonical string
 */
const REDUCED_NUCLEI = new Set(['AH', 'IH', 'AX', 'UH']);
const REDUCED = 'RX';

function canonicalPhones(phonemes) {
  if (!Array.isArray(phonemes)) return [];
  return phonemes.map((phone) => {
    const raw = String(phone || '');
    const base = raw.replace(/[0-9]/g, '');
    /**
     * SECONDARY STRESS COLLAPSES INTO UNSTRESSED; PRIMARY DOES NOT.
     *
     * Word identity turns on where the PRIMARY stress falls — that is the whole
     * of REcord vs reCORD. The 1/2 distinction is gradient prosody within one
     * word, and transcribers disagree about it: cross-checking the metronome's
     * hand-written tables against cmudict, all three mismatches out of 24 were
     * this and only this (contract AE0/AE2, permit IH0/IH2, address EH0/EH2).
     * Treating them as different words would split a word on a notation choice.
     */
    const digits = raw.replace(/[^0-9]/g, '').replace(/2/g, '0');

    /**
     * Unstressed reduced nuclei neutralise. cmudict writes `gravity` as both
     * G R AE1 V **AH0** T IY0 and G R AE1 V **IH0** T IY0 — one word, two
     * transcriptions of the same reduced vowel. Collapsing them only in
     * UNSTRESSED position is what keeps this safe: the contrast that separates
     * wound /AW1/ from wound /UW1/ lives in the stressed nucleus and is untouched.
     */
    if (digits === '0' && REDUCED_NUCLEI.has(base)) return REDUCED;

    const family = VOWEL_TO_BASE_FAMILY[base] || base;
    return digits ? `${family}${digits}` : family;
  });
}

export function canonicalPronunciation(phonemes) {
  return canonicalPhones(phonemes).join(' ');
}

/**
 * Do two pronunciations denote the same word?
 *
 * Allophonic/varietal difference -> same word. Phonemic contrast -> different word.
 * This is the only question phonemic reasoning is allowed to answer here; it never
 * decides WHICH word is meant.
 */
export function sameWordPronunciation(a, b) {
  const ca = canonicalPronunciation(a);
  const cb = canonicalPronunciation(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  /**
   * Epenthesis. cmudict writes `spring` as both S P R IH1 NG and
   * S P **ER0** R? IH1 NG — a reduced vowel inserted to break the onset cluster.
   * That is an insertion, not a substitution, so normalising phone-for-phone
   * cannot see it; the skeletons must be compared with reduced vowels elided.
   *
   * Elision is applied to BOTH sides and only to reduced (unstressed) nuclei, so
   * every stressed nucleus — where heteronym contrast lives — still has to match.
   */
  const skeleton = (phones) =>
    canonicalPhones(phones)
      // ER0 is a SYLLABIC R, not an inserted vowel: cmudict writes `spring` as
      // S P R IH1 NG and S P ER0 IH1 NG, where ER0 stands in for the R rather than
      // sitting beside it. Eliding it loses the consonant; mapping it back to R is
      // what makes the two skeletons comparable.
      .map((p) => (p === 'ER0' ? 'R' : p))
      .filter((p) => p !== REDUCED)
      .join(' ');
  const sa = skeleton(a);
  const sb = skeleton(b);
  if (!sa || !sb) return false;
  return sa === sb;
}

const ORDERED_RULES = Object.freeze([
  {
    id: "nasal_place_assimilation_bilabial",
    apply(buffer, index) {
      const current = buffer[index];
      const next = buffer[index + 1];
      if (current !== "N" || !next) return null;

      const nextBase = basePhone(next);
      if (!["P", "B", "M"].includes(nextBase)) return null;

      const before = [current, next];
      buffer[index] = "M";
      const after = [buffer[index], buffer[index + 1]];
      return { ruleId: this.id, index, before, after };
    },
  },
  {
    id: "terminal_mb_cluster_reduction",
    apply(buffer, index) {
      const current = buffer[index];
      const next = buffer[index + 1];
      const afterNext = buffer[index + 2];

      if (current !== "M" || next !== "B" || afterNext) return null;

      const before = [current, next];
      buffer.splice(index + 1, 1);
      const after = [buffer[index]];
      return { ruleId: this.id, index, before, after };
    },
  },
]);

/**
 * Applies ordered phonological processes to a phoneme sequence.
 * @param {string[]} phonemes
 * @param {ApplyProcessOptions} [options]
 * @returns {string[] | { phonemes: string[], trace: PhonologicalRuleTrace[] }}
 */
export function applyPhonologicalProcesses(phonemes, options = {}) {
  const buffer = Array.isArray(phonemes) ? [...phonemes] : [];
  const trace = [];

  for (let index = 0; index < buffer.length; index += 1) {
    for (const rule of ORDERED_RULES) {
      const applied = rule.apply(buffer, index);
      if (!applied) continue;
      if (options.trace) trace.push(applied);
    }
  }

  if (options.trace) return { phonemes: buffer, trace };
  return buffer;
}

export const PHONOLOGICAL_PROCESS_RULES = ORDERED_RULES;
