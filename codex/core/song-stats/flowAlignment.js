import {
  ALIGNMENT_COVERAGE_MIN,
  BEAT_GRID_COVERAGE_MIN,
  DEFAULT_BEATS_PER_LINE,
  DEFAULT_BPM,
  FLOW_SPS_WEIGHT,
  FLOW_SYNC_WEIGHT,
  SPS_CEILING,
} from './constants.js';
import { isSectionHeadingLine } from './lyricTokens.js';

const VOWEL_PHONEME = /^(?:A[AEHOWY]|E[HRY]|I[HY]|O[HOWY]|U[HW])\d?$/;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function positiveOption(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function median(values) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function lineWords(line) {
  return Array.isArray(line?.words) ? line.words : [];
}

function vowelCount(word) {
  const phonemes = word?.phonetics?.phonemes ?? word?.deepPhonetics?.phonemes ?? [];
  return phonemes.filter((phoneme) => VOWEL_PHONEME.test(String(phoneme))).length;
}

function syllableCount(word) {
  if (Number.isFinite(word?.syllableCount) && word.syllableCount > 0) {
    return Math.floor(word.syllableCount);
  }
  return vowelCount(word);
}

function stressPattern(word, count) {
  const supplied = typeof word?.stressPattern === 'string'
    ? word.stressPattern.replace(/[^012]/gu, '')
    : '';
  if (supplied.length > 0) {
    return Array.from({ length: count }, (_, index) => supplied[index] ?? '0');
  }

  const phonemes = word?.phonetics?.phonemes ?? word?.deepPhonetics?.phonemes ?? [];
  const inferred = phonemes
    .filter((phoneme) => VOWEL_PHONEME.test(String(phoneme)))
    .map((phoneme) => String(phoneme).endsWith('1') ? '1' : '0');
  return Array.from({ length: count }, (_, index) => inferred[index] ?? '0');
}

function lineSyllableProfile(line) {
  const stresses = [];
  let resolvedWords = 0;

  for (const word of lineWords(line)) {
    const count = syllableCount(word);
    if (count <= 0) continue;
    resolvedWords += 1;
    stresses.push(...stressPattern(word, count));
  }

  return {
    syllables: stresses.length,
    primaryStressIndexes: stresses
      .map((stress, index) => stress === '1' ? index : -1)
      .filter((index) => index >= 0),
    resolvedWords,
    wordCount: lineWords(line).length,
  };
}

function stressDisplacement(profiles, beatsPerLine) {
  let displacementSum = 0;
  let primaryStressCount = 0;
  const halfSubdivision = 0.5 / beatsPerLine;

  for (const profile of profiles) {
    if (profile.syllables === 0) continue;
    for (const syllableIndex of profile.primaryStressIndexes) {
      const position = (syllableIndex + 0.5) / profile.syllables;
      const nearestGridPosition = (
        (Math.round(position * beatsPerLine - 0.5) + 0.5) / beatsPerLine
      );
      const distance = Math.abs(position - nearestGridPosition);
      displacementSum += clamp01(distance / halfSubdivision);
      primaryStressCount += 1;
    }
  }

  return primaryStressCount === 0
    ? 0
    : clamp01(displacementSum / primaryStressCount);
}

function hasIrregularLineStructure(profiles) {
  if (profiles.length < 2) return false;
  const counts = profiles.map((profile) => profile.syllables);
  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  if (mean === 0) return false;
  const variance = counts.reduce(
    (sum, count) => sum + ((count - mean) ** 2),
    0,
  ) / counts.length;
  return Math.sqrt(variance) / mean > 0.35;
}

/**
 * Computes aligned flow only for complete timing inputs, otherwise returning
 * the complete text-only estimate without blending partial timing data.
 *
 * @param {import('./types.js').AnalyzedDocument} doc
 * @param {{
 *   bpm?: number,
 *   beatsPerLine?: number,
 *   alignment?: {
 *     coverage01?: number,
 *     activeDurationSeconds?: number,
 *     timestampsMonotonic?: boolean,
 *     words?: Array<{
 *       startSec?: number,
 *       endSec?: number,
 *       text?: string,
 *       normalized?: string,
 *     }>,
 *   },
 *   beatGrid?: { coverage01?: number, timesSec?: number[] },
 * }} [options]
 * @returns {import('./types.js').SongStatPillar}
 */
export function computeFlowAlignment(doc, options = {}) {
  const bpm = positiveOption(options.bpm, DEFAULT_BPM);
  const beatsPerLine = positiveOption(options.beatsPerLine, DEFAULT_BEATS_PER_LINE);
  if (alignmentEligible(options.alignment, options.beatGrid)) {
    return alignedFlow(doc, options.alignment, options.beatGrid);
  }

  const estimated = estimatedFlow(doc, bpm, beatsPerLine);
  // alignment_incomplete only when timing inputs were supplied but failed
  // eligibility — not on the pure estimated path (alignment/beatGrid absent).
  const alignmentAttempted = options.alignment != null || options.beatGrid != null;
  if (!alignmentAttempted) {
    return estimated;
  }

  return {
    ...estimated,
    diagnostics: [
      ...estimated.diagnostics,
      {
        code: 'alignment_incomplete',
        message: 'Complete alignment and beat-grid coverage are required for aligned flow.',
        severity: 'warning',
      },
    ],
  };
}

function estimatedFlow(doc, bpm, beatsPerLine) {
  const lyricLines = (doc.lines ?? []).filter((line) => (
    String(line?.text ?? '').trim().length > 0 && !isSectionHeadingLine(line)
  ));
  const profiles = lyricLines.map(lineSyllableProfile);
  const bars = lyricLines.length;
  const estimatedDurationSec = bars * beatsPerLine * 60 / bpm;
  const totalSyllables = profiles.reduce(
    (sum, profile) => sum + profile.syllables,
    0,
  );
  const totalWords = profiles.reduce((sum, profile) => sum + profile.wordCount, 0);
  const resolvedWords = profiles.reduce(
    (sum, profile) => sum + profile.resolvedWords,
    0,
  );
  const sps = estimatedDurationSec > 0
    ? totalSyllables / estimatedDurationSec
    : 0;
  const stressDisplacementProxy = stressDisplacement(profiles, beatsPerLine);
  const diagnostics = [{
    code: 'estimated_one_bar_per_line',
    message: 'Estimated flow assumes one bar for each nonempty lyric source line.',
    severity: 'info',
  }];

  if (bars < 2) {
    diagnostics.push({
      code: 'estimated_flow_low_confidence',
      message: 'Estimated flow is low confidence with fewer than two lyric bars.',
      severity: 'warning',
    });
  }
  if (hasIrregularLineStructure(profiles)) {
    diagnostics.push({
      code: 'line_structure_irregular',
      message: 'Lyric-line syllable counts vary enough to weaken the one-bar-per-line estimate.',
      severity: 'info',
    });
  }

  return {
    id: 'flow_alignment',
    value: sps,
    unit: 'sps',
    secondary: {
      stressDisplacementProxy,
      estimatedDurationSec,
    },
    normalized01: (
      FLOW_SPS_WEIGHT * clamp01(sps / SPS_CEILING)
      + FLOW_SYNC_WEIGHT * stressDisplacementProxy
    ),
    fidelity: 'estimated',
    confidence01: bars < 2 ? 0.4 : 0.7,
    coverage01: totalWords > 0 ? resolvedWords / totalWords : 0,
    diagnostics,
  };
}

function nearestGridIndex(timeSec, gridTimes) {
  let nearestIndex = 0;
  let nearestDistance = Math.abs(timeSec - gridTimes[0]);

  for (let index = 1; index < gridTimes.length; index += 1) {
    const distance = Math.abs(timeSec - gridTimes[index]);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }

  return nearestIndex;
}

function wordStressWeight(word) {
  const count = syllableCount(word);
  const stresses = stressPattern(word, count);
  if (stresses.includes('1')) return 1;
  if (stresses.includes('2')) return 0.5;
  return 0;
}

function normalizedWordText(word) {
  const text = word?.normalized ?? word?.text ?? '';
  return String(text)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function correspondAlignedWords(alignmentWords, analyzedWords) {
  const correspondences = [];
  let nextAnalyzedIndex = 0;

  for (const alignedWord of alignmentWords) {
    const alignedText = normalizedWordText(alignedWord);
    if (alignedText.length === 0) continue;

    let matchedIndex = -1;
    for (let index = nextAnalyzedIndex; index < analyzedWords.length; index += 1) {
      if (normalizedWordText(analyzedWords[index]) === alignedText) {
        matchedIndex = index;
        break;
      }
    }
    if (matchedIndex < 0) continue;

    correspondences.push({
      onset: alignedWord.startSec,
      analyzedWord: analyzedWords[matchedIndex],
    });
    nextAnalyzedIndex = matchedIndex + 1;
  }

  return correspondences;
}

function syncopationIndex(correspondences, alignmentOnsets, gridTimes) {
  const toleranceSeconds = 0.05;
  let weightedSyncopation = 0;
  let stressWeightTotal = 0;

  correspondences.forEach(({ onset, analyzedWord }) => {
    const stressWeight = wordStressWeight(analyzedWord);
    if (stressWeight === 0) return;
    stressWeightTotal += stressWeight;

    const gridIndex = nearestGridIndex(onset, gridTimes);
    const metricalStrength = gridIndex % 2 === 0 ? 1 : 0.5;
    if (metricalStrength === 1) return;

    const nextStrongerTime = gridTimes[gridIndex + 1];
    const strongerPositionHasOnset = nextStrongerTime !== undefined && alignmentOnsets.some(
      (candidate) => Math.abs(candidate - nextStrongerTime) <= toleranceSeconds,
    );
    const displaced = strongerPositionHasOnset ? 0 : 1;
    weightedSyncopation += stressWeight * (1 - metricalStrength) * displaced;
  });

  return stressWeightTotal > 0
    ? clamp01(weightedSyncopation / stressWeightTotal)
    : 0;
}

function alignedFlow(doc, alignment, beatGrid) {
  const onsets = alignment.words.map((word) => word.startSec);
  const analyzedWords = Array.isArray(doc.allWords) ? doc.allWords : [];
  const correspondences = correspondAlignedWords(alignment.words, analyzedWords);
  const signedDeviationsSeconds = onsets.map((onset) => {
    const nearest = beatGrid.timesSec[nearestGridIndex(onset, beatGrid.timesSec)];
    return onset - nearest;
  });
  const absoluteDeviationsMs = signedDeviationsSeconds.map(
    (deviation) => Math.abs(deviation) * 1000,
  );
  const gridDeviationMs = median(absoluteDeviationsMs);
  const pocketBiasMs = median(signedDeviationsSeconds) * 1000;
  const pocketConsistencyMs = median(
    absoluteDeviationsMs.map((deviation) => Math.abs(deviation - gridDeviationMs)),
  );
  const syncopation = syncopationIndex(correspondences, onsets, beatGrid.timesSec);
  const totalSyllables = analyzedWords.reduce(
    (sum, word) => sum + syllableCount(word),
    0,
  );
  const sps = totalSyllables / alignment.activeDurationSeconds;
  const coverage01 = Math.min(alignment.coverage01, beatGrid.coverage01);

  return {
    id: 'flow_alignment',
    value: sps,
    unit: 'sps',
    secondary: {
      syncopationIndex: syncopation,
      gridDeviationMs,
      pocketBiasMs,
      pocketConsistencyMs,
    },
    normalized01: (
      FLOW_SPS_WEIGHT * clamp01(sps / SPS_CEILING)
      + FLOW_SYNC_WEIGHT * syncopation
    ),
    fidelity: 'aligned',
    confidence01: coverage01,
    coverage01,
    diagnostics: [],
  };
}

function alignmentEligible(alignment, beatGrid) {
  return (
    alignment?.coverage01 >= ALIGNMENT_COVERAGE_MIN
    && beatGrid?.coverage01 >= BEAT_GRID_COVERAGE_MIN
    && alignment.timestampsMonotonic === true
    && alignment.activeDurationSeconds > 0
    && Array.isArray(alignment.words)
    && alignment.words.length > 0
    && alignment.words.every((word) => Number.isFinite(word?.startSec))
    && Array.isArray(beatGrid.timesSec)
    && beatGrid.timesSec.length > 0
    && beatGrid.timesSec.every(Number.isFinite)
  );
}
