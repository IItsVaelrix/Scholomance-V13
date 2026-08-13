import { normalizeVowelFamily } from '../../phonology/vowelFamily.js';
import { resolvePlsVerseIRState } from '../verseIRBridge.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildCandidateRhymeKeys(candidateAnalysis) {
  const keys = new Set();

  if (typeof candidateAnalysis?.rhymeKey === 'string' && candidateAnalysis.rhymeKey) {
    keys.add(candidateAnalysis.rhymeKey);
  }

  if (Array.isArray(candidateAnalysis?.extendedRhymeKeys)) {
    candidateAnalysis.extendedRhymeKeys.forEach((key) => {
      const normalizedKey = String(key || '').trim();
      if (normalizedKey) keys.add(normalizedKey);
    });
  }

  return keys;
}

function resolveTargetVowelFamily(targetAnalysis, verseIRTarget) {
  return normalizeVowelFamily(
    targetAnalysis?.vowelFamily
    || verseIRTarget?.primaryStressedVowelFamily
    || verseIRTarget?.terminalVowelFamily
    || null
  );
}

function getVerseIRCandidateSignal(candidateAnalysis, verseIRState) {
  if (!candidateAnalysis || !verseIRState) {
    return 0;
  }

  const candidateRhymeKeys = buildCandidateRhymeKeys(candidateAnalysis);
  const candidateFamily = normalizeVowelFamily(candidateAnalysis?.vowelFamily || null);
  const previousLineEnd = verseIRState.previousLineEnd || null;
  const currentLine = verseIRState.currentLine || null;

  let signal = 0;

  if (previousLineEnd?.rhymeTailSignature && candidateRhymeKeys.has(previousLineEnd.rhymeTailSignature)) {
    signal = 1;
  }

  const targetVowelFamily = normalizeVowelFamily(
    previousLineEnd?.primaryStressedVowelFamily
    || previousLineEnd?.terminalVowelFamily
    || null
  );
  if (targetVowelFamily && candidateFamily === targetVowelFamily) {
    signal = Math.max(signal, 0.72);
  }

  if (currentLine?.dominantVowelFamily && candidateFamily === currentLine.dominantVowelFamily) {
    signal = Math.max(signal, currentLine.repeatedWindowCount > 0 ? 0.48 : 0.36);
  }

  return signal;
}

/**
 * RhymeProvider — Generator provider.
 * Detects the rhyme target from the previous line's last word,
 * returns candidates scored by rhyme strength.
 */
