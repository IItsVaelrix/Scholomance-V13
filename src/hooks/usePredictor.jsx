import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { TriePredictor } from '../../codex/core/trie.js';
import { Spellchecker } from '../../codex/core/spellchecker.js';
import { createJudiciaryEngine } from '../../codex/core/judiciary.js';
import { createTokenGraphSemanticRepo } from '../../codex/services/token-graph/semantic.repo.js';
import { createTokenGraphSequenceRepo } from '../../codex/services/token-graph/sequence.repo.js';
import { createRitualPredictionEngine } from '../../codex/core/ritual-prediction/run.js';
import { PhonemeEngine } from '../../codex/core/phonology/phoneme.engine.js';
import { PoeticLanguageServer } from '../lib/poeticLanguageServer.js';
import { ScholomanceDictionaryAPI } from '../lib/scholomanceDictionary.api.js';

const MIN_CORPUS_WORD_LENGTH = 2;
const VALIDATION_BATCH_MAX_SIZE = 500;
// Coalescing window for spellcheck/validation batches. Was 12ms, which fired a
// request roughly every keystroke and blew the server's per-route rate limit
// (HTTP 429) - that 429 storm starved the resonance gate and greyed every word.
// 350ms batches a burst of typing into one request while staying responsive.
const VALIDATION_BATCH_WINDOW_MS = 350;

const PredictorContext = createContext(null);

function normalizeCorpusWord(value) {
  const token = String(value || '').trim().toLowerCase();
  if (token.length < MIN_CORPUS_WORD_LENGTH) return '';
  if (/^\d+$/.test(token)) return '';
  return token;
}

function normalizeSequenceWeight(weight) {
  const parsed = Number(weight);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeSequenceEntry(entry) {
  let prevRaw = null;
  let nextRaw = null;
  let weightRaw = 1;

  if (Array.isArray(entry)) {
    [prevRaw, nextRaw] = entry;
    if (entry.length >= 3) weightRaw = entry[2];
  } else if (entry && typeof entry === 'object') {
    prevRaw = entry.prev ?? entry.from ?? null;
    nextRaw = entry.next ?? entry.to ?? null;
    weightRaw = entry.weight ?? entry.count ?? entry.frequency ?? 1;
  } else {
    return null;
  }

  const prev = normalizeCorpusWord(prevRaw);
  const next = normalizeCorpusWord(nextRaw);
  if (!prev || !next) return null;

  return {
    prev,
    next,
    weight: normalizeSequenceWeight(weightRaw),
  };
}

function normalizeCorpusPayload(rawPayload) {
  const dictionaryRaw = Array.isArray(rawPayload)
    ? rawPayload
    : (Array.isArray(rawPayload?.dictionary) ? rawPayload.dictionary : []);
  const sequencesRaw = Array.isArray(rawPayload?.sequences) ? rawPayload.sequences : [];

  const dictionary = [];
  dictionaryRaw.forEach((entry) => {
    const normalized = normalizeCorpusWord(entry);
    if (!normalized) return;
    dictionary.push(normalized);
  });

  const sequenceByPair = new Map();
  const addSequence = (prev, next, weight = 1) => {
    const key = `${prev}\u0000${next}`;
    const current = sequenceByPair.get(key) || 0;
    sequenceByPair.set(key, current + normalizeSequenceWeight(weight));
  };

  if (sequencesRaw.length > 0) {
    sequencesRaw.forEach((entry) => {
      const normalizedEntry = normalizeSequenceEntry(entry);
      if (!normalizedEntry) return;
      addSequence(normalizedEntry.prev, normalizedEntry.next, normalizedEntry.weight);
    });
  } else if (Array.isArray(rawPayload)) {
    for (let i = 0; i < rawPayload.length - 1; i++) {
      const prev = normalizeCorpusWord(rawPayload[i]);
      const next = normalizeCorpusWord(rawPayload[i + 1]);
      if (!prev || !next) continue;
      addSequence(prev, next, 1);
    }
  }

  const sequences = [...sequenceByPair.entries()].map(([pair, weight]) => {
    const [prev, next] = pair.split('\u0000');
    return { prev, next, weight };
  });

  return { dictionary, sequences };
}

function resolvePredictionSchool(analysis) {
  const vowelFamily = Array.isArray(analysis?.vowelFamily)
    ? analysis.vowelFamily[0]
    : analysis?.vowelFamily;
  if (!vowelFamily) return null;
  return PhonemeEngine.getSchoolFromVowelFamily(vowelFamily);
}

function createBatchedDictionaryValidator(dictionaryAPI, {
  maxBatchSize = VALIDATION_BATCH_MAX_SIZE,
  flushWindowMs = VALIDATION_BATCH_WINDOW_MS,
} = {}) {
  const pendingByWord = new Map();
  let flushTimer = null;
  let flushInFlight = false;

  const toNormalized = (value) => String(value || '').trim().toLowerCase();

  const scheduleFlush = (delayMs = flushWindowMs) => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, delayMs);
  };

  const flush = async () => {
    if (flushInFlight || pendingByWord.size === 0) return;
    flushInFlight = true;

    try {
      while (pendingByWord.size > 0) {
        const batchEntries = [...pendingByWord.entries()].slice(0, maxBatchSize);
        batchEntries.forEach(([word]) => pendingByWord.delete(word));

        const words = batchEntries.map(([word]) => word);
        try {
          const validWords = await dictionaryAPI.validateBatch(words);
          const validSet = new Set((Array.isArray(validWords) ? validWords : []).map(toNormalized));
          batchEntries.forEach(([word, resolvers]) => {
            const isValid = validSet.has(word);
            resolvers.forEach(({ resolve }) => resolve(isValid));
          });
        } catch (error) {
          batchEntries.forEach(([, resolvers]) => {
            resolvers.forEach(({ reject }) => reject(error));
          });
        }
      }
    } finally {
      flushInFlight = false;
      if (pendingByWord.size > 0) scheduleFlush(0);
    }
  };

  const validateWord = (candidateWord) => new Promise((resolve, reject) => {
    const normalized = toNormalized(candidateWord);
    if (!normalized) {
      resolve(true);
      return;
    }

    const queue = pendingByWord.get(normalized) || [];
    queue.push({ resolve, reject });
    pendingByWord.set(normalized, queue);

    if (pendingByWord.size >= maxBatchSize) {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      void flush();
      return;
    }

    scheduleFlush();
  });

  const cancel = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const cancelError = new Error('Batched dictionary validation cancelled.');
    pendingByWord.forEach((resolvers) => {
      resolvers.forEach(({ reject }) => reject(cancelError));
    });
    pendingByWord.clear();
  };

  return { validateWord, cancel };
}

