/**
 * VerseSynthesis AMP — Unified Linguistic Analytical MicroProcessor
 * 
 * The authoritative engine for transmuting raw syntax into structured magic.
 * Integrates VerseIR, RhymeDetection, and MeterAnalysis into a single O(1) lookup field.
 * 
 * Logic Domain: Vaelrix Law 5 (Pure Analysis)
 */

import { analyzeText } from "../../../analysis.pipeline.js";
import { buildSyntaxLayer } from "../../syntax.layer.js";
import { buildHiddenHarkovSummary } from "../../models/harkov.model.js";
import { compileVerseToIR } from "./compileVerseToIR.js";
import { detectScheme, analyzeMeter } from "../../rhymeScheme.detector.js";
import { normalizeVowelFamily } from "../../../phonology/vowelFamily.js";
import { analyzeLiteraryDevices, detectEmotionDetailed } from "../../literaryDevices.detector.js";
import { resolveSonicChroma } from "../../../phonology/chroma.resolver.js";
import { decodeBytecode } from "../bytecodeRenderer.js";
import { buildResonancePalette, resolveResonanceColor } from "../color/rhymeColorRegistry.js";
import { hslToHex, resolveVerseIrColor } from "../color/pcaChroma.js";
import { buildChromaKinase, phosphorylateToken } from "../color/chroma.kinase.js";
import { CHROMA_CHEFS } from "../color/chroma.bytecode.js";
import { auditTokenWeights } from "../../../tokenization/tokenWeightError.js";
import { combineTokenWeights } from "../../../tokenization/tokenWeightSchema.js";
// The canonical position-bound text identity used by the Lexical editor's
// resolver (resolveTokenDataAtPosition). Lives in codex/core so the vacuum
// layer contract is preserved (no src/ imports from codex/core — LING-0F03).
// src/lib/lexical/charStart.js re-exports from here.
import { buildIdentityKey } from "./identityKey.js";

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
  const scheme = detectScheme(verseIR.rhyme?.schemePattern, verseIR.rhyme?.rhymeGroups);
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

  const tokensToIterate = verseIR?.tokens || [];
  const unifiedTokens = [];
  tokensToIterate.forEach((token, index) => {
    const syntaxToken = syntaxLayer?.tokens?.[index] || {};
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

    // Which chef actually cooked this token's colour? Pipeline B wins when it has
    // a vowel family; otherwise Pipeline A's HSL is used. Two different colour
    // spaces have always swapped into this one field — now we record which.
    const chef = verseIrColor
      ? CHROMA_CHEFS.PCA
      : (sonicChroma ? CHROMA_CHEFS.SONIC : CHROMA_CHEFS.NONE);

    const kinase = buildChromaKinase(token, {
      chef,
      resolve: () => {
        if (verseIrColor) {
          return {
            hex: verseIrColor.hex,
            h: verseIrColor.oklch?.h,
            s: Math.round((verseIrColor.oklch?.c ?? 0) * 100),
            l: Math.round((verseIrColor.oklch?.l ?? 0) * 100),
            nucleus: token.terminalVowelFamily,
          };
        }
        if (sonicChroma) {
          return {
            hex: hslToHex(sonicChroma.h, sonicChroma.s, sonicChroma.l),
            h: sonicChroma.h,
            s: sonicChroma.s,
            l: sonicChroma.l,
            nucleus: token.primaryStressedVowelFamily,
          };
        }
        return { hex: null };
      },
    });

    const chroma = phosphorylateToken(token, kinase);

    const unifiedToken = {
      ...token,
      ...syntaxToken,
      hhm: hhm.tokenStateByIdentity.get(identityKey) || null,
      vowelFamily: normalizeVowelFamily(token.primaryStressedVowelFamily),
      verseIrColor,
      precomputed: {
        sonicChroma,
        decoded,
        chroma,
        verseIrColorHex: verseIrColor?.hex || null,
        // The kinase decides. A colour that cannot justify itself is not painted —
        // the token goes grey, and its stamp says exactly why.
        hex: chroma.committed ? chroma.color : null
      }
    };

    unifiedTokens[index] = unifiedToken;

    tokenByIdentity.set(identityKey, unifiedToken);
    // Also index by the position-bound text identity the Lexical resolver
    // queries (buildIdentityKey(word, charStart)). The colon key
    // `lineIndex:wordIndex:charStart` is for index-based consumers (ReadPage's
    // truesightDebugWords); the editor's identity fallback never carried
    // line/word indices, so without this dash key it could never match.
    if (token.word) {
      tokenByIdentity.set(buildIdentityKey(token.word, token.charStart), unifiedToken);
    }
    tokenByCharStart.set(token.charStart, unifiedToken);
    
    if (!tokenByNormalizedWord.has(token.normalized)) {
      tokenByNormalizedWord.set(token.normalized, unifiedToken);
    }
  });

  // 7. Authority Registry Unification
  const rhymeColorRegistry = buildResonancePalette(Array.from(tokenByIdentity.values()), currentSchool);

  const rawDocWeights = analyzedDoc.parsed?.tokenWeights ?? {};
  const combinedTokenWeights = {};

  for (const [normalizedWord, unifiedToken] of tokenByNormalizedWord.entries()) {
    if (!normalizedWord) continue;

    const docWeight = rawDocWeights[normalizedWord] ?? null;
    const syntacticWeight = typeof unifiedToken?.hhm?.tokenWeight === 'number'
      ? unifiedToken.hhm.tokenWeight
      : null;

    if (docWeight === null && syntacticWeight === null) {
      continue;
    }

    combinedTokenWeights[normalizedWord] = combineTokenWeights({
      normalized: normalizedWord,
      document: docWeight,
      syntactic: syntacticWeight,
      activation: null,
    });
  }

  for (const [word, weight] of Object.entries(rawDocWeights)) {
    if (!(word in combinedTokenWeights)) {
      combinedTokenWeights[word] = weight;
    }
  }

  let tokenWeightDiagnostic = null;
  try {
    tokenWeightDiagnostic = auditTokenWeights({
      analyzedDocument: analyzedDoc,
      rankedCandidates: [],
    });
  } catch (auditError) {
    console.warn('[VerseSynthesis] tokenWeight audit failed silently:', auditError);
  }

  const stampedVerseIR = Object.freeze({
    ...verseIR,
    tokens: Object.freeze(unifiedTokens),
  });

  return Object.freeze({
    timestamp: Date.now(), // EXEMPT
    verseIR: stampedVerseIR,
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
    totalSyllables: stampedVerseIR.metadata?.syllableCount ?? stampedVerseIR.tokens.reduce((n, t) => n + (t.syllableCount || 0), 0),
    tokenWeights: Object.keys(combinedTokenWeights).length > 0
      ? combinedTokenWeights
      : rawDocWeights,
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
    rhymeColorRegistry: new Map(),
    totalSyllables: 0,
    tokenWeights: {},
    tokenWeightDiagnostic: null,
    isPure: true
  });
}
