import { normalizeVowelFamily } from '../../phonology/vowelFamily.js';
import { resolvePlsVerseIRState } from '../verseIRBridge.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function resolveColorFamily(value) {
  const raw = String(value || '').trim().toUpperCase();
  return raw || normalizeVowelFamily(value || '');
}

// Inline centroid builder (replaces missing buildVerseIrColorCentroid)
function buildVerseIrColorCentroid(weightedFamilies) {
  if (!weightedFamilies || weightedFamilies.length === 0) return null;
  
  const totalWeight = weightedFamilies.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight <= 0) return null;
  
  // Simple centroid: weighted average of family indices
  const familyIndexMap = new Map([
    ['IY', 0], ['IH', 1], ['EH', 2], ['AE', 3],
    ['AA', 4], ['AO', 5], ['UH', 6], ['UW', 7],
    ['AH', 8], ['ER', 9], ['EY', 10], ['AY', 11],
    ['OY', 12], ['AW', 13], ['OW', 14], ['UX', 15]
  ]);
  
  let weightedSum = 0;
  for (const { family, weight } of weightedFamilies) {
    const idx = familyIndexMap.get(family) ?? 0;
    weightedSum += idx * weight;
  }
  
  return weightedSum / totalWeight;
}

// Inline alignment scorer (replaces missing scoreVerseIrColorAlignment)
function scoreVerseIrColorAlignment(candidateFamily, centroid) {
  const familyIndexMap = new Map([
    ['IY', 0], ['IH', 1], ['EH', 2], ['AE', 3],
    ['AA', 4], ['AO', 5], ['UH', 6], ['UW', 7],
    ['AH', 8], ['ER', 9], ['EY', 10], ['AY', 11],
    ['OY', 12], ['AW', 13], ['OW', 14], ['UX', 15]
  ]);
  
  const candidateIdx = familyIndexMap.get(candidateFamily) ?? 0;
  const distance = Math.abs(candidateIdx - centroid);
  const maxDistance = 15;
  
  return 1 - (distance / maxDistance);
}

/**
 * ColorProvider — Scorer provider.
 * Scores candidates by vowel family continuity with the current line.
 */
export function colorProvider(context, engines, candidates) {
  const { currentLineWords } = context;
  const { phonemeEngine } = engines;
  if (!phonemeEngine || candidates.length === 0) return candidates;

  const familyCounts = new Map();
  const verseIRState = resolvePlsVerseIRState(context);
  const verseIRLine = verseIRState?.currentLine || null;

  if (Array.isArray(verseIRLine?.vowelFamilies) && verseIRLine.vowelFamilies.length > 0) {
    verseIRLine.vowelFamilies.forEach(({ id, count }) => {
      const family = resolveColorFamily(id);
      const safeCount = Number(count) || 0;
      if (!family || safeCount <= 0) return;
      familyCounts.set(family, (familyCounts.get(family) || 0) + safeCount);
    });
  }

  if (familyCounts.size === 0) {
    for (const word of (currentLineWords || [])) {
      const analysis = phonemeEngine.getAnalysis(word);
      if (!analysis) continue;
      const family = resolveColorFamily(analysis.vowelFamily);
      if (family) familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    }
  }

  if (familyCounts.size === 0) return candidates;

  const totalFamilyWeight = [...familyCounts.values()].reduce((sum, count) => sum + count, 0);
  const centroid = buildVerseIrColorCentroid(
    [...familyCounts.entries()].map(([family, weight]) => ({ family, weight }))
  );
  if (!centroid) return candidates;

  return candidates.map((candidate) => {
    const analysis = phonemeEngine.getAnalysis(candidate.token);
    const candidateFamily = resolveColorFamily(analysis?.vowelFamily || '');
    if (!candidateFamily) {
      return {
        ...candidate,
        scores: { ...candidate.scores, color: 0 },
      };
    }

    const centroidScore = scoreVerseIrColorAlignment(candidateFamily, centroid);
    const familyShare = totalFamilyWeight > 0
      ? ((familyCounts.get(candidateFamily) || 0) / totalFamilyWeight)
      : 0;
    const score = clamp01((centroidScore * 0.82) + (familyShare * 0.18) + (familyCounts.has(candidateFamily) ? 0.12 : 0));

    return {
      ...candidate,
      scores: { ...candidate.scores, color: score },
      badge: score >= 0.78 ? 'COLOR' : (candidate.badge || null),
    };
  });
}
