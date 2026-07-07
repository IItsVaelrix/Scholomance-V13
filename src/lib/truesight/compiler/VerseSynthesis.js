/**
 * VerseSynthesis AMP — Unified Linguistic Analytical MicroProcessor
 *
 * The authoritative engine for transmuting raw syntax into structured magic.
 * Integrates VerseIR, RhymeDetection, and MeterAnalysis into a single O(1) lookup field.
 *
 * Logic Domain: Vaelrix Law 5 (Pure Analysis)
 */

import { analyzeText } from "../../../../codex/core/analysis.pipeline.js";
import { buildSyntaxLayer } from "../../syntax.layer.js";
import { buildHiddenHarkovSummary } from "../../models/harkov.model.js";
import { compileVerseToIR } from "./compileVerseToIR.js";
import { detectScheme, analyzeMeter } from "../../rhymeScheme.detector.js";
import { normalizeVowelFamily } from '../../phonology/vowelFamily.js';
import { analyzeLiteraryDevices, detectEmotionDetailed } from "../../literaryDevices.detector.js";
import { resolveSonicChroma } from "../../../../codex/core/phonology/chroma.resolver.js";
import { decodeBytecode } from "../bytecodeRenderer.js";
import { buildResonancePalette, resolveResonanceColor } from "../color/rhymeColorRegistry.js";
import { resolveVerseIrColor } from "../color/pcaChroma.js";
// CONNECTIVE TISSUE: Wire the token weight audit into the synthesis pass so
// the diagnostic is never orphaned. The audit runs after frequency counts are
// complete (analysis.pipeline stamps weights in its second pass) so results
// are always accurate when the artifact is consumed.
import { auditTokenWeights } from "../../../core/tokenization/tokenWeightError.js";
// CONNECTIVE TISSUE (open item 2): bring the shared weight schema in so we
// can combine Harkov syntactic weights with pipeline document weights via
// combineTokenWeights() instead of discarding one or the other.
import { combineTokenWeights } from "../../../core/tokenization/tokenWeightSchema.js";

/**
 * Executes a total linguistic synthesis of the given text.
 *
 * @param {string} text - Raw verse text
 * @param {Object} options - { mode, school }
 * @returns {LinguisticArtifact} Unified analytical payload
 */
