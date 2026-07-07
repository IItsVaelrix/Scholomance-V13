/**
 * Token-weight diagnostic audit.
 *
 * CLASSIFICATION: core / pure / diagnostic
 * LAYER: codex/core
 *
 * DIAGNOSE_ONLY: observes analyzed documents and ranked candidates, but never
 * mutates pipeline state or source data.
 */

const DEFAULT_DEVIATION_THRESHOLD = 0.25;
const MIN_AUDITABLE_WEIGHT = 0.05;
const POSITIONAL_DECAY_PER_WORD = 0.06;
const SYLLABLE_SALIENCE_BONUS = 0.08;
const RARITY_WEIGHT_SCALE = 0.3;

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function computeReferenceWeight(word, termFrequency, positionInLine) {
  if (word?.isStopWord) return 0;

  const frequency = Math.max(0, Number(termFrequency) || 0);
  const idfProxy = 1 / (1 + frequency);
  const syllables = Math.max(1, Number(word?.syllableCount) || 1);
  const syllableSalience = syllables > 1
    ? (syllables - 1) * SYLLABLE_SALIENCE_BONUS
    : 0;
  const positionalFactor = Math.max(
    0.2,
    1 - positionInLine * POSITIONAL_DECAY_PER_WORD
  );
  const baseWeight = idfProxy * (1 + syllableSalience) * positionalFactor;
  const rarity = clamp01(word?.rarity);

  return clamp01(baseWeight + rarity * RARITY_WEIGHT_SCALE);
}

function heuristicSyllableCount(word) {
  const lower = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  const vowelGroups = lower.match(/[aeiouy]+/g);
  const raw = vowelGroups ? vowelGroups.length : 1;
  const silentE = lower.length > 2 && lower.endsWith('e') ? -1 : 0;
  return Math.max(1, raw + silentE);
}

function createSummary(tokenEntries, errors) {
  const auditableEntries = tokenEntries.filter(
    (entry) => entry.referenceWeight >= MIN_AUDITABLE_WEIGHT
  );
  const entriesWithDeviation = auditableEntries.filter(
    (entry) => entry.deviation !== undefined
  );
  const deviations = entriesWithDeviation.map((entry) => Math.abs(entry.deviation));
  const meanAbsoluteDeviation = deviations.length > 0
    ? deviations.reduce((sum, value) => sum + value, 0) / deviations.length
    : 0;
  const worstDeviation = deviations.length > 0 ? Math.max(...deviations) : 0;
  const worstEntry = entriesWithDeviation.find(
    (entry) => Math.abs(entry.deviation) === worstDeviation
  );

  return {
    totalTokens: tokenEntries.length,
    errorCount: errors.length,
    stopWordLeakCount: errors.filter((error) => error.kind === 'STOP_WORD_SCORED').length,
    overWeightedCount: errors.filter((error) => error.kind === 'OVER_WEIGHTED').length,
    underWeightedCount: errors.filter((error) => error.kind === 'UNDER_WEIGHTED').length,
    missingPhoneticsCount: errors.filter((error) => error.kind === 'MISSING_PHONETICS').length,
    meanAbsoluteDeviation,
    worstDeviation,
    worstToken: worstEntry?.token || '',
  };
}

/**
 * Audits token scoring drift against a transparent reference formula.
 *
 * @param {{
 *   analyzedDocument?: { allWords?: Array<object>, parsed?: { wordFrequency?: Record<string, number> } },
 *   rankedCandidates?: Array<{ token?: string, score?: number }>,
 *   deviationThreshold?: number,
 *   auditedAt?: string|null
 * }} input
 */
