import { CANDIDATE_SOURCES, MIN_GRAPHEME_OVERLAP, MAX_CANDIDATES, MIN_CANDIDATES } from '../schemas.js';
import { retrieveVectorNNPhonemeCandidates } from './vector-nn.candidate.generator.js';

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function characterOverlapAtMin(a, b, min = 3) {
  const limitedA = a.slice(0, min);
  let overlap = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] === b[i]) overlap += 1;
  }
  return overlap;
}

function boundarySafeAdaptation(word, entryWord, phonemes) {
  if (!word.endsWith(entryWord) && !entryWord.endsWith(word)) {
    return phonemes;
  }
  return phonemes;
}

export function generateSubstringCandidates(word, cmuEntries, limit = MAX_CANDIDATES) {
  const upper = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (upper.length < 3) return [];

  const results = [];
  const seenPhonemes = new Set();

  for (const entry of cmuEntries) {
    const [key, phonemeVariants] = entry;
    if (key.length < MIN_GRAPHEME_OVERLAP) continue;

    const overlap = characterOverlapAtMin(upper, key, MIN_GRAPHEME_OVERLAP);
    if (overlap < MIN_GRAPHEME_OVERLAP) continue;

    const adapted = boundarySafeAdaptation(upper, key, phonemeVariants[0]);
    if (!adapted || adapted.length === 0) continue;

    const keyStr = adapted.join(' ');
    if (seenPhonemes.has(keyStr)) continue;
    seenPhonemes.add(keyStr);

    results.push({
      word: upper,
      phonemes: adapted,
      source: CANDIDATE_SOURCES.SUBSTRING,
      overlap,
      confidence: clamp01(overlap / Math.max(upper.length, key.length)),
    });

    if (results.length >= limit) break;
  }

  if (results.length < MIN_CANDIDATES) {
    const nnResults = retrieveVectorNNPhonemeCandidates(upper, cmuEntries, limit - results.length);
    for (const nnEntry of nnResults) {
      const keyStr = nnEntry.phonemes.join(' ');
      if (!seenPhonemes.has(keyStr)) {
        seenPhonemes.add(keyStr);
        results.push({
          word: upper,
          phonemes: nnEntry.phonemes,
          source: CANDIDATE_SOURCES.VECTOR_NN,
          overlap: nnEntry.overlap,
          confidence: nnEntry.similarity,
        });
      }
      if (results.length >= limit) break;
    }
  }

  return results.slice(0, limit);
}
