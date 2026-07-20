import { useRef, useLayoutEffect, useEffect, useState, useMemo, useId, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ResizableBox } from 'react-resizable';
import { useTheme } from '../hooks/useTheme.jsx';
import { useWordLookup } from '../hooks/useWordLookup.jsx';
import { buildRitualPrediction, reconcileWithLexicon } from '../lib/ritualPredictionTooltip.js';
import { PhonemeEngine } from '../lib/engine.adapter.js';
import { ScholomanceDictionaryAPI } from '../lib/scholomanceDictionary.api.js';
import { resolveOverlayPlacement } from '../lib/truesight/overlay-placement.js';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, Copy, Replace, Search, X } from 'lucide-react';
import './RitualPredictionTooltip.css';

const TOOLTIP_MIN_WIDTH = 300;
const TOOLTIP_MIN_HEIGHT = 300;
const TOOLTIP_MAX_WIDTH = 680;
const TOOLTIP_MAX_HEIGHT = 720;
const TOOLTIP_DEFAULT_WIDTH = 420;
const TOOLTIP_DEFAULT_HEIGHT = 580;

const DRAG_IGNORE_SELECTOR = [
  '.rp-close-btn',
  '.rp-action-btn',
  '.rp-rune',
  '.rp-rune-explore',
  '.rp-crumb-btn',
  '.rp-nav-btn',
  '.rp-diagnostics-toggle',
  '.rp-confidence-badge',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '.react-resizable-handle'
].join(', ');

const CARD_INITIAL = { opacity: 0, scale: 0.94, y: 8 };
const CARD_ANIMATE = {
  opacity: 1,
  scale: 1,
  y: 0,
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
};
const CARD_EXIT = {
  opacity: 0,
  scale: 0.96,
  y: -4,
  transition: { duration: 0.14, ease: 'easeIn' },
};

const RHYME_TIER_LABEL = {
  identity: 'identity',
  perfect: 'perfect',
  near: 'near',
  slant: 'slant',
  assonance: 'assonance',
  consonance: 'consonance',
};

function normalizeWord(value) {
  return String(value || '').trim().toLowerCase();
}


// Syllable rhythm: one pip per syllable, the primary-stress syllable drawn as a
// gold ring. Reads the binary stressPattern ("0101" -> 1 = stressed); falls back
// to plain pips when only a count is known. Presents SOUND humanly — no raw
// engine keys (vowel family / coda / rhyme key are deliberately not shown).
function StressRhythm({ syllableCount, stressPattern }) {
  const count = Number(syllableCount) || 0;
  if (count <= 0) return null;
  const pattern = typeof stressPattern === 'string' ? stressPattern : '';
  const pips = Array.from({ length: count }, (_, i) => pattern[i] === '1');
  return (
    <span className="rp-rhythm" aria-label={`${count} syllable${count === 1 ? '' : 's'}`}>
      <span className="rp-rhythm-lab">{count} syl</span>
      {pips.map((stressed, i) => (
        <span key={i} className={`rp-pip ${stressed ? 'rp-pip--stress' : ''}`} />
      ))}
    </span>
  );
}