export function auditTokenWeights(input = {}) {
  const analyzedDocument = input.analyzedDocument || {};
  const rankedCandidates = Array.isArray(input.rankedCandidates)
    ? input.rankedCandidates
    : [];
  const deviationThreshold = typeof input.deviationThreshold === 'number'
    ? input.deviationThreshold
    : DEFAULT_DEVIATION_THRESHOLD;
  const wordFrequency = analyzedDocument.parsed?.wordFrequency || {};
  const rankerScoreMap = new Map();

  for (const candidate of rankedCandidates) {
    if (candidate && typeof candidate.token === 'string') {
      rankerScoreMap.set(candidate.token.toLowerCase(), candidate.score);
    }
  }

  const tokenEntries = [];
  const errors = [];
  const linePositionCounters = new Map();

  for (const word of Array.isArray(analyzedDocument.allWords) ? analyzedDocument.allWords : []) {
    const lineNumber = word?.lineNumber ?? 0;
    const positionInLine = linePositionCounters.get(lineNumber) ?? 0;
    linePositionCounters.set(lineNumber, positionInLine + 1);

    const normalized = String(word?.normalized || '').toLowerCase();
    const termFrequency = wordFrequency[normalized] ?? 1;
    const idfProxy = 1 / (1 + termFrequency);
    const referenceWeight = computeReferenceWeight(word, termFrequency, positionInLine);
    const hasPhonetics = Boolean(word?.phonetics?.phonemes?.length);
    const syllableCount = word?.syllableCount ?? 1;
    const rankerScore = rankerScoreMap.get(normalized);
    const deviation = rankerScore !== undefined ? rankerScore - referenceWeight : undefined;
    const token = word?.text ?? normalized;

    const entry = {
      token,
      normalized,
      referenceWeight,
      rankerScore,
      deviation,
      isStopWord: Boolean(word?.isStopWord),
      hasPhonetics,
      syllableCount,
      termFrequency,
      idfProxy,
      positionalWeight: referenceWeight,
    };
    tokenEntries.push(entry);

    if (word?.isStopWord && rankerScore !== undefined && rankerScore > 0.1) {
      errors.push({
        kind: 'STOP_WORD_SCORED',
        token,
        message: `Stop word "${token}" received ranker score ${rankerScore.toFixed(3)}.`,
        referenceWeight: 0,
        rankerScore,
        deviationMagnitude: rankerScore,
        investigateIn: 'codex/core/analysis.pipeline.js:STOP_WORDS',
      });
    }

    if (!word?.isStopWord && !hasPhonetics && referenceWeight > MIN_AUDITABLE_WEIGHT) {
      errors.push({
        kind: 'MISSING_PHONETICS',
        token,
        message: `Content word "${token}" has no phoneme data.`,
        referenceWeight,
        rankerScore,
        investigateIn: 'codex/core/phonology/phoneme.engine.js',
      });
    }

    if (!word?.isStopWord && hasPhonetics) {
      const heuristic = heuristicSyllableCount(normalized);
      if (Math.abs(syllableCount - heuristic) >= 2) {
        errors.push({
          kind: 'SYLLABLE_MISMATCH',
          token,
          message: `Syllable count mismatch for "${token}": engine=${syllableCount}, heuristic=${heuristic}.`,
          referenceWeight,
          rankerScore,
          investigateIn: 'src/lib/pls/providers/meterProvider.js',
        });
      }
    }

    if (
      deviation !== undefined &&
      referenceWeight >= MIN_AUDITABLE_WEIGHT &&
      Math.abs(deviation) > deviationThreshold
    ) {
      const kind = deviation > 0 ? 'OVER_WEIGHTED' : 'UNDER_WEIGHTED';
      errors.push({
        kind,
        token,
        message:
          `"${token}" is ${kind.replace('_', '-').toLowerCase()}. ` +
          `Reference: ${referenceWeight.toFixed(3)}, ` +
          `Ranker: ${rankerScore.toFixed(3)}, ` +
          `Deviation: ${deviation > 0 ? '+' : ''}${deviation.toFixed(3)} ` +
          `(threshold +/-${deviationThreshold}).`,
        referenceWeight,
        rankerScore,
        deviationMagnitude: Math.abs(deviation),
        investigateIn: kind === 'OVER_WEIGHTED'
          ? 'src/lib/pls/ranker.js:DEFAULT_WEIGHTS or provider scoring'
          : 'src/lib/pls/providers/*',
      });
    }
  }

  return {
    auditedAt: typeof input.auditedAt === 'string' ? input.auditedAt : new Date().toISOString(), // EXEMPT
    tokens: tokenEntries,
    errors,
    summary: createSummary(tokenEntries, errors),
    deviationThreshold,
    diagnosticMode: 'DIAGNOSE_ONLY',
  };
}

export function topTokenWeightErrors(diagnostic, limit = 10) {
  return [...(diagnostic?.errors || [])]
    .sort((left, right) => (right.deviationMagnitude ?? 0) - (left.deviationMagnitude ?? 0))
    .slice(0, limit);
}

export function formatTokenWeightReport(diagnostic) {
  const summary = diagnostic?.summary || {};
  const lines = [
    `TokenWeight Audit - ${diagnostic?.auditedAt || 'unknown'}`,
    `Tokens audited   : ${summary.totalTokens ?? 0}`,
    `Errors found     : ${summary.errorCount ?? 0}`,
    `  Over-weighted  : ${summary.overWeightedCount ?? 0}`,
    `  Under-weighted : ${summary.underWeightedCount ?? 0}`,
    `  Stop-word leak : ${summary.stopWordLeakCount ?? 0}`,
    `  Missing phon.  : ${summary.missingPhoneticsCount ?? 0}`,
    `Mean abs. dev.   : ${(summary.meanAbsoluteDeviation ?? 0).toFixed(4)}`,
    `Worst deviation  : ${(summary.worstDeviation ?? 0).toFixed(4)} ("${summary.worstToken || ''}")`,
    `Threshold        : +/-${diagnostic?.deviationThreshold ?? DEFAULT_DEVIATION_THRESHOLD}`,
    '',
  ];

  if (!diagnostic?.errors?.length) {
    lines.push('No token weight errors detected.');
  } else {
    lines.push('Top errors:');
    for (const error of topTokenWeightErrors(diagnostic, 5)) {
      lines.push(`  [${error.kind}] "${error.token}" - ${String(error.message || '').slice(0, 100)}`);
      if (error.investigateIn) {
        lines.push(`    investigate: ${error.investigateIn}`);
      }
    }
  }

  return lines.join('\n');
}

export function hasTokenWeightErrors(diagnostic) {
  return Boolean(diagnostic?.errors?.length);
}
