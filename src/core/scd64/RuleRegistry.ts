import type { SourceFile, Node } from 'ts-morph';
import { generateSCD64 } from './generateSCD64FromSlots';
import { BUG_FAMILIES } from './glossary';

export interface SCD64DiagnosticMatch {
  ruleId: string;
  family: string;
  similarity: string;
  severity: "warning" | "error";
  targetNode: Node;
  evidence: string[];
  remediation: string[];
  predictedSCD64: string;
}

export interface SCD64Rule {
  id: string;
  family: string;
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[];
}

class Registry {
  private rules: SCD64Rule[] = [];

  register(rule: SCD64Rule) {
    this.rules.push(rule);
  }

  evaluateAll(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    const matches: SCD64DiagnosticMatch[] = [];
    for (const rule of this.rules) {
      matches.push(...rule.evaluate(sourceFile));
    }
    return matches;
  }
}

export const RuleRegistry = new Registry();

// --- Day 1 Rules ---

const LEGACY_PATTERNS: Record<string, RegExp[]> = {
  COLOR_DRAGON: [
    /\bgetGlobalCharStart\s*\(/,
    /\banalysisMap\s*(?:\.|\[|\s*=|;|,|\))/,
    /\.set\([a-zA-Z_$.?\s]+\.toLowerCase\(\)/,
    /\.get\([a-zA-Z_$.?\s]+\.toLowerCase\(\)/,
  ],
  GATE_DATA_ABSENT: [
    /deepAnalysis\?\.syntaxLayer\?\.allConnections/
  ],
  RESONANCE_GHOST: [
    // Require assignment-context: a real gate-nulling reassignment, NOT a
    // destructuring default param (`{ resonantCharStarts = null }`) or a
    // default arg (`resonantCharStarts = null,`). The negative lookahead
    // rejects a trailing `,` or `}`, which only occur in default/destructuring
    // positions — mirroring how COLOR_DRAGON's patterns require code-syntax
    // context so benign mentions don't trip a 100% false positive.
    /resonantCharStarts\s*=\s*null\b(?!\s*[,}])/,
    /resonantCharStarts\s*=\s*\[\s*\](?!\s*[,}])/,
    /qualifies\s*=\s*\(\s*\)\s*=>/
  ],
  GHOST_LOGIC: [
    // Singular form of a normally-plural critical identifier — the ghost
    // variable that looks correct but references a different binding.
    /\bresonantCharStart\b(?!s\b)/,
    /\banalyzedWordByCharStart\b(?!s\b)/,
    // deepAnalysis vs analysis: both are analysis objects but with different
    // shapes; using the wrong one in a critical path is a ghost.
    /\bdeepAnalysis\b(?![?.\s]*\?\.)/,
  ]
};

const FIX_PATTERNS: Record<string, RegExp[]> = {
  COLOR_DRAGON: [
    /computeCharStartFromLexical/,
    /resolveTokenDataAtPosition/
  ],
  GATE_DATA_ABSENT: [
    /resolveResonanceConnections/
  ],
  RESONANCE_GHOST: [
    /resonantCharStarts\s*=\s*new Set\(/,
    // The gate is now a tiered Map built by buildResonanceGate; either the Map
    // construction or the builder call is a valid "gate constructed" signal.
    /resonantCharStarts\s*=\s*new Map\(/,
    /buildResonanceGate/,
    /MIN_RESONANCE_SCORE/
  ],
  GHOST_LOGIC: [
    // The canonical plural forms — their presence means the correct identifier
    // is in use, suppressing the ghost alarm.
    /\bresonantCharStarts\b/,
    /\banalyzedWordsByCharStart\b/,
    // Safe optional-chaining on deepAnalysis means it's being used correctly
    // rather than confused with a non-optional analysis object.
    /\bdeepAnalysis\?\./,
  ]
};

const REMEDIATION_HINTS: Record<string, string[]> = {
  COLOR_DRAGON: [
    "[BREAKPOINT] Set a breakpoint where TruesightPlugin computes global charStart to verify coordinate drift.",
    "[INSPECT] Compare backend source-relative charStart against frontend Lexical sibling accumulation in compileVerseToIR.js.",
    "[AVOID] Do not patch shouldColor() directly until coordinate authority is verified — fix the offset calculation instead."
  ],
  GATE_DATA_ABSENT: [
    "[INSPECT] Check the useVerseSynthesis catch path to ensure local fallback syntaxLayer construction provides connections.",
    "[INSPECT] Verify the 429 rate-limit path correctly falls back without starving the resonance gate.",
    "[FIX] Import and use resolveResonanceConnections() to explicitly merge or bypass missing server connections."
  ],
  RESONANCE_GHOST: [
    "[BREAKPOINT] Check if resonantCharStarts Set construction loop in ReadPage.jsx is skipped entirely.",
    "[INSPECT] Ensure MIN_RESONANCE_SCORE threshold check correctly builds the Set rather than returning null/empty.",
    "[AVOID] Do not explicitly zero out the gate Set on unhandled paths; initialize as an empty Set object."
  ],
  GHOST_LOGIC: [
    "[SEMANTIC_DIFF] Compare every occurrence of the singular identifier against its plural counterpart. They resolve to different bindings.",
    "[INSPECT] Check if the singular form was introduced by a typo (missing 's') or by destructuring the wrong object.",
    "[FIX] Replace the singular ghost identifier with its correct plural form, then verify all downstream consumers receive the expected data shape.",
    "[AVOID] Do not rename blindly — confirm the data shape matches what the surrounding code expects before switching identifiers."
  ]
};

interface LegacyRuleOverride {
  /** Diagnostic id; defaults to `SCD64.${family}.LEGACY_EVIDENCE`. */
  ruleId?: string;
  /** Legacy (bad) patterns; defaults to LEGACY_PATTERNS[family]. */
  legacy?: RegExp[];
  /** Fix (good) patterns whose presence suppresses; defaults to FIX_PATTERNS[family]. */
  fix?: RegExp[];
  /** Remediation hints; defaults to REMEDIATION_HINTS[family]. */
  remediation?: string[];
}

/**
 * Evaluate a legacy/fix pattern pair against a file. By default it reads the
 * per-family pattern maps, but callers can pass explicit patterns so that a
 * single SCD64 family (e.g. COLOR_DRAGON) can host several independent rules
 * without their pattern sets cross-contaminating each other's suppression.
 */
function evaluateLegacyPatterns(
  sourceFile: SourceFile,
  family: string,
  override: LegacyRuleOverride = {},
): SCD64DiagnosticMatch[] {
  const matches: SCD64DiagnosticMatch[] = [];
  const text = sourceFile.getFullText();

  const legacyPatterns = override.legacy ?? LEGACY_PATTERNS[family] ?? [];
  const fixPatterns = override.fix ?? FIX_PATTERNS[family] ?? [];
  const remediation = override.remediation ?? REMEDIATION_HINTS[family];
  const ruleId = override.ruleId ?? `SCD64.${family}.LEGACY_EVIDENCE`;

  let legacyHits = 0;
  for (const pat of legacyPatterns) {
    const m = text.match(new RegExp(pat.source, pat.flags + 'g'));
    if (m) legacyHits += m.length;
  }

  let fixHits = 0;
  for (const pat of fixPatterns) {
    const m = text.match(new RegExp(pat.source, pat.flags + 'g'));
    if (m) fixHits += m.length;
  }

  // Fix patterns suppress: a file that already contains the canonical repair
  // must not keep firing the legacy alarm (Set→Map gate migration, etc.).
  if (legacyHits > 0 && fixHits === 0) {
    // If we have legacy hits, find the first occurrence to anchor the diagnostic
    let targetNode: Node | null = null;
    const firstMatch = text.match(legacyPatterns[0]);
    if (firstMatch && firstMatch.index) {
      targetNode = sourceFile.getDescendantAtPos(firstMatch.index) || sourceFile;
    } else {
      targetNode = sourceFile;
    }

    matches.push({
      ruleId,
      family: family,
      similarity: "100%", // We use 100% since it matched the exact legacy signature
      severity: "warning",
      targetNode,
      evidence: [
        `Detected ${legacyHits} instances of legacy ${family} patterns.`
      ],
      remediation: remediation || ["Update the component to use the canonical fix patterns."],
      predictedSCD64: generateSCD64(family, true)
    });
  }

  return matches;
}

// --- vowelFamily-source divergence (COLOR_DRAGON INVARIANT) ---
// The color key (vowelFamily) must be folded through VOWEL_TO_BASE_FAMILY then
// normalizeVowelFamily, exactly as phoneme.engine.js does. Emitting a raw
// stripped ARPABET nucleus (AH/AY/OY/UH/AW…) as vowelFamily maps to the wrong
// school/color — the same source-divergence COLOR_DRAGON is about.
const VOWELFAMILY_LEGACY_PATTERNS: RegExp[] = [
  /vowelFamily:\s*baseV\b/,
  /vowelFamily:\s*stripStress\(/,
];
const VOWELFAMILY_FIX_PATTERNS: RegExp[] = [
  /normalizeVowelFamily/,
  /VOWEL_TO_BASE_FAMILY/,
];
const VOWELFAMILY_REMEDIATION: string[] = [
  "[INSPECT] vowelFamily must be folded through VOWEL_TO_BASE_FAMILY then normalizeVowelFamily — phoneme.engine.js is the authority.",
  "[FIX] Replace `vowelFamily: baseV` with `vowelFamily: normalizeVowelFamily(VOWEL_TO_BASE_FAMILY[baseV] || 'A')`.",
  "[AVOID] Do not emit a raw stripped nucleus as the color key; the school lookup expects a normalized base family.",
];

RuleRegistry.register({
  id: "SCD64.COLOR_DRAGON.LEGACY",
  family: "COLOR_DRAGON",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    return evaluateLegacyPatterns(sourceFile, "COLOR_DRAGON");
  }
});

RuleRegistry.register({
  id: "SCD64.GATE_DATA_ABSENT.LEGACY",
  family: "GATE_DATA_ABSENT",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    return evaluateLegacyPatterns(sourceFile, "GATE_DATA_ABSENT");
  }
});

RuleRegistry.register({
  id: "SCD64.RESONANCE_GHOST.LEGACY",
  family: "RESONANCE_GHOST",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    return evaluateLegacyPatterns(sourceFile, "RESONANCE_GHOST");
  }
});

RuleRegistry.register({
  id: "SCD64.COLOR_DRAGON.VOWELFAMILY_SOURCE",
  family: "COLOR_DRAGON",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    return evaluateLegacyPatterns(sourceFile, "COLOR_DRAGON", {
      ruleId: "SCD64.COLOR_DRAGON.VOWELFAMILY_SOURCE",
      legacy: VOWELFAMILY_LEGACY_PATTERNS,
      fix: VOWELFAMILY_FIX_PATTERNS,
      remediation: VOWELFAMILY_REMEDIATION,
    });
  }
});

