import {
  FolderIcon,
  SearchIcon,
  ToolsIcon,
  SettingsIcon,
} from "../../components/Icons.jsx";
import { useUserSettings, LOCAL_STORAGE_KEY as SETTINGS_STORAGE_KEY } from "../../hooks/useUserSettings.js";
import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { $getSelection } from "lexical";

import { useTheme } from "../../hooks/useTheme.jsx";
import { useScrolls } from "../../hooks/useScrolls.jsx";
import { useProgression } from "../../hooks/useProgression.jsx";
import { useVerseSynthesis } from "../../hooks/useVerseSynthesis.js";
import { usePredictor } from "../../hooks/usePredictor.jsx";
import { getRitualPalette } from "../../data/schoolPalettes.js";
import { SCHOOLS, VOWEL_FAMILY_TO_SCHOOL, getSchoolsByUnlock } from "../../data/schools.js";
import { normalizeVowelFamily } from "../../lib/phonology/vowelFamily.js";
import { parseBooleanEnvFlag } from "../../hooks/useCODExPipeline.jsx";
import { patternColor } from "../../lib/patternColor.js";
import { resolveResonanceConnections } from "../../lib/truesight/resolveResonanceConnections.js";
import { buildResonanceGate } from "../../lib/truesight/buildResonanceGate.js";
import { getCachedWord, setCachedWord, pruneOldCaches } from "../../lib/platform/wordCache.js";
import { getAuroraLevel, cycleAuroraLevel, useAuroraLevel, AURORA_FACTORS } from "../../lib/atmosphere/aurora.ts";
import { useAutoSave } from "../../hooks/useAutoSave.js";
import { useAdaptivePalette } from "../../hooks/useAdaptivePalette.js";
import { useAnimationSubmitter } from "../../ui/animation/hooks/useAnimationSubmitter.ts";

import AnalysisPanel from "./AnalysisPanel.jsx";
import AnalyzePanel from "./AnalyzePanel.jsx";
import InfoBeamPanel from "../../components/InfoBeamPanel.jsx";
import RhymeDiagramPanel from "../../components/RhymeDiagramPanel.jsx";
import SongStatsPanel from "../../components/SongStatsPanel.jsx";
import RitualPredictionTooltip from "../../components/RitualPredictionTooltip.jsx";
import { useSongStats } from "../../hooks/useSongStats.js";
import { shouldShowMetricsPanel } from "./metricsPanelVisibility.js";

import ScrollEditor from "../../lib/lexical/LexicalScrollEditor.jsx";
import ScrollList from "./ScrollList.jsx";
import { ANALYSIS_MODES } from "../../lib/truesight/compiler/analysisModes";
import { TopBar, StatusBar } from "./IDEChrome.jsx";
import { encodeBytecodeHealth, CELL_IDS } from "../../lib/diagnostic.adapter.js";

const USE_SERVER_ANALYSIS = parseBooleanEnvFlag(import.meta.env.VITE_USE_SERVER_PANEL_ANALYSIS, true);
import ControlConsole from "./ControlConsole.jsx";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion.js";
import AmbienceTray from './AmbienceTray.jsx';
import FocusModeButton from './FocusModeButton.jsx';
import { useFocusMode } from './useFocusMode.js';
import SearchPanel from "./SearchPanel.jsx";
import FloatingPanel from "../../components/shared/FloatingPanel.jsx";
import IDEAmbientCanvas from "./IDEAmbientCanvas.jsx";
import "./IDE.css";
import MobileBottomNav from './MobileBottomNav.jsx';
import MobileHexSheet from './MobileHexSheet.jsx';
import MobileWordSheet from './MobileWordSheet.jsx';
import { useHaptic } from '../../hooks/useHaptic.ts';

const SCHOOL_GLYPHS = {
  DEFAULT:    "\uD83C\uDF08",
  SONIC:      "\u266A",
  PSYCHIC:    "\u25EC",
  VOID:       "\u2205",
  ALCHEMY:    "\u2697",
  WILL:       "\u26A1",
  DIVINATION: "\u25C9",
  NECROMANCY: "\u263D",
  ABJURATION: "\u2B21",
};
const TOOLTIP_WIDTH = 390;
const TOOLTIP_HEIGHT = 510;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = -8;

const ENABLE_SYNTAX_RHYME_LAYER = parseBooleanEnvFlag(
  import.meta.env.VITE_ENABLE_SYNTAX_RHYME_LAYER,
  false
);

