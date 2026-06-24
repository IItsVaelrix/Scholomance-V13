import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { freshRng } from '../../lib/math/seededRng.js';
import './IDE.css';
import FocusModeButton from './FocusModeButton.jsx';

// ─── MatrixTitle ──────────────────────────────────────────────────────────────

const MATRIX_CHARS = '001101011010|/\\#+=~';
const GLOW_VARIANTS = ['glow-cyan', 'glow-gold', 'glow-iridescent', 'glow-spark', 'glow-ethereal', 'glow-ember'];
const GLOW_DURATIONS = {
  'glow-cyan': 1200,
  'glow-gold': 1800,
  'glow-iridescent': 2400,
  'glow-spark': 700,
  'glow-ethereal': 2000,
  'glow-ember': 1600,
};

function randMatrixChar() {
  const rng = freshRng();
  return MATRIX_CHARS[Math.floor(rng() * MATRIX_CHARS.length)];
}

function MatrixTitle({ title }) {
  const reduceMotion = usePrefersReducedMotion();
  // null = render plain text; array = render animated slots
  const [slots, setSlots] = useState(null);
  const [glowClass, setGlowClass] = useState('');

  const prevTitleRef = useRef(String(title || ''));
  const isInitialRef = useRef(true);
  const cycleIds = useRef([]);
  const settleIds = useRef([]);
  const fullSettleId = useRef(null);
  const glowTimer = useRef(null);
  const glowClear = useRef(null);

  const scheduleGlow = useCallback(() => {
    const rng = freshRng();
    const delay = 15000 + rng() * 30000;
    glowTimer.current = setTimeout(() => {
      const variant = GLOW_VARIANTS[Math.floor(rng() * GLOW_VARIANTS.length)];
      setGlowClass(`ide-title--${variant}`);
      glowClear.current = setTimeout(() => {
        setGlowClass('');
        scheduleGlow();
      }, GLOW_DURATIONS[variant] + 120);
    }, delay);
  }, []);

  useEffect(() => {
    if (!reduceMotion) scheduleGlow();
    return () => {
      clearTimeout(glowTimer.current);
      clearTimeout(glowClear.current);
    };
  }, [scheduleGlow, reduceMotion]);

  useEffect(() => {
    const str = String(title || '');

    if (isInitialRef.current) {
      isInitialRef.current = false;
      prevTitleRef.current = str;
      setSlots(null);
      return;
    }

    if (str === prevTitleRef.current) return;
    prevTitleRef.current = str;

    cycleIds.current.forEach(clearInterval);
    settleIds.current.forEach(clearTimeout);
    clearTimeout(fullSettleId.current);
    cycleIds.current = [];
    settleIds.current = [];

    if (!str || reduceMotion) {
      setSlots(null);
      return;
    }

    const chars = str.split('');
    setSlots(chars.map(() => ({ char: randMatrixChar(), state: 'cycling' })));

    chars.forEach((targetChar, i) => {
      const cId = setInterval(() => {
        setSlots(prev => {
          if (!Array.isArray(prev) || !prev[i] || prev[i].state !== 'cycling') return prev;
          const copy = [...prev];
          copy[i] = { char: randMatrixChar(), state: 'cycling' };
          return copy;
        });
      }, 45);
      cycleIds.current[i] = cId;

      const rng = freshRng();
      const delay = 80 + i * 55 + rng() * 20;
      const sId = setTimeout(() => {
        clearInterval(cycleIds.current[i]);
        setSlots(prev => {
          if (!Array.isArray(prev)) return prev;
          const copy = [...prev];
          if (copy[i]) copy[i] = { char: targetChar === ' ' ? ' ' : targetChar, state: 'settled' };
          return copy;
        });
      }, delay);
      settleIds.current[i] = sId;
    });

    // Switch back to plain text after last char settles + settle animation plays out
    const lastSettleAt = 80 + (chars.length - 1) * 55 + 20;
    fullSettleId.current = setTimeout(() => setSlots(null), lastSettleAt + 620);

    return () => {
      cycleIds.current.forEach(clearInterval);
      settleIds.current.forEach(clearTimeout);
      clearTimeout(fullSettleId.current);
    };
  }, [title, reduceMotion]);

  const str = String(title || '');

  return (
    <h1
      className={`ide-title${glowClass ? ` ${glowClass}` : ''}`}
      aria-label={str}
    >
      {slots !== null
        ? slots.map((slot, i) => (
            <span key={i} className={`ide-title-char ide-title-char--${slot.state}`} aria-hidden="true">
              {slot.char}
            </span>
          ))
        : (str || null)}
    </h1>
  );
}

// ─── SVG Icon Primitives ──────────────────────────────────────────────────────

