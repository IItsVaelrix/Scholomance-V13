/**
 * Sigil pipeline orchestrator (PDR §12.7).
 *
 * Wires the Resonance Alignment Engine to the transmuter: analyze the résumé against
 * the JD, derive the preserve set from the detected torque conflicts, then transmute
 * with those terms held literal. This is the load-bearing coupling of Phase 1 (PDR §1) —
 * the analysis measures a keyword gap and the transmuter is prevented from widening it.
 *
 * The score reflects the RAW résumé (analysis runs before transmutation), so it reports
 * the user's actual alignment, not the post-swap artifact.
 */

import { analyzeKeywordGap, splitPhraseSegments } from './keyword-gap.js';
import { transmuteToSigil, transmuteToSigilWithProvenance } from './transmuter.js';
import { assembleDataArchive } from './data-archive.js';
import { analyzeAcronymCoverage } from './acronyms.js';
import { analyzeResumeLegibility } from '../../../codex/core/career/ats-hmm/index.js';
import { analyzeCareerFit } from './analysis/analyze-career.js';

export { analyzeCareerFit };


const MAX_RESONANCE_ANCHORS = 6;

/** Title-cases a keyword for display ("inbound calls" → "Inbound Calls", "ci-cd" → "Ci-Cd"). */
function titleCase(term) {
  return String(term)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-'),
    )
    .join(' ');
}

/** True if `shortWords` appears as a contiguous run inside `longWords`. */
function isContiguousSubphrase(longWords, shortWords) {
  if (shortWords.length > longWords.length) return false;
  for (let i = 0; i + shortWords.length <= longWords.length; i += 1) {
    let match = true;
    for (let j = 0; j < shortWords.length; j += 1) {
      if (longWords[i + j] !== shortWords[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Resonance anchors are the keywords that appear in BOTH the résumé and the JD — i.e. the
 * candidate's genuine, on-target strengths, weight-ranked by the analyzer. Reinforcing real
 * matches is honest ATS signal; it never surfaces missing terms (that would be stuffing
 * skills the candidate lacks). Empty when there is no JD or no overlap, in which case the
 * transmuter falls back to its generic placeholders.
 *
 * Dedup is subphrase-aware: a unigram already contained in an accepted bigram ("Customer"
 * under "Customer Support") is dropped, so the line reads as distinct skills, not echoes.
 * Since matched is weight-ranked and bigrams outweigh unigrams, the more specific phrase
 * is the one that survives.
 *
 * @param {import('./keyword-gap.js').KeywordGapReport} report
 * @returns {string[]}
 */
export function deriveResonanceAnchors(report) {
  const accepted = [];
  const acceptedWords = [];
  for (const hit of report.matched || []) {
    const titled = titleCase(hit.term);
    if (!titled) continue;
    const words = titled.toLowerCase().split(' ');
    const overlaps = acceptedWords.some(
      (aw) => isContiguousSubphrase(aw, words) || isContiguousSubphrase(words, aw),
    );
    if (overlaps) continue;
    accepted.push(titled);
    acceptedWords.push(words);
    if (accepted.length >= MAX_RESONANCE_ANCHORS) break;
  }
  return accepted;
}

/**
 * @param {string} resumeText
 * @param {string} jobDescriptionText
 * @param {Object} [options] — forwarded to the analyzer (topK, minLength, etc.)
 * @returns {{ sigil: string, report: import('./keyword-gap.js').KeywordGapReport }}
 */
export function buildKeywordAwareSigil(resumeText, jobDescriptionText, options = {}) {
  const report = analyzeKeywordGap(resumeText, jobDescriptionText, options);
  const preserveKeywords = report.torqueConflicts.map((c) => c.jobTerm);
  const resonanceAnchors = deriveResonanceAnchors(report);
  const sigil = transmuteToSigil(resumeText, { ...options, preserveKeywords, resonanceAnchors });
  return { sigil, report };
}

/**
 * Superset of {@link buildKeywordAwareSigil} that also returns the Data Archive: an
 * itemized, plain-language record of every change and its rationale (verb elevations,
 * preserved keywords, JD alignment, resonance anchors, and the legibility audit).
 *
 * The `sigil` is byte-identical to `buildKeywordAwareSigil(...).sigil`. Deterministic.
 *
 * @param {string} resumeText
 * @param {string} jobDescriptionText
 * @param {Object} [options]
 * @returns {{ sigil: string, report: object, archive: ReturnType<typeof assembleDataArchive> }}
 */
export function buildSigilDataArchive(resumeText, jobDescriptionText, options = {}) {
  const report = analyzeKeywordGap(resumeText, jobDescriptionText, options);
  const preserveKeywords = report.torqueConflicts.map((c) => c.jobTerm);
  const resonanceAnchors = deriveResonanceAnchors(report);
  const { sigil, changes } = transmuteToSigilWithProvenance(resumeText, {
    ...options,
    preserveKeywords,
    resonanceAnchors,
  });
  // Audit the user's own prose (not the wrapped Sigil) so the legibility verdicts point at
  // lines they can actually edit, not the ceremonial header/footer.
  const legibility = analyzeResumeLegibility(resumeText);

  // Boundary audit: run the legibility arbiter over the JD ONE PHRASE SEGMENT PER LINE, so a
  // properly punctuated list becomes short (unflagged) lines while an unpunctuated keyword
  // run stays one long line the arbiter flags as a content pile. Those flagged segments are
  // exactly the lines where missing punctuation could merge unrelated terms in matching — we
  // surface them for the user to fix rather than guessing where the commas belong.
  const jdBoundaryAudit = analyzeResumeLegibility(splitPhraseSegments(jobDescriptionText).join('\n'));

  // Acronym coverage runs on the user's RAW résumé (the transmuter never touches acronyms),
  // surfacing single-form usages so the author can add the missing variant for literal ATS scans.
  const acronymCoverage = analyzeAcronymCoverage(resumeText, jobDescriptionText, options);

  const archive = assembleDataArchive({
    changes,
    report,
    legibility,
    jdBoundaryWarnings: jdBoundaryAudit.flagged,
    acronymCoverage,
  });
  return { sigil, report, archive };
}
