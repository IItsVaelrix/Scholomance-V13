import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVerseSynthesis } from '../../hooks/useVerseSynthesis.js';
import { usePredictor } from '../../hooks/usePredictor.jsx';
import { useWordLookup } from '../../hooks/useWordLookup.jsx';
import { useTheme } from '../../hooks/useTheme.jsx';
import { useAdaptivePalette } from '../../hooks/useAdaptivePalette.js';
import { getSyntacticIntegrity } from '../../lib/syntacticIntegrity.js';
import IntelliSense from '../../components/IntelliSense.jsx';
import WordTooltip from '../../components/WordTooltip.jsx';
import { WORD_TOKEN_REGEX } from '../../lib/wordTokenization.js';
import { VOWEL_FAMILY_TO_SCHOOL } from '../../data/schools.js';
import { normalizeVowelFamily } from '../../lib/phonology/vowelFamily.js';
import { decodeBytecode } from '../../lib/truesight/bytecodeRenderer.js';
import { resolveResonanceColor, buildResonancePalette } from '../../lib/truesight/color/rhymeColorRegistry.js';
import { resolveSonicChroma } from '../../lib/phonology.adapter.js';

/**
 * OracleScribe.jsx
 *
 * An IDE-enhanced battle input surface.
 * Fuses Spell Weave logic (Intent) with Oracle intelligence (Energy).
 *
 * The verse textarea is always rendered in Truesight mode (the typed
 * text is visually transparent; the overlay shows phoneme-colored words
 * underneath). On first focus, a one-time reveal hint explains the mode
 * - otherwise first-time players see a transparent box and assume the
 * input is broken. Dismissal persists in localStorage.
 */

const TRUESIGHT_HINT_KEY = 'scholomance.combat.truesightHintSeen.v1';

