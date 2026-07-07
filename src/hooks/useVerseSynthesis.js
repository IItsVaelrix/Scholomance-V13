import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { synthesizeVerse } from "../lib/truesight/compiler/VerseSynthesis.js";
import { verseIRMicroprocessors } from "../../codex/core/microprocessors/index.js";
import { parseBooleanEnvFlag } from "./useCODExPipeline.jsx";
import { ScholomanceDictionaryAPI } from "../lib/scholomanceDictionary.api.js";
import { shouldPreserveArtifactOnError } from "../lib/truesight/synthesisErrorPolicy.js";

const USE_SERVER_ANALYSIS = parseBooleanEnvFlag(import.meta.env.VITE_USE_SERVER_PANEL_ANALYSIS, true);

// Bounded backoff for transient HTTP rejections (esp. 429 rate limits). Keeps
// the last good analysis on screen while a couple of spaced retries refresh it,
// instead of blanking the resonance gate. See synthesisErrorPolicy.js.
const RATE_LIMIT_RETRY_BASE_MS = 1500;
const RATE_LIMIT_MAX_RETRIES = 2;

/**
 * useVerseSynthesis — UI Bridge to the VerseSynthesis AMP
 * 
 * Provides reactive access to the unified linguistic artifact.
 * Debounces raw input to prevent temporal jitter during drafting.
 */
export function useVerseSynthesis(content, options = {}) {
  const [artifact, setArtifact] = useState(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [error, setError] = useState(null);

  const { mode = 'balanced', school = 'DEFAULT', paused = false } = options;

  const [highlightedGroup, setHighlightedGroup] = useState(null);
  
  const requestCount = useRef(0);
  const lastRequestContentRef = useRef("");
  // Last committed artifact (for the catch path to decide whether to preserve
  // it), the latest requested content (staleness guard for retries), and the
  // pending rate-limit retry timer + attempt counter.
  const artifactRef = useRef(null);
  const latestContentRef = useRef(content);
  const retryTimerRef = useRef(null);
  const retryAttemptsRef = useRef(0);

  useEffect(() => { artifactRef.current = artifact; }, [artifact]);

  const performSynthesis = useCallback(async function performSynthesis(text) {
    // Deterministic Guard: Stop if content is identical to last issued request
    if (text === lastRequestContentRef.current) return;

    const requestId = ++requestCount.current;
    lastRequestContentRef.current = text;

    setIsSynthesizing(true);
    setError(null);

    try {
      let result;

      if (USE_SERVER_ANALYSIS && ScholomanceDictionaryAPI.isEnabled()) {
        const response = await ScholomanceDictionaryAPI.analyzePanels(text, { nluMode: 'generate' });
        if (response?.data) {
          result = response.data;
          // Hydrate Maps which are lost during JSON serialization
          if (result.analysis?.wordAnalyses) {
            result.tokenByIdentity = new Map();
            result.tokenByCharStart = new Map();
            result.tokenByNormalizedWord = new Map();

            result.analysis.wordAnalyses.forEach(profile => {
              const identity = `${profile.lineIndex}:${profile.wordIndex}:${profile.charStart}`;
              result.tokenByIdentity.set(identity, profile);
              result.tokenByCharStart.set(profile.charStart, profile);
              if (!result.tokenByNormalizedWord.has(profile.normalizedWord)) {
                result.tokenByNormalizedWord.set(profile.normalizedWord, profile);
              }
            });
          }
          // Mapping for UI components that expect specific artifact fields
          result.verseIR = result.analysis?.compiler;
          result.syntaxLayer = result.analysis;
        }
      }

      if (!result) {
        // In V12, we offload this to the VerseSynthesis Microprocessor
        result = await verseIRMicroprocessors.execute('nlu.synthesizeVerse', { text, options: { mode, school } });
      }

      if (requestId === requestCount.current) {
        retryAttemptsRef.current = 0; // healthy response clears the backoff
        setArtifact(result);
      }
    } catch (err) {
      if (requestId === requestCount.current) {
        console.error("[PB-SYNTHESIS] Transmutation failed:", err);
        setError(err.message || 'Synthesis failed');

        if (shouldPreserveArtifactOnError(err, artifactRef.current)) {
          // Transient HTTP rejection (e.g. 429) and we hold a populated
          // analysis: keep the last good artifact so colours persist, and
          // schedule a bounded, staleness-guarded retry to refresh it. Do NOT
          // overwrite with the connection-less local fallback.
          if (retryAttemptsRef.current < RATE_LIMIT_MAX_RETRIES) {
            retryAttemptsRef.current += 1;
            const delay = RATE_LIMIT_RETRY_BASE_MS * retryAttemptsRef.current;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              // Only retry if the user hasn't moved on to different content.
              if (text !== latestContentRef.current) return;
              lastRequestContentRef.current = ''; // bypass the dedupe guard
              performSynthesis(text);
            }, delay);
          }
        } else {
          // Genuine unavailability (network error) or no prior good artifact:
          // degrade to local synthesis. The connection-less artifact trips the
          // "resonance offline" signal (resonanceDegraded) downstream.
          const fallback = synthesizeVerse(text, { mode, school });
          setArtifact(fallback);
        }
      }
    } finally {
      if (requestId === requestCount.current) {
        setIsSynthesizing(false);
      }
    }
  }, [mode, school]);

  const highlightRhymeGroup = useCallback((groupLabel) => {
    setHighlightedGroup(groupLabel);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedGroup(null);
  }, []);

  const activeConnections = useMemo(() => {
    if (!highlightedGroup) return artifact?.syntaxLayer?.allConnections || artifact?.verseIR?.connections || [];
    const all = artifact?.syntaxLayer?.allConnections || artifact?.verseIR?.connections || [];
    return Array.isArray(all) ? all.filter(c => c.groupLabel === highlightedGroup) : [];
  }, [highlightedGroup, artifact]);

  useEffect(() => {
    // Content changed: cancel any pending rate-limit retry for the old text
    // and reset the backoff so the new text gets a fresh budget.
    latestContentRef.current = content;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptsRef.current = 0;

    if (paused) {
      requestCount.current++;
      setIsSynthesizing(false);
      return;
    }
    if (!content) {
      setArtifact(null);
      setError(null);
      return;
    }

    const requestId = ++requestCount.current;

    const timer = setTimeout(() => {
      if (requestId !== requestCount.current) return;
      performSynthesis(content);
    }, 4000); // 4000ms debounce for heavy analysis

    return () => {
      clearTimeout(timer);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [content, performSynthesis, paused]);

  return {
    artifact,
    isSynthesizing,
    error,
    activeConnections,
    highlightRhymeGroup,
    clearHighlight,
    // Helper accessors for UI panels
    verseIR: artifact?.verseIR,
    syntaxLayer: artifact?.syntaxLayer,
    scheme: artifact?.scheme,
    meter: artifact?.meter,
    literaryDevices: artifact?.literaryDevices,
    emotion: artifact?.emotion,
    totalSyllables: artifact?.totalSyllables || 0,
    analyzedWords: artifact?.tokenByNormalizedWord || new Map(),
    tokenByIdentity: artifact?.tokenByIdentity || new Map(),
    tokenByCharStart: artifact?.tokenByCharStart || new Map(),
  };
}
