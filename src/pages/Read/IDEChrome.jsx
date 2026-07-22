import { COMPOSE_FLAGS, useFeatureFlag } from '../../core/compose/flags';
import { ComposeScrollEditorToolbar } from '../../core/compose/migrated/ComposeScrollEditorToolbar';
import {
  ComposeReadTopBar,
  ComposeReadStatusBar,
} from '../../core/compose/migrated/ComposeReadChrome';
import { registerReadChromeMigration } from '../../core/compose/migrated/ReadChrome';
import DigitalRainText from '../../components/DigitalRainText.jsx';
import './IDE.css';
import './IDE.light-manuscript.css';
import FocusModeButton from './FocusModeButton.jsx';
import { ThemeToggle } from '../../components/Navigation/ThemeToggle.jsx';

registerReadChromeMigration();

// ─── MatrixTitle ──────────────────────────────────────────────────────────────

function MatrixTitle({ title }) {
  return (
    <DigitalRainText
      text={title}
      as="h1"
      className="ide-title"
      enableGlow
      animateOnMount={false}
    />
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
  // Proper cog silhouette — the previous icon was a hub + radial rays (reads as a sun),
  // which collided with ThemeToggle's sun/moon affordance.
  return (
    <Svg>
      <path d="M6.05 1.35h2.9l.28 1.28c.42.12.81.32 1.16.57l1.22-.48 1.45 2.51-1.02.88c.12.4.18.82.18 1.24s-.06.84-.18 1.24l1.02.88-1.45 2.51-1.22-.48a3.9 3.9 0 0 1-1.16.57l-.28 1.28H6.05l-.28-1.28a3.9 3.9 0 0 1-1.16-.57l-1.22.48-1.45-2.51 1.02-.88A3.9 3.9 0 0 1 2.78 7.5c0-.42.06-.84.18-1.24l-1.02-.88 1.45-2.51 1.22.48c.35-.25.74-.45 1.16-.57l.28-1.28Z" />
      <circle cx="7.5" cy="7.5" r="2.15" />
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
  const useComposeToolbar = useFeatureFlag(COMPOSE_FLAGS.MIGRATE_TOOLBAR);

  return (
    <ComposeReadTopBar
      identity={
        <>
          <span className="ide-logo"><ScrollIcon /></span>
          <MatrixTitle title={title} />
        </>
      }
      progression={
        progression && (
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
        )
      }
      actions={
        <>
          {useComposeToolbar ? (
            <ComposeScrollEditorToolbar
              includeWandOrnament={false}
              isEditable={isEditable}
              showMinimapControl={showMinimapControl}
              showSettingsControl={showSettingsControl}
              onEdit={onEdit}
              onNewScroll={onNewScroll}
              onToggleMinimap={onToggleMinimap}
              onOpenSearch={onOpenSearch}
              onCycleAuroraLevel={onCycleAuroraLevel}
              onToggleFocus={onToggleFocus}
              onSettingsClick={onSettingsClick}
            />
          ) : (
            <>
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
            </>
          )}
          <ThemeToggle className="ide-icon-btn" />
        </>
      }
    />
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

export function StatusBar({ line, col, language, syllableCount, analysisError, serverAnalysisActive }) {
  return (
    <ComposeReadStatusBar
      vitals={
        <>
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
        </>
      }
      position={
        <>
          <span className="status-item">{`Ln ${line}, Col ${col}`}</span>
          <span className="status-item">UTF-8</span>
          <span className="status-item">{language}</span>
        </>
      }
    />
  );
}