export function synthesizeVerse(text, options = {}) {
  const normalizedText = String(text || "");
  if (!normalizedText.trim()) return createEmptyArtifact();

  // 1. Structural Skeleton (The Bones)
  const analyzedDoc = analyzeText(normalizedText);
  const syntaxLayer = buildSyntaxLayer(analyzedDoc);

  // 2. Hidden Harkov Model (The Pulse)
  const hhm = buildHiddenHarkovSummary(syntaxLayer.tokens);

  // 3. VerseIR Compilation (The Physics)
  const verseIR = compileVerseToIR(normalizedText, {
    mode: options.mode || 'balanced'
  });

  // 4. Rhyme & Meter Detection (The Echo)
  const scheme = detectScheme(syntaxLayer.schemePattern, syntaxLayer.rhymeGroups);
  const meter = analyzeMeter(analyzedDoc.lines);

  // 5. Stylistic Inference (The Soul)
  const literaryDevices = analyzeLiteraryDevices(normalizedText);
  const emotion = detectEmotionDetailed(normalizedText, {
    syntaxLayer,
    hhmSummary: hhm.summary
  }).emotion;

  // 6. Token Identity Mapping & Chromatic Unification
  const tokenByIdentity = new Map();
  const tokenByCharStart = new Map();
  const tokenByNormalizedWord = new Map();

  const currentSchool = options.school || 'DEFAULT';

  verseIR.tokens.forEach((token, index) => {
    const syntaxToken = syntaxLayer.tokens[index] || {};
    const identityKey = `${token.lineIndex}:${token.tokenIndexInLine}:${token.charStart}`;

    // PIPELINE A: Phonetic Anchor
    const sonicChroma = (token.phonemes?.length > 0) ? resolveSonicChroma(token.phonemes) : null;

    // PIPELINE B: Unified Visual (Locked to Anchor)
    const verseIrColor = token.terminalVowelFamily
      ? resolveVerseIrColor(token.terminalVowelFamily, currentSchool, {
          phase: index / (verseIR.tokens.length || 1)
        })
      : null;

    const visualBytecode = token.visualBytecode || token.trueVisionBytecode || null;
    const decoded = visualBytecode ? decodeBytecode(visualBytecode) : null;

    const unifiedToken = {
      ...token,
      ...syntaxToken,
      hhm: hhm.tokenStateByIdentity.get(identityKey) || null,
      vowelFamily: normalizeVowelFamily(token.primaryStressedVowelFamily),
      verseIrColor,
      precomputed: {
        sonicChroma,
        decoded,
        hex: verseIrColor?.hex || (sonicChroma ? `hsl(${sonicChroma.h}, ${sonicChroma.s}%, ${sonicChroma.l}%)` : null)
      }
    };

    tokenByIdentity.set(identityKey, unifiedToken);
    tokenByCharStart.set(token.charStart, unifiedToken);

    if (!tokenByNormalizedWord.has(token.normalizedWord)) {
      tokenByNormalizedWord.set(token.normalizedWord, unifiedToken);
    }
  });

  // 7. Authority Registry Unification
  const rhymeColorRegistry = buildResonancePalette(Array.from(tokenByIdentity.values()), currentSchool);

  // 7b. Multi-Dimensional Token Weight Combination
  // ─────────────────────────────────────────────────
  // At this point tokenByNormalizedWord is fully built and each unified token
  // carries hhm.tokenWeight (syntactic role dimension from Harkov).
  // analyzedDoc.parsed.tokenWeights carries the document dimension (TF-IDF ×
  // syllable salience × positional decay × rarity).
  //
  // combineTokenWeights() blends them: 50% document + 35% syntactic.
  // If either dimension is missing for a token, the ratio is renormalized
  // automatically so the result is always valid.
  const rawDocWeights = analyzedDoc.parsed?.tokenWeights ?? {};
  const combinedTokenWeights = {};

  for (const [normalizedWord, unifiedToken] of tokenByNormalizedWord.entries()) {
    if (!normalizedWord) continue;

    const docWeight = rawDocWeights[normalizedWord] ?? null;
    // Harkov tokenWeight lives on hhm.tokenWeight (number, 0.05-1 range).
    const syntacticWeight = typeof unifiedToken?.hhm?.tokenWeight === 'number'
      ? unifiedToken.hhm.tokenWeight
      : null;

    if (docWeight === null && syntacticWeight === null) {
      // No data from either dimension — skip (token won't be in the map).
      continue;
    }

    combinedTokenWeights[normalizedWord] = combineTokenWeights({
      normalized: normalizedWord,
      document: docWeight,
      syntactic: syntacticWeight,
      activation: null, // activation dimension is cursor-context at request time, not synthesis time
    });
  }

  // Fall back to raw pipeline weights for any token that tokenByNormalizedWord
  // didn't cover (e.g. tokens present in analyzed doc but not in verseIR).
  for (const [word, w] of Object.entries(rawDocWeights)) {
    if (!(word in combinedTokenWeights)) {
      combinedTokenWeights[word] = w;
    }
  }

  // 8. Token Weight Audit (DIAGNOSE_ONLY — never mutates any pipeline state)
  // Runs against the analyzed document with no ranked candidates yet. This
  // catches document-level weight anomalies (missing phonetics, stop-word
  // presence, syllable mismatches) before the ranker ever sees the text.
  let tokenWeightDiagnostic = null;
  try {
    tokenWeightDiagnostic = auditTokenWeights({
      analyzedDocument: analyzedDoc,
      rankedCandidates: [], // no candidates at synthesis time; audit is document-only
    });
  } catch (auditErr) {
    // Audit failures must never surface to the user or block synthesis.
    console.warn('[VerseSynthesis] tokenWeight audit failed silently:', auditErr);
  }

  return Object.freeze({
    timestamp: Date.now(), // EXEMPT
    verseIR,
    syntaxLayer,
    hhm,
    scheme,
    meter,
    literaryDevices,
    emotion,
    tokenByIdentity,
    tokenByCharStart,
    tokenByNormalizedWord,
    rhymeColorRegistry,
    totalSyllables: verseIR.metadata.syllableCount || 0,
    // Combined token weights: pipeline document dimension (50%) blended with
    // Harkov syntactic dimension (35%). Falls back to raw pipeline weights for
    // any token that had no HHM entry.
    // Consumed by PLSContext → ranker.js to modulate candidate scores.
    tokenWeights: Object.keys(combinedTokenWeights).length > 0
      ? combinedTokenWeights
      : rawDocWeights,
    // DIAGNOSE_ONLY audit result. Null if audit errored or was skipped.
    tokenWeightDiagnostic,
    isPure: true
  });
}

function createEmptyArtifact() {
  return Object.freeze({
    timestamp: Date.now(), // EXEMPT
    verseIR: null,
    syntaxLayer: null,
    hhm: null,
    scheme: null,
    meter: null,
    literaryDevices: [],
    emotion: 'Neutral',
    tokenByIdentity: new Map(),
    tokenByCharStart: new Map(),
    tokenByNormalizedWord: new Map(),
    totalSyllables: 0,
    tokenWeights: {},
    tokenWeightDiagnostic: null,
    isPure: true
  });
}
