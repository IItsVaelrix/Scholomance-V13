import { useState, useEffect, useLayoutEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, startTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "../../hooks/useTheme.jsx";
import IntelliSense from "../../components/IntelliSense.jsx";
import { computeAdaptiveGridTopology, buildTruesightOverlayLines } from "../../lib/truesight/compiler/adaptiveWhitespaceGrid";
import Gutter from "./Gutter.jsx";
import { normalizeVowelFamily } from "../../lib/phonology/vowelFamily.js";
import { WORD_TOKEN_REGEX } from "../../lib/wordTokenization.js";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion.js";
import { decodeBytecode } from "../../lib/truesight/bytecodeRenderer.js";
import { cleanVisualiserWord, wordTruesight } from "../Visualiser/truesightColor";
import { resolvePlsVerseIRState } from "../../lib/pls/verseIRBridge.js";
import { BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, ERROR_CODES, MODULE_IDS } from "../../lib/pixelbrain.adapter.js";
import { AnimatedSurface } from "../../components/AnimatedSurface";
import { resolveOverlayPlacement } from "../../lib/truesight/overlay-placement.js";
import { extractPreviousWord } from "../../../codex/core/spellcheckContext.js";


const MAX_CONTENT_LENGTH = 50000;
// Matches the CSS --editor-content-line-height: 1.9 at the default
// --editor-content-font-size: clamp(1.02rem,1.2vw,1.12rem) ≈ 16px.
// When adaptiveTopology hasn't computed yet (e.g. single-line content before
// the ResizeObserver fires), this keeps the gutter at the correct height so
// it doesn't jump from 24px → 30.4px when the first keystroke triggers
// topology recalculation.
const DEFAULT_LINE_HEIGHT = 30.4;

const sanitizeTruesightStyle = (styleObj) => {
  if (!styleObj) return {};
  const copy = { ...styleObj };
  const forbidden = [
    'letterSpacing', 'wordSpacing', 'fontWeight', 'fontStyle',
    'fontFamily', 'fontSize', 'lineHeight', 'textTransform',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'border', 'borderWidth', 'borderStyle'
  ];
  for (const prop of forbidden) {
    delete copy[prop];
  }
  return copy;
};

function normalizeWordToken(token) {
  return cleanVisualiserWord(token).toUpperCase();
}

function toFiniteInt(value, fallback = -1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function findSyntaxTokenForCursor(syntaxLayer, lineNumber, targetWordIndex, targetCharStart) {
  if (!syntaxLayer || typeof syntaxLayer !== "object") return null;

  const byIdentity = syntaxLayer.tokenByIdentity;
  const byCharStart = syntaxLayer.tokenByCharStart;
  const tokens = Array.isArray(syntaxLayer.tokens) ? syntaxLayer.tokens : [];

  if (byIdentity?.get && Number.isInteger(targetCharStart) && targetCharStart >= 0) {
    const identity = `${lineNumber}:${targetWordIndex}:${targetCharStart}`;
    const identityToken = byIdentity.get(identity);
    if (identityToken) return identityToken;
  }

  if (byCharStart?.get && Number.isInteger(targetCharStart) && targetCharStart >= 0) {
    const exactCharToken = byCharStart.get(targetCharStart);
    if (exactCharToken) return exactCharToken;
  }

  const lineTokens = tokens
    .filter((token) => toFiniteInt(token?.lineNumber, -1) === lineNumber)
    .sort((a, b) => toFiniteInt(a?.wordIndex, 0) - toFiniteInt(b?.wordIndex, 0));

  if (lineTokens.length === 0) return null;

  if (Number.isInteger(targetCharStart) && targetCharStart >= 0) {
    const rangeMatch = lineTokens.find((token) => {
      const start = toFiniteInt(token?.charStart, -1);
      const end = toFiniteInt(token?.charEnd, -1);
      if (start < 0 || end < start) return false;
      return targetCharStart >= start && targetCharStart <= end;
    });
    if (rangeMatch) return rangeMatch;
  }

  const exactWordIndex = lineTokens.find(
    (token) => toFiniteInt(token?.wordIndex, -1) === targetWordIndex
  );
  if (exactWordIndex) return exactWordIndex;

  const closestPrior = [...lineTokens]
    .reverse()
    .find((token) => toFiniteInt(token?.wordIndex, -1) <= targetWordIndex);
  if (closestPrior) return closestPrior;

  return lineTokens[lineTokens.length - 1];
}

/**
 * Resolves a word token at the given character offset.
 * Uses the syntaxLayer if available, otherwise falls back to regex tokenization.
 */
function resolveWordTokenAtOffset(cursorOffset, syntaxLayer, content) {
  if (!syntaxLayer || typeof syntaxLayer !== "object") {
    // Fallback: basic tokenization from content
    const beforeCursor = String(content || "").slice(0, Math.max(0, cursorOffset));
    const lines = beforeCursor.split("\n");
    const lineNumber = Math.max(0, lines.length - 1);
    const currentLineText = lines[lines.length - 1] || "";
    const words = currentLineText.match(WORD_TOKEN_REGEX) || [];
    const targetWordIndex = words.length;
    
    return {
      lineNumber,
      wordIndex: targetWordIndex,
      charStart: beforeCursor.length,
      charEnd: beforeCursor.length,
      token: words[targetWordIndex - 1] || "",
    };
  }

  // Use syntax layer for precise token resolution
  const beforeCursor = String(content || "").slice(0, Math.max(0, cursorOffset));
  const linesBefore = beforeCursor.split("\n");
  const lineNumber = Math.max(0, linesBefore.length - 1);
  const currentLineText = linesBefore[linesBefore.length - 1] || "";
  const words = currentLineText.match(WORD_TOKEN_REGEX) || [];
  const targetWordIndex = words.length;

  const syntaxToken = findSyntaxTokenForCursor(
    syntaxLayer,
    lineNumber,
    targetWordIndex,
    cursorOffset
  );

  if (syntaxToken) {
    return {
      ...syntaxToken,
      lineNumber: toFiniteInt(syntaxToken?.lineNumber, lineNumber),
      wordIndex: toFiniteInt(syntaxToken?.wordIndex, targetWordIndex),
      charStart: toFiniteInt(syntaxToken?.charStart, cursorOffset),
      charEnd: toFiniteInt(syntaxToken?.charEnd, cursorOffset),
    };
  }

  // Fallback
  return {
    lineNumber,
    wordIndex: targetWordIndex,
    charStart: cursorOffset,
    charEnd: cursorOffset,
    token: "",
  };
}

/**
 * Builds a word activation payload from a token entry.
 */
function buildWordPayloadFromToken(tokenEntry) {
  if (!tokenEntry) return null;

  const rawToken = tokenEntry.token || "";
  const normalizedWord = normalizeWordToken(rawToken);
  // school is intentionally absent: the caller sets it from wordTruesight so
  // the payload always agrees with the rendered colour (single authority).
  const vowelFamily = tokenEntry.vowelFamily || null;

  return {
    word: rawToken,
    normalizedWord,
    charStart: toFiniteInt(tokenEntry?.charStart, -1),
    charEnd: toFiniteInt(tokenEntry?.charEnd, -1),
    lineNumber: toFiniteInt(tokenEntry?.lineNumber, -1),
    wordIndex: toFiniteInt(tokenEntry?.wordIndex, -1),
    vowelFamily,
    analysis: tokenEntry.analysis || null,
    bytecode: tokenEntry.visualBytecode || tokenEntry.trueVisionBytecode || null,
  };
}

/**
 * Emits a word activation event via the onWordActivate callback.
 */
function emitWordActivation(trigger, wordPayload, anchorRect, onWordActivate) {
  if (!onWordActivate || !wordPayload) return;

  const activation = {
    trigger,
    ...wordPayload,
    anchorRect,
  };

  onWordActivate(activation);
}

// ── Pillar 5: De-jittered caret measurement ──────────────────────────────────
// A single persistent, offscreen canvas measures text - no per-keystroke DOM
// allocation, so typing produces no GC churn. Computed font styles and a
// per-character width matrix are cached and invalidated only on an explicit
// layout-shift trigger (see invalidateCaretMeasurementCache).

function getMeasurementContext(measurement) {
  if (!measurement.ctx) {
    if (typeof document === 'undefined') return null;
    measurement.canvas = document.createElement('canvas');
    measurement.ctx = measurement.canvas.getContext('2d');
    // Match the textarea's text-rendering:geometricPrecision shaping so caret
    // measurement uses the same fractional glyph advances the browser renders
    // (canvas defaults to optimizeSpeed, which grid-fits advances to integers).
    if (measurement.ctx && 'textRendering' in measurement.ctx) {
      measurement.ctx.textRendering = 'geometricPrecision';
    }
    if (measurement.ctx && 'fontKerning' in measurement.ctx) {
      measurement.ctx.fontKerning = 'normal';
    }
  }
  return measurement.ctx;
}

/**
 * Explicit cache-invalidation trigger. Called when a physical layout shift
 * (font family/size, adaptive topology, Truesight scale) changes glyph metrics.
 * Width and device-pixel changes are detected automatically via the signature.
 */
function invalidateCaretMeasurementCache(measurement) {
  if (!measurement) return;
  measurement.styles = null;
  measurement.charWidths.clear();
  measurement.signature = '';
}

function refreshMeasurementStyles(measurement, textarea) {
  const s = window.getComputedStyle(textarea);
  const fontSize = parseFloat(s.fontSize) || 16;
  
  // Signature captures the cheap-to-read layout inputs that shift glyph
  // metrics: textarea width (wrap points), device-pixel ratio (zoom),
  // and critical typographic properties to prevent side-by-side cache pollution.
  const signature = [
    textarea.clientWidth,
    window.devicePixelRatio || 1,
    s.fontFamily,
    s.fontSize,
    s.fontWeight,
    s.fontStyle,
    s.letterSpacing,
  ].join('|');

  if (measurement.styles && measurement.signature === signature) {
    return measurement.styles;
  }

  let lineHeight = parseFloat(s.lineHeight);
  if (!String(s.lineHeight).includes('px') && lineHeight < 10) {
    lineHeight = lineHeight * fontSize;
  }
  if (Number.isNaN(lineHeight)) {
    const customLineHeight = parseFloat(s.getPropertyValue('--editor-content-line-height'));
    if (!Number.isNaN(customLineHeight)) {
      lineHeight = customLineHeight * fontSize;
    } else {
      lineHeight = fontSize * 1.9;
    }
  }

  measurement.styles = {
    fontSize,
    lineHeight,
    paddingLeft: parseFloat(s.paddingLeft) || 0,
    paddingTop: parseFloat(s.paddingTop) || 0,
    fontString: `${s.fontWeight} ${fontSize}px ${s.fontFamily}`,
  };
  measurement.signature = signature;
  measurement.charWidths.clear(); // glyph metrics changed
  return measurement.styles;
}

/** Measures a line width via a cached per-character width matrix. */
function measureLineWidth(measurement, line, styles) {
  const ctx = getMeasurementContext(measurement);
  if (!ctx) return 0;
  if (ctx.font !== styles.fontString) ctx.font = styles.fontString;
  const widths = measurement.charWidths;
  let total = 0;
  for (const ch of line) {
    let w = widths.get(ch);
    if (w === undefined) {
      w = ctx.measureText(ch).width;
      widths.set(ch, w);
    }
    total += w;
  }
  return total;
}

function getCursorCoordsFromTextarea(measurement, textarea, mirrored = false, topology = null) {
  if (!textarea) return { x: 0, y: 0 };

  const styles = refreshMeasurementStyles(measurement, textarea);
  const pos = textarea.selectionStart;
  const text = textarea.value.substring(0, pos);
  const lines = text.split('\n');
  const lineCount = lines.length;
  const currentLineText = lines[lineCount - 1];

  const textWidth = measureLineWidth(measurement, currentLineText, styles);

  let x = styles.paddingLeft + textWidth;
  const y = styles.paddingTop + (lineCount - 1) * styles.lineHeight;

  if (mirrored && topology) {
    const axisX = (topology.totalWidth - 1) / 2;
    x = (2 * axisX) - x;
  }

  return { x, y };
}

function getCaretViewportCoords(measurement, textarea, prefix = "", topology = null) {
  if (!textarea) return { x: 0, y: 0 };

  const rect = textarea.getBoundingClientRect();
  const styles = refreshMeasurementStyles(measurement, textarea);
  const pos = textarea.selectionStart;
  const startPos = Math.max(0, pos - prefix.length);
  const textBeforeStart = textarea.value.substring(0, startPos);
  const lines = textBeforeStart.split('\n');
  const lineCount = lines.length;
  const currentLineText = lines[lineCount - 1];

  const textWidth = measureLineWidth(measurement, currentLineText, styles);

  const contentX = styles.paddingLeft + textWidth;
  const contentY = styles.paddingTop + (lineCount - 1) * styles.lineHeight;

  const visualX = contentX - textarea.scrollLeft;
  const visualY = contentY - textarea.scrollTop;

  return {
    x: rect.left + visualX,
    y: rect.top + visualY + styles.lineHeight - 2
  };
}

/**
 * @typedef {{
 *   content?: string,
 *   title?: string,
 *   isEditable?: boolean,
 *   isTruesight?: boolean,
 *   isPredictive?: boolean,
 *   disabled?: boolean,
 *   onContentChange?: (content: string) => void,
 *   onTitleChange?: (title: string) => void,
 *   onSave?: () => void,
 *   onCancel?: () => void,
 *   onCursorChange?: (pos: { line: number, col: number }) => void,
 *   onSelectionTextChange?: (selection: string) => void,
 *   onWordActivate?: (token: object) => void,
 *   onScrollChange?: (top: number) => void,
 *   analyzedDocument?: object | null,
 *   lineSyllableCounts?: number[] | null,
 *   analyzedWords?: Map<any, any>,
 *   analyzedWordsByCharStart?: Map<number, any>,
 *   analyzedWordsByIdentity?: Map<string, any>,
 *   highlightedLines?: number[],
 *   pinnedLines?: number[],
 *   predict?: ((text: string) => Promise<string[]>) | null,
 *   getCompletions?: ((prefix: string) => Promise<string[]>) | null,
 *   checkSpelling?: ((word: string) => Promise<boolean>) | null,
 *   getSpellingSuggestions?: ((word: string, ctx: any, n: number) => Promise<string[]>) | null,
 *   predictorReady?: boolean,
 *   plsPhoneticFeatures?: object | null,
 *   tokenWeights?: Record<string, number> | null,
 *   theme?: object | null,
 *   forceTopology?: object | null,
 *   initialContainerWidth?: number | null,
 *   ideMode?: 'EDIT' | 'TRUESIGHT' | 'NEUTRAL',
 *   onFocus?: () => void,
 *   onBlur?: () => void,
 *   mirrored?: boolean,
 *   allowLegacyWordFallback?: boolean,
 * }} ScrollEditorProps
 */

/**
 * Handle exposed via forwardRef. Callers may only call methods listed here.
 * If a method is not in this typedef it does not exist on the ref - add it
 * here and to useImperativeHandle together or not at all.
 *
 * @typedef {{
 *   save: () => void,
 *   jumpToLine: (lineNumber: number) => void,
 *   scrollTo: (y: number) => void,
 *   scrollToTopSmooth: () => void,
 *   replaceContent: (newContent: string) => void,
 *   readonly clientHeight: number,
 *   readonly scrollHeight: number,
 * }} ScrollEditorHandle
 */

const ScrollEditor = forwardRef(/**
 * @param {ScrollEditorProps} props
 * @param {import('react').ForwardedRef<ScrollEditorHandle>} ref
 */({
  content: initialContent = "",
  title: initialTitle = "",
  isEditable: propIsEditable = false,
  isTruesight: propIsTruesight = false,
  isPredictive = false,
  disabled = false,
  onContentChange,
  onTitleChange,
  onSave,
  onCancel,
  onCursorChange,
  onSelectionTextChange,
  onWordActivate,
  onScrollChange,
  analyzedDocument = null,
  lineSyllableCounts: propLineSyllableCounts = null,
  analyzedWords = new Map(),
  analyzedWordsByCharStart = new Map(),
  analyzedWordsByIdentity = new Map(),
  highlightedLines = [],
  pinnedLines = [],
  predict = null,
  getCompletions = null,
  checkSpelling = null,
  getSpellingSuggestions = null,
  predictorReady = false,
  plsPhoneticFeatures = null,
  tokenWeights = null,
  theme = null,
  // Test-injection seams (bug a2812103) - let JSDOM-bound tests bypass real
  // layout measurement. Production code never passes these.
  forceTopology = null,
  initialContainerWidth = null,
  ideMode,
  onFocus,
  onBlur,
  mirrored = false,
  allowLegacyWordFallback = true,
  isLatticeGrid = false,
}, ref) => {
  const { theme: activeTheme } = useTheme();

  const activeIdeMode = ideMode || (propIsTruesight ? "TRUESIGHT" : (propIsEditable ? "EDIT" : "NEUTRAL"));
  const isEditable = propIsEditable;
  const isTruesight = propIsTruesight;

  const [content, setContent] = useState(initialContent);
  const [contentForOverlay, setContentForOverlay] = useState(initialContent);
  const isTypingRef = useRef(false);
  const caretMeasurementRef = useRef({
    canvas: null,
    ctx: null,
    styles: null,
    charWidths: new Map(),
    signature: '',
  });
  const typingTimeoutRef = useRef(null);
  const completionsTimeoutRef = useRef(null);
  const completionsRequestRef = useRef(0);

  const syncOverlayToContent = useCallback((newContent) => {
    setContentForOverlay(newContent);
    isTypingRef.current = false;
  }, []);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(initialContainerWidth ?? 0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [intellisenseSuggestions, setIntellisenseSuggestions] = useState([]);
  const [intellisenseIndex, setIntellisenseIndex] = useState(0);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [viewportState, setViewportState] = useState(null);
  const [adaptiveTopology, setAdaptiveTopology] = useState(forceTopology);
  const [isGhostPinned, setIsGhostPinned] = useState(false);
  const [ghostData, setGhostData] = useState(null);
  const [bytecodeArtifacts, setBytecodeArtifacts] = useState([]);
  const [isQuarantined, setIsQuarantined] = useState(false);

  const editorContainerRef = useRef(null);
  const wrapperRef = useRef(null);
  const textareaRef = useRef(null);
  const wordBackgroundLayerRef = useRef(null);
  const gutterRef = useRef(null);
  const markdownRef = useRef(null);
  const scrollTopRef = useRef(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = prefersReducedMotion;

  const isReadOnlyPlain = !isEditable && !isTruesight;
  const isReadOnlyTruesight = !isEditable && isTruesight;

  useLayoutEffect(() => {
    setContent(initialContent);
    setContentForOverlay(initialContent);
    isTypingRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [initialContent]);

  useEffect(() => {
    // FORCE SYNC: When transitioning from editable to read-only (e.g. after SAVE),
    // we must immediately flush the overlay to ensure the final saved state
    // is bit-perfectly reflected in the analytical artifacts.
    if (!isEditable) {
      setContentForOverlay(content);
      isTypingRef.current = false;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  }, [isEditable, content]);

  useLayoutEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  const stableTypographyRef = useRef(null);

  const updateTypography = useCallback((force = false) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const styles = window.getComputedStyle(wrapper);
    const clientWidth = wrapper.clientWidth;
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    
    const width = Math.max(0, clientWidth - paddingLeft - paddingRight);
    const height = wrapper.clientHeight;

    // Only update state if dimensions or critical font styles actually changed, or if forced
    const current = stableTypographyRef.current;
    if (!force && current && 
        current.width === width && 
        current.height === height && 
        current.fontSize === styles.fontSize &&
        current.fontFamily === styles.fontFamily) {
      return;
    }

    const topology = computeAdaptiveGridTopology({
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontStyle: styles.fontStyle,
      fontWeight: styles.fontWeight,
      lineHeight: styles.lineHeight,
      paddingLeft,
      paddingTop,
      paddingRight,
      letterSpacing: parseFloat(styles.letterSpacing) || 0,
      wordSpacing: parseFloat(styles.wordSpacing) || 0,
      tabSize: parseInt(styles.tabSize || '2', 10) || 2,
      containerWidth: clientWidth
    });
    
    stableTypographyRef.current = { 
      width, 
      height, 
      fontSize: styles.fontSize, 
      fontFamily: styles.fontFamily,
      topology 
    };

    setContainerWidth(width);
    setContainerHeight(height);
    setAdaptiveTopology(topology);
  }, []);

  useLayoutEffect(() => {
    // When forceTopology is supplied (e.g., JSDOM tests), skip real
    // measurement entirely - the injected topology IS the authoritative state.
    if (forceTopology) return undefined;
    // EDIT mode types rapidly - skip continuous measurement while composing.
    // BUT never skip when Truesight is on: the annotation overlay positions every
    // word box against this topology, so starving it leaves the lattice unable to
    // instantiate. (The ResizeObserver below fires on size/font change, not on
    // keystrokes, so this doesn't re-measure per letter.)
    if (activeIdeMode === "EDIT" && !isTruesight) return undefined;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Initial measurement covers Gutter alignment in all non-EDIT modes.
    updateTypography(true);

    // NEUTRAL is static - initial measurement is sufficient; skip observer.
    if (activeIdeMode === "NEUTRAL") return undefined;

    // TRUESIGHT needs continuous tracking for overlay layout.
    let frameId;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        updateTypography();
      });
    });

    observer.observe(wrapper);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateTypography, forceTopology, activeIdeMode]);

  // Chunked relayout: each raw line's measured token geometry is cached by its
  // text, so typing only re-measures the edited line - the rest are reused. The
  // whole lattice no longer regenerates per keystroke, which is what let us drop
  // the typing-freeze (and the desync it caused) on the input path below.
  const overlayLineCacheRef = useRef({ sig: '', map: new Map() });
  const { overlayLines, allOverlayTokens } = useMemo(() => {
    if (!adaptiveTopology || !Number.isFinite(containerWidth) || containerWidth <= 0) {
      return { overlayLines: [], allOverlayTokens: [] };
    }
    const t = adaptiveTopology;
    // Any font/width change invalidates every cached measurement.
    const sig = `${containerWidth}|${t.fontFamily}|${t.fontSize}|${t.fontStyle}|${t.fontWeight}|${t.letterSpacing}|${t.wordSpacing}`;
    const cacheBox = overlayLineCacheRef.current;
    if (cacheBox.sig !== sig) {
      cacheBox.sig = sig;
      cacheBox.map = new Map();
    }
    const cache = cacheBox.map;

    const rawLines = String(contentForOverlay || "").split("\n");
    const seen = new Set();
    const lines = [];
    let absoluteOffset = 0;
    let globalVisualLineIndex = 0;

    for (let rawLineIndex = 0; rawLineIndex < rawLines.length; rawLineIndex += 1) {
      const lineText = rawLines[rawLineIndex];
      seen.add(lineText);
      // Per-line geometry is independent (token x/width are line-local); only the
      // absolute char offset and visual-line index are stitched in per render.
      let lineVisuals = cache.get(lineText);
      if (!lineVisuals) {
        lineVisuals = buildTruesightOverlayLines(lineText, containerWidth, t).lines;
        cache.set(lineText, lineVisuals);
      }
      for (const vl of lineVisuals) {
        const offset = absoluteOffset;
        lines.push({
          ...vl,
          lineIndex: globalVisualLineIndex,
          rawLineIndex,
          absoluteStart: offset,
          tokens: vl.tokens.map((tok) => ({
            ...tok,
            globalCharStart: offset + tok.localStart,
            lineIndex: rawLineIndex,
          })),
        });
        globalVisualLineIndex += 1;
      }
      absoluteOffset += lineText.length + 1;
    }

    // Keep the cache bounded to the document's live lines.
    if (cache.size > rawLines.length * 2 + 64) {
      for (const key of cache.keys()) {
        if (!seen.has(key)) cache.delete(key);
      }
    }

    return { overlayLines: lines, allOverlayTokens: lines.flatMap((l) => l.tokens) };
  }, [contentForOverlay, containerWidth, adaptiveTopology]);

  const lineSyllableCounts = useMemo(() => {
    if (propLineSyllableCounts) return propLineSyllableCounts;
    if (analyzedDocument?.lineSyllableCounts) return analyzedDocument.lineSyllableCounts;
    return overlayLines.map(() => 0);
  }, [propLineSyllableCounts, analyzedDocument, overlayLines]);

  const contentLineCount = useMemo(() => (content ? content.split('\n').length : 0), [content]);

  const syntaxLayer = useMemo(() => analyzedDocument?.syntaxSummary || null, [analyzedDocument]);

  const cursorSync = useMemo(() => {
    if (!adaptiveTopology) return null;
    const { baseCellHeight } = adaptiveTopology;
    const overlayStyles = {
      paddingLeft: `${adaptiveTopology.originX}px`,
      paddingTop: `${adaptiveTopology.originY}px`,
      lineHeight: `${baseCellHeight}px`,
    };
    const textareaStyles = {
      paddingLeft: `${adaptiveTopology.originX}px`,
      paddingTop: `${adaptiveTopology.originY}px`,
      lineHeight: `${baseCellHeight}px`,
    };
    return { overlayStyles, textareaStyles };
  }, [adaptiveTopology]);

  const lineHeightPx = adaptiveTopology?.baseCellHeight || DEFAULT_LINE_HEIGHT;

  const derivedAnalyzedWordsByCharStart = useMemo(() => {
    const map = new Map();
    if (analyzedWordsByCharStart instanceof Map) {
      for (const [charStart, analysis] of analyzedWordsByCharStart.entries()) {
        map.set(Number(charStart), analysis);
      }
    }
    return map;
  }, [analyzedWordsByCharStart]);

  const highlightedLinesSet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(highlightedLines)) {
      for (const lineIndex of highlightedLines) {
        set.add(Number(lineIndex));
      }
    }
    return set;
  }, [highlightedLines]);

  const getViewportNode = useCallback(() => {
    if (isReadOnlyTruesight) return wordBackgroundLayerRef.current;
    if (isReadOnlyPlain) return markdownRef.current;
    return textareaRef.current;
  }, [isReadOnlyPlain, isReadOnlyTruesight]);

  const syncScrollPosition = useCallback((top, left = 0, source = null) => {
    const nextTop = Number.isFinite(top) ? Math.max(0, top) : 0;
    const nextLeft = Number.isFinite(left) ? Math.max(0, left) : 0;

    scrollTopRef.current = nextTop;
    setScrollTop((prev) => (Math.abs(prev - nextTop) > 1 ? nextTop : prev));
    onScrollChange?.(nextTop);

    const peers = [textareaRef.current, wordBackgroundLayerRef.current, markdownRef.current];
    for (const node of peers) {
      if (!node || node === source) continue;
      node.scrollTop = nextTop;
      node.scrollLeft = nextLeft;
    }

    // Gutter uses transform-based sync to avoid scrollTop on overflow:hidden
    gutterRef.current?.syncScroll?.(nextTop);
  }, [onScrollChange]);

  const handleTextareaScroll = useCallback(() => {
    if (isReadOnlyPlain) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    syncScrollPosition(textarea.scrollTop, textarea.scrollLeft, textarea);
  }, [isReadOnlyPlain, syncScrollPosition]);

  const handleOverlayScroll = useCallback(() => {
    const layer = wordBackgroundLayerRef.current;
    if (!layer) return;
    syncScrollPosition(layer.scrollTop, layer.scrollLeft, layer);
  }, [syncScrollPosition]);

  const [localMisspellings, setLocalMisspellings] = useState(new Set());

  useEffect(() => {
    if (!checkSpelling || !isEditable) return;
    
    let isCancelled = false;
    const timerId = setTimeout(() => {
      const validate = async () => {
        const tokens = overlayLines.flatMap(line => line.tokens.filter(t => WORD_TOKEN_REGEX.test(t.token) && !t.isWhitespace));
        const results = await Promise.all(tokens.map(async (t) => {
          const isValid = await checkSpelling(t.token.trim());
          return { charStart: t.localStart, isValid };
        }));
        
        if (!isCancelled) {
          const invalidSet = new Set(results.filter(r => !r.isValid).map(r => r.charStart));
          setLocalMisspellings(invalidSet);
        }
      };
      validate();
    }, 450);
    
    return () => {
      isCancelled = true;
      clearTimeout(timerId);
    };
  }, [overlayLines, checkSpelling, isEditable]);

  const [hoveredMisspelling, setHoveredMisspelling] = useState(null);
  const [spellcheckSuggestions, setSpellcheckSuggestions] = useState([]);
  const spellcheckTooltipRef = useRef(null);
  const [tooltipPlacement, setTooltipPlacement] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (hoveredMisspelling) {
      setTooltipPlacement({ x: hoveredMisspelling.x, y: hoveredMisspelling.y + 4 });
    }
  }, [hoveredMisspelling]);

  useLayoutEffect(() => {
    if (!hoveredMisspelling || !spellcheckTooltipRef.current) return;
    const tooltipEl = spellcheckTooltipRef.current;
    const containerEl = editorContainerRef.current;
    if (!containerEl) return;

    const tooltipRect = tooltipEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const anchorX = hoveredMisspelling.x + containerRect.left;
    const anchorY = hoveredMisspelling.y + containerRect.top;
    const anchorRect = { left: anchorX, top: anchorY, width: 0, height: 0, right: anchorX, bottom: anchorY };

    const overlayRect = { width: tooltipRect.width || 240, height: tooltipRect.height || 100 };
    const viewportRect = { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height };

    const placement = resolveOverlayPlacement(
      anchorRect,
      overlayRect,
      viewportRect,
      { placement: 'bottom', flip: true, clamp: true }
    );

    setTooltipPlacement({
      x: placement.x - containerRect.left,
      y: placement.y - containerRect.top
    });
  }, [hoveredMisspelling, spellcheckSuggestions]);

  // Keep a stable ref of tokens so the biological loop doesn't get cancelled by React renders
  const allOverlayTokensRef = useRef([]);
  useEffect(() => {
    allOverlayTokensRef.current = allOverlayTokens;
  }, [allOverlayTokens]);

  // T-CELL & MACROPHAGE: Biological Immune Loop
  useEffect(() => {
    if (!isTruesight || !wordBackgroundLayerRef.current) return;
    
    let tCellScan;
    const immuneSweep = () => {
      const renderedSpans = wordBackgroundLayerRef.current.querySelectorAll('.truesight-word');
      const expectedWords = allOverlayTokensRef.current.filter(t => !t.isWhitespace && WORD_TOKEN_REGEX.test(t.token));
      if (renderedSpans.length > 0 && renderedSpans.length !== expectedWords.length) {
        console.error(`[T-CELL 🚨] DOM ALIGNMENT FAILURE! Expected ${expectedWords.length} words, found ${renderedSpans.length}. Executing Quarantine.`);
        setIsQuarantined(true);
        
        // Dispatch exosome to the Immune System Server
        fetch('/api/diagnostic/exosome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: 1,
            checksum: `tcell-dom-${Date.now()}`,
            epicenter_node: "ScrollEditor.jsx",
            resolution_status: "QUARANTINED",
            context: {
              error: `DOM ALIGNMENT FAILURE! Expected ${expectedWords.length} words, found ${renderedSpans.length}.`,
              type: "STRUCTURAL_FAULT",
              code: "PB-ERR-v1-TRUESIGHT-DOM-MISMATCH"
            }
          })
        }).catch(err => console.error("T-Cell dispatch failed:", err));
      } else {
        setIsQuarantined(false);
        
        // ---------------------------------------------------------
        // MACROPHAGE: Spectral Color Integrity Scan
        // ---------------------------------------------------------
        let phagocytosisExecuted = false;
        
        renderedSpans.forEach((span, i) => {
          const expectedWord = expectedWords[i];
          const renderedColor = span.style.getPropertyValue('--w') || span.style.color;
          
          // Detect malformed colors (e.g. string "undefined", "NaN", or null incorrectly cast)
          if (renderedColor === 'undefined' || renderedColor.includes('NaN')) {
            phagocytosisExecuted = true;
            console.error(`[MACROPHAGE 🦠] Spectral Leak at Word ${i} ("${expectedWord.token}"). Engulfing corrupted color: ${renderedColor}`);
            
            // Execute Phagocytosis: Override the corrupted inline styles with neutral gray
            span.style.setProperty('--w', 'hsl(0, 0%, 50%)', 'important');
            span.style.setProperty('color', 'hsl(0, 0%, 50%)', 'important');
            
            // Deep Diagnostic Report Generation
            const diagnosticReport = {
              version: 'v2',
              category: 'SPECTRAL_PIPELINE',
              severity: 'CRITICAL',
              errorCode: 'PB-ERR-v1-TRUESIGHT-CHROMA-BLEED',
              cellId: 'VERSE_IR_RENDERER',
              checkId: 'VISUAL_BYTECODE_FIDELITY',
              context: {
                word: expectedWord.token,
                renderedColor: renderedColor,
                spatialTopology: { layer: 'CHROMATIC_DOM', domIndex: i },
                rootCauseAnalysis: "Failed to resolve Biophysical Metrics during VerseIR Amplification. Viseme Mapping returned NaN or undefined."
              },
              timestamp: new Date().toISOString()
            };

            console.log(`\n=== 🔬 DEEP SPECTRAL DIAGNOSTIC REPORT ===`);
            console.log(JSON.stringify(diagnosticReport, null, 2));
            console.log(`==========================================\n`);

            // Dispatch exosome to the Immune System Server
            fetch('/api/diagnostic/exosome', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                schemaVersion: 2,
                checksum: `macrophage-chroma-${Date.now()}-${i}`,
                epicenter_node: "ScrollEditor.jsx",
                resolution_status: "PHAGOCYTIZED",
                diagnosticReport
              })
            }).catch(err => console.error("Macrophage dispatch failed:", err));
          }
        });
        
        if (phagocytosisExecuted) {
           console.log(`[MACROPHAGE 🦠] 🧼 Color misalignments neutralized. Rendering payload wiped to neutral gray.`);
        }
      }
      
      // Schedule the next tick in 500ms
      tCellScan = setTimeout(immuneSweep, 500);
    };
    
    // Start the biological loop
    tCellScan = setTimeout(immuneSweep, 500);
    
    return () => clearTimeout(tCellScan);
  }, [isTruesight]);

  useEffect(() => {
    if (!hoveredMisspelling || !getSpellingSuggestions) {
      setSpellcheckSuggestions([]);
      return;
    }
    
    let isCancelled = false;
    getSpellingSuggestions(
      hoveredMisspelling.word,
      hoveredMisspelling.prevWord || null,
      3,
    ).then(suggestions => {
      if (!isCancelled) setSpellcheckSuggestions(suggestions);
    });
    return () => { isCancelled = true; };
  }, [hoveredMisspelling, getSpellingSuggestions]);

  const handleMarkdownScroll = useCallback(() => {
    if (!isReadOnlyPlain) return;
    const markdown = markdownRef.current;
    if (!markdown) return;
    syncScrollPosition(markdown.scrollTop, markdown.scrollLeft, markdown);
  }, [isReadOnlyPlain, syncScrollPosition]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) return;
    setIsSaving(true);
    try {
      await onSave?.(title, content);
    } finally {
      setIsSaving(false);
    }
  }, [content, title, onSave]);

  useLayoutEffect(() => {
    if (pinnedLines && pinnedLines.length > 0) {
      const sorted = [...pinnedLines].sort((a, b) => a - b);
      const initialYMap = new Map();
      for (const li of sorted) {
        initialYMap.set(li, li * lineHeightPx - scrollTopRef.current);
      }
      setGhostData({ sortedLines: sorted, initialYMap });
      setIsGhostPinned(true);
    } else {
      setIsGhostPinned(false);
    }
  }, [pinnedLines, lineHeightPx]);

  const jumpToLine = useCallback((lineNum) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lines = content.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
      offset += lines[i].length + 1;
    }
    if (isEditable) {
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
    }
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight);
    const viewport = getViewportNode();
    const nextTop = Math.max(0, (lineNum - 1) * lineHeight);
    if (viewport) {
      viewport.scrollTop = nextTop;
      syncScrollPosition(viewport.scrollTop, viewport.scrollLeft, viewport);
      return;
    }
    textarea.scrollTop = nextTop;
    syncScrollPosition(textarea.scrollTop, textarea.scrollLeft, textarea);
  }, [content, getViewportNode, isEditable, syncScrollPosition]);

  const scrollTo = useCallback((y) => {
    const viewport = getViewportNode();
    if (!viewport) return;
    viewport.scrollTop = y;
    syncScrollPosition(viewport.scrollTop, viewport.scrollLeft, viewport);
  }, [getViewportNode, syncScrollPosition]);

  const scrollToTopSmooth = useCallback(() => {
    const viewport = getViewportNode();
    if (!viewport) return;
    if ('scrollBehavior' in document.documentElement.style) {
      viewport.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const start = viewport.scrollTop;
    if (start === 0) return;
    const duration = 320;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      viewport.scrollTop = start * (1 - ease);
      syncScrollPosition(viewport.scrollTop, viewport.scrollLeft, viewport);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [getViewportNode, syncScrollPosition]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    jumpToLine,
    scrollTo,
    scrollToTopSmooth,
    replaceContent(newContent) {
      setContent(newContent);
      setContentForOverlay(newContent);
      onContentChange?.(newContent);
    },
    get clientHeight() { return getViewportNode()?.clientHeight || 0; },
    get scrollHeight() { return getViewportNode()?.scrollHeight || 0; },
  }), [getViewportNode, handleSave, jumpToLine, scrollTo, scrollToTopSmooth, onContentChange]);

  const handleAcceptSuggestion = useCallback((token) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = content.substring(0, pos);
    const textAfter = content.substring(pos);
    const lastWordMatch = textBefore.match(/([a-zA-Z']+)$/);
    let newContent, newCursorPos;
    if (lastWordMatch) {
      const before = content.substring(0, lastWordMatch.index);
      newContent = before + token + ' ' + textAfter;
      newCursorPos = lastWordMatch.index + token.length + 1;
    } else {
      newContent = textBefore + token + ' ' + textAfter;
      newCursorPos = pos + token.length + 1;
    }
    setContent(newContent);
    setContentForOverlay(newContent);
    onContentChange?.(newContent);
    setIntellisenseSuggestions([]);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }, [content, onContentChange]);

  const handleKeyDown = useCallback(
    (e) => {
      if (intellisenseSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setIntellisenseIndex(i => (i + 1) % intellisenseSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setIntellisenseIndex(i => (i - 1 + intellisenseSuggestions.length) % intellisenseSuggestions.length);
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          handleAcceptSuggestion(intellisenseSuggestions[intellisenseIndex]?.token);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setIntellisenseSuggestions([]);
          return;
        }
      }
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape" && onCancel) {
        e.preventDefault();
        onCancel();
      }
    }, [handleSave, onCancel, intellisenseSuggestions, intellisenseIndex, handleAcceptSuggestion]);

  const emitCursorChange = useCallback((textarea) => {
    if (activeIdeMode === "NEUTRAL") return;
    const pos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, pos);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    onCursorChange?.({ line, col, offset: pos });
  }, [onCursorChange, activeIdeMode]);

  // Pillar 5: explicit cache-invalidation trigger - flush cached glyph metrics
  // when a physical layout shift (adaptive topology / Truesight scale) occurs.
  useEffect(() => {
    invalidateCaretMeasurementCache(caretMeasurementRef.current);
  }, [adaptiveTopology, isTruesight]);

  // Pillar 5: Explicit font readiness invalidation.
  // Re-measures glyphs and updates typography once web fonts (e.g. Crimson Pro) are fully loaded.
  useEffect(() => {
    if (activeIdeMode !== "TRUESIGHT") return;
    if (typeof document === "undefined" || !document.fonts?.ready) return;

    let cancelled = false;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      invalidateCaretMeasurementCache(caretMeasurementRef.current);
      updateTypography(true);
    });

    return () => {
      cancelled = true;
    };
  }, [activeIdeMode, updateTypography]);

  const handleCursorChange = useCallback((event) => {
    emitCursorChange(event.target);
  }, [emitCursorChange]);

  const handleSelectionChange = useCallback((event) => {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    onSelectionTextChange?.(start === end ? "" : textarea.value.slice(start, end));
    emitCursorChange(textarea);
  }, [emitCursorChange, onSelectionTextChange]);

  const handleTextareaClick = useCallback((event) => {
    const textarea = event.currentTarget;
    emitCursorChange(textarea);
    
    // Sync scroll if overlay is active
    handleTextareaScroll(event);

    if (activeIdeMode === "EDIT" && !isTruesight) return;
    if (!onWordActivate || textarea.selectionStart !== textarea.selectionEnd) return;
    
    const cursorOffset = textarea.selectionStart;
    const tokenEntry = resolveWordTokenAtOffset(cursorOffset, syntaxLayer, content);
    if (!tokenEntry || !tokenEntry.token) return;

    const clean = tokenEntry.token.trim().toUpperCase();
    const identityKey = `${tokenEntry.lineNumber}:${tokenEntry.wordIndex}:${tokenEntry.charStart}`;
    
    const analysis = analyzedWordsByIdentity.get(identityKey) || 
                     derivedAnalyzedWordsByCharStart.get(tokenEntry.charStart) || 
                     (allowLegacyWordFallback ? analyzedWords.get(clean) : null);

    const truesight = wordTruesight(tokenEntry.token);
    const wordPayload = {
      ...buildWordPayloadFromToken(tokenEntry),
      analysis,
      color: truesight?.color || null,
      school: truesight?.school || null,
    };
    
    if (!wordPayload.word) return;

    const caretCoords = getCursorCoordsFromTextarea(caretMeasurementRef.current, textarea, mirrored, adaptiveTopology);
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || DEFAULT_LINE_HEIGHT;

    emitWordActivation("textarea_tap", {
      ...wordPayload,
      lineIndex: tokenEntry.lineNumber,
    }, {
      left: caretCoords.x,
      right: caretCoords.x + 1,
      top: caretCoords.y - lineHeight,
      bottom: caretCoords.y,
      width: 1,
      height: lineHeight,
    }, onWordActivate);
  }, [emitCursorChange, handleTextareaScroll, onWordActivate, content, syntaxLayer, analyzedWordsByIdentity, derivedAnalyzedWordsByCharStart, allowLegacyWordFallback, analyzedWords, mirrored, adaptiveTopology, activeIdeMode, isTruesight]);

  const updateCompletions = useCallback(async (value, pos) => {
    if (!isPredictive || !getCompletions || !predictorReady) {
      setIntellisenseSuggestions([]);
      return;
    }

    const requestId = ++completionsRequestRef.current;

    const textBefore = value.substring(0, pos);
    const lastWordMatch = textBefore.match(/([a-zA-Z']+)$/);
    const prefix = lastWordMatch ? lastWordMatch[1] : "";

    // Only trigger if we have some text or are at a word boundary
    if (prefix.length === 0 && !textBefore.endsWith(' ')) {
      setIntellisenseSuggestions([]);
      return;
    }

    const lines = textBefore.split("\n");
    const lineIndex = lines.length - 1;
    const currentLineText = lines[lineIndex] || "";

    // Build context for PLS.
    // tokenWeights: per-token document-importance weights from the analysis
    // pipeline second pass (TF-IDF × syllable salience × positional decay).
    // The ranker blends these 30/70 with provider scores so rare content words
    // rank above stop words and high-frequency filler tokens.
    const context = {
      text: value,
      cursorOffset: pos,
      lineIndex,
      currentLineText,
      prefix,
      plsPhoneticFeatures: plsPhoneticFeatures || null,
      tokenWeights: tokenWeights || null,
    };

    // Use syntax layer for HHM context
    const tokenAtCursor = resolveWordTokenAtOffset(pos, syntaxLayer, value);
    const options = {
      syntaxContext: tokenAtCursor || null,
      maxResults: 8,
    };

    const completions = await getCompletions(context, options);
    if (requestId !== completionsRequestRef.current) return;

    let suggestionsList = [];
    if (prefix && checkSpelling && getSpellingSuggestions) {
      const isValidSpelling = await checkSpelling(prefix);
      if (!isValidSpelling) {
        const prevWord = extractPreviousWord(textBefore, prefix);
        const spellingCorrections = await getSpellingSuggestions(prefix, prevWord, 3);
        if (spellingCorrections && spellingCorrections.length > 0) {
          suggestionsList = spellingCorrections.map(word => ({
            token: word,
            type: 'correction',
            isRhyme: false,
            badges: []
          }));
        }
      }
    }

    if (completions && completions.length > 0) {
      const seenTokens = new Set(suggestionsList.map(s => s.token));
      const filteredCompletions = completions.filter(c => !seenTokens.has(c.token));
      suggestionsList = [...suggestionsList, ...filteredCompletions];
    }

    setIntellisenseSuggestions(suggestionsList);
    setIntellisenseIndex(0);

    // Pillar 5: batch the caret-coordinate read + state update onto a frame so
    // measurement and the render update land together on requestAnimationFrame.
    requestAnimationFrame(() => {
      const tx = textareaRef.current;
      if (!tx) return;
      setCursorCoords(getCaretViewportCoords(caretMeasurementRef.current, tx, prefix, adaptiveTopology));
    });
  }, [isPredictive, getCompletions, predictorReady, syntaxLayer, checkSpelling, getSpellingSuggestions, adaptiveTopology, plsPhoneticFeatures, tokenWeights]);

  const handleContentChange = useCallback((event) => {
    const nextValue = event.target.value;
    const pos = event.target.selectionStart;

    if (nextValue.length > MAX_CONTENT_LENGTH) {
      const truncated = nextValue.slice(0, MAX_CONTENT_LENGTH);
      setContent(truncated);
      if (!isTruesight) setContentForOverlay(truncated);
      if (onContentChange) {
        onContentChange(truncated);
      }
      return;
    }

    setContent(nextValue);
    emitCursorChange(event.target);
    
    // Keep the annotation lattice in lockstep with the text. The per-line layout
    // cache makes the rebuild cheap (only the edited line re-measures), so instead
    // of freezing the overlay for 400ms (which left the word boxes desynced from
    // the text mid-type) we update it every keystroke. Staging it in a transition
    // keeps the keystroke itself non-blocking - the caret stays on the synchronous
    // `content` update above; the overlay catches up within a frame.
    if (isTruesight) {
      startTransition(() => setContentForOverlay(nextValue));
    } else {
      setContentForOverlay(nextValue);
    }
    
    if (onContentChange) {
      onContentChange(nextValue);
    }

    // COMPLETIONS DEBOUNCE: Defer IntelliSense compute (regex walk + syntax-layer
    // lookup + async getCompletions + layout-forcing cursor measurement) off the
    // keystroke critical path. 120ms is below user-perceptible threshold and
    // strictly less than the 400ms typing-freeze, so the two timers do not
    // contend. See SISP-FIX-v1-INPUT-LAG-001.
    if (completionsTimeoutRef.current) clearTimeout(completionsTimeoutRef.current);
    completionsTimeoutRef.current = setTimeout(() => {
      updateCompletions(nextValue, pos);
    }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitCursorChange, onContentChange, updateCompletions, isTruesight, syncOverlayToContent]);

  const editorMotionProps = reducedMotion
    ? {
        initial: false,
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.2 },
      };

  return (
    <motion.div
      ref={editorContainerRef}
      className="scroll-editor"
      data-testid="scroll-editor-root"
      style={{ position: 'relative' }}
      {...editorMotionProps}
      role="form"
      aria-label="Scroll editor"
      onFocus={(e) => {
        if (!editorContainerRef.current?.contains(e.relatedTarget)) {
          onFocus?.(e);
        }
      }}
      onBlur={(e) => {
        if (!editorContainerRef.current?.contains(e.relatedTarget)) {
          onBlur?.(e);
        }
      }}
    >
      <div className="editor-header">
        {isEditable ? (
          <div className="editor-title-container">
            <input
              id="scroll-title"
              type="text"
              className="editor-title-input"
              placeholder="Scroll Title..."
              aria-label="Scroll Title"
              value={title}
              onChange={(e) => {
                const nextTitle = e.target.value;
                setTitle(nextTitle);
                if (onTitleChange) {
                  onTitleChange(nextTitle);
                }
              }}
              disabled={disabled || isSaving}
              maxLength={100}
              aria-required="true"
            />
            <button
              type="button"
              className="btn btn-primary save-scroll-btn"
              onClick={handleSave}
              disabled={disabled || isSaving || !content.trim()}
            >
              {isSaving ? "Saving..." : "Save Scroll"}
            </button>
            <button
              type="button"
              className="scroll-top-btn"
              onClick={scrollToTopSmooth}
              aria-label="Scroll to top"
              title="Scroll to top"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 9.5L7 4.5L12 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <h2 className="editor-title-display">{title || "Untitled Scroll"}</h2>
        )}

      </div>

      <div className={`editor-body ${!isEditable ? "read-only" : ""}`}>
        <Gutter
          ref={gutterRef}
          overlayLines={overlayLines}
          lineCounts={lineSyllableCounts}
          contentLineCount={contentLineCount}
          topOffset={adaptiveTopology?.originY || 0}
          viewportHeight={containerHeight}
          lineHeightPx={lineHeightPx}
        />
        <div ref={wrapperRef} className="editor-textarea-wrapper">
          {!isEditable && !isTruesight && (
            <div
              ref={markdownRef}
              className="markdown-rendered"
              style={cursorSync?.textareaStyles}
              aria-label={`Scroll content: ${title || "Untitled"}`}
              onScroll={handleMarkdownScroll}
            >
              {content}
            </div>
          )}
          {isTruesight && (
            <div
              ref={wordBackgroundLayerRef}
              className={`word-background-layer${isReadOnlyTruesight ? ' word-background-layer--interactive' : ''}`}
              style={{
                ...cursorSync?.overlayStyles,
                // Edit + Truesight: lift the overlay above the textarea but keep the
                // LAYER click-through - only the word shells (pointer-events:auto)
                // catch clicks; whitespace/empty space falls through to the textarea
                // so caret placement, scrolling and typing all still work.
                ...(isTruesight && isEditable ? { zIndex: 'var(--z-above)', pointerEvents: 'none' } : {}),
              }}
              aria-hidden={!isReadOnlyTruesight && !isEditable}
              onScroll={handleOverlayScroll}
            >
              <div>
                {overlayLines.map(({ lineIndex: li, rawLineIndex, tokens, lineType }) => {
                  const isGroupActive = highlightedLinesSet.size > 0;
                  const isHighlighted = highlightedLinesSet.has(rawLineIndex);
                  const isLineDimmed = (isGroupActive && !isHighlighted) || isGhostPinned;

                  return (
                    <div
                      key={li}
                      className={`truesight-line truesight-line--${lineType}${isLineDimmed ? ' truesight-line--dimmed' : ''}${isHighlighted ? ' truesight-line--highlighted' : ''}`}
                      style={{ position: 'relative', height: `${lineHeightPx}px` }}
                    >
                      {tokens.map(({ token, localStart, localEnd, globalCharStart, lineIndex, wordIndex, x: tokenX, width: tokenWidth, isWhitespace }, tokIdx, tokArr) => {
                        const isWord = WORD_TOKEN_REGEX.test(token) && !isWhitespace;
                        const clean = isWord ? token.trim().toUpperCase() : "";
                        
                        // V12 FIX: Use Global Character Start for stable lookup (Determinism is the Shield)
                        const charStart = globalCharStart;
                        const charEnd = globalCharStart + token.length;
                        const identityKey = `${lineIndex}:${Number.isInteger(wordIndex) ? wordIndex : -1}:${charStart}`;
                        
                        const analysis = isWord
                          ? (
                            derivedAnalyzedWordsByCharStart.get(charStart) ||
                            analyzedWordsByIdentity.get(identityKey) ||
                            (allowLegacyWordFallback ? analyzedWords.get(clean) : null)
                          )
                          : null;

                        const pixelX = tokenX || 0;
                        const pixelWidth = tokenWidth || null;
                        const annotationWidth = Math.max(1, pixelWidth || (adaptiveTopology?.baseCellWidth || 1) * token.length);
                        // Tile the clickable box to the next glyph token's left edge so
                        // the entire word - including its trailing edge - is hittable.
                        // Each word div then abuts the next with no dead zone, mirroring
                        // the procedural overlay formula (token.x is cumulative width).
                        const nextGlyph = tokArr.slice(tokIdx + 1).find((t) => !t.isWhitespace);
                        const hitWidth = (nextGlyph && Number.isFinite(nextGlyph.x))
                          ? Math.max(annotationWidth, nextGlyph.x - pixelX)
                          : annotationWidth;

                        const commonStyle = {
                          position: 'absolute',
                          left: `${pixelX}px`,
                          width: pixelWidth ? `${pixelWidth}px` : 'auto',
                          whiteSpace: 'pre',
                        };

                        if (!isWord) {
                          const isPunct = !isWhitespace;
                          const punctaClass = (isLatticeGrid && isPunct) ? 'truesight-puncta--lattice' : '';
                          return (
                            <span
                              key={localStart}
                              className={punctaClass || undefined}
                              style={{
                                ...commonStyle,
                                pointerEvents: 'none',
                                opacity: isWhitespace ? 0 : 0.4,
                              }}
                              data-char-start={charStart}
                            >
                              {token}
                            </span>
                          );
                        }

                        const wordVowelFamily = analysis ? normalizeVowelFamily(analysis?.vowelFamily) : null;
                        const rhymeVowelFamily = analysis
                          ? normalizeVowelFamily(analysis?.terminalVowelFamily || analysis?.vowelFamily)
                          : null;
                        const bytecode = analysis?.visualBytecode || analysis?.trueVisionBytecode || null;
                        const truesight = wordTruesight(token);
                        const shouldColor = Boolean(truesight);

                        // V12 PERFORMANCE: Use precomputed values from Synthesis Kernel
                        const decoded = (bytecode && shouldColor && !isQuarantined) ? (analysis.precomputed?.decoded || decodeBytecode(bytecode, { reducedMotion, theme: activeTheme })) : null;

                        const color = (!isQuarantined && truesight?.color) ? truesight.color : null;

                        const animationSignal = (analysis?.animationSpec || analysis?.dominantSchool) && !isQuarantined ? analysis : null;

                        const isLineHighlighted = highlightedLinesSet.has(lineIndex);

                        const wordStyle = {
                          ...commonStyle,
                          color: color || undefined,
                          '--w': color || undefined,
                          ...(decoded?.style || {}),
                          pointerEvents: 'auto',
                          cursor: 'help',
                          ...(isLineHighlighted ? { backgroundColor: 'rgba(101, 31, 255, 0.13)', borderRadius: '0.5rem' } : {}),
                        };

                        const isMisspelled = localMisspellings.has(charStart);

                        return (
                          <span
                            key={`word-${charStart}`}
                            className="truesight-word-shell truesight-word"
                            role="button"
                            tabIndex={0}
                            aria-label={token}
                            data-char-start={charStart}
                            style={{
                              ...wordStyle,
                              position: 'absolute',
                              left: `${pixelX}px`,
                              width: `${hitWidth}px`,
                              height: `${lineHeightPx}px`,
                              cursor: 'help',
                              display: 'inline-block',
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onClick={(event) => {
                              onWordActivate?.({
                                word: token,
                                normalizedWord: clean,
                                trigger: 'truesight_tap',
                                analysis: analysis || null,
                                charStart,
                                charEnd,
                                lineIndex,
                                wordIndex,
                                vowelFamily: wordVowelFamily,
                                terminalVowelFamily: rhymeVowelFamily,
                                school: truesight?.school || null,
                                color,
                                anchorRect: event.currentTarget.getBoundingClientRect(),
                              });
                              // While editing, a word click opens the tooltip AND drops
                              // the caret into the word so you can keep typing there  - 
                              // the shell intercepted the click, so place the caret by hand.
                              if (isEditable && textareaRef.current) {
                                const ta = textareaRef.current;
                                ta.focus();
                                try { ta.setSelectionRange(charStart, charStart); } catch (_) { /* noop */ }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onWordActivate?.({
                                  word: token,
                                  normalizedWord: clean,
                                  trigger: 'truesight_tap',
                                  analysis: analysis || null,
                                  charStart,
                                  charEnd,
                                  lineIndex,
                                  wordIndex,
                                  vowelFamily: wordVowelFamily,
                                  terminalVowelFamily: rhymeVowelFamily,
                                  school: truesight?.school || null,
                                  color,
                                  anchorRect: e.currentTarget.getBoundingClientRect(),
                                });
                              }
                            }}
                          >
                            <span
                              className={[
                                'truesight-annotation-box',
                                shouldColor ? 'truesight-annotation-box--resonant' : 'truesight-annotation-box--plain',
                                isLineHighlighted ? 'truesight-annotation-box--highlighted' : '',
                                isMisspelled ? 'truesight-annotation-box--misspelled' : '',
                                isLatticeGrid ? 'truesight-annotation-box--lattice' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                '--w': color || undefined,
                                pointerEvents: 'none',
                                cursor: 'default',
                              }}
                              data-char-start={charStart}
                              aria-hidden="true"
                            />
                            <AnimatedSurface
                              as="span"
                              signal={animationSignal}
                              aria-hidden="true"
                              className={[
                               'truesight-word-inner',
                               'pixel-brain-chip',
                               shouldColor ? 'grimoire-word' : 'grimoire-word--grey',
                                decoded?.className || '',
                                isLineHighlighted ? 'grimoire-word--rhyme-highlight' : '',
                                isMisspelled ? 'grimoire-word--misspelled' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: color || undefined,
                                '--w': color || undefined,
                                ...sanitizeTruesightStyle(decoded?.style),
                                pointerEvents: 'none',
                                '--chip-delay': `${wordIndex * 30}ms`
                              }}
                            >
                              {token}
                            </AnimatedSurface>
                            {isMisspelled && (
                              <motion.div
                                className="spellcheck-orb"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                whileHover={{ scale: 1.2, boxShadow: '0 0 12px var(--ritual-error, #ff4d4d)' }}
                                style={{
                                  position: 'absolute',
                                  left: `${pixelX + (pixelWidth || 0)}px`,
                                  top: '-4px',
                                  width: '10px',
                                  height: '10px',
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--ritual-error, #ff4d4d)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '8px',
                                  fontWeight: 'bold',
                                  cursor: 'help',
                                  zIndex: 10,
                                  boxShadow: '0 0 8px rgba(255, 77, 77, 0.6)',
                                  // Purely visual: the word shell owns all interaction,
                                  // so the orb never intercepts hover/click on the word.
                                  pointerEvents: 'none',
                                }}
                                onMouseEnter={(e) => {
                                  const r = e.currentTarget.getBoundingClientRect();
                                  const container = editorContainerRef.current;
                                  const cRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
                                  const prevToken = [...tokArr.slice(0, tokIdx)]
                                    .reverse()
                                    .find((entry) => WORD_TOKEN_REGEX.test(entry.token) && !entry.isWhitespace);
                                  setHoveredMisspelling({
                                    word: token.trim(),
                                    prevWord: prevToken ? prevToken.token.trim() : null,
                                    charStart,
                                    x: r.left - cRect.left,
                                    y: r.bottom - cRect.top
                                  });
                                }}
                                onMouseLeave={() => setHoveredMisspelling(null)}
                              >
                                !
                              </motion.div>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <textarea
            id="scroll-content"
            ref={textareaRef}
            className={`editor-textarea ${isTruesight ? "truesight-transparent" : "editor-textarea--foreground"} ${isReadOnlyTruesight ? "editor-textarea--underlay" : ""} ${!isEditable && !isTruesight ? "editor-textarea--read-only" : ""} ${isReadOnlyTruesight ? "editor-textarea--read-only-truesight" : ""}`}
            style={cursorSync?.textareaStyles}
            aria-hidden={isTruesight && !isEditable && !!onWordActivate}
            tabIndex={isTruesight && !isEditable && !!onWordActivate ? -1 : undefined}
            placeholder={isEditable ? "Inscribe thy verses upon this sacred parchment..." : ""}
            value={content}
            onChange={handleContentChange}
            onKeyDown={isEditable ? handleKeyDown : undefined}
            onKeyUp={handleCursorChange}
            onSelect={handleSelectionChange}
            onClick={handleTextareaClick}
            onBlur={() => {
              setIntellisenseSuggestions([]);
            }}
            onScroll={handleTextareaScroll}
            disabled={disabled || isSaving}
            readOnly={!isEditable}
            spellCheck="false"
            maxLength={MAX_CONTENT_LENGTH}
            aria-required={isEditable}
            aria-label={`Scroll content: ${title || "Untitled"}`}          />

          {isTruesight && ghostData && (
            <div className="truesight-ghost-layer" aria-hidden="true">
              <AnimatePresence onExitComplete={() => setGhostData(null)}>
                {isGhostPinned && ghostData.sortedLines.map((li, i) => {
                  const lineData = overlayLines.find(l => l.rawLineIndex === li);
                  if (!lineData) return null;
                  const initialY = ghostData.initialYMap.get(li) ?? 0;
                  const targetY = 8 + i * (lineHeightPx + 4);
                  return (
                    <motion.div
                      key={`ghost-${li}`}
                      className="truesight-line truesight-line--highlighted truesight-ghost-line"
                      initial={{ y: initialY, opacity: 0.6, scale: 0.98 }}
                      animate={{ y: targetY, opacity: 1, scale: 1 }}
                      exit={{ y: initialY, opacity: 0, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.8, restDelta: 0.001 }}
                      style={{ willChange: "transform, opacity", contain: "layout paint style", position: 'absolute', height: `${lineHeightPx}px`, left: '1%', right: '1%' }}
                    >
                      {lineData.tokens.map(({ token, localStart, localEnd, globalCharStart, wordIndex, x: tokenX, width: tokenWidth, isWhitespace }, tokIdx, tokArr) => {
                        const isWord = WORD_TOKEN_REGEX.test(token) && !isWhitespace;
                        const commonStyle = {
                          position: 'absolute',
                          left: `${tokenX}px`,
                          width: `${tokenWidth}px`,
                          whiteSpace: 'pre',
                        };

                        if (!isWord) {
                          const isPunct = !isWhitespace;
                          const punctaClass = (isLatticeGrid && isPunct) ? 'truesight-puncta--lattice' : '';
                          return (
                            <span 
                              key={`vghost-${globalCharStart}`} 
                              className={punctaClass || undefined}
                              style={{ ...commonStyle, color: 'transparent' }}
                              data-char-start={globalCharStart}
                            >
                              {token}
                            </span>
                          );
                        }
                        
                        const clean = token.trim().toUpperCase();
                        const charStart = globalCharStart;
                        const charEnd = globalCharStart + token.length;
                        const identityKey = `${li}:${Number.isInteger(wordIndex) ? wordIndex : -1}:${charStart}`;
                        const analysis = derivedAnalyzedWordsByCharStart.get(charStart)
                          || analyzedWordsByIdentity.get(identityKey)
                          || (allowLegacyWordFallback ? analyzedWords.get(clean) : null);
                        const wordVowelFamily = analysis ? normalizeVowelFamily(analysis?.vowelFamily) : null;
                        const rhymeVowelFamily = analysis
                          ? normalizeVowelFamily(analysis?.terminalVowelFamily || analysis?.vowelFamily)
                          : null;
                        const bytecode = analysis?.visualBytecode || analysis?.trueVisionBytecode || null;
                        const truesight = wordTruesight(token);
                        const shouldColor = Boolean(truesight);

                        // V12 PERFORMANCE: Use precomputed values
                        const decoded = (bytecode && shouldColor) ? (analysis.precomputed?.decoded || decodeBytecode(bytecode, { reducedMotion, theme: activeTheme })) : null;

                        const color = truesight?.color || null;
                        const animationSignal = (analysis?.animationSpec || analysis?.dominantSchool) ? analysis : null;
                        const annotationWidth = Math.max(1, tokenWidth || (adaptiveTopology?.baseCellWidth || 1) * token.length);
                        // Tile each word's clickable box to the next glyph token (see
                        // the primary overlay path) so the whole word is hittable.
                        const nextGlyph = tokArr.slice(tokIdx + 1).find((t) => !t.isWhitespace);
                        const hitWidth = (nextGlyph && Number.isFinite(nextGlyph.x))
                          ? Math.max(annotationWidth, nextGlyph.x - (tokenX || 0))
                          : annotationWidth;

                        const isMultiSyllable = (shouldColor || wordVowelFamily) && (decoded?.syllableDepth >= 2);
                        const isRichMultiSyllable = (shouldColor || wordVowelFamily) && (decoded?.syllableDepth >= 3);

                        return (
                          <span
                            key={`ghost-word-${charStart}`}
                            className="truesight-word-shell truesight-word"
                            role="button"
                            tabIndex={0}
                            aria-label={token}
                            data-char-start={charStart}
                            style={{
                              position: 'absolute',
                              left: `${tokenX}px`,
                              width: `${hitWidth}px`,
                              height: `${lineHeightPx}px`,
                              cursor: 'help',
                              display: 'inline-block',
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onClick={(event) => {
                              onWordActivate?.({
                                word: token,
                                normalizedWord: clean,
                                trigger: 'truesight_tap',
                                analysis: analysis || null,
                                charStart,
                                charEnd,
                                lineIndex: li,
                                wordIndex,
                                vowelFamily: wordVowelFamily,
                                terminalVowelFamily: rhymeVowelFamily,
                                school: truesight?.school || null,
                                color,
                                anchorRect: event.currentTarget.getBoundingClientRect(),
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onWordActivate?.({
                                  word: token,
                                  normalizedWord: clean,
                                  trigger: 'truesight_tap',
                                  analysis: analysis || null,
                                  charStart,
                                  charEnd,
                                  lineIndex: li,
                                  wordIndex,
                                  vowelFamily: wordVowelFamily,
                                  terminalVowelFamily: rhymeVowelFamily,
                                  school: truesight?.school || null,
                                  color,
                                  anchorRect: e.currentTarget.getBoundingClientRect(),
                                });
                              }
                            }}
                          >
                            <span
                              className={[
                                'truesight-annotation-box',
                                (shouldColor || wordVowelFamily) ? 'truesight-annotation-box--resonant' : 'truesight-annotation-box--plain',
                                isLatticeGrid ? 'truesight-annotation-box--lattice' : '',
                              ].filter(Boolean).join(' ')}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                '--w': color || undefined,
                                pointerEvents: 'none',
                                cursor: 'default',
                              }}
                              data-char-start={charStart}
                              aria-hidden="true"
                            />
                            <AnimatedSurface
                              as="span"
                              signal={animationSignal}
                              aria-hidden="true"
                              className={[
                                "truesight-word-inner",
                                "pixel-brain-chip",
                                (shouldColor || wordVowelFamily) ? "grimoire-word" : "grimoire-word--grey",
                                decoded?.className || "",
                                isMultiSyllable ? "word--multi-rhyme" : "",
                                isRichMultiSyllable ? "word--multi-rhyme--rich" : "",
                              ].filter(Boolean).join(" ")}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: color || undefined,
                                '--w': color || undefined,
                                ...sanitizeTruesightStyle(decoded?.style),
                                pointerEvents: 'none',
                                '--chip-delay': `${(analysis?.globalTokenIndex || 0) * 30}ms`
                              }}
                            >
                              {token}
                            </AnimatedSurface>
                          </span>
                        );
                      })}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {hoveredMisspelling && spellcheckSuggestions.length > 0 && (
          <motion.div
            ref={spellcheckTooltipRef}
            className="spellcheck-tooltip"
            data-testid="spellcheck-orb"
            {...(reducedMotion
              ? {
                  initial: false,
                  animate: { opacity: 1 },
                  exit: { opacity: 0 },
                  transition: { duration: 0 },
                }
              : {
                  initial: { opacity: 0, y: 5 },
                  animate: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: 5 },
                  transition: { duration: 0.16, ease: 'easeOut' },
                })}
            style={{
              position: 'absolute',
              left: tooltipPlacement.x,
              top: tooltipPlacement.y,
              backgroundColor: 'var(--ritual-panel, #1a1a2e)',
              border: '1px solid var(--ritual-error, #ff4d4d)',
              padding: '8px',
              borderRadius: '4px',
              zIndex: 100,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              fontSize: '12px',
            }}
          >
            <div style={{ color: 'var(--ritual-error, #ff4d4d)', marginBottom: '4px', fontWeight: 'bold' }}>
              Did you mean?
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {spellcheckSuggestions.map(s => (
                <button
                  key={s}
                  className="btn-tiny"
                  onClick={() => {
                    const original = hoveredMisspelling.word;
                    const replacement = s;
                    const charStart = hoveredMisspelling.charStart;
                    const newContent = content.slice(0, charStart) + replacement + content.slice(charStart + original.length);
                    onContentChange?.(newContent);
                    setHoveredMisspelling(null);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {intellisenseSuggestions.length > 0 && (
          <IntelliSense
            suggestions={intellisenseSuggestions}
            selectedIndex={intellisenseIndex}
            position={cursorCoords}
            onAccept={handleAcceptSuggestion}
            onHover={setIntellisenseIndex}
            ghostLine={intellisenseSuggestions[intellisenseIndex]?.ghostLine || null}
            badges={intellisenseSuggestions[intellisenseIndex]?.badges || []}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ScrollEditor.displayName = "ScrollEditor";

export default ScrollEditor;