export function PredictorProvider({ children }) {
  const [model] = useState(() => new TriePredictor());
  const [spellchecker] = useState(() => new Spellchecker());
  const [judiciary] = useState(() => createJudiciaryEngine());
  const [semanticGraphRepo] = useState(() => createTokenGraphSemanticRepo());
  const [sequenceGraphRepo] = useState(() => createTokenGraphSequenceRepo({ trie: model }));
  const [ritualPredictionEngine] = useState(() => createRitualPredictionEngine({
    sequenceGraphRepo,
    semanticGraphRepo,
    judiciary,
    analyzeWord: (token) => PhonemeEngine.analyzeWord(token),
    resolveSchool: resolvePredictionSchool,
  }));
  const [isReady, setIsReady] = useState(false);
  const [isDictionaryConnected, setIsDictionaryConnected] = useState(false);
  const plsRef = useRef(null);
  const loadAttemptedRef = useRef(false);

  useEffect(() => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;

    let isDisposed = false;
    let cancelBatchValidator = null;

    async function loadCorpus() {
      try {
        if (typeof window === 'undefined' || !window.location || !window.location.origin) return;

        const response = await fetch('/corpus.json');
        if (!response.ok) {
          console.warn('[Predictor] Failed to load corpus.json:', response.status);
          return;
        }

        const payload = await response.json();
        const { dictionary: words, sequences } = normalizeCorpusPayload(payload);

        if (words.length === 0) {
          console.warn('[Predictor] corpus dictionary is empty');
          return;
        }

        // V12 PERFORMANCE: Chunked training to prevent main-thread stasis (LCP optimization)
        const yieldToMain = () => new Promise((resolve) => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(), { timeout: 50 });
          } else {
            setTimeout(resolve, 0);
          }
        });

        // 1. Train Trie and Spellchecker (Vocabulary) - Chunked
        const VOCAB_BATCH_SIZE = 2000;
        for (let i = 0; i < words.length; i += VOCAB_BATCH_SIZE) {
          const chunk = words.slice(i, i + VOCAB_BATCH_SIZE);
          for (const word of chunk) {
            model.insert(word);
          }
          if (!isDisposed) spellchecker.init(chunk, i === 0);
          await yieldToMain();
          if (isDisposed) return;
        }

        // 2. Train Bigrams (Natural Sequences) - Chunked
        const SEQ_BATCH_SIZE = 1500;
        for (let i = 0; i < sequences.length; i += SEQ_BATCH_SIZE) {
          const chunk = sequences.slice(i, i + SEQ_BATCH_SIZE);
          for (const { prev, next, weight } of chunk) {
            model.insert(prev, next, weight);
            spellchecker.rememberSequence(prev, next, weight);
          }
          await yieldToMain();
          if (isDisposed) return;
        }

        await PhonemeEngine.ensureInitialized();

        const uniqueWords = [...new Set(words)];
        const authoritySample = uniqueWords.slice(0, 500);
        await PhonemeEngine.ensureAuthorityBatch(authoritySample);

        let dictionaryAPI = null;
        if (ScholomanceDictionaryAPI.isConfigured()) {
          const connected = await ScholomanceDictionaryAPI.checkConnectivity({ force: true });
          if (connected) {
            dictionaryAPI = ScholomanceDictionaryAPI;
            if (!isDisposed) setIsDictionaryConnected(true);
          } else {
            if (!isDisposed) setIsDictionaryConnected(false);
          }
        }

        const batchedValidator = (dictionaryAPI && typeof dictionaryAPI.validateBatch === 'function')
          ? createBatchedDictionaryValidator(dictionaryAPI)
          : null;
        if (batchedValidator) {
          cancelBatchValidator = batchedValidator.cancel;
        }

        spellchecker.configureAsync({
          validateWord: batchedValidator ? batchedValidator.validateWord : null,
          suggestWords: (dictionaryAPI && typeof dictionaryAPI.suggest === 'function')
            ? async (prefix, limit) => dictionaryAPI.suggest(prefix, { limit })
            : null,
          onAsyncOffline: ({ source } = {}) => {
            ScholomanceDictionaryAPI.markUnavailable(`spellchecker:${source || 'unknown'}`);
            if (!isDisposed) setIsDictionaryConnected(false);
          },
          onAsyncOnline: () => {
            ScholomanceDictionaryAPI.markAvailable();
            if (!isDisposed) setIsDictionaryConnected(true);
          },
        });

        const pls = new PoeticLanguageServer({
          phonemeEngine: PhonemeEngine,
          trie: model,
          spellchecker,
          dictionaryAPI,
        });
        await pls.buildIndex(words);
        plsRef.current = pls;

        if (!isDisposed) setIsReady(true);
      } catch (err) {
        console.error('Failed to load ritual corpus:', err);
      }
    }

    loadCorpus();

    return () => {
      isDisposed = true;
      cancelBatchValidator?.();
      loadAttemptedRef.current = false;
    };
  }, [model, spellchecker]);

  const getDemocraticChoice = useCallback((suggestions, syntaxContext = null) => {
    const candidates = suggestions.map((s) => {
      const rawScore = Number(s.score);
      // Preserve 0-1 ranker scores; legacy >1 scores compress into the unit interval.
      const confidence = Number.isFinite(rawScore) && rawScore > 0
        ? Math.max(0.05, Math.min(1, rawScore > 1 ? rawScore / 2 : rawScore))
        : 0.8;
      return {
        word: s.token || s,
        layer: s.reason === 'phonetic' ? 'PHONEME'
          : s.reason === 'edit' ? 'SPELLCHECK' : 'PREDICTOR',
        confidence,
      };
    });
    return judiciary.vote(candidates, syntaxContext);
  }, [judiciary]);

  const predictDetailed = useCallback(async (prefix, contextWord = null, limit = 5, options = {}) => {
    if (!isReady) return [];
    const normalizedPrefix = normalizeCorpusWord(prefix);
    const normalizedContextWord = normalizeCorpusWord(contextWord);

    return await ritualPredictionEngine.run({
      prefix: normalizedPrefix,
      prevWord: normalizedContextWord,
      prevLineEndWord: options.prevLineEndWord || null,
      currentLineWords: Array.isArray(options.currentLineWords) ? options.currentLineWords : [],
      currentSchool: options.currentSchool || null,
      syntaxContext: options.syntaxContext || null,
      anchorTokens: Array.isArray(options.anchorTokens) ? options.anchorTokens : [],
      verseIRState: options.verseIRState || null,
      maxCandidates: Math.max(limit * 6, 24),
    });
  }, [isReady, ritualPredictionEngine]);

  const predict = useCallback(async (prefix, contextWord = null, limit = 5, options = {}) => {
    if (!isReady) return [];
    const normalizedPrefix = normalizeCorpusWord(prefix);
    const normalizedContextWord = normalizeCorpusWord(contextWord);
    const prediction = await predictDetailed(normalizedPrefix, normalizedContextWord, limit, options);

    if (Array.isArray(prediction?.candidates) && prediction.candidates.length > 0) {
      const filteredCandidates = prediction.candidates.filter((candidate) => (
        normalizedPrefix || candidate.token !== normalizedContextWord
      ));
      if (filteredCandidates.length > 0) {
        return filteredCandidates.slice(0, limit).map((candidate) => candidate.token);
      }
    }

    if (normalizedPrefix) return model.predict(normalizedPrefix, limit);
    if (normalizedContextWord) return model.predictNext(normalizedContextWord, limit);
    return [];
  }, [isReady, model, predictDetailed]);

  const getCompletions = useCallback(async (context, options) => {
    if (!isReady || !plsRef.current) return [];
    return plsRef.current.getCompletions(context, options);
  }, [isReady]);

  const checkSpelling = useCallback(async (word) => {
    if (!isReady) return true;
    return spellchecker.checkAsync(word);
  }, [isReady, spellchecker]);

  const getSpellingSuggestions = useCallback(async (word, prevWord = null, limit = 5) => {
    if (!isReady) return [];
    return spellchecker.suggestAsync(word, limit, prevWord);
  }, [isReady, spellchecker]);

  const value = {
    predict,
    getCompletions,
    checkSpelling,
    getSpellingSuggestions,
    getDemocraticChoice,
    predictDetailed,
    ready: isReady,
    isDictionaryConnected,
  };

  return (
    <PredictorContext.Provider value={value}>
      {children}
    </PredictorContext.Provider>
  );
}

export function usePredictor() {
  const context = useContext(PredictorContext);
  if (!context) {
    throw new Error('usePredictor must be used within a PredictorProvider');
  }
  return context;
}
