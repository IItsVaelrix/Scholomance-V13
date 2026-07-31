import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { synthesizeVerse } from "../lib/truesight/compiler/VerseSynthesis.js";
import { verseIRMicroprocessors } from "../lib/codex/textAnalysis.js";
import { parseBooleanEnvFlag } from "./useCODExPipeline.jsx";
import { ScholomanceDictionaryAPI } from "../lib/scholomanceDictionary.api.js";
import { shouldPreserveArtifactOnError } from "../lib/truesight/synthesisErrorPolicy.js";
import { buildIdentityKey } from "../lib/lexical/charStart.js";
import { WORD_REGEX_GLOBAL } from "../lib/wordTokenization.js";

const USE_SERVER_ANALYSIS = parseBooleanEnvFlag(import.meta.env.VITE_USE_SERVER_PANEL_ANALYSIS, true);

// Bounded backoff for transient HTTP rejections (esp. 429 rate limits). Keeps
// the last good analysis on screen while a couple of spaced retries refresh it,
// instead of blanking the resonance gate. See synthesisErrorPolicy.js.
const RATE_LIMIT_RETRY_BASE_MS = 1500;
const RATE_LIMIT_MAX_RETRIES = 2;

// No time debounce by default. There used to be a flat 4000ms here "for heavy
// analysis", which cost 4s of grey text on every scroll load and was the reason
// TrueSight looked broken on first read. It is not needed:
//
//   - It was not protecting against analysis cost. Measured 8-176ms server-side.
//   - It is not what bounds the request rate against the route's 60/min ceiling.
//     The token-batch gate below does that, because the batch baseline advances
//     synchronously when a request is ISSUED: crossing the threshold fires once
//     and immediately re-closes the gate for the next `minTokenDelta` words.
//     Measured with zero debounce: 201 words typed one keystroke at a time
//     produces 5 requests, not 201 (see useVerseSynthesis.debounce.test.jsx).
//
// The option survives for callers that want extra coalescing; it is no longer
// load-bearing for rate limiting.
const DEFAULT_DEBOUNCE_MS = 0;

// Colour re-morphs on a TOKEN BATCH, not on a clock. A time debounce still
// issues a request for a one-word edit, so a steady typist walks straight into
// the 60/min ceiling and gets 429s that blank the gate. Instead: re-analyse only
// once the word multiset has moved by a whole batch from the one last analysed.
//
// Symmetric difference, so deleting 50 words counts like adding 50 — both change
// resonance. Small edits accumulate against the last ANALYSED batch rather than
// the last render, so 5 x 12 words eventually crosses instead of never counting.
//
// The first batch of a document is always analysed: with no previous batch there
// is nothing to diff, and a short scroll must still paint.
const DEFAULT_MIN_TOKEN_DELTA = 50;

// Cooldown on TrueSight Blink. The button is a deliberate override of the batch
// gate, so without a cooldown it IS the request storm the gate prevents — one
// held-down finger reintroduces exactly the 429s that blank the colours. Tracked
// as boolean state (not a timestamp) so the control can render the cooldown and
// no wall-clock read is needed.
const DEFAULT_BLINK_COOLDOWN_MS = 30_000;

function wordTokens(text) {
  return String(text || '').toLowerCase().match(WORD_REGEX_GLOBAL) || [];
}