function clampTooltipPosition(position, viewportWidth = 1200, viewportHeight = 900) {
  const minX = Math.min(TOOLTIP_MARGIN, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const minY = Math.min(TOOLTIP_MARGIN, viewportHeight - TOOLTIP_HEIGHT - TOOLTIP_MARGIN);
  const maxX = Math.max(TOOLTIP_MARGIN, viewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const maxY = Math.max(TOOLTIP_MARGIN, viewportHeight - TOOLTIP_HEIGHT - TOOLTIP_MARGIN);
  const rawX = Number(position?.x);
  const rawY = Number(position?.y);
  const safeX = Number.isFinite(rawX) ? rawX : TOOLTIP_MARGIN;
  const safeY = Number.isFinite(rawY) ? rawY : TOOLTIP_MARGIN;
  return {
    x: Math.min(Math.max(minX, safeX), maxX),
    y: Math.min(Math.max(minY, safeY), maxY),
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeComparableWord(value) {
  return String(value || "").trim().toUpperCase();
}

function applyMatchCase(sourceWord, replacement) {
  const source = String(sourceWord || "");
  const nextWord = String(replacement || "");
  if (!source || !nextWord) return nextWord;

  if (source === source.toUpperCase()) {
    return nextWord.toUpperCase();
  }

  const first = source.charAt(0);
  const rest = source.slice(1);
  if (first === first.toUpperCase() && rest === rest.toLowerCase()) {
    return `${nextWord.charAt(0).toUpperCase()}${nextWord.slice(1)}`;
  }

  return nextWord;
}

// Reads useUserSettings' persisted store directly so toggles can hydrate
// synchronously (before the settings hook resolves) without a visible flash.
function readPersistedBooleanSetting(key) {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed[key] === 'boolean') return parsed[key];
    }
  } catch {
    // Fall through to the settings hook's value
  }
  return null;
}


export default function ReadPage() {
  const { theme } = useTheme();
  const { settings, updateSettings } = useUserSettings();
  const auroraLevel = useAuroraLevel();
  const { scrolls, saveScroll, deleteScroll, getScrollById, activeScrollId, setActiveScrollId } = useScrolls();
  const { addXP, progression } = useProgression();
  const [isEditable, setIsEditable] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  /** @type {import('react').RefObject<import('./ScrollEditor.jsx').ScrollEditorHandle>} */
  const editorRef = useRef(null);
  const editorDocumentSerialRef = useRef(0);
  const [editorDocumentIdentity, setEditorDocumentIdentity] = useState("new:0");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [editorSelectionText, setEditorSelectionText] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("SONIC");
  const [infoBeamEnabled, setInfoBeamEnabled] = useState(false);
  const [infoBeamFamily, setInfoBeamFamily] = useState(null);

  const [ideMode, setIdeMode] = useState("NEUTRAL");
  const prevModeRef = useRef("NEUTRAL");

  useEffect(() => {
    if (prevModeRef.current !== ideMode) {
      const fromMode = prevModeRef.current;
      const toMode = ideMode;
      prevModeRef.current = ideMode;

      const health = encodeBytecodeHealth(CELL_IDS.LIFECYCLE, "state-transition-clean", { fromMode, toMode });
      console.log(`[LIFECYCLE] Transition verified: ${health.bytecode}`);
    }
  }, [ideMode]);

  // Use settings for initial state if available
  const [isTruesight, setIsTruesight] = useState(
    () => readPersistedBooleanSetting('truesightEnabled') ?? settings?.truesightEnabled ?? false
  );
  const [isLatticeGrid, setIsLatticeGrid] = useState(
    () => readPersistedBooleanSetting('latticeGridEnabled') ?? settings?.latticeGridEnabled ?? false
  );
  const [isPredictive, setIsPredictive] = useState(true);
  const [mirrored, setMirrored] = useState(settings?.mirroredEnabled ?? false); // Mirror state
  const [analysisMode, setAnalysisMode] = useState(settings?.analysisMode ?? ANALYSIS_MODES.NONE);
  const [highlightedLines, setHighlightedLines] = useState([]);
  const [pinnedLines, setPinnedLines] = useState([]);

  const handleIdeFocus = useCallback(() => {
    if (isTruesight && !isEditable && !isEditing) {
      setIdeMode("TRUESIGHT");
      return;
    }
    setIdeMode("EDIT");
  }, [isEditable, isEditing, isTruesight]);

  const handleIdeBlur = useCallback(() => {
    if (isTruesight && !isEditable && !isEditing) {
      setIdeMode("TRUESIGHT");
      return;
    }
    setIdeMode("NEUTRAL");
  }, [isEditable, isEditing, isTruesight]);
  
  const activeScroll = activeScrollId ? getScrollById(activeScrollId) : null;

  const { saveStatus, bumpAutosaveContext, isSaving } = useAutoSave({
    title: editorTitle,
    content: editorContent,
    id: activeScrollId,
    isEditable: isEditing && isEditable,
    submittedAt: activeScroll?.submittedAt
  }, {
    onSaveSuccess: (savedScroll) => {
      setEditorTitle(String(savedScroll.title || ""));
    }
  });

  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 960
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isHexSheetOpen, setIsHexSheetOpen] = useState(false);
  const [isWordSheetOpen, setIsWordSheetOpen] = useState(false);
  const { haptic } = useHaptic(settings?.hapticEnabled ?? false);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 959px)');
    const mobile = window.matchMedia('(max-width: 639px)');

    const onNarrow = (e) => setIsNarrowViewport(e.matches);
    const onMobile = (e) => setIsMobileViewport(e.matches);

    narrow.addEventListener('change', onNarrow);
    mobile.addEventListener('change', onMobile);

    return () => {
      narrow.removeEventListener('change', onNarrow);
      mobile.removeEventListener('change', onMobile);
    };
  }, []);

  const [sidebarTab, setSidebarTab] = useState("FILES");
  const [mobileActiveTab, setMobileActiveTab] = useState("EDITOR");
  const [showScorePanel, setShowScorePanel] = useState(false);
  const [showOraclePanel, setShowOraclePanel] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [showSpellcheckPanel, setShowSpellcheckPanel] = useState(false);
  const [oracleWord, setOracleWord] = useState("");
  const [toasts, setToasts] = useState([]);

  const toastCounter = useRef(0);
  const addToast = useCallback((message, type = "info") => {
    const id = `toast-${Date.now()}-${toastCounter.current++}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useFocusMode(focusMode, setFocusMode);

  // Console-driven display settings. These three were persisted but inert; the
  // Control Console wires them into real CSS levers on the layout wrapper.
  const osReducedMotion = usePrefersReducedMotion();
  const fontSizeSetting = settings?.fontSize ?? "medium";
  const compactMode = settings?.compactMode ?? false;
  const reducedMotionSetting = settings?.reducedMotion ?? false;
  const reducedMotionActive = osReducedMotion || reducedMotionSetting;
  const fontScale = fontSizeSetting === "small" ? 0.92 : fontSizeSetting === "large" ? 1.12 : 1;

  // Drive a specific aurora level using only the atmosphere module's public API
  // (it exposes a cycle, not a setter); bounded to the 3 known levels.
  const handleSetAurora = useCallback((target) => {
    let level = getAuroraLevel();
    for (let i = 0; i < AURORA_FACTORS.length && level !== target; i += 1) {
      level = cycleAuroraLevel();
    }
  }, []);

  const schoolColorHex = useMemo(() => {
    return SCHOOLS[selectedSchool]?.color || "#d5b34b";
  }, [selectedSchool]);

  const effectiveHighlightedLines = useMemo(() => {
    return [...new Set([...highlightedLines, ...pinnedLines])];
  }, [highlightedLines, pinnedLines]);
  
  const activeScrollContent = String(activeScroll?.content || "");

  const editorInitialTitle = isEditable
    ? String(editorTitle || "")
    : String(activeScroll?.title || editorTitle || "");

  const editorInitialContent = isEditable
    ? String(editorContent || "")
    : activeScrollContent;

  const truesightContent = (isEditable || isEditing) ? editorContent : activeScrollContent;

  const {
    artifact: deepAnalysis,
    isSynthesizing: isAnalyzing,
    error: analysisError,
    activeConnections,
    highlightRhymeGroup,
    clearHighlight,
    verseIR,
    scheme: schemeDetection,
    meter: meterDetection,
    vowelSummary,
    literaryDevices,
    emotion,
    totalSyllables,
    analyzedWords,
    tokenByIdentity: analyzedWordsByIdentity,
    tokenByCharStart: analyzedWordsByCharStart,
  } = useVerseSynthesis(truesightContent, {
    mode: analysisMode,
    school: selectedSchool,
    paused: ideMode === "EDIT"
  });

  // Fallbacks for legacy fields moving to AMP
  const scoreData = deepAnalysis?.scoreData || null;
  const rhymeAstrology = deepAnalysis?.rhymeAstrology || null;
  const narrativeAMP = deepAnalysis?.narrativeAMP || null;
  const oracle = deepAnalysis?.oracle || null;
  const genreProfile = deepAnalysis?.genreProfile || null;
  const {
    songStats,
    computeFailed: songStatsComputeFailed,
  } = useSongStats(truesightContent, deepAnalysis);

  // Word colour authority is wordTruesight (school colour) inside ScrollEditor;
  // the adaptive palette only feeds the ambient blended-HSL animation intent.
  const {
    blendedHsl,
    dominantSchool
  } = useAdaptivePalette(deepAnalysis, { paused: ideMode !== "TRUESIGHT" });

  const { submitIntent } = useAnimationSubmitter();

  // Drive atmospheric effects via Animation AMP
  useEffect(() => {
    submitIntent({
      version: 'v1.0',
      targetId: 'global:atmosphere',
      trigger: 'audio',
      state: { blendedHsl, dominantSchool }
    });
  }, [blendedHsl, dominantSchool, submitIntent]);

  // Handle route-based atmosphere (pausing on watch page)
  const location = useLocation();
  // AtmosphereSync handles global route-change intents

  const handleToggleTruesight = useCallback(() => {
    setIsTruesight((prev) => {
      const next = !prev;
      updateSettings({ truesightEnabled: next });
      setHighlightedLines([]);
      setIdeMode((currMode) => {
        if (currMode === "EDIT") return currMode;
        return next ? "TRUESIGHT" : "NEUTRAL";
      });
      return next;
    });
  }, [updateSettings]);

  const handleToggleLatticeGrid = useCallback(() => {
    setIsLatticeGrid((prev) => {
      const next = !prev;
      updateSettings({ latticeGridEnabled: next });
      return next;
    });
  }, [updateSettings]);

  const handleTogglePredictive = useCallback(() => {
    setIsPredictive((prev) => !prev);
  }, []);

  const handleToggleMirrored = useCallback(() => {
    setMirrored((prev) => {
      const next = !prev;
      updateSettings({ mirroredEnabled: next });
      return next;
    });
  }, [updateSettings]);

  const handleModeChange = useCallback((nextMode) => {
    setAnalysisMode((prev) => {
      const resolvedMode = prev === nextMode ? ANALYSIS_MODES.NONE : nextMode;
      updateSettings({ analysisMode: resolvedMode });
      return resolvedMode;
    });
    setHighlightedLines([]);
  }, [updateSettings]);

  const handleSchoolChange = useCallback((schoolId) => {
    setSelectedSchool(schoolId);
  }, []);

  const handleMobileTabChange = useCallback((tab) => {
    if (tab === 'HEX') {
      haptic('tap');
      setIsHexSheetOpen(true);
      return;
    }
    haptic(tab === 'EDITOR' ? 'select' : 'tap');
    setMobileActiveTab(tab);
  }, [haptic]);

  const handleInfoBeamToggle = useCallback(() => {
    setInfoBeamEnabled((prev) => !prev);
  }, []);

  const overlayConnections = useMemo(() => {
    if (ideMode !== "TRUESIGHT") {
      return [];
    }
    return activeConnections || [];
  }, [ideMode, activeConnections]);

  const handleInfoBeamClick = useCallback((label) => {
    setInfoBeamFamily(label);
  }, []);

  // Lexicon lookup is now owned by the tooltip itself (RitualPredictionTooltip
  // self-fetches via useWordLookup), so ReadPage no longer threads word data.

  const infoBeamConnections = useMemo(() => {
    if (!infoBeamEnabled || !infoBeamFamily) return [];
    const { connections } = resolveResonanceConnections(deepAnalysis);
    return connections.filter((c) => c.groupLabel === infoBeamFamily);
  }, [infoBeamEnabled, infoBeamFamily, deepAnalysis]);

  // Resonance gate for word colouring: only words that participate in a
  // rhyme/assonance connection get coloured (the rest stay grey), so colour
  // marks resonance instead of every content word ("Skittles" fix). Always
  // returns a Set - empty when analysis ran but found nothing resonant, OR
  // when no connection source exists on the live synthesis path (server
  // offline / local fallback). The two are distinguished by `resonanceDegraded`
  // below; the gate itself stays strict (grey) in both cases so the offline
  // state can never reintroduce the over-colouring bug. The connection source
  // is read path-agnostically (see SCD64 GATE_DATA_ABSENT 03030742...).
  // The tiered resonance gate: Map<charStart, 'rhyme' | 'assonance'>.
  // 'rhyme' preserves the historical >= MIN_RESONANCE_SCORE glow set exactly;
  // 'assonance' adds vowel echoes as a subordinate tint tier. A Map keeps
  // .has/.size working for existing consumers while adding .get for the tier.
  const resonantCharStarts = useMemo(() => {
    const { connections } = resolveResonanceConnections(deepAnalysis);
    // When the Dictionary Oracle is unavailable the backend has no authoritative
    // phonemes, so every word's vowel family is a guess derived from SPELLING —
    // which inverts love/move and though/tough. Colouring from that is worse than
    // not colouring: it looks confident and it is wrong. The backend tells us, and
    // the gate renders nothing. Read path-agnostically: useVerseSynthesis aliases
    // `analysis` to `syntaxLayer`, so the flag can arrive under either key.
    const authorityUnavailable = Boolean(
      deepAnalysis?.syntaxLayer?.authorityUnavailable
      ?? deepAnalysis?.analysis?.authorityUnavailable,
    );

    // Multis arrive as their OWN array, never inside allConnections — they are a
    // chain of rhyme families across syllables, not a word-pair connection, and
    // merging the two models is what broke every earlier attempt. Read
    // path-agnostically for the same reason as authorityUnavailable above.
    const multis = deepAnalysis?.syntaxLayer?.multis
      ?? deepAnalysis?.analysis?.multis
      ?? [];

    return buildResonanceGate(connections, { authorityUnavailable, multis });
  }, [deepAnalysis]);

  // True when analysis has arrived but the live synthesis path carries no
  // connection source at all (the GATE_DATA_ABSENT condition). Drives the
  // quiet "resonance offline" signal so a grey editor reads as "analysis
  // unavailable" rather than "broken". Loading (no deepAnalysis yet) is NOT
  // degraded - it's just not-ready.
  const resonanceDegraded = useMemo(() => {
    if (!deepAnalysis) return false;
    return !resolveResonanceConnections(deepAnalysis).sourcePresent;
  }, [deepAnalysis]);

  const scrollLines = useMemo(
    () => truesightContent.split("\n"),
    [truesightContent]
  );

  const lineCount = scrollLines.length;
  const currentLineText = cursorPos.line > 0 ? scrollLines[cursorPos.line - 1] || "" : "";

  const mobileSurfaceTitle = activeScroll?.title || (isEditable ? "Drafting..." : "Scholomance");
  const editorSubtitle = scoreData
    ? `${scoreData.totalScore} Power`
    : `Ln ${cursorPos.line} · Col ${cursorPos.col}`;

  const ritualPalette = getRitualPalette(selectedSchool);
  const activeSchoolLabel = SCHOOLS[selectedSchool]?.name || "Universal";
  const mobileVisionLabel = isTruesight ? "Truesight active" : "Ink view";
  const issueEditorDocumentIdentity = useCallback((label = "new") => {
    editorDocumentSerialRef.current += 1;
    setEditorDocumentIdentity(`${label || "new"}:${editorDocumentSerialRef.current}`);
  }, []);

  const handleSaveScroll = useCallback(
    async (title, content) => {
      bumpAutosaveContext(activeScrollId, title, content);
      const wasSubmitted = Boolean(activeScroll?.submittedAt);
      const saveAsNewSubmission = Boolean(activeScrollId && !wasSubmitted);
      const isUpdate = Boolean(activeScrollId && !saveAsNewSubmission);
      const savedScroll = await saveScroll({
        id: isUpdate ? activeScrollId : undefined,
        forceNew: saveAsNewSubmission,
        replaceId: saveAsNewSubmission ? activeScrollId : undefined,
        title,
        content,
        submit: true,
        submittedAt: isUpdate ? activeScroll?.submittedAt || null : null,
      });
      if (!savedScroll) {
        addToast("Failed to save scroll", "error");
        return;
      }

      const didSubmitNow = !wasSubmitted && Boolean(savedScroll.submittedAt);
      const actionLabel = didSubmitNow
        ? "Scroll Submitted"
        : isUpdate
          ? "Scroll Updated"
          : "Scroll Saved";

      if (didSubmitNow) {
        const totalPower = scoreData?.totalScore || 0;
        const baseXP = 25;
        const powerXP = Math.round(Math.pow(totalPower, 1.6));
        const xpAwarded = baseXP + powerXP;
        const source = totalPower > 70 ? "legendary_submission"
          : totalPower > 40 ? "expert_submission"
            : "basic_submission";

        addXP(xpAwarded, source);
        addToast(`${actionLabel}! +${xpAwarded} XP`, "success");
      } else {
        addToast(`${actionLabel}!`, "success");
      }

      setEditorTitle(savedScroll.title);
      setActiveScrollId(savedScroll.id);
      bumpAutosaveContext(savedScroll.id, savedScroll.title, savedScroll.content);
      issueEditorDocumentIdentity(savedScroll.id);

      // A saved scroll is committed, so leave the editing state the same way
      // handleCancelEdit does. This used to setIsEditing(true), which pinned
      // ideMode to "EDIT" forever — and useVerseSynthesis takes `paused:
      // ideMode === "EDIT"`, so the whole analysis pass never ran again. With no
      // analysed document there is no token data, so the ritual tooltip had no
      // lineIndex, no context line, and therefore no resonance partners at all.
      setIsEditing(false);
      setIsEditable(false);
      setIdeMode(isTruesight ? "TRUESIGHT" : "NEUTRAL");
    },
    [activeScrollId, activeScroll?.submittedAt, saveScroll, addXP, addToast, scoreData, bumpAutosaveContext, setActiveScrollId, issueEditorDocumentIdentity, isTruesight]
  );

  // Opening a scroll is a READ. Editing is opt-in via handleEditScroll.
  // This used to setIsEditable(true), which meant handleIdeFocus could never
  // reach its TRUESIGHT branch and pinned ideMode to "EDIT" — and
  // useVerseSynthesis is paused in EDIT, so opening a scroll silently disabled
  // the analysis that Truesight and the ritual tooltip's resonance depend on.
  const handleSelectScroll = useCallback((id) => {
    const scroll = getScrollById(id);
    if (!scroll) return;
    bumpAutosaveContext(id, scroll.title, scroll.content);
    setActiveScrollId(id);
    setEditorTitle(String(scroll.title || ""));
    setEditorContent(String(scroll.content || ""));
    issueEditorDocumentIdentity(id);
    setIsEditing(false);
    setIsEditable(false);
    setHighlightedLines([]);
    setIdeMode(isTruesight ? "TRUESIGHT" : "NEUTRAL");
  }, [bumpAutosaveContext, getScrollById, issueEditorDocumentIdentity, setActiveScrollId, isTruesight]);

  const handleNewScroll = useCallback(() => {
    bumpAutosaveContext(null, "", "");
    setActiveScrollId(null);
    setEditorTitle("");
    setEditorContent("");
    issueEditorDocumentIdentity("new");
    setIsEditing(false);
    setIsEditable(true);
    setHighlightedLines([]);
    setIdeMode("EDIT");
    setTooltipState({ token: null, position: { x: TOOLTIP_MARGIN, y: TOOLTIP_MARGIN }, localAnalysis: null, pinned: false });
    setSessionWords([]);
    setSessionIndex(-1);
  }, [bumpAutosaveContext, issueEditorDocumentIdentity, setActiveScrollId]);

  const handleEditScroll = useCallback(() => {
    bumpAutosaveContext(activeScrollId, activeScroll?.title, activeScrollContent);
    setEditorTitle(String(activeScroll?.title || ""));
    setEditorContent(activeScrollContent);
    // Do NOT call issueEditorDocumentIdentity here - we are editing the same
    // document already mounted in ScrollEditor. Changing the key would remount
    // it, losing scroll position and resetting adaptiveTopology (which clears
    // the Gutter's per-line syllable counts).
    setIsEditing(true);
    setIsEditable(true);
    setHighlightedLines([]);
    setIdeMode("EDIT");
  }, [activeScroll?.title, activeScrollContent, activeScrollId, bumpAutosaveContext]);

  const handleEditScrollById = useCallback((id) => {
    const scroll = getScrollById(id);
    if (!scroll) return;
    bumpAutosaveContext(id, scroll.title, scroll.content);
    setActiveScrollId(id);
    setEditorTitle(String(scroll.title || ""));
    setEditorContent(String(scroll.content || ""));
    issueEditorDocumentIdentity(id);
    setIsEditing(true);
    setIsEditable(true);
    setHighlightedLines([]);
    setIdeMode("EDIT");
  }, [getScrollById, bumpAutosaveContext, issueEditorDocumentIdentity, setActiveScrollId]);

  const handleCancelEdit = useCallback(() => {
    if (activeScrollId) {
      bumpAutosaveContext(activeScrollId, activeScroll?.title, activeScrollContent);
      setEditorTitle(String(activeScroll?.title || ""));
      setEditorContent(activeScrollContent);
      issueEditorDocumentIdentity(activeScrollId);
      setIsEditing(false);
      setIsEditable(false);
      setIdeMode(isTruesight ? "TRUESIGHT" : "NEUTRAL");
    } else {
      bumpAutosaveContext(null, "", "");
      setActiveScrollId(null);
      setEditorTitle("");
      setEditorContent("");
      issueEditorDocumentIdentity("new");
      setIsEditing(false);
      setIsEditable(false);
      setIdeMode("NEUTRAL");
    }
  }, [activeScroll?.title, activeScrollContent, activeScrollId, bumpAutosaveContext, issueEditorDocumentIdentity, setActiveScrollId, isTruesight]);

  const handleEditorContentChange = useCallback((newContent) => {
    setEditorContent(newContent);
  }, []);

  const handleEditorTitleChange = useCallback((newTitle) => {
    setEditorTitle(newTitle);
  }, []);

  // Craft actions (insert/replace/pin) from AnalyzePanel results. 'pin' is
  // handled locally inside AnalyzePanel and never reaches here. No-ops
  // safely if the Lexical editor isn't mounted (e.g. no active scroll).
  const handleAnalyzeCraft = useCallback(({ action, item }) => {
    if (action === 'pin') return;
    const editor = editorRef.current?.getEditor?.();
    if (!editor) return;
    editor.update(() => {
      const selection = $getSelection();
      if (!selection) return;
      selection.insertText(item.text);
    });
  }, []);

  const [tooltipState, setTooltipState] = useState({
    token: null,
    position: { x: TOOLTIP_MARGIN, y: TOOLTIP_MARGIN },
    localAnalysis: null,
    pinned: false,
  });

  const [sessionWords, setSessionWords] = useState([]);
  const [sessionIndex, setSessionIndex] = useState(-1);

  const tooltipCloseGuardRef = useRef({ expiresAt: 0, lineIndex: -1, charStart: -1 });

  const resolveTooltipPosition = useCallback((anchorRect) => {
    if (!anchorRect) return { x: TOOLTIP_MARGIN, y: TOOLTIP_MARGIN };
    const rawX = anchorRect.left + TOOLTIP_OFFSET_X;
    const rawY = anchorRect.top + TOOLTIP_OFFSET_Y - TOOLTIP_HEIGHT;
    const vp = ({ width: window.innerWidth, height: window.innerHeight });
    return clampTooltipPosition({ x: rawX, y: rawY }, vp.width, vp.height);
  }, []);

  const buildTooltipAnalysis = useCallback((activation) => {
    const { word, analysis, charStart } = activation;
    const core = analysis || {};
    const vowelFamily = core.vowelFamily || activation.vowelFamily || null;
    const terminalVowelFamily = core.terminalVowelFamily || activation.terminalVowelFamily || null;
    const schoolId = activation.school || (vowelFamily ? VOWEL_FAMILY_TO_SCHOOL[normalizeVowelFamily(vowelFamily)] : null);
    const lineIndex = Number.isInteger(activation.lineIndex) ? activation.lineIndex : activation.lineNumber;
    return {
      word,
      charStart,
      lineIndex,
      core: {
        vowelFamily,
        terminalVowelFamily,
        rhymeKey: core.rhymeKey || null,
        rhymeTailSignature: core.rhymeTailSignature || null,
        syllableCount: core.syllableCount || 0,
        phonemes: core.phonemes || activation.phonemes || [],
        stressPattern: core.stressPattern || "",
        color: activation.color || core.color || core.precomputed?.hex || null,
        schoolName: schoolId ? SCHOOLS[schoolId]?.name : null,
        schoolGlyph: schoolId ? SCHOOLS[schoolId]?.glyph : null,
      }
    };
  }, []);

  useEffect(() => {
    // Initialize session for Lexicon access
    import("../../lib/csrf.js").then(({ getCsrfToken }) => {
      getCsrfToken().catch(err => console.warn("[ReadPage] Session init failed:", err));
    });
  }, []);

  const misspellings = useMemo(() => {
    return scoreData?.misspellings || [];
  }, [scoreData]);

  const handleWordActivate = useCallback((activation) => {
    if (!activation || !activation.normalizedWord) {
      setTooltipState({ token: null, position: { x: 0, y: 0 }, localAnalysis: null, pinned: false });
      return;
    }

    const closeGuard = tooltipCloseGuardRef.current;
    if (Date.now() < closeGuard.expiresAt) {
      const sameToken = closeGuard.lineIndex === activation.lineIndex && closeGuard.charStart === activation.charStart;
      if (sameToken) return;
    }

    if (tooltipState.token && tooltipState.token.normalizedWord === activation.normalizedWord) {
      return;
    }

    // Ritual prediction is fully dormant when the HEX TOOLS toggle is off:
    // no spellcheck box, no tooltip -- nothing surfaces unprompted.
    if (!isPredictive) {
      return;
    }

    const isMisspelledWord = misspellings.some(
      (err) => normalizeComparableWord(err.word) === activation.normalizedWord
    );
    if (isMisspelledWord) {
      setShowSpellcheckPanel(true);
    }


    const pos = resolveTooltipPosition(activation.anchorRect);
    const analysis = buildTooltipAnalysis(activation);

    setTooltipState({
      token: { 
        word: activation.word, 
        normalizedWord: activation.normalizedWord, 
        charStart: activation.charStart, 
        lineIndex: Number.isInteger(activation.lineIndex) ? activation.lineIndex : activation.lineNumber
      },
      position: pos,
      localAnalysis: analysis,
      pinned: true,
    });

    if (activation.normalizedWord) {
      setSessionWords((prev) => {
        if (prev.length > 0 && prev[prev.length - 1]?.word === activation.normalizedWord) return prev;
        const next = [...prev, { word: activation.normalizedWord }].slice(-20);
        setSessionIndex(next.length - 1);
        return next;
      });
    }

    if (isMobileViewport) {
      setIsWordSheetOpen(true);
    }
  }, [buildTooltipAnalysis, isMobileViewport, isPredictive, misspellings, resolveTooltipPosition, tooltipState]);

  const handleCloseTooltip = useCallback(() => {
    handleWordActivate(null);
  }, [handleWordActivate]);

  // Transmute: replace the originally-activated word in the poem with the
  // chosen word. Only valid when we know the source position (charStart >= 0).
  const handleTransmute = useCallback((chosenWord) => {
    if (!tooltipState.token) return;
    const { word: original, charStart } = tooltipState.token;
    if (!Number.isInteger(charStart) || charStart < 0) return;
    const replacement = applyMatchCase(original, chosenWord);
    const newContent = editorContent.slice(0, charStart) + replacement + editorContent.slice(charStart + original.length);
    handleEditorContentChange(newContent);
    handleCloseTooltip();
    addToast(`Transmuted "${original}" to "${replacement}"`, "success");
  }, [editorContent, handleEditorContentChange, handleCloseTooltip, tooltipState.token, addToast]);

  // Session navigation re-seeds the tooltip with the chosen word; the tooltip
  // self-fetches its own lexicon + prediction. Source position is cleared so
  // transmute stays disabled for words not anchored in the current document.
  const handleSessionNavigate = useCallback((direction) => {
    const nextIndex = sessionIndex + direction;
    if (nextIndex < 0 || nextIndex >= sessionWords.length) return;
    const nextWord = sessionWords[nextIndex]?.word;
    if (!nextWord) return;
    setSessionIndex(nextIndex);
    setTooltipState((prev) => ({
      ...prev,
      token: { word: nextWord, normalizedWord: nextWord, charStart: -1, lineIndex: -1 },
      localAnalysis: null,
    }));
  }, [sessionIndex, sessionWords]);

  // The raw line the activated word sits on - feeds the tooltip's resonance.
  const tooltipContextLine = useMemo(() => {
    const lineIndex = tooltipState.token?.lineIndex;
    if (!Number.isInteger(lineIndex) || lineIndex < 0) return "";
    return (editorContent || "").split("\n")[lineIndex] || "";
  }, [editorContent, tooltipState.token]);

  const { predict, getCompletions, checkSpelling, getSpellingSuggestions, ready: predictorReady } = usePredictor();

  useEffect(() => {
    if (misspellings.length === 0) {
      setShowSpellcheckPanel(false);
    }
  }, [misspellings]);

  useEffect(() => {
    if (!isPredictive) {
      setTooltipState({ token: null, position: { x: 0, y: 0 }, localAnalysis: null, pinned: false });
      setIsWordSheetOpen(false);
      setShowSpellcheckPanel(false);
    }
  }, [isPredictive]);

  const applySpellcheckCorrection = useCallback((original, correction) => {
    const replacement = applyMatchCase(original, correction);
    const escapedOriginal = escapeRegExp(original);
    const regex = new RegExp(`\\b${escapedOriginal}\\b`, "g");
    const newContent = editorContent.replace(regex, replacement);
    handleEditorContentChange(newContent);
    addToast(`Corrected "${original}" to "${replacement}"`, "success");
  }, [editorContent, handleEditorContentChange, addToast]);

  const lexiconSeedWord = useMemo(() => oracleWord || "", [oracleWord]);

  const jumpToLexiconOracle = useCallback((word) => {
    setOracleWord(word);
    setSidebarTab("SEARCH");
  }, []);

  const resolveLexiconContext = useCallback((word) => {
    if (!word || !deepAnalysis) return null;
    const normalized = word.toUpperCase();
    const tokens = deepAnalysis.verseIR?.tokens || [];
    const occurrences = tokens.filter(t => t.normalizedWord === normalized);
    
    if (occurrences.length === 0) return null;

    const first = occurrences[0];
    
    return {
      foundInScroll: true,
      totalOccurrences: occurrences.length,
      core: {
        rhymeKey: first.rhymeKey,
        vowelFamily: first.vowelFamily,
      },
      resonanceLinks: occurrences.map(t => ({
        lineIndex: t.lineIndex,
        word: t.word,
        context: scrollLines[t.lineIndex] || ""
      })),
      astrology: deepAnalysis.rhymeAstrology?.wordMap?.get(normalized) || null
    };
  }, [deepAnalysis, scrollLines]);

  useEffect(() => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => pruneOldCaches());
    } else {
      setTimeout(pruneOldCaches, 100);
    }
  }, []);

  const isAstrologyMode = analysisMode === ANALYSIS_MODES.ASTROLOGY;
  const isAnalyzeMode = isTruesight && analysisMode === ANALYSIS_MODES.ANALYZE;
  const isAnalysisPanelVisible = isAnalyzeMode || isAstrologyMode;
  const analysisPanelTitle = isAstrologyMode ? "Rhyme Astrology" : "Phonetic Analysis";
  const analysisPanelCloseLabel = isAstrologyMode ? "Close Astrology" : "Close Analysis";

  const mobileTabs = useMemo(() => [
    { id: "EDITOR", label: "Editor", hint: "Ink & Vision" },
    { id: "FILES",  label: "Scrolls", hint: "Archive" },
    { id: "SEARCH", label: "Oracle", hint: "Lexicon" },
    { id: "TOOLS",  label: "Hex",    hint: "Controls" },
    { id: "STATS",  label: "Power",  hint: "Metrics" },
  ], []);

  const currentMobileTab = useMemo(() => {
    const base = mobileTabs.find(t => t.id === mobileActiveTab) || mobileTabs[0];
    const descriptions = {
      EDITOR: "The primary manifestation surface for thy verses.",
      FILES:  "Survey the records of thy past rituals.",
      SEARCH: "Query the Abyss for linguistic echoes and resonance.",
      TOOLS:  "Tweak the laws of sight and predictive anticipation.",
      STATS:  "Observe the numerical weight of thy current casting.",
    };
    const eyebrows = { EDITOR: "Drafting", FILES: "Archive", SEARCH: "Oracle", TOOLS: "Alchemical", STATS: "Judiciary" };
    return { 
      ...base, 
      description: descriptions[mobileActiveTab], 
      eyebrow: eyebrows[mobileActiveTab],
      badge: mobileActiveTab === "STATS" && scoreData ? `${scoreData.totalScore} Power` : ""
    };
  }, [mobileActiveTab, scoreData, mobileTabs]);

  const MobileTabIcon = ({ tabId }) => {
    if (tabId === "FILES") return <FolderIcon />;
    if (tabId === "SEARCH") return <SearchIcon />;
    if (tabId === "TOOLS") return <ToolsIcon />;
    if (tabId === "STATS") return <SettingsIcon />;
    return <span className="material-symbols-outlined">edit_note</span>;
  };

  // One prop contract, consumed by both the desktop TOOLS tab and the mobile
  // tools sheet. Every field maps to real Scribe state or a persisted setting.
  const controlConsoleProps = {
    isTruesight,
    onToggleTruesight: handleToggleTruesight,
    isLatticeGrid,
    onToggleLatticeGrid: handleToggleLatticeGrid,
    mirrored,
    onToggleMirrored: handleToggleMirrored,
    isPredictive,
    onTogglePredictive: handleTogglePredictive,
    showScorePanel,
    onToggleScorePanel: () => setShowScorePanel((v) => !v),
    analysisMode,
    onModeChange: handleModeChange,
    isAnalyzing,
    predictorReady,
    resonanceDegraded,
    selectedSchool,
    onSchoolChange: setSelectedSchool,
    schoolList: getSchoolsByUnlock(progression),
    auroraLevel,
    onSetAurora: handleSetAurora,
    focusMode,
    onToggleFocus: () => setFocusMode((v) => !v),
    showOraclePanel,
    onToggleOracle: () => setShowOraclePanel((v) => !v),
    fontSize: fontSizeSetting,
    onFontSizeChange: (size) => updateSettings({ fontSize: size }),
    compactMode,
    onToggleCompact: () => updateSettings({ compactMode: !compactMode }),
    reducedMotion: reducedMotionSetting,
    onToggleReducedMotion: () => updateSettings({ reducedMotion: !reducedMotionSetting }),
    hapticEnabled: settings?.hapticEnabled ?? false,
    onToggleHaptic: () => updateSettings({ hapticEnabled: !(settings?.hapticEnabled ?? false) }),
    telemetry: {
      line: cursorPos.line,
      col: cursorPos.col,
      syllables: totalSyllables ?? 0,
      lines: lineCount ?? 0,
      power: Math.round(scoreData?.totalScore || 0),
    },
  };

  const toolsBlock = <ControlConsole {...controlConsoleProps} />;

  const songStatsSlot = songStats ? (
    <SongStatsPanel stats={songStats} visible={true} isEmbedded={true} />
  ) : songStatsComputeFailed ? (
    <div className="song-stats-panel is-embedded song-stats-unavailable" role="status">
      Song stats unavailable — recompute failed for the current lyrics.
    </div>
  ) : null;

  const metricsPanelVisible = shouldShowMetricsPanel({
    showScorePanel,
    songStats,
    songStatsComputeFailed,
  });

  const scoreBlock = songStatsSlot;

  const schoolList = getSchoolsByUnlock(progression);

  const activeMobilePanel = mobileActiveTab === "EDITOR" ? null :
    mobileActiveTab === "FILES" ? <ScrollList scrolls={scrolls} activeScrollId={activeScrollId} onSelect={(id) => { handleSelectScroll(id); setMobileActiveTab("EDITOR"); }} onNewScroll={handleNewScroll} /> :
    mobileActiveTab === "SEARCH" ? <SearchPanel seedWord={lexiconSeedWord} selectedSchool={selectedSchool} contextLookup={resolveLexiconContext} onJumpToLine={(line) => { editorRef.current?.jumpToLine?.(line); setMobileActiveTab("EDITOR"); }} /> :
    mobileActiveTab === "TOOLS" ? <div className="ide-mobile-panel">{toolsBlock}</div> :
    <div className="ide-mobile-panel">{scoreBlock}</div>;


  const commonUI = (
    <>

      {showSpellcheckPanel && misspellings.length > 0 && (
        <FloatingPanel
          id="spellcheck-panel"
          title="Spellcheck"
          onClose={() => setShowSpellcheckPanel(false)}
          defaultX={typeof window !== 'undefined' ? window.innerWidth - 300 : 900}
          defaultY={typeof window !== 'undefined' ? window.innerHeight - 300 : 600}
          minWidth={220}
          minHeight={120}
          maxWidth={400}
          maxHeight={500}
          className="spellcheck-panel"
        >
          <div className="misspellings-list">
            {misspellings.map((err, i) => (
              <div key={i} className="misspelling-item">
                <button
                  type="button"
                  className={`error-word${err.suggestions.length > 0 ? " error-word--interactive" : ""}`}
                  disabled={err.suggestions.length === 0}
                  onClick={() => applySpellcheckCorrection(err.word, err.suggestions[0])}
                  title={
                    err.suggestions.length > 0
                      ? `Replace "${err.word}" with "${err.suggestions[0]}"`
                      : "No suggestions available"
                  }
                >
                  {err.word}
                </button>
                <div className="error-suggestions">
                  {err.suggestions.map((s, j) => (
                    <button key={j} className="btn-tiny" onClick={() => applySpellcheckCorrection(err.word, s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FloatingPanel>
      )}

      <div className="toast-container">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              className={`toast-item toast-item--${toast.type}`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showSettingsPanel && (
          <FloatingPanel
            id="settings-panel"
            title="Settings"
            onClose={() => setShowSettingsPanel(false)}
            defaultX={typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 340) : 900}
            defaultY={64}
            defaultWidth={300}
            defaultHeight={320}
            minWidth={240}
            minHeight={220}
            maxWidth={420}
            maxHeight={500}
            zIndex={300}
            className="settings-floating-panel"
          >
            <div className="settings-panel-body">
              <div className="settings-panel-section">
                <span className="settings-panel-label">Optics</span>
                <div className="settings-panel-row">
                  <span>Truesight</span>
                  <button
                    type="button"
                    className={`settings-toggle${isTruesight ? ' settings-toggle--on' : ''}`}
                    aria-pressed={isTruesight}
                    onClick={handleToggleTruesight}
                  >
                    {isTruesight ? 'On' : 'Off'}
                  </button>
                </div>
                {isTruesight && resonanceDegraded && (
                  <div className="settings-panel-note settings-panel-note--offline" role="status">
                    Resonance offline - analysis unavailable; words shown in plain ink.
                  </div>
                )}
                <div className="settings-panel-row">
                  <span>Symmetrical</span>
                  <button
                    type="button"
                    className={`settings-toggle${mirrored ? ' settings-toggle--on' : ''}`}
                    aria-pressed={mirrored}
                    onClick={handleToggleMirrored}
                  >
                    {mirrored ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </div>
          </FloatingPanel>
        )}
      </AnimatePresence>
    </>
  );

  /* ── MOBILE RENDER ── */
  if (isMobileViewport) {
    return (
      <div className="ide-layout-wrapper ide-layout-wrapper--mobile">
        <TopBar
          title={mobileSurfaceTitle}
          onOpenSearch={() => setMobileActiveTab('ORACLE')}
          showMinimap={false}
          onToggleMinimap={() => {}}
          isEditable={isEditable}
          activeScrollId={activeScrollId}
          onEdit={handleEditScroll}
          onNewScroll={handleNewScroll}
          progression={progression}
          auroraLevel={auroraLevel}
          onCycleAuroraLevel={cycleAuroraLevel}
          onSettingsClick={() => setShowSettingsPanel(p => !p)}
          showMinimapControl={false}
          showSettingsControl={true}
        />

        <main className="ide-mobile-content" id="main-content">
          {mobileActiveTab === 'EDITOR' && (
            <motion.div
              key="editor"
              className="ide-mobile-editor-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <ScrollEditor
                key={editorDocumentIdentity}
                ref={editorRef}
                documentIdentity={editorDocumentIdentity}
                title={editorInitialTitle}
                content={editorInitialContent}
                onSave={handleSaveScroll}
                onCancel={isEditing ? handleCancelEdit : undefined}
                isEditable={isEditable}
                disabled={false}
                isTruesight={isTruesight}
                isLatticeGrid={isLatticeGrid}
                isPredictive={isPredictive}
                predict={predict}
                getCompletions={getCompletions}
                checkSpelling={checkSpelling}
                getSpellingSuggestions={getSpellingSuggestions}
                predictorReady={predictorReady}
                plsPhoneticFeatures={scoreData?.plsPhoneticFeatures || rhymeAstrology?.features || null}
                tokenWeights={scoreData?.tokenWeights || null}
                onContentChange={handleEditorContentChange}
                onTitleChange={handleEditorTitleChange}
                analyzedWords={analyzedWords}
                analyzedWordsByIdentity={analyzedWordsByIdentity}
                analyzedWordsByCharStart={analyzedWordsByCharStart}
                resonantCharStarts={resonantCharStarts}
                lineSyllableCounts={deepAnalysis?.lineSyllableCounts || []}
                highlightedLines={effectiveHighlightedLines}
                pinnedLines={pinnedLines}
                syntaxLayer={deepAnalysis?.syntaxSummary}
                theme={theme}
                onWordActivate={handleWordActivate}
                onCursorChange={setCursorPos}
                onSelectionTextChange={setEditorSelectionText}
                mirrored={mirrored}
                ideMode={ideMode}
                onFocus={handleIdeFocus}
                onBlur={handleIdeBlur}
              />
            </motion.div>
          )}

          {mobileActiveTab === 'SCROLLS' && (
            <motion.div
              key="scrolls"
              className="ide-mobile-panel-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <ScrollList
                scrolls={scrolls}
                activeScrollId={activeScrollId}
                onSelect={id => { handleSelectScroll(id); setMobileActiveTab('EDITOR'); }}
                onNewScroll={handleNewScroll}
              />
            </motion.div>
          )}

          {mobileActiveTab === 'ORACLE' && (
            <motion.div
              key="oracle"
              className="ide-mobile-panel-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <SearchPanel
                seedWord={lexiconSeedWord}
                selectedSchool={selectedSchool}
                contextLookup={resolveLexiconContext}
                onJumpToLine={line => {
                  editorRef.current?.jumpToLine?.(line);
                  setMobileActiveTab('EDITOR');
                }}
              />
            </motion.div>
          )}

          {mobileActiveTab === 'POWER' && (
            <motion.div
              key="power"
              className="ide-mobile-panel-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              {songStatsSlot}
            </motion.div>
          )}
        </main>

        <MobileBottomNav
          activeTab={mobileActiveTab}
          onTabChange={handleMobileTabChange}
          editorSubtitle={mobileActiveTab === 'EDITOR' ? editorSubtitle : undefined}
          hapticEnabled={settings?.hapticEnabled ?? false}
        />

        <MobileHexSheet
          isOpen={isHexSheetOpen}
          onClose={() => { haptic('dismiss'); setIsHexSheetOpen(false); }}
          isTruesight={isTruesight}
          onToggleTruesight={handleToggleTruesight}
          isLatticeGrid={isLatticeGrid}
          onToggleLatticeGrid={handleToggleLatticeGrid}
          isPredictive={isPredictive}
          onTogglePredictive={handleTogglePredictive}
          mirrored={mirrored}
          onToggleMirrored={handleToggleMirrored}
          analysisMode={analysisMode}
          onModeChange={handleModeChange}
          selectedSchool={selectedSchool}
          onSchoolChange={handleSchoolChange}
          schoolList={schoolList}
          hapticEnabled={settings?.hapticEnabled ?? false}
          onToggleHaptic={() => updateSettings({ hapticEnabled: !(settings?.hapticEnabled ?? false) })}
        />

        <MobileWordSheet
          isOpen={isWordSheetOpen}
          onClose={() => { haptic('dismiss'); setIsWordSheetOpen(false); }}
          word={tooltipState.token?.word || null}
          contextLine={tooltipContextLine}
          onTransmute={handleTransmute}
          sessionHistory={sessionWords}
          sessionIndex={sessionIndex}
          onSessionNavigate={handleSessionNavigate}
          hapticEnabled={settings?.hapticEnabled ?? false}
        />

        {commonUI}
      </div>
    );
  }

  /* ── DESKTOP RENDER ── */
  return (
    <div
      className={`ide-layout-wrapper${focusMode ? ' ide-layout-wrapper--focus' : ''}${compactMode ? ' ide-layout-wrapper--compact' : ''}`}
      data-reduced-motion={reducedMotionActive ? 'true' : 'false'}
      style={{
        '--ritual-abyss': ritualPalette.abyss,
        '--ritual-panel': ritualPalette.panel,
        '--ritual-parchment': ritualPalette.parchment,
        '--ritual-ink': ritualPalette.ink,
        '--ritual-primary': ritualPalette.primary,
        '--ritual-secondary': ritualPalette.secondary,
        '--ritual-tertiary': ritualPalette.tertiary,
        '--ritual-border': ritualPalette.border,
        '--ritual-glow': ritualPalette.glow,
        '--ritual-aurora-start': ritualPalette.aurora_start,
        '--ritual-aurora-end': ritualPalette.aurora_end,
        '--active-school-glow': ritualPalette.glow_40,
        '--ide-font-scale': fontScale,
      }}
    >
      <TopBar
        title={activeScroll?.title || (isEditable ? "New Scroll" : "Scholomance IDE")}
        onOpenSearch={() => setSidebarTab('SEARCH')}
        showMinimap={showOraclePanel}
        onToggleMinimap={() => setShowOraclePanel(!showOraclePanel)}
        isEditable={isEditable}
        activeScrollId={activeScrollId}
        onEdit={handleEditScroll}
        onNewScroll={handleNewScroll}
        progression={progression}
        auroraLevel={auroraLevel}
        onCycleAuroraLevel={cycleAuroraLevel}
        onSettingsClick={() => setSidebarTab('TOOLS')}
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode((v) => !v)}
      />
      <main className="ide-main-content">
        <IDEAmbientCanvas schoolColor={schoolColorHex} />
        <PanelGroup
          className="ide-panel-group"
          direction={isNarrowViewport ? "vertical" : "horizontal"}
        >
          {/* 1. Dedicated Activity Bar (Icons only, far left) */}
          <Panel
            defaultSize={isNarrowViewport ? 10 : 4}
            minSize={isNarrowViewport ? 8 : 4}
            maxSize={isNarrowViewport ? 15 : 6}
            className="activity-icons-col"
          >
            <div className="activity-bar-content">
              {['FILES', 'SEARCH', 'TOOLS'].map((tab) => {
                const Icon = tab === 'FILES' ? FolderIcon : tab === 'SEARCH' ? SearchIcon : ToolsIcon;
                return (
                  <button
                    key={tab}
                    className={`activity-item icon-only ${sidebarTab === tab ? 'active' : ''}`}
                    onClick={() => setSidebarTab(tab)}
                    title={tab}
                  >
                    <Icon size={28} />
                  </button>
                );
              })}
            </div>
            <div className="activity-bar-footer">
              <button
                className="activity-item icon-only"
                title="Settings"
                aria-label="Settings"
                onClick={() => setSidebarTab('TOOLS')}
              >
                <SettingsIcon size={24} />
              </button>
            </div>
          </Panel>

          <PanelResizeHandle className="sidebar-resize-handle" />

          {/* 2. Primary Sidebar (Labels + Content) */}
          <Panel
            defaultSize={isNarrowViewport ? 30 : 20}
            minSize={isNarrowViewport ? 20 : 15}
            className="ide-sidebar expandable-sidebar"
          >
            <div className="sidebar-combined-content">
              {/* Header labels area */}
              <div className="sidebar-labels-header">
                {['EXPLORER', 'ORACLE', 'HEX TOOLS'].map((label, i) => {
                  const tabs = ['FILES', 'SEARCH', 'TOOLS'];
                  return (
                    <button
                      key={label}
                      className={`sidebar-label-btn ${sidebarTab === tabs[i] ? 'active' : ''}`}
                      onClick={() => setSidebarTab(tabs[i])}
                    >
                      <span className="activity-label">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Main content area */}
              <div className="sidebar-body-content">
                {sidebarTab === 'FILES' && (
                  <ScrollList
                    scrolls={scrolls}
                    activeScrollId={activeScrollId}
                    onSelect={handleSelectScroll}
                    onDelete={deleteScroll}
                    onNewScroll={handleNewScroll}
                    onEdit={handleEditScrollById}
                  />
                )}
                {sidebarTab === 'SEARCH' && (
                  <SearchPanel
                    seedWord={lexiconSeedWord}
                    selectedSchool={selectedSchool}
                    contextLookup={resolveLexiconContext}
                    onJumpToLine={(line) => {
                      editorRef.current?.jumpToLine?.(line);
                    }}
                    variant="sidebar"
                  />
                )}
                {sidebarTab === 'TOOLS' && (
                  <div className="sidebar-tools">
                    <ControlConsole {...controlConsoleProps} />
                    {analysisMode === ANALYSIS_MODES.RHYME && (
                      <div className="sidebar-sub-panel">
                        <RhymeDiagramPanel
                          connections={overlayConnections}
                          lineCount={lineCount}
                          visible={true}
                          onPairSelect={(lines) => {
                            setPinnedLines(lines);
                            if (!lines) setHighlightedLines([]);
                            if (lines) editorRef.current?.scrollToTopSmooth?.();
                          }}
                          onConnectionClick={() => {
                            editorRef.current?.scrollToTopSmooth?.();
                          }}
                          highlightedLines={effectiveHighlightedLines}
                        />
                      </div>
                    )}
                    {analysisMode === ANALYSIS_MODES.VOWEL && (
                      <div className="sidebar-sub-panel">
                         <div className="vowel-family-placeholder">Vowel Analysis Offline</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="sidebar-resize-handle" />
          <Panel defaultSize={settings?.ideLayout?.length === 5 ? settings.ideLayout[3] : (settings?.ideLayout?.[2] ?? (isNarrowViewport ? undefined : 60))} minSize={isNarrowViewport ? "40%" : "30%"}>
            <div className="codex-workspace">
              <div className="document-container">
                {activeScrollId || isEditable ? (
                  <ScrollEditor
                    key={editorDocumentIdentity}
                    ref={editorRef}
                    documentIdentity={editorDocumentIdentity}
                    title={editorInitialTitle}
                    content={editorInitialContent}
                    onSave={handleSaveScroll}
                    onCancel={isEditing ? handleCancelEdit : undefined}
                    isEditable={isEditable}
                    disabled={false}
                    isTruesight={isTruesight}
                    isLatticeGrid={isLatticeGrid}
                    isPredictive={isPredictive}
                    predict={predict}
                    getCompletions={getCompletions}
                    checkSpelling={checkSpelling}
                    getSpellingSuggestions={getSpellingSuggestions}
                    predictorReady={predictorReady}
                    plsPhoneticFeatures={scoreData?.plsPhoneticFeatures || rhymeAstrology?.features || null}
                    tokenWeights={scoreData?.tokenWeights || null}
                    onContentChange={handleEditorContentChange}
                    onTitleChange={handleEditorTitleChange}
                    analyzedWords={analyzedWords}
                    analyzedWordsByIdentity={analyzedWordsByIdentity}
                    analyzedWordsByCharStart={analyzedWordsByCharStart}
                    resonantCharStarts={resonantCharStarts}
                    lineSyllableCounts={deepAnalysis?.lineSyllableCounts || []}
                    highlightedLines={effectiveHighlightedLines}
                    pinnedLines={pinnedLines}
                    syntaxLayer={deepAnalysis?.syntaxSummary}
                    theme={theme}
                    selectedSchool={selectedSchool}
                    onWordActivate={handleWordActivate}
                    onCursorChange={setCursorPos}
                    onSelectionTextChange={setEditorSelectionText}
                    mirrored={mirrored}
                    ideMode={ideMode}
                    onFocus={handleIdeFocus}
                    onBlur={handleIdeBlur}
                  />
                ) : (
                  <div className="scroll-placeholder">
                    <button type="button" className="btn btn-primary" onClick={handleNewScroll}>
                      Begin New Scroll
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Panel>
          {!isNarrowViewport && (
            <>
              <PanelResizeHandle className="sidebar-resize-handle" />
              <Panel 
                defaultSize={settings?.ideLayout?.length === 5 ? settings.ideLayout[4] : (settings?.ideLayout?.[3] ?? 25)}
                minSize={15} 
                collapsible={true} 
                className="ide-right-panel"
              >
                <div className="right-panel-container">
                  <div className="right-panel-scroll">
                    {metricsPanelVisible && (
                      <div className="right-panel-section">
                        <div className="right-panel-section-header">
                          <span className="right-panel-section-title">CODEx Metrics</span>
                          <button
                            type="button"
                            className="right-panel-close"
                            onClick={() => setShowScorePanel(false)}
                            aria-label="Close CODEx Metrics"
                          >×</button>
                        </div>
                        {songStatsSlot}
                      </div>
                    )}


                    {isAnalysisPanelVisible && (
                      <div className="right-panel-section">
                        <div className="right-panel-section-header">
                          <span className="right-panel-section-title">{analysisPanelTitle}</span>
                          <button
                            type="button"
                            className="right-panel-close"
                            onClick={() => handleModeChange(analysisMode)}
                            aria-label={analysisPanelCloseLabel}
                          >×</button>
                        </div>
                        {isAnalyzeMode ? (
                          <AnalyzePanel
                            initialQuery={currentLineText?.split(/\s+/)[0] || ''}
                            onCraftAction={handleAnalyzeCraft}
                            selection={editorSelectionText}
                            currentLineText={currentLineText}
                            scrollLines={scrollLines}
                            currentLineIndex={Math.max(0, cursorPos.line - 1)}
                            documentContext={truesightContent}
                          />
                        ) : (
                          <AnalysisPanel
                            scheme={schemeDetection}
                            meter={meterDetection}
                            statistics={deepAnalysis?.statistics}
                            literaryDevices={literaryDevices}
                            emotion={emotion}
                            genreProfile={genreProfile}
                            hhmSummary={deepAnalysis?.syntaxSummary?.hhm}
                            scoreData={scoreData}
                            rhymeAstrology={rhymeAstrology}
                            narrativeAMP={narrativeAMP}
                            oracle={oracle}
                            onGroupHover={highlightRhymeGroup}
                            onGroupLeave={clearHighlight}
                            infoBeamEnabled={infoBeamEnabled}
                            onInfoBeamToggle={() => setInfoBeamEnabled((prev) => !prev)}
                            onGroupClick={handleInfoBeamClick}
                            activeInfoBeamFamily={infoBeamFamily}
                            surfaceMode={isAstrologyMode ? "astrology" : "full"}
                            currentLineText={currentLineText}
                          />
                        )}
                      </div>
                    )}

                    {infoBeamEnabled && infoBeamFamily && (
                      <div className="right-panel-section">
                        <div className="right-panel-section-header">
                          <span className="right-panel-section-title">InfoBeam - Group {infoBeamFamily}</span>
                          <button
                            type="button"
                            className="right-panel-close"
                            onClick={() => setInfoBeamFamily(null)}
                            aria-label="Close InfoBeam"
                          >×</button>
                        </div>
                        <InfoBeamPanel
                          groupLabel={infoBeamFamily}
                          groupColor={patternColor(infoBeamFamily)}
                          connections={infoBeamConnections}
                          scrollLines={scrollLines}
                        />
                      </div>
                    )}

                    {showOraclePanel && (
                      <div className="right-panel-section">
                        <div className="right-panel-section-header">
                          <span className="right-panel-section-title">Lexicon Oracle</span>
                          <button
                            type="button"
                            className="right-panel-close"
                            onClick={() => setShowOraclePanel(false)}
                            aria-label="Close Lexicon Oracle"
                          >×</button>
                        </div>
                        <SearchPanel
                          seedWord={lexiconSeedWord}
                          selectedSchool={selectedSchool}
                          contextLookup={resolveLexiconContext}
                          onJumpToLine={(line) => {
                            editorRef.current?.jumpToLine?.(line);
                          }}
                          variant="rail"
                        />
                      </div>
                    )}

                    {showSpellcheckPanel && misspellings.length > 0 && (
                      <div className="right-panel-section">
                        <div className="right-panel-section-header">
                          <span className="right-panel-section-title">Spellcheck</span>
                          <button
                            type="button"
                            className="right-panel-close"
                            onClick={() => setShowSpellcheckPanel(false)}
                            aria-label="Close Spellcheck"
                          >×</button>
                        </div>
                        <div className="misspellings-list">
                          {misspellings.map((err, i) => (
                            <div key={i} className="misspelling-item">
                              <button
                                type="button"
                                className={`error-word${err.suggestions.length > 0 ? " error-word--interactive" : ""}`}
                                disabled={err.suggestions.length === 0}
                                onClick={() => applySpellcheckCorrection(err.word, err.suggestions[0])}
                                title={
                                  err.suggestions.length > 0
                                    ? `Replace "${err.word}" with "${err.suggestions[0]}"`
                                    : "No suggestions available"
                                }
                              >
                                {err.word}
                              </button>
                              <div className="error-suggestions">
                                {err.suggestions.map((s, j) => (
                                  <button
                                    key={j}
                                    className="btn-tiny"
                                    onClick={() => applySpellcheckCorrection(err.word, s)}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!showScorePanel && !isAnalysisPanelVisible && !(infoBeamEnabled && infoBeamFamily) && !showOraclePanel && !(showSpellcheckPanel && misspellings.length > 0) && (
                      <div className="right-panel-empty">
                        <div className="right-panel-empty-icon">⊘</div>
                        <p>Summon the Lexicon Oracle, Rhyme Astrology, or CODEx Metrics to project analysis here</p>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </main>

      <StatusBar
        line={cursorPos.line}
        col={cursorPos.col}
        language="Scroll Language"
        syllableCount={totalSyllables}
        analysisError={analysisError}
        serverAnalysisActive={USE_SERVER_ANALYSIS}
      />

      {focusMode && (
        <>
          <FocusModeButton variant="floating" active onToggle={() => setFocusMode(false)} />
          <AmbienceTray />
        </>
      )}

      {isPredictive && tooltipState.token && (
        <AnimatePresence>
          <RitualPredictionTooltip
            key="word-card"
            word={tooltipState.token.word}
            contextLine={tooltipContextLine}
            x={tooltipState.position.x}
            y={tooltipState.position.y}
            onClose={handleCloseTooltip}
            onTransmute={handleTransmute}
            sessionHistory={sessionWords}
            sessionIndex={sessionIndex}
            onSessionNavigate={handleSessionNavigate}
          />
        </AnimatePresence>
      )}

      {/* Floating panel fallback for narrow viewports only */}
      {isNarrowViewport && showOraclePanel && (
        <FloatingPanel
          id="lexicon-oracle-panel"
          title="Lexicon Oracle"
          onClose={() => setShowOraclePanel(false)}
          defaultX={window.innerWidth - 420}
          defaultY={88}
          defaultWidth={380}
          defaultHeight={520}
          minWidth={280}
          minHeight={240}
          maxWidth={560}
          maxHeight={760}
          zIndex={200}
          className="oracle-floating-panel"
        >
          <SearchPanel
            seedWord={lexiconSeedWord}
            selectedSchool={selectedSchool}
            contextLookup={resolveLexiconContext}
            onJumpToLine={(line) => {
              editorRef.current?.jumpToLine?.(line);
            }}
            variant="floating"
          />
        </FloatingPanel>
      )}

      {isNarrowViewport && isAnalysisPanelVisible && (
        <FloatingPanel
          id={isAstrologyMode ? "astrology-panel" : "analyze-panel"}
          title={analysisPanelTitle}
          onClose={() => handleModeChange(analysisMode)}
          defaultX={window.innerWidth - 360}
          defaultY={80}
          defaultWidth={340}
          defaultHeight={540}
          minWidth={280}
          minHeight={200}
          maxWidth={580}
          maxHeight={860}
        >
          {isAnalyzeMode ? (
            <AnalyzePanel
              initialQuery={currentLineText?.split(/\s+/)[0] || ''}
              onCraftAction={handleAnalyzeCraft}
              selection={editorSelectionText}
              currentLineText={currentLineText}
              scrollLines={scrollLines}
              currentLineIndex={Math.max(0, cursorPos.line - 1)}
              documentContext={truesightContent}
            />
          ) : (
            <AnalysisPanel
              scheme={schemeDetection}
              meter={meterDetection}
              statistics={deepAnalysis?.statistics}
              literaryDevices={literaryDevices}
              emotion={emotion}
              genreProfile={genreProfile}
              hhmSummary={deepAnalysis?.syntaxSummary?.hhm}
              scoreData={scoreData}
              rhymeAstrology={rhymeAstrology}
              narrativeAMP={narrativeAMP}
              oracle={oracle}
              onGroupHover={highlightRhymeGroup}
              onGroupLeave={clearHighlight}
              infoBeamEnabled={infoBeamEnabled}
              onInfoBeamToggle={() => setInfoBeamEnabled((prev) => !prev)}
              onGroupClick={handleInfoBeamClick}
              activeInfoBeamFamily={infoBeamFamily}
              surfaceMode={isAstrologyMode ? "astrology" : "full"}
              currentLineText={currentLineText}
            />
          )}
        </FloatingPanel>
      )}

      {isNarrowViewport && infoBeamEnabled && infoBeamFamily && (
        <FloatingPanel
          id="infobeam-panel"
          title={`InfoBeam - Group ${infoBeamFamily}`}
          onClose={() => setInfoBeamFamily(null)}
          defaultX={window.innerWidth - 720}
          defaultY={80}
          defaultWidth={320}
          defaultHeight={480}
          minWidth={220}
          minHeight={160}
          maxWidth={500}
          maxHeight={700}
          zIndex={150}
          className="infobeam-floating-panel"
        >
          <InfoBeamPanel
            groupLabel={infoBeamFamily}
            groupColor={patternColor(infoBeamFamily)}
            connections={infoBeamConnections}
            scrollLines={scrollLines}
          />
        </FloatingPanel>
      )}

      {isNarrowViewport && metricsPanelVisible && (
        <FloatingPanel
          id="score-panel"
          title="CODEx Metrics"
          className="codex-metrics-panel"
          onClose={() => setShowScorePanel(false)}
          defaultX={window.innerWidth - 340}
          defaultY={80}
          minWidth={260}
          minHeight={180}
          maxWidth={500}
          maxHeight={700}
        >
          {songStatsSlot}
        </FloatingPanel>
      )}

      {commonUI}
    </div>
  );
}
