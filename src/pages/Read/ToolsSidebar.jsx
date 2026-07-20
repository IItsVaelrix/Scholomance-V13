// @ts-check
import { ANALYSIS_MODES } from '../../lib/truesight/compiler/analysisModes';
import { EyeIcon, SparkleIcon, MetricsIcon, AnalyzeIcon, AstrologyIcon } from '../../components/Icons.jsx';
import GrimDesignPanel from './GrimDesignPanel.jsx';
import './IDE.css';

/**
 * @typedef {{
 *   isTruesight: boolean,
 *   onToggleTruesight: () => void,
 *   isLatticeGrid: boolean,
 *   onToggleLatticeGrid: () => void,
 *   isPredictive: boolean,
 *   onTogglePredictive: () => void,
 *   mirrored: boolean,
 *   onToggleMirrored: () => void,
 *   analysisMode: string,
 *   onModeChange: (mode: string) => void,
 *   isAnalyzing: boolean,
 *   showScorePanel: boolean,
 *   onToggleScorePanel: () => void,
 *   selectedSchool: string,
 *   onSchoolChange: (schoolId: string) => void,
 *   schoolList: Array<{ id: string, glyph: string, name: string }>,
 * }} ToolsSidebarProps
 */

// ─── ToolsSidebar ─────────────────────────────────────────────────────────────

/** @param {ToolsSidebarProps} props */
export default function ToolsSidebar({
  isTruesight,
  onToggleTruesight,
  isLatticeGrid,
  onToggleLatticeGrid,
  isPredictive,
  onTogglePredictive,
  mirrored,
  onToggleMirrored,
  analysisMode,
  onModeChange,
  isAnalyzing,
  showScorePanel,
  onToggleScorePanel,
  selectedSchool,
  onSchoolChange,
  schoolList,
}) {
  return (
    <div className="tools-sidebar">

      {/* ── Visual Skin ── */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          <span className="sidebar-section-glyph" aria-hidden="true">◈</span>
          Visual Skin
        </h3>
        <select
          className="school-dropdown-sidebar"
          value={selectedSchool}
          onChange={(e) => onSchoolChange(e.target.value)}
          aria-label="Select school color skin"
        >
          {schoolList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.glyph} {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Core Analysis ── */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          <span className="sidebar-section-glyph" aria-hidden="true">⊕</span>
          Core Analysis
        </h3>
        <button
          type="button"
          className={`sidebar-tool-btn ${isTruesight ? 'active' : ''}`}
          aria-pressed={isTruesight}
          onClick={onToggleTruesight}
        >
          <span className="tool-icon"><EyeIcon /></span>
          <span className="tool-label">Truesight</span>
          <span className={`status-dot ${isTruesight ? 'on' : 'off'}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sidebar-tool-btn ${isLatticeGrid ? 'active' : ''}`}
          aria-pressed={isLatticeGrid}
          onClick={isTruesight ? onToggleLatticeGrid : undefined}
          disabled={!isTruesight}
          title={isTruesight ? 'Toggle annotation grid overlay' : 'Truesight must be enabled first'}
        >
          <span className="tool-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </span>
          <span className="tool-label">WordToolTip</span>
          <span className={`status-dot ${isLatticeGrid ? 'on' : 'off'}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sidebar-tool-btn ${mirrored ? 'active' : ''}`}
          aria-pressed={mirrored}
          onClick={onToggleMirrored}
        >
          <span className="tool-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <path d="M12 3v18" />
              <path d="M5 8l-2 2 2 2" />
              <path d="M19 8l2 2-2 2" />
              <path d="M3 10h18" />
            </svg>
          </span>
          <span className="tool-label">Symmetrical</span>
          <span className={`status-dot ${mirrored ? 'on' : 'off'}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sidebar-tool-btn ${isPredictive ? 'active' : ''}`}
          aria-pressed={isPredictive}
          onClick={onTogglePredictive}
        >
          <span className="tool-icon"><SparkleIcon /></span>
          <span className="tool-label">Ritual Prediction</span>
          <span className={`status-dot ${isPredictive ? 'on' : 'off'}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sidebar-tool-btn ${showScorePanel ? 'active' : ''}`}
          aria-pressed={showScorePanel}
          onClick={onToggleScorePanel}
        >
          <span className="tool-icon"><MetricsIcon /></span>
          <span className="tool-label">CODEx Metrics</span>
          <span className={`status-dot ${showScorePanel ? 'on' : 'off'}`} aria-hidden="true" />
        </button>
      </div>

      {/* ── Modes ── */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          <span className="sidebar-section-glyph" aria-hidden="true">⋈</span>
          Modes
        </h3>
        <button
          className={`sidebar-tool-btn ${analysisMode === ANALYSIS_MODES.ASTROLOGY ? 'active' : ''}`}
          onClick={() => onModeChange(ANALYSIS_MODES.ASTROLOGY)}
        >
          <span className="tool-icon"><AstrologyIcon /></span>
          <span className="tool-label">Rhyme Astrology</span>
        </button>
        <button
          className={`sidebar-tool-btn ${analysisMode === ANALYSIS_MODES.ANALYZE ? 'active' : ''}`}
          onClick={() => onModeChange(ANALYSIS_MODES.ANALYZE)}
        >
          <span className="tool-icon"><AnalyzeIcon /></span>
          <span className="tool-label">Leximancy</span>
        </button>
      </div>

      {isAnalyzing && (
        <div className="sidebar-footer">
          <div className="analyzing-indicator">
            <span className="analyzing-spinner" aria-hidden="true" />
            Analyzing...
          </div>
        </div>
      )}

      {/* ── GrimDesign — dev-only ──
          A design/authoring surface, not a reader feature. `import.meta.env.DEV` is
          statically false in a production build, so this branch and the panel's import
          are dropped there rather than shipped hidden. */}
      {import.meta.env.DEV && <GrimDesignPanel />}

    </div>
  );
}