function Svg({ children }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 15 15"
      fill="none" stroke="currentColor"
      strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ScrollIcon() {
  return (
    <Svg>
      <path d="M3 1.5h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
      <line x1="5"  y1="5"   x2="10" y2="5"   />
      <line x1="5"  y1="7.5" x2="10" y2="7.5" />
      <line x1="5"  y1="10"  x2="8"  y2="10"  />
    </Svg>
  );
}

function EditIcon() {
  return (
    <Svg>
      <path d="M9.5 2 L13 5.5 L6 12.5 H2.5 V9 L9.5 2Z" />
      <line x1="8" y1="3.5" x2="11.5" y2="7" />
    </Svg>
  );
}

function NewIcon() {
  return (
    <Svg>
      <line x1="7.5" y1="2" x2="7.5" y2="13" />
      <line x1="2" y1="7.5" x2="13" y2="7.5" />
    </Svg>
  );
}

function MapIcon() {
  return (
    <Svg>
      <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" />
      <rect x="8.5" y="1.5" width="5" height="5" rx="0.5" />
      <rect x="1.5" y="8.5" width="5" height="5" rx="0.5" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="0.5" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg>
      <circle cx="6"   cy="6"   r="4.5" />
      <line   x1="9.5" y1="9.5" x2="13.5" y2="13.5" />
    </Svg>
  );
}

function GearIcon() {
  return (
    <Svg>
      <circle cx="7.5" cy="7.5" r="2.2" />
      <line x1="7.5"  y1="1.5"  x2="7.5"  y2="3.2"  />
      <line x1="7.5"  y1="11.8" x2="7.5"  y2="13.5" />
      <line x1="1.5"  y1="7.5"  x2="3.2"  y2="7.5"  />
      <line x1="11.8" y1="7.5"  x2="13.5" y2="7.5"  />
      <line x1="3.3"  y1="3.3"  x2="4.4"  y2="4.4"  />
      <line x1="10.6" y1="10.6" x2="11.7" y2="11.7" />
      <line x1="11.7" y1="3.3"  x2="10.6" y2="4.4"  />
      <line x1="4.4"  y1="10.6" x2="3.3"  y2="11.7" />
    </Svg>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

const AURORA_LABELS = ['◉ ATMOS', '◇ ATMOS', '◈ ATMOS'];
const AURORA_TITLES = ['Aurora: Off', 'Aurora: Dim', 'Aurora: Full'];

export function TopBar({
  title,
  onOpenSearch,
  showMinimap,
  onToggleMinimap,
  isEditable,
  activeScrollId,
  onEdit,
  onNewScroll,
  progression,
  auroraLevel = 2,
  onCycleAuroraLevel,
  onSettingsClick,
  focusMode,
  onToggleFocus,
  showMinimapControl = true,
  showSettingsControl = true,
}) {
  return (
    <div className="ide-topbar">
      <div className="ide-topbar-left">
        <span className="ide-logo"><ScrollIcon /></span>
        <MatrixTitle title={title} />
      </div>

      <div className="ide-topbar-center">
        {progression && (
          <div className="topbar-progression">
            <span className="progression-label">
              Level {Math.floor(progression.xp / 1000) + 1}
            </span>
            <div className="progression-bar-mini">
              <div
                className="progression-fill-mini"
                style={{ width: `${(progression.xp % 1000) / 10}%` }}
              />
            </div>
            <span className="progression-xp">{progression.xp} XP</span>
          </div>
        )}
      </div>

      <div className="ide-topbar-right">
        {!isEditable && onEdit && (
          <button className="ide-icon-btn" title="Edit Scroll" onClick={onEdit} aria-label="Edit Scroll">
            <EditIcon />
          </button>
        )}
        {!isEditable && onNewScroll && (
          <button className="ide-icon-btn" title="New Scroll" onClick={onNewScroll} aria-label="New Scroll">
            <NewIcon />
          </button>
        )}
        {showMinimapControl && (
          <button
            className={`ide-icon-btn ${showMinimap ? 'active' : ''}`}
            title="Toggle Lexicon Oracle"
            aria-label="Toggle Lexicon Oracle"
            onClick={onToggleMinimap}
          >
            <MapIcon />
          </button>
        )}
        <button
          className="ide-icon-btn"
          title="Open Oracle Search (Ctrl+F)"
          aria-label="Open Oracle Search"
          onClick={onOpenSearch}
        >
          <SearchIcon />
        </button>
        {onCycleAuroraLevel && (
          <button
            className={`ide-icon-btn ide-atmos-btn ide-atmos-btn--level-${auroraLevel}`}
            title={AURORA_TITLES[auroraLevel]}
            aria-label={AURORA_TITLES[auroraLevel]}
            aria-pressed={auroraLevel > 0}
            onClick={onCycleAuroraLevel}
          >
            {AURORA_LABELS[auroraLevel]}
          </button>
        )}
        <FocusModeButton variant="bar" active={focusMode} onToggle={onToggleFocus} />
        {showSettingsControl && (
          <button className="ide-icon-btn" title="Settings" aria-label="Settings" onClick={onSettingsClick}>
            <GearIcon />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

export function StatusBar({ line, col, language, syllableCount, analysisError, serverAnalysisActive }) {
  return (
    <div className="ide-statusbar">
      <div className="ide-statusbar-left">
        <span className={`status-item${analysisError ? ' status-item--offline' : ''}`}>
          <span className="status-ready-dot" aria-hidden="true" />
          {analysisError ? 'Analysis Offline' : 'Ready'}
        </span>
        {serverAnalysisActive && (
          <span className="status-item status-item--server">
            Server Synthesis
          </span>
        )}
        {syllableCount !== undefined && (
          <span className="status-item syllable-status">
            Syllables: <span className="syllable-count-value">{syllableCount}</span>
          </span>
        )}
      </div>
      <div className="ide-statusbar-right">
        <span className="status-item">{`Ln ${line}, Col ${col}`}</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">{language}</span>
      </div>
    </div>
  );
}