// A failed lookup used to render as an empty rune row, which reads as "this word
// has no rhymes" rather than "the Oracle never answered". Name the condition and
// offer the way out of it.
function OracleNotice({ error, onRetry }) {
  if (!error) return null;
  const severity = error.severity === 'WARN' ? 'warn' : 'info';
  return (
    <div className={`rp-oracle-notice rp-oracle-notice--${severity}`} role="status">
      <AlertTriangle size={11} className="rp-oracle-notice-icon" aria-hidden="true" />
      <span className="rp-oracle-notice-text">{error.message}</span>
      {onRetry && (
        <button type="button" className="rp-oracle-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// Suggestion pills. In a poem context (onTransmute provided) the primary click
// transmutes the word in the text one-click; a secondary ⌕ icon explores
// (navigates the card). Without a transmute handler the pill just navigates.
function RuneRow({ label, words, tier = 'perfect', onNavigate, onTransmute }) {
  if (!words || words.length === 0) return null;
  return (
    <div className={`rp-rune-row rp-rune-row--${tier}`}>
      <span className="rp-rune-label">{label}</span>
      <span className="rp-rune-pills">
        {words.slice(0, 10).map((w, i) => {
          const text = typeof w === 'string' ? w : (w?.word || '');
          if (!text) return null;
          if (onTransmute) {
            return (
              <span key={i} className="rp-rune-group">
                <button
                  type="button"
                  className="rp-rune rp-rune--transmute"
                  onClick={() => onTransmute(text)}
                  title={`Replace with "${text}"`}
                >
                  {text}
                </button>
                <button
                  type="button"
                  className="rp-rune-explore"
                  onClick={() => onNavigate(text)}
                  aria-label={`Explore "${text}"`}
                  title={`Explore "${text}"`}
                >
                  <Search size={10} />
                </button>
              </span>
            );
          }
          return (
            <button key={i} type="button" className="rp-rune" onClick={() => onNavigate(text)}>
              {text}
            </button>
          );
        })}
      </span>
    </div>
  );
}

function Breadcrumb({ history, index, onJump }) {
  if (history.length <= 1) return null;
  const end = index + 1;
  const start = Math.max(0, end - 6);
  const visible = history.slice(start, end);
  return (
    <div className="rp-breadcrumb" aria-label="Word navigation history">
      {start > 0 && <span className="rp-crumb-trunc">...</span>}
      {visible.map((w, relIdx) => {
        const absIdx = start + relIdx;
        const isCurrent = absIdx === index;
        return (
          <span key={absIdx} className="rp-crumb-item">
            {relIdx > 0 && <ChevronRight size={10} className="rp-crumb-sep" aria-hidden="true" />}
            {isCurrent ? (
              <span className="rp-crumb-current">{w}</span>
            ) : (
              <button type="button" className="rp-crumb-btn" onClick={() => onJump(absIdx)}>{w}</button>
            )}
          </span>
        );
      })}
    </div>
  );
}

// The line-resonance ribbon: how this word sonically bonds with the other
// words already in its line. An unconfirmed bond (local phoneme estimate, not
// lexicon-verified) is marked so the ribbon never overstates a match.
function ResonanceSection({ partners }) {
  if (!partners || partners.length === 0) return null;
  return (
    <div className="rp-resonance" role="list" aria-label="Resonance in this line">
      <span className="rp-resonance-lab">in this line</span>
      {partners.map((p, i) => (
        <span
          key={i}
          role="listitem"
          className={`rp-bond ${p.confirmed === false ? 'rp-bond--unconfirmed' : ''}`}
          title={p.confirmed === false ? 'Unconfirmed by the lexicon (local phoneme estimate)' : `resonance ${p.score.toFixed(2)}`}
        >
          <span className={`rp-bond-tier rp-tier--${p.type}`}>{RHYME_TIER_LABEL[p.type] || p.type}</span>
          <span className="rp-bond-word">{p.word}</span>
        </span>
      ))}
    </div>
  );
}

function cleanWordLists(activeWord, lex) {
  if (!lex) return { rhymes: [], slantRhymes: [], synonyms: [], antonyms: [] };
  const normalized = normalizeWord(activeWord);
  const normalizeItem = (w) => normalizeWord(typeof w === 'string' ? w : w?.word);

  const takeUnique = (list, limit = 8) => {
    const seen = new Set([normalized]);
    return (list || []).filter((w) => {
      const n = normalizeItem(w);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    }).slice(0, limit);
  };

  return {
    rhymes: takeUnique(lex.rhymes, 10),
    slantRhymes: takeUnique(lex.slantRhymes, 10),
    synonyms: takeUnique(lex.synonyms, 5),
    antonyms: takeUnique(lex.antonyms, 5),
  };
}

const RitualPredictionTooltip = ({
  prediction: predictionProp = null,
  word: wordProp = null,
  contextLine: contextLineProp = null,
  anchorRect = null,
  x,
  y,
  isEmbedded = false,
  onClose,
  onTransmute,
  onCopyPrediction,
  sessionHistory = [],
  sessionIndex = -1,
  onSessionNavigate,
}) => {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const titleId = useId();

  // The word the parent seeded us with (activation, session jump, or a
  // precomputed prediction). Internal rune/breadcrumb navigation diverges from
  // this until the parent seeds a new word.
  const seedWord = wordProp || predictionProp?.word || '';
  const rootWord = seedWord;
  const seedContextLine = contextLineProp ?? predictionProp?.source?.contextLine ?? '';

  const [activeWord, setActiveWord] = useState(seedWord);
  const [history, setHistory] = useState([seedWord].filter(Boolean));
  const [historyIndex, setHistoryIndex] = useState(0);

  // Re-seed when the parent hands us a different word (new activation / session
  // navigation). Internal navigation never triggers this.
  useEffect(() => {
    setActiveWord(seedWord);
    setHistory(seedWord ? [seedWord] : []);
    setHistoryIndex(0);
  }, [seedWord]);

  // status/error were previously discarded. useWordLookup resolves every failure
  // (timeout, 429, disconnect, denied) to a structured state rather than
  // throwing, so dropping them made a rate-limited lookup look exactly like a
  // word with no rhymes: an empty list and no explanation.
  const {
    lookup,
    retry: retryLookup,
    data: lookupData,
    isLoading: lookupLoading,
    status: lookupStatus,
    error: lookupError,
  } = useWordLookup();
  useEffect(() => {
    if (activeWord) lookup(activeWord);
  }, [activeWord, lookup]);


  // The local PhonemeEngine guesses phonemes from spelling when it has no
  // authority for a word, and does not label the guess as one: it reported
  // "bold" as B AA1 L D / AA-LD while the lexicon entry on the very same card
  // read B OW1 L D. (gene BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK)
  //
  // Prime the WHOLE context line, not just the active word. Resonance is decided
  // by comparing the active word's phonemes against its neighbours', so a line
  // where one word is authoritative and the rest are guesses is WORSE than a
  // line of uniform guesses: "bold" (real OW-LD) stops matching "told" (guessed
  // AA-LD) and the rhyme vanishes. Correct the whole line or none of it.
  const [authorityVersion, setAuthorityVersion] = useState(0);
  useEffect(() => {
    const words = [
      ...(String(seedContextLine || '').match(/[A-Za-z']+/g) || []),
      activeWord,
    ].filter(Boolean);
    if (words.length === 0) return undefined;

    let cancelled = false;
    PhonemeEngine.primeAuthorityBatch(words, ScholomanceDictionaryAPI)
      .then(() => {
        if (!cancelled) setAuthorityVersion((v) => v + 1);
      })
      .catch(() => {
        // Authority unavailable: the engine keeps its heuristic and the card
        // renders the guess rather than nothing.
      });
    return () => { cancelled = true; };
  }, [seedContextLine, activeWord]);

  // Provisional, instant prediction: the precomputed one for the root word,
  // otherwise a locally-built heuristic for whatever word we've navigated to.
  const basePrediction = useMemo(() => {
    if (!activeWord) return predictionProp;
    const propMatches = predictionProp && normalizeWord(predictionProp.word) === normalizeWord(activeWord);

    // The precomputed prediction was built before the lexicon answered, so once
    // the engine has real phonemes it is stale — rebuild rather than render the
    // guess. Keep its `source` so the footer still knows where the word came from.
    if (propMatches && authorityVersion === 0) return predictionProp;

    const rebuilt = buildRitualPrediction({
      word: activeWord,
      line: 0,
      column: 0,
      contextLine: seedContextLine,
      surroundingText: seedContextLine,
    });
    return propMatches ? { ...rebuilt, source: predictionProp.source ?? rebuilt.source } : rebuilt;
  }, [predictionProp, activeWord, seedContextLine, authorityVersion]);

  // Single prediction authority: once the lexicon lookup for the active word
  // resolves, the backend is the source of truth — role and resonance tiers are
  // reconciled from it. Until then the local heuristic renders as provisional.
  const prediction = useMemo(() => {
    if (!basePrediction) return basePrediction;
    const lexMatch = lookupData && normalizeWord(lookupData.word) === normalizeWord(activeWord)
      ? lookupData
      : null;
    if (lexMatch) return reconcileWithLexicon(basePrediction, lexMatch);
    return { ...basePrediction, prediction: { ...basePrediction.prediction, provisional: true } };
  }, [basePrediction, lookupData, activeWord]);

  const navigateTo = useCallback((nextWord) => {
    const clean = String(nextWord || '').trim();
    if (!clean || normalizeWord(clean) === normalizeWord(activeWord)) return;
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, clean];
      setHistoryIndex(next.length - 1);
      return next;
    });
    setActiveWord(clean);
  }, [activeWord, historyIndex]);

  const jumpToCrumb = useCallback((idx) => {
    setHistory((prev) => {
      const target = prev[idx];
      if (target) {
        setHistoryIndex(idx);
        setActiveWord(target);
      }
      return prev;
    });
  }, []);

  const posRef = useRef({ x: anchorRect?.x ?? x ?? 0, y: anchorRect?.y ?? y ?? 0 });
  const posInitialized = useRef(false);
  const [size, setSize] = useState({ width: TOOLTIP_DEFAULT_WIDTH, height: TOOLTIP_DEFAULT_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);

  const applyLivePosition = useCallback((nextPos) => {
    const node = containerRef.current;
    if (!node) return;
    node.style.left = `${nextPos.x}px`;
    node.style.top = `${nextPos.y}px`;
  }, []);

  useLayoutEffect(() => {
    if (isEmbedded || posInitialized.current) return;
    const seedRect = anchorRect || (x != null || y != null
      ? { top: y || 0, left: x || 0, width: 1, height: 1, bottom: y || 0, right: x || 0 }
      : null);
    if (!seedRect) return;
    posInitialized.current = true;

    const viewportRect = { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    const result = resolveOverlayPlacement(
      {
        top: seedRect.top,
        left: seedRect.left,
        width: seedRect.width || 1,
        height: seedRect.height || 1,
        bottom: seedRect.bottom ?? seedRect.top,
        right: seedRect.right ?? seedRect.left,
      },
      { width: size.width, height: size.height },
      viewportRect,
      { placement: 'bottom', flip: true, clamp: true, margin: 10 },
    );

    const nextPos = { x: result.x, y: result.y };
    posRef.current = nextPos;
    applyLivePosition(nextPos);
  }, [anchorRect, x, y, isEmbedded, size.width, size.height, applyLivePosition]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    if (isEmbedded) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const handleWindowResize = () => {
      const viewportRect = { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
      const result = resolveOverlayPlacement(
        { left: posRef.current.x, top: posRef.current.y, width: 0, height: 0, right: posRef.current.x, bottom: posRef.current.y },
        { width: size.width, height: size.height },
        viewportRect,
        { placement: 'bottom', flip: false, clamp: true },
      );
      const nextPos = { x: result.x, y: result.y };
      posRef.current = nextPos;
      applyLivePosition(nextPos);
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleWindowResize);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [onClose, isEmbedded, size.width, size.height, applyLivePosition]);

  useEffect(() => {
    if (!isEmbedded) containerRef.current?.focus();
  }, [isEmbedded]);

  const handleDragStart = useCallback((e) => {
    if (isEmbedded) return;
    if (e.button !== 0 && e.button !== undefined) return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(DRAG_IGNORE_SELECTOR)) return;
    if (e.cancelable) e.preventDefault();

    const target = e.currentTarget;
    const pointerId = e.pointerId;
    let hasPointerCapture = false;
    if (typeof pointerId === 'number' && target.setPointerCapture) {
      try { target.setPointerCapture(pointerId); hasPointerCapture = true; } catch { /* noop */ }
    }
    setIsDragging(true);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startPos = { ...posRef.current };

    const handlePointerMove = (moveEvent) => {
      if (typeof pointerId === 'number' && moveEvent.pointerId !== pointerId) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const rawX = startPos.x + (moveEvent.clientX - startPointerX);
      const rawY = startPos.y + (moveEvent.clientY - startPointerY);
      const result = resolveOverlayPlacement(
        { left: rawX, top: rawY, width: 0, height: 0, right: rawX, bottom: rawY },
        { width: size.width, height: size.height },
        { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight },
        { placement: 'bottom', flip: false, clamp: true },
      );
      const latestPos = { x: result.x, y: result.y };
      posRef.current = latestPos;
      applyLivePosition(latestPos);
    };

    const handlePointerEnd = (endEvent) => {
      if (typeof pointerId === 'number' && endEvent.pointerId !== pointerId) return;
      if (hasPointerCapture && typeof pointerId === 'number' && target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
  }, [isEmbedded, size.width, size.height, applyLivePosition]);

  const handleResize = useCallback((_event, { size: newSize }) => {
    if (Math.abs(size.width - newSize.width) > 1 || Math.abs(size.height - newSize.height) > 1) {
      setSize({ width: newSize.width, height: newSize.height });
    }
  }, [size.width, size.height]);

  const handleCopy = useCallback(() => {
    if (!prediction) return;
    if (onCopyPrediction) {
      onCopyPrediction(prediction);
    } else {
      try {
        navigator.clipboard.writeText(JSON.stringify(prediction, null, 2));
      } catch (err) {
        console.warn('Failed to copy prediction', err);
      }
    }
  }, [prediction, onCopyPrediction]);

  if (!prediction) return null;

  const { word, source, prediction: pred, details } = prediction;

  // ── Lexicon data (only when it matches the active word) ───────────────────
  const lexMatches = lookupData && normalizeWord(lookupData.word) === normalizeWord(activeWord);
  const lex = lexMatches ? lookupData : null;
  const pos = lex?.definition?.partOfSpeech || lex?.pos || (Array.isArray(lex?.entries) ? lex.entries[0]?.pos : '') || '';
  const pronunciation = typeof lex?.pronunciation === 'string' ? lex.pronunciation : null;
  const definitions = (() => {
    if (!lex) return [];
    if (Array.isArray(lex.definitions) && lex.definitions.length > 0) {
      return [...new Set(lex.definitions.map((d) => (typeof d === 'string' ? d : d?.text)).filter(Boolean))].slice(0, 5);
    }
    return lex.definition?.text ? [lex.definition.text] : [];
  })();
  const { rhymes, slantRhymes, synonyms, antonyms } = cleanWordLists(activeWord, lex);
  // There was a "simile" row here. It was fed from /api/corpus/semantic, which
  // despite its name is a phoneme-distance search whose candidate pool is
  // lookupRhymes(word, 500) — every result carries the query's own rhyme_key.
  // The row then subtracted everything already shown as a rhyme or slant, so by
  // construction it displayed the rhymes that were too poor to make the rhyme
  // list, under a label promising figurative language. Nothing in this system
  // produces similes, so the row is gone rather than renamed into a half-truth.


  const canTransmute = typeof onTransmute === 'function' && rootWord && normalizeWord(activeWord) !== normalizeWord(rootWord);

  const phonology = pred.phonology || null;
  const estimated = Boolean(phonology?.estimated);

  const cardBody = (
    <div className="rp-card">
      <div className="rp-card-frame">
        <div className="rp-inner">
          {/* ── Title bar: the word is the card name, pronunciation its cost ── */}
          <div className="rp-header" onPointerDown={handleDragStart}>
            <div className="rp-title-bar">
              <span id={titleId} className="rp-word">{word}</span>
              <div className="rp-title-right">
                {pronunciation && <span className="rp-pron">{pronunciation}</span>}
                <button
                  type="button"
                  className="rp-close-btn"
                  onClick={() => onClose?.()}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Close card"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <Breadcrumb history={history} index={historyIndex} onJump={jumpToCrumb} />
            {/* ── Type line: part of speech + syllable/stress rhythm ── */}
            <div className="rp-type-line">
              <span className="rp-pos">{pos || 'word'}</span>
              <div className="rp-type-right">
                {estimated && (
                  <span
                    className="rp-estimated"
                    title="Not in the dictionary — the pronunciation and rhythm are derived from the spelling, so treat the sound as an estimate."
                  >
                    sound estimated
                  </span>
                )}
                <StressRhythm syllableCount={phonology?.syllableCount} stressPattern={phonology?.stressPattern} />
              </div>
            </div>
          </div>

          {/* ── Rules text box: the swap palette + flavor-text meaning ── */}
          <div key={activeWord} className={`rp-body ${isDragging ? 'rp-pointer-none' : ''}`}>
            {lookupLoading && !lex && <div className="rp-lexicon-status">consulting the lexicon…</div>}
            {!lookupLoading && lookupStatus !== 'ready' && (
              <OracleNotice error={lookupError} onRetry={retryLookup} />
            )}

            <div className="rp-textbox">
              <RuneRow label="rhyme" tier="perfect" words={rhymes} onNavigate={navigateTo} onTransmute={onTransmute} />
              <RuneRow label="slant" tier="slant" words={slantRhymes} onNavigate={navigateTo} onTransmute={onTransmute} />
              <RuneRow label="syn" tier="syn" words={synonyms} onNavigate={navigateTo} onTransmute={onTransmute} />
              <RuneRow label="ant" tier="ant" words={antonyms} onNavigate={navigateTo} onTransmute={onTransmute} />

              {definitions.length > 0 && (
                <div className="rp-flavor">
                  {definitions.map((def, i) => (
                    <p key={i} className="rp-def">
                      <span className="rp-def-marker">{definitions.length > 1 ? `${i + 1} · ` : ''}{pos || 'def'}</span>
                      {def}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <ResonanceSection partners={details.resonancePartners} />

            <div className="rp-actions">
              {canTransmute && (
                <button type="button" className="rp-action-btn rp-action-btn--accent" onClick={() => onTransmute(activeWord)}>
                  <Replace size={12} />
                  <span>{`Replace “${rootWord}” → “${activeWord}”`}</span>
                </button>
              )}
              <button type="button" className="rp-action-btn" onClick={handleCopy} aria-label="Copy this card">
                <Copy size={12} />
                <span>Copy</span>
              </button>
            </div>
          </div>

          {sessionHistory.length > 1 && typeof onSessionNavigate === 'function' && (
            <div className="rp-session-nav" role="navigation" aria-label="Session word history">
              <button
                type="button"
                className="rp-nav-btn"
                onClick={() => onSessionNavigate(-1)}
                disabled={sessionIndex <= 0}
                aria-label="Previous session word"
              >
                <ArrowLeft size={13} />
              </button>
              <span className="rp-nav-pos">{sessionIndex + 1} / {sessionHistory.length}</span>
              <button
                type="button"
                className="rp-nav-btn"
                onClick={() => onSessionNavigate(1)}
                disabled={sessionIndex >= sessionHistory.length - 1}
                aria-label="Next session word"
              >
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* ── Collector line: where the word lives in the manuscript ── */}
          {!isEmbedded && source?.filePath && (
            <div className="rp-footer">
              <span className="rp-source-path">{source.filePath}</span>
              <span className="rp-source-loc">L{source.line} · C{source.column}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Embedded (mobile sheet) - no positioning / resize chrome ──────────────
  if (isEmbedded) {
    return (
      <div ref={containerRef} className="ritual-prediction-tooltip rp-embedded" data-theme={theme}>
        {cardBody}
      </div>
    );
  }

  return (
    <motion.div
      ref={containerRef}
      className={`ritual-prediction-tooltip ${isDragging ? 'rp-is-dragging' : ''}`}
      data-theme={theme}
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 1300, touchAction: 'none' }}
      initial={CARD_INITIAL}
      animate={CARD_ANIMATE}
      exit={CARD_EXIT}
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="false"
      tabIndex={-1}
    >
      <ResizableBox
        width={size.width}
        height={size.height}
        minConstraints={[TOOLTIP_MIN_WIDTH, TOOLTIP_MIN_HEIGHT]}
        maxConstraints={[TOOLTIP_MAX_WIDTH, TOOLTIP_MAX_HEIGHT]}
        onResize={handleResize}
        resizeHandles={['se', 'sw', 'ne', 'nw', 'e', 's']}
        handleSize={[12, 12]}
      >
        {cardBody}
      </ResizableBox>
    </motion.div>
  );
};

export default RitualPredictionTooltip;
