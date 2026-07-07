import { useRef, useLayoutEffect, useEffect, useState, useMemo, useId, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResizableBox } from 'react-resizable';
import { useTheme } from '../hooks/useTheme.jsx';
import { useWordLookup } from '../hooks/useWordLookup.jsx';
import { ScholomanceCorpusAPI } from '../lib/scholomanceCorpus.api.js';
import { buildRitualPrediction, reconcileWithLexicon } from '../lib/ritualPredictionTooltip.js';
import { resolveOverlayPlacement } from '../lib/truesight/overlay-placement.js';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight, Copy, Replace, Search, Sparkles, X } from 'lucide-react';
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

const ROLE_LABELS = {
  anchor: 'Anchor',
  modifier: 'Modifier',
  trigger: 'Trigger',
  connector: 'Connector',
  unknown: 'Unknown',
};

const ROLE_DESCRIPTIONS = {
  anchor: 'A stable naming point - identifies a concept or entity.',
  modifier: 'Qualifies or intensifies - shapes the meaning of another element.',
  trigger: 'Initiates action or transformation - a dynamic force.',
  connector: 'Links elements - a structural binding in the syntax.',
  unknown: 'Resists classification - may be a proper noun or rare token.',
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

function ConfidenceBadge({ confidence, factors }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(confidence * 100);
  const tier = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
  const hasFactors = Array.isArray(factors) && factors.length > 0;
  return (
    <span className="rp-confidence-wrap">
      <button
        type="button"
        className={`rp-confidence-badge rp-confidence--${tier}`}
        aria-label={`Confidence ${pct}%${hasFactors ? ' - show breakdown' : ''}`}
        aria-expanded={hasFactors ? open : undefined}
        onClick={hasFactors ? () => setOpen((v) => !v) : undefined}
        data-static={hasFactors ? undefined : 'true'}
      >
        {pct}%
      </button>
      <AnimatePresence>
        {open && hasFactors && (
          <motion.div
            className="rp-confidence-breakdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            {factors.map((f, i) => (
              <div key={i} className="rp-conf-factor">
                <span className="rp-conf-label">{f.label}</span>
                <span className={`rp-conf-delta ${f.delta >= 0 ? 'rp-conf-pos' : 'rp-conf-neg'}`}>
                  {f.delta >= 0 ? '+' : ''}{Math.round(f.delta * 100)}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function AuraTag({ label }) {
  return <span className="rp-aura-tag">{label}</span>;
}

// Suggestion pills. In a poem context (onTransmute provided) the primary click
// transmutes the word in the text one-click; a secondary ⌕ icon explores
// (navigates the card). Without a transmute handler the pill just navigates.
function RuneRow({ label, words, onNavigate, onTransmute }) {
  if (!words || words.length === 0) return null;
  return (
    <div className="rp-rune-row">
      <span className="rp-rune-label">{label}</span>
      <span className="rp-rune-pills">
        {words.slice(0, 8).map((w, i) => {
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

function ResonanceSection({ partners }) {
  if (!partners || partners.length === 0) return null;
  return (
    <section className="rp-section">
      <div className="rp-section-label">Resonance (this line)</div>
      <ul className="rp-resonance-list">
        {partners.map((p, i) => (
          <li
            key={i}
            className={`rp-resonance-row ${p.confirmed === false ? 'rp-resonance--unconfirmed' : ''}`}
            title={p.confirmed === false ? 'Unconfirmed by the lexicon (local phoneme estimate)' : undefined}
          >
            <span className={`rp-resonance-tier rp-tier--${p.type}`}>{RHYME_TIER_LABEL[p.type] || p.type}</span>
            <span className="rp-resonance-word">{p.word}</span>
            <span className="rp-resonance-score">{p.score.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function cleanWordLists(activeWord, lex) {
  if (!lex) return { rhymes: [], slantRhymes: [], synonyms: [], antonyms: [] };
  const normalized = normalizeWord(activeWord);
  const normalizeItem = (w) => normalizeWord(typeof w === 'string' ? w : w?.word);

  const seen = new Set([normalized]);
  const takeUnique = (list, limit = 8) => (list || []).filter((w) => {
    const n = normalizeItem(w);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  }).slice(0, limit);

  return {
    rhymes: takeUnique(lex.rhymes, 8),
    slantRhymes: takeUnique(lex.slantRhymes, 8),
    synonyms: takeUnique(lex.synonyms, 8),
    antonyms: takeUnique(lex.antonyms, 8),
  };
}

function WhyFactorsSection({ factors, fallback }) {
  if (!factors || factors.length === 0) {
    return fallback ? <p className="rp-why-text">{fallback}</p> : null;
  }
  return (
    <ul className="rp-why-list">
      {factors.map((f, i) => (
        <li key={i} className="rp-why-row">
          <span className="rp-why-detail">{f.detail}</span>
          <span className="rp-why-weight" title="signal weight">{Math.round(f.weight * 100)}</span>
        </li>
      ))}
    </ul>
  );
}

function DiagnosticsSection({ diagnostics }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!diagnostics) return null;
  const { warnings, debugTrace } = diagnostics;
  if ((!warnings || warnings.length === 0) && (!debugTrace || debugTrace.length === 0)) return null;

  return (
    <div className="rp-diagnostics">
      <button
        type="button"
        className="rp-diagnostics-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Arcane Traces</span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="rp-diagnostics-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {warnings?.length > 0 && (
              <div className="rp-diag-warnings">
                {warnings.map((w, i) => (
                  <div key={i} className="rp-diag-warn">{w}</div>
                ))}
              </div>
            )}
            {debugTrace?.length > 0 && (
              <div className="rp-diag-trace">
                {debugTrace.map((t, i) => (
                  <div key={i} className="rp-diag-line">{t}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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

  const { lookup, data: lookupData, isLoading: lookupLoading } = useWordLookup();
  useEffect(() => {
    if (activeWord) lookup(activeWord);
  }, [activeWord, lookup]);

  const [corpusData, setCorpusData] = useState({ semantic: [], search: [] });
  const [corpusLoading, setCorpusLoading] = useState(false);
  useEffect(() => {
    if (!activeWord || !ScholomanceCorpusAPI.isEnabled()) {
      setCorpusData({ semantic: [], search: [] });
      return;
    }
    setCorpusLoading(true);
    let cancelled = false;
    Promise.all([
      ScholomanceCorpusAPI.semantic(activeWord, 8).catch(() => []),
      ScholomanceCorpusAPI.search(activeWord, 3).catch(() => []),
    ]).then(([semantic, search]) => {
      if (cancelled) return;
      setCorpusData({ semantic, search });
    }).finally(() => {
      if (!cancelled) setCorpusLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeWord]);

  // Provisional, instant prediction: the precomputed one for the root word,
  // otherwise a locally-built heuristic for whatever word we've navigated to.
  const basePrediction = useMemo(() => {
    if (!activeWord) return predictionProp;
    if (predictionProp && normalizeWord(predictionProp.word) === normalizeWord(activeWord)) {
      return predictionProp;
    }
    return buildRitualPrediction({ word: activeWord, line: 0, column: 0, contextLine: seedContextLine, surroundingText: seedContextLine });
  }, [predictionProp, activeWord, seedContextLine]);

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

  const { word, source, prediction: pred, details, diagnostics } = prediction;

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
  const similes = corpusData.semantic
    .map((r) => (typeof r === 'string' ? r : r?.word))
    .filter((w) => {
      const n = normalizeWord(w);
      return n && n !== normalizeWord(activeWord)
        && !rhymes.some((r) => normalizeWord(r) === n)
        && !slantRhymes.some((r) => normalizeWord(r) === n)
        && !synonyms.some((r) => normalizeWord(r) === n)
        && !antonyms.some((r) => normalizeWord(r) === n);
    }).slice(0, 8);

  const { rhymes, slantRhymes, synonyms, antonyms } = cleanWordLists(activeWord, lex);
  const similes = corpusData.semantic
    .map((r) => (typeof r === 'string' ? r : r?.word))
    .filter((w) => {
      const n = normalizeWord(w);
      return n && n !== normalizeWord(activeWord)
        && !rhymes.some((r) => normalizeWord(r) === n)
        && !slantRhymes.some((r) => normalizeWord(r) === n)
        && !synonyms.some((r) => normalizeWord(r) === n)
        && !antonyms.some((r) => normalizeWord(r) === n);
    }).slice(0, 8);

  const canTransmute = typeof onTransmute === 'function' && rootWord && normalizeWord(activeWord) !== normalizeWord(rootWord);

  const cardBody = (
    <div className="rp-card">
      <div className="rp-card-frame">
        <div className="rp-header" onPointerDown={handleDragStart}>
          <div className="rp-header-top">
            <h3 id={titleId} className="rp-title">Arcane Resonance</h3>
            <button
              type="button"
              className="rp-close-btn"
              onClick={() => onClose?.()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close prediction"
            >
              <X size={14} />
            </button>
          </div>
          <Breadcrumb history={history} index={historyIndex} onJump={jumpToCrumb} />
          <div className="rp-word-row">
            <span className="rp-word">{word}</span>
            <ConfidenceBadge confidence={pred.confidence} factors={pred.confidenceFactors} />
          </div>
          {pronunciation && <div className="rp-pron">{pronunciation}</div>}
          <div className="rp-ritual-name">{pred.ritualName}</div>
        </div>

        <div key={activeWord} className={`rp-body rp-ink ${isDragging ? 'rp-pointer-none' : ''}`}>
          <section className="rp-section">
            <div className="rp-section-label">Lexicon & Structure</div>
            <div className="rp-role-row">
              <span className={`rp-role-badge rp-role--${pred.role}`}>{ROLE_LABELS[pred.role] || 'Unknown'}</span>
              {pred.roleSignal && <span className="rp-role-signal">via {pred.roleSignal}</span>}
              {pos && <span className="rp-lex-pos">{pos}</span>}
              {pred.provisional && <span className="rp-role-provisional" title="Awaiting lexicon confirmation">provisional</span>}
            </div>
            <div className="rp-role-desc">{ROLE_DESCRIPTIONS[pred.role] || ''}</div>
            
            {lookupLoading && !lex && <div className="rp-lexicon-status">consulting the lexicon...</div>}
            <div className="rp-definitions-group">
              {definitions.map((def, i) => <p key={i} className="rp-lex-def">{def}</p>)}
            </div>
            <RuneRow label="syn" words={synonyms} onNavigate={navigateTo} onTransmute={onTransmute} />
            <RuneRow label="ant" words={antonyms} onNavigate={navigateTo} onTransmute={onTransmute} />
            <RuneRow label="rhyme" words={rhymes} onNavigate={navigateTo} onTransmute={onTransmute} />
            <RuneRow label="slant" words={slantRhymes} onNavigate={navigateTo} onTransmute={onTransmute} />
            <RuneRow label="simile" words={similes} onNavigate={navigateTo} onTransmute={onTransmute} />
          </section>

          {details.whyFactors?.length > 0 && (
            <section className="rp-section">
              <div className="rp-section-label">Divination Insights</div>
              <WhyFactorsSection factors={details.whyFactors} fallback={details.why} />
            </section>
          )}

          <ResonanceSection partners={details.resonancePartners} />

          {pred.phonology && (
            <section className="rp-section">
              <div className="rp-section-label"><Sparkles size={11} /> Phonology</div>
              <div className="rp-phon-grid">
                {pred.phonology.vowelFamily && <span className="rp-phon-cell"><b>vowel</b> {String(pred.phonology.vowelFamily).toUpperCase()}</span>}
                {pred.phonology.syllableCount > 0 && <span className="rp-phon-cell"><b>syllables</b> {pred.phonology.syllableCount}</span>}
                {pred.phonology.stressPattern && <span className="rp-phon-cell"><b>stress</b> {pred.phonology.stressPattern}</span>}
                {pred.phonology.coda && <span className="rp-phon-cell"><b>coda</b> {pred.phonology.coda}</span>}
                {pred.phonology.rhymeKey && <span className="rp-phon-cell"><b>rhyme</b> {pred.phonology.rhymeKey}</span>}
              </div>
              {pred.phonology.extendedRhymeKeys?.length > 0 && (
                <div className="rp-aura-tags" role="list" aria-label="Extended rhyme keys">
                  {pred.phonology.extendedRhymeKeys.slice(0, 6).map((k, i) => <AuraTag key={i} label={k} />)}
                </div>
              )}
            </section>
          )}

          {details.nearbySignals.length > 0 && (
            <section className="rp-section">
              <div className="rp-section-label">Nearby Signals</div>
              <ul className="rp-signals-list">
                {details.nearbySignals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </section>
          )}

          {(corpusData.semantic.length > 0 || corpusData.search.length > 0 || corpusLoading) && (
            <section className="rp-section">
              <div className="rp-section-label">Scholomance Corpus</div>
              {corpusLoading && <div className="rp-lexicon-status">consulting the corpus...</div>}
              <RuneRow
                label="echo"
                words={corpusData.semantic.map((r) => (typeof r === 'string' ? r : r?.word)).filter(Boolean)}
                onNavigate={navigateTo}
                onTransmute={onTransmute}
              />
              {corpusData.search.map((result, i) => (
                <p key={i} className="rp-lex-def rp-corpus-snippet">
                  {result.snippet || result.text}
                </p>
              ))}
            </section>
          )}

          <section className="rp-section">
            <div className="rp-section-label">Suggested Actions</div>
            <div className="rp-actions">
              {canTransmute && (
                <button type="button" className="rp-action-btn rp-action-btn--accent" onClick={() => onTransmute(activeWord)}>
                  <Replace size={12} />
                  <span>{`Replace "${rootWord}" → "${activeWord}"`}</span>
                </button>
              )}
              <button type="button" className="rp-action-btn" onClick={handleCopy}>
                <Copy size={12} />
                <span>Copy prediction</span>
              </button>
            </div>
          </section>

          <DiagnosticsSection diagnostics={diagnostics} />
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

        {!isEmbedded && source?.filePath && (
          <div className="rp-footer">
            <span className="rp-source-path">{source.filePath}</span>
            <span className="rp-source-loc">L{source.line} C{source.column}</span>
          </div>
        )}
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