// gene BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK — a gated painter that still
// calls wordTruesight invents vowel-family truth when backend resonance exists.
// resolveGatedTruesightPaint is the only legal gated paint entrypoint.
const FRONTEND_FALLBACK_LEGACY: RegExp[] = [
  /\bwordTruesight\s*\(/,
];
const FRONTEND_FALLBACK_FIX: RegExp[] = [
  /\bresolveGatedTruesightPaint\b/,
];
const FRONTEND_FALLBACK_REMEDIATION: string[] = [
  "[INSPECT] Gated TrueSight must paint only from backend token fields via resolveGatedTruesightPaint.",
  "[FIX] Replace wordTruesight(...) in gated Lexical/Scribe paths with resolveGatedTruesightPaint({ resonantCharStarts, charStart, tokenData, word }).",
  "[AVOID] Do not call tokenTruesight with a synthetic `{ token: word }` shell — that reopens analyzeDeep inventing hue (COLOR_DRAGON).",
];

RuleRegistry.register({
  id: "SCD64.COLOR_DRAGON.FRONTEND_FALLBACK",
  family: "COLOR_DRAGON",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    const text = sourceFile.getFullText();
    // Only fire on files that participate in the resonance gate — otherwise
    // Visualiser/ungated preview helpers that legitimately use wordTruesight
    // would false-positive.
    if (!/\bresonantCharStarts\b/.test(text) && !/\bbuildResonanceGate\b/.test(text)) {
      return [];
    }
    return evaluateLegacyPatterns(sourceFile, "COLOR_DRAGON", {
      ruleId: "SCD64.COLOR_DRAGON.FRONTEND_FALLBACK",
      legacy: FRONTEND_FALLBACK_LEGACY,
      fix: FRONTEND_FALLBACK_FIX,
      remediation: FRONTEND_FALLBACK_REMEDIATION,
    });
  }
});

RuleRegistry.register({
  id: "SCD64.GHOST_LOGIC.LEGACY",
  family: "GHOST_LOGIC",
  evaluate(sourceFile: SourceFile): SCD64DiagnosticMatch[] {
    return evaluateLegacyPatterns(sourceFile, "GHOST_LOGIC");
  }
});