function tokenDelta(current, previous) {
  const counts = new Map();
  for (const t of current) counts.set(t, (counts.get(t) || 0) + 1);
  for (const t of previous) counts.set(t, (counts.get(t) || 0) - 1);
  let delta = 0;
  for (const n of counts.values()) delta += Math.abs(n);
  return delta;
}

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

  const {
    mode = 'balanced',
    school = 'DEFAULT',
    paused = false,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minTokenDelta = DEFAULT_MIN_TOKEN_DELTA,
    blinkCooldownMs = DEFAULT_BLINK_COOLDOWN_MS,
  } = options;

  const [canBlink, setCanBlink] = useState(true);
  const blinkCooldownTimerRef = useRef(null);

  const [highlightedGroup, setHighlightedGroup] = useState(null);
  
  const requestCount = useRef(0);
  const lastRequestContentRef = useRef("");
  // Word multiset of the batch last SENT for analysis. null until the first
  // request, which is how "always analyse the first batch" is expressed.
  const lastAnalyzedTokensRef = useRef(null);
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
    // Record the batch we are analysing, so the delta gate measures against what
    // was last SENT rather than what was last rendered.
    lastAnalyzedTokensRef.current = wordTokens(text);

    setIsSynthesizing(true);
    setError(null);

    try {
      let result;

      if (USE_SERVER_ANALYSIS && ScholomanceDictionaryAPI.isEnabled()) {
        const response = await ScholomanceDictionaryAPI.analyzePanels(text, {
          nluMode: 'direct',
          analysisProfile: 'editor',
        });
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
              // Also index by the position-bound text identity the Lexical
              // resolver queries (buildIdentityKey(word, charStart)). The colon
              // key above serves index-based consumers; the editor's identity
              // fallback carries no line/word indices, so without this dash key
              // it could never match a colon-keyed entry (dead fallback).
              if (profile.word) {
                result.tokenByIdentity.set(buildIdentityKey(profile.word, profile.charStart), profile);
              }
              result.tokenByCharStart.set(profile.charStart, profile);
              if (!result.tokenByNormalizedWord.has(profile.normalizedWord)) {
                result.tokenByNormalizedWord.set(profile.normalizedWord, profile);
              }
            });
          }
          // Mapping for UI components that expect specific artifact fields
          result.verseIR = result.analysis?.compiler;
          result.syntaxLayer = result.analysis;

          const lineCounts = result.analysis?.lineSyllableCounts
            || result.verseIR?.lineSyllableCounts
            || (Array.isArray(result.analysis?.lines) ? result.analysis.lines.map(l => l.syllableCount) : null);
          if (Array.isArray(lineCounts)) {
            result.lineSyllableCounts = lineCounts;
          }

          // Sum totalSyllables if not provided directly
          if (typeof result.totalSyllables !== 'number' || result.totalSyllables === 0) {
            if (Array.isArray(result.lineSyllableCounts) && result.lineSyllableCounts.length > 0) {
              result.totalSyllables = result.lineSyllableCounts.reduce((sum, n) => sum + (Number(n) || 0), 0);
            } else if (Array.isArray(result.analysis?.wordAnalyses)) {
              result.totalSyllables = result.analysis.wordAnalyses
                .reduce((sum, w) => sum + (Number(w?.syllableCount) || 0), 0);
            }
          }
        }
      }

      if (!result) {
        // In V12, we offload this to the VerseSynthesis Microprocessor
        result = await verseIRMicroprocessors.execute('nlu.synthesizeVerse', { text, options: { mode, school } });
      }

      if (result && !Array.isArray(result.lineSyllableCounts)) {
        const lineCounts = result.analysis?.lineSyllableCounts
          || result.verseIR?.lineSyllableCounts
          || (Array.isArray(result.syntaxLayer?.lines) ? result.syntaxLayer.lines.map(l => l.syllableCount) : null);
        result.lineSyllableCounts = Array.isArray(lineCounts) ? lineCounts : [];
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

  /**
   * TrueSight Blink (Color Refresh) — the hex-tools escape hatch for the
   * token-batch gate. An edit smaller than `minTokenDelta` never re-colours on
   * its own (that is what keeps a typist clear of the route's 60/min ceiling),
   * so the operator needs a deliberate way to say "re-read it now".
   *
   * Clears both guards before firing: the dedupe guard, so re-blinking identical
   * content still re-analyses, and the batch baseline, so the request is not
   * measured against itself.
   */
  const blink = useCallback(async () => {
    const text = latestContentRef.current;
    if (!text) return;
    // Cooldown is checked off the ref, not off `canBlink`, so a stale closure
    // cannot let a second request through before the re-render lands.
    if (blinkCooldownTimerRef.current !== null) return;

    if (blinkCooldownMs > 0) {
      setCanBlink(false);
      blinkCooldownTimerRef.current = setTimeout(() => {
        blinkCooldownTimerRef.current = null;
        setCanBlink(true);
      }, blinkCooldownMs);
    }

    lastRequestContentRef.current = '';
    lastAnalyzedTokensRef.current = null;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptsRef.current = 0;
    await performSynthesis(text);
  }, [performSynthesis, blinkCooldownMs]);

  // Don't leave a cooldown timer running past unmount.
  useEffect(() => () => {
    if (blinkCooldownTimerRef.current) {
      clearTimeout(blinkCooldownTimerRef.current);
      blinkCooldownTimerRef.current = null;
    }
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

    // Token-batch gate. The first batch always paints; after that the word
    // multiset must have moved by at least `minTokenDelta` from the batch last
    // analysed, so ordinary typing cannot walk into the route's 60/min ceiling.
    const previousTokens = lastAnalyzedTokensRef.current;
    if (previousTokens !== null
      && tokenDelta(wordTokens(content), previousTokens) < minTokenDelta) {
      setIsSynthesizing(false);
      return;
    }

    const requestId = ++requestCount.current;

    const timer = setTimeout(() => {
      if (requestId !== requestCount.current) return;
      performSynthesis(content);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [content, performSynthesis, paused, debounceMs, minTokenDelta]);

  return {
    artifact,
    isSynthesizing,
    error,
    activeConnections,
    highlightRhymeGroup,
    clearHighlight,
    blink,
    canBlink,
    // Helper accessors for UI panels
    verseIR: artifact?.verseIR,
    syntaxLayer: artifact?.syntaxLayer,
    scheme: artifact?.scheme,
    meter: artifact?.meter,
    literaryDevices: artifact?.literaryDevices,
    emotion: artifact?.emotion,
    totalSyllables: artifact?.totalSyllables || 0,
    lineSyllableCounts: artifact?.lineSyllableCounts || artifact?.syntaxLayer?.lineSyllableCounts || [],
    analyzedWords: artifact?.tokenByNormalizedWord || new Map(),
    tokenByIdentity: artifact?.tokenByIdentity || new Map(),
    tokenByCharStart: artifact?.tokenByCharStart || new Map(),
  };
}