export async function rhymeProvider(context, engines) {
  const { prevLineEndWord, prevWord } = context;
  if (!prevLineEndWord) return [];

  const { phonemeEngine, rhymeIndex, dictionaryAPI, trie } = engines;
  const verseIRState = resolvePlsVerseIRState(context);
  const verseIRTarget = verseIRState?.previousLineEnd || null;
  const targetWord = verseIRTarget?.word || prevLineEndWord;
  const targetAnalysis = phonemeEngine.getAnalysis(targetWord);
  if (!targetAnalysis && !verseIRTarget) return [];

  const targetRhymeKey = targetAnalysis?.rhymeKey || verseIRTarget?.rhymeTailSignature || '';
  const targetRhymeTailSignature = verseIRTarget?.rhymeTailSignature || targetAnalysis?.rhymeKey || '';
  const targetVowelFamily = resolveTargetVowelFamily(targetAnalysis, verseIRTarget);
  const targetUpper = String(targetWord).toUpperCase();
  const prefixUpper = String(context.prefix || '').toUpperCase();
  const prevWordLower = String(prevWord || '').toLowerCase();

  const buildRankMap = (words = []) => {
    const out = new Map();
    const total = words.length || 1;
    words.forEach((token, index) => {
      const normalized = String(token || '').toUpperCase();
      if (!normalized || out.has(normalized)) return;
      out.set(normalized, Math.max(0, 1 - (index / total)));
    });
    return out;
  };

  const sequentialRankMap = (trie && prevWordLower && typeof trie.predictNext === 'function')
    ? buildRankMap(trie.predictNext(prevWordLower, 40))
    : new Map();

  const seen = new Set();
  const results = [];
  let maxFrequency = 1;

  const addCandidate = (entry, baseScore) => {
    const tokenUpper = String(entry?.token || '').toUpperCase();
    if (!tokenUpper) return;
    if (seen.has(tokenUpper)) return;
    if (tokenUpper === targetUpper) return;
    if (prefixUpper && !tokenUpper.startsWith(prefixUpper)) return;

    const frequency = Number(entry?.frequency) || 0;
    const frequencySignal = Math.log10(frequency + 1.1) / Math.log10(maxFrequency + 1.1);
    const sequentialSignal = sequentialRankMap.get(tokenUpper) || 0;
    const candidateAnalysis = phonemeEngine.getAnalysis(tokenUpper);
    const verseIRSignal = getVerseIRCandidateSignal(candidateAnalysis, verseIRState);
    const score = clamp(
      (baseScore * 0.71) + (sequentialSignal * 0.16) + (frequencySignal * 0.07) + (verseIRSignal * 0.06),
      0,
      1
    );

    seen.add(tokenUpper);
    results.push({
      token: tokenUpper.toLowerCase(),
      score,
      badge: score >= 0.7 ? 'RHYME' : null,
      frequency,
    });
  };

  const exactMatches = targetRhymeKey ? rhymeIndex.getByRhymeKey(targetRhymeKey) : [];
  maxFrequency = Math.max(
    maxFrequency,
    ...exactMatches.map((entry) => Number(entry?.frequency) || 0)
  );
  for (const entry of exactMatches) {
    addCandidate(entry, 1.0);
  }

  const familyMatches = targetVowelFamily ? rhymeIndex.getByVowelFamily(targetVowelFamily) : [];
  maxFrequency = Math.max(
    maxFrequency,
    ...familyMatches.map((entry) => Number(entry?.frequency) || 0)
  );
  for (const entry of familyMatches) {
    if (seen.has(entry.token)) continue;

    const candidateAnalysis = phonemeEngine.getAnalysis(entry.token);
    if (!candidateAnalysis) continue;

    const candidateRhymeKeys = buildCandidateRhymeKeys(candidateAnalysis);
    const verseIRSignal = getVerseIRCandidateSignal(candidateAnalysis, verseIRState);
    let score = 0.5;

    if (targetRhymeTailSignature && candidateRhymeKeys.has(targetRhymeTailSignature)) {
      score = 0.86;
    } else if (candidateAnalysis.coda && targetAnalysis?.coda) {
      if (phonemeEngine.checkCodaMutation(candidateAnalysis.coda, targetAnalysis.coda)) {
        score = 0.75;
      }
    } else if (!candidateAnalysis.coda && !targetAnalysis?.coda) {
      score = 0.7;
    }

    if (verseIRSignal > 0) {
      score = Math.max(score, clamp((score * 0.78) + (verseIRSignal * 0.22), 0, 1));
    }

    addCandidate(entry, score);
  }

  if (dictionaryAPI && typeof dictionaryAPI.lookup === 'function') {
    try {
      const apiResult = await dictionaryAPI.lookup(targetWord);
      const dbRhymes = Array.isArray(apiResult?.rhymes) ? apiResult.rhymes : [];

      for (const word of dbRhymes.slice(0, 30)) {
        const upper = String(word || '').trim().toUpperCase();
        if (!upper || seen.has(upper) || upper === targetUpper) continue;
        if (prefixUpper && !upper.startsWith(prefixUpper)) continue;

        let score = 0.6;
        const candidateAnalysis = phonemeEngine.getAnalysis(upper);
        const candidateRhymeKeys = buildCandidateRhymeKeys(candidateAnalysis);
        const verseIRSignal = getVerseIRCandidateSignal(candidateAnalysis, verseIRState);

        if (candidateAnalysis) {
          if ((targetRhymeTailSignature && candidateRhymeKeys.has(targetRhymeTailSignature))
            || (targetRhymeKey && candidateRhymeKeys.has(targetRhymeKey))) {
            score = 0.95;
          } else if (normalizeVowelFamily(candidateAnalysis.vowelFamily || null) === targetVowelFamily) {
            score = 0.75;
          }
        }

        if (verseIRSignal > 0) {
          score = Math.max(score, clamp((score * 0.8) + (verseIRSignal * 0.2), 0, 1));
        }

        addCandidate({ token: upper, frequency: 0 }, score);
      }
    } catch (_error) {
      // Dictionary unavailable - local rhyme index results are still returned.
    }
  }

  results.sort((a, b) => b.score - a.score || (b.frequency || 0) - (a.frequency || 0));
  return results.map(({ frequency: _frequency, ...candidate }) => candidate);
}