export default function OracleScribe({ onSubmit, isDisabled, school, variant = 'default' }) {
  const [text, setText] = useState('');
  const [weave, setWeave] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [intellisenseSuggestions, setIntellisenseSuggestions] = useState([]);
  const [intellisenseIndex, setIntellisenseIndex] = useState(0);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [tooltipState, setTooltipState] = useState({ visible: false, token: null, position: { x: 0, y: 0 } });
  const [truesightHintVisible, setTruesightHintVisible] = useState(false);

  const textareaRef = useRef(null);
  const hintShownRef = useRef(false);
  const predictRequestRef = useRef(0);
  const { theme } = useTheme();

  const dismissTruesightHint = useCallback(() => {
    setTruesightHintVisible(false);
    try { window.localStorage.setItem(TRUESIGHT_HINT_KEY, '1'); } catch { /* noop */ }
  }, []);

  const onVerseFocus = useCallback(() => {
    setIsFocused(true);
    if (hintShownRef.current) return;
    let alreadySeen = false;
    try { alreadySeen = window.localStorage.getItem(TRUESIGHT_HINT_KEY) === '1'; } catch { /* noop */ }
    if (alreadySeen) {
      hintShownRef.current = true;
      return;
    }
    hintShownRef.current = true;
    setTruesightHintVisible(true);
  }, []);

  const {
    artifact: deepAnalysis,
    isSynthesizing: isAnalyzing
  } = useVerseSynthesis(text);

  const scoreData = deepAnalysis?.scoreData;

  const { palette: adaptivePalette } = useAdaptivePalette(deepAnalysis);
  const { predict, predictorReady } = usePredictor();

  // Conceptual Integrity (Phase 5)
  const integrity = useMemo(() => getSyntacticIntegrity(weave), [weave]);
  const canCast = text.trim().length > 0 && weave.trim().length > 0 && !isDisabled;

  const handleTextChange = (e) => {
    const val = e.target.value;
    if (val.length <= 300) setText(val);
  };

  const handleWeaveChange = (e) => {
    const val = e.target.value;
    if (val.length <= 100) setWeave(val);
  };

  const handleSubmit = () => {
    if (canCast) {
      onSubmit(text, weave);
      setText('');
      setWeave('');
    }
  };

  const handleKeyDown = (e) => {
    if (intellisenseSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIntellisenseIndex(i => (i + 1) % intellisenseSuggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIntellisenseIndex(i => (i - 1 + intellisenseSuggestions.length) % intellisenseSuggestions.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const token = intellisenseSuggestions[intellisenseIndex]?.token;
        const pos = textareaRef.current.selectionStart;
        const textBefore = text.substring(0, pos);
        const lastWordMatch = textBefore.match(/([a-zA-Z']+)$/);
        const before = lastWordMatch ? text.substring(0, lastWordMatch.index) : textBefore;
        setText(before + token + ' ' + text.substring(pos));
        setIntellisenseSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (!isFocused || !predictorReady || !text) return;
    const timeoutId = setTimeout(async () => {
      const requestId = ++predictRequestRef.current;
      const pos = textareaRef.current.selectionStart;
      const textBefore = text.substring(0, pos);
      const lastWordMatch = textBefore.match(/([a-zA-Z']+)$/);
      const prefix = lastWordMatch ? lastWordMatch[1] : '';
      const suggestions = await predict(prefix, null, 5);
      if (requestId !== predictRequestRef.current) return;
      if (Array.isArray(suggestions)) {
        setIntellisenseSuggestions(suggestions.map(s => ({ token: s })));
      }
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [text, isFocused, predictorReady, predict]);

  return (
    <div className={`oracle-scribe battle-panel oracle-scribe--${variant} ${isFocused ? 'is-focused' : ''}`}>
      <div className="scribe-header">
        <div className="scribe-label">ORACLE SCRIBE - {school} AFFINITY</div>
        <div className={`scribe-integrity status-${integrity.status?.toLowerCase()}`} aria-label="Syntactic integrity">
          {integrity.label || 'AWAITING CONCEPT'}
        </div>
      </div>

      <div className="scribe-editor-stack">
        {/* WEAVE (INTENT / FORM) */}
        <div className="scribe-field weave-field">
          <div className="field-label">INTENT / FORM (WEAVE)</div>
          <textarea
            className="scribe-weave-textarea"
            value={weave}
            onChange={handleWeaveChange}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder="e.g. Strike the shadow with force..."
            aria-label="Weave input"
          />
        </div>

        {/* VERSE (ENERGY / PHONEMES) */}
        <div className="scribe-field verse-field">
          <div className="field-label">ENERGY / PHONEMES (VERSE)</div>
          <div className="scribe-textarea-container">
            <div className="scribe-truesight-overlay" aria-hidden="true">
              {text.split(/(\s+)/).map((part, i) => {
                const isWord = WORD_TOKEN_REGEX.test(part);
                if (!isWord) return <span key={i}>{part}</span>;
                const normalized = part.trim().toUpperCase();
                const token = deepAnalysis?.tokenByNormalizedWord?.get(normalized);
                const wordVowelFamily = token?.vowelFamily;
                const rhymeKey = token?.rhymeKey || null;
                const pcaColor = wordVowelFamily ? adaptivePalette[wordVowelFamily] : 'inherit';
                const color = rhymeKey ? resolveResonanceColor(rhymeKey, school, pcaColor) : pcaColor;
                return (
                  <span key={i} className="scribe-truesight-word" style={{ color: color === 'inherit' ? undefined : color }}>
                    {part}
                  </span>
                );
              })}
            </div>
            <textarea
              ref={textareaRef}
              className="scribe-textarea truesight-transparent"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onFocus={onVerseFocus}
              onBlur={() => setIsFocused(false)}
              disabled={isDisabled}
              placeholder="Inscribe the living phonemes..."
              aria-label="Verse input"
            />
            <AnimatePresence>
              {truesightHintVisible && (
                <motion.div
                  className="truesight-reveal"
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <div className="truesight-reveal-glyph" aria-hidden="true">✦</div>
                  <div className="truesight-reveal-body">
                    <div className="truesight-reveal-title">TRUESIGHT AWAKENED</div>
                    <div className="truesight-reveal-text">
                      Your verse is illuminated. Words glow by <em>school</em> and <em>resonance</em> as you inscribe - what you type is still being recorded.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="truesight-reveal-dismiss"
                    onClick={dismissTruesightHint}
                    aria-label="Dismiss Truesight hint"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="scribe-footer">
        <div className="scribe-metrics">
          <div className="metric-resonance">
            <span>RESONANCE</span>
            <div className="metric-bar">
              <motion.div className="metric-fill" animate={{ width: `${(scoreData?.totalScore || 0) * 100}%` }} />
            </div>
          </div>
        </div>
        <button className="scribe-cast-btn" onClick={handleSubmit} disabled={!canCast}>
          {isAnalyzing ? 'ANALYZING...' : 'Cast this spell'}
        </button>
      </div>

      <AnimatePresence>
        {intellisenseSuggestions.length > 0 && (
          <IntelliSense
            suggestions={intellisenseSuggestions}
            selectedIndex={intellisenseIndex}
            position={cursorCoords}
            onAccept={(token) => {
              const pos = textareaRef.current.selectionStart;
              const textBefore = text.substring(0, pos);
              const lastWordMatch = textBefore.match(/([a-zA-Z']+)$/);
              const before = lastWordMatch ? text.substring(0, lastWordMatch.index) : textBefore;
              setText(before + token + ' ' + text.substring(pos));
              setIntellisenseSuggestions([]);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
