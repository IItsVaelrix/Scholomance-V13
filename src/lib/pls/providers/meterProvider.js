/**
 * MeterProvider — Scorer provider.
 * Scores candidates by how well their syllable count fits the line's needs.
 */
export function meterProvider(context, engines, candidates) {
  const { currentLineWords, targetSyllableCount, priorLineSyllableCounts } = context;
  const { phonemeEngine } = engines;
  if (!phonemeEngine || candidates.length === 0) return candidates;

  // Count syllables already on the current line
  let currentSyllables = 0;
  for (const word of (currentLineWords || [])) {
    const analysis = phonemeEngine.getAnalysis(word);
    if (analysis) currentSyllables += analysis.syllableCount || 1;
  }

  // Determine target line length in syllables
  let target = targetSyllableCount || null;
  if (!target && priorLineSyllableCounts && priorLineSyllableCounts.length > 0) {
    // Infer from prior lines: use the median
    const sorted = [...priorLineSyllableCounts].sort((a, b) => a - b);
    target = sorted[Math.floor(sorted.length / 2)];
  }
  if (!target) target = 10; // reasonable default for English verse

  const remaining = Math.max(1, target - currentSyllables);

  return candidates.map(c => {
    const analysis = phonemeEngine.getAnalysis(c.token);
    const candidateSyllables = analysis?.syllableCount || 1;
    const delta = Math.abs(candidateSyllables - remaining);
    const score = Math.max(0, 1 - (delta / Math.max(remaining, 1)));

    return {
      ...c,
      scores: { ...c.scores, meter: score },
      badge: score >= 0.8 ? 'METER' : (c.badge || null),
    };
  });
}
