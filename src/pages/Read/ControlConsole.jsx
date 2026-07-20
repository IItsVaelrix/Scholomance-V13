// @ts-check
import { useMemo } from 'react';
import { ANALYSIS_MODES } from '../../lib/truesight/compiler/analysisModes';
import {
  EyeIcon,
  SparkleIcon,
  MetricsIcon,
  AnalyzeIcon,
  AstrologyIcon,
  GridIcon,
  SymmetryIcon,
  LayersIcon,
  ZapIcon,
} from '../../components/Icons.jsx';
import GrimDesignPanel from './GrimDesignPanel.jsx';
import './IDE.css';
import './ControlConsole.css';

/**
 * Technical Control Console — the unified command surface for the Scribe.
 *
 * World-law: the Scribe is a technomancer's console. Every control is a real
 * lever on the analysis engine or the environment; nothing is decorative. The
 * panel is a deterministic state renderer — banks are derived from props, and
 * each control maps a data field → visual state.
 *
 * @typedef {Object} ControlConsoleProps
 * @property {boolean} isTruesight
 * @property {() => void} onToggleTruesight
 * @property {boolean} isLatticeGrid
 * @property {() => void} onToggleLatticeGrid
 * @property {boolean} mirrored
 * @property {() => void} onToggleMirrored
 * @property {boolean} isPredictive
 * @property {() => void} onTogglePredictive
 * @property {boolean} showScorePanel
 * @property {() => void} onToggleScorePanel
 * @property {string} analysisMode
 * @property {(mode: string) => void} onModeChange
 * @property {boolean} isAnalyzing
 * @property {boolean} predictorReady
 * @property {boolean} resonanceDegraded
 * @property {string} selectedSchool
 * @property {(schoolId: string) => void} onSchoolChange
 * @property {Array<{ id: string, glyph: string, name: string }>} schoolList
 * @property {number} auroraLevel
 * @property {(level: number) => void} onSetAurora
 * @property {boolean} focusMode
 * @property {() => void} onToggleFocus
 * @property {boolean} showOraclePanel
 * @property {() => void} onToggleOracle
 * @property {string} fontSize
 * @property {(size: string) => void} onFontSizeChange
 * @property {boolean} compactMode
 * @property {() => void} onToggleCompact
 * @property {boolean} reducedMotion
 * @property {() => void} onToggleReducedMotion
 * @property {boolean} hapticEnabled
 * @property {() => void} onToggleHaptic
 * @property {{ line: number, col: number, syllables: number, lines: number, power: number }} telemetry
 */

const AURORA_OPTIONS = [
  { id: 0, label: 'Off' },
  { id: 1, label: 'Dim' },
  { id: 2, label: 'Full' },
];

const FONT_SIZE_OPTIONS = [
  { id: 'small', label: 'S' },
  { id: 'medium', label: 'M' },
  { id: 'large', label: 'L' },
];

/** @param {ControlConsoleProps} props */
export default function ControlConsole(props) {
  const {
    isTruesight, onToggleTruesight,
    isLatticeGrid, onToggleLatticeGrid,
    mirrored, onToggleMirrored,
    isPredictive, onTogglePredictive,
    showScorePanel, onToggleScorePanel,
    analysisMode, onModeChange, isAnalyzing,
    predictorReady, resonanceDegraded,
    selectedSchool, onSchoolChange, schoolList,
    auroraLevel, onSetAurora,
    focusMode, onToggleFocus,
    showOraclePanel, onToggleOracle,
    fontSize, onFontSizeChange,
    compactMode, onToggleCompact,
    reducedMotion, onToggleReducedMotion,
    hapticEnabled, onToggleHaptic,
    telemetry,
  } = props;

  // Derive the panel structure from state. Keeping this as data (not JSX)
  // enforces the JSON-to-UI mapping law and keeps the render deterministic.
  const banks = useMemo(() => ([
    {
      id: 'optics',
      label: 'Optics',
      glyph: '◈',
      controls: [
        { kind: 'toggle', id: 'truesight', label: 'Truesight', hint: 'Reveal phonemic coloring', icon: EyeIcon, value: isTruesight, onToggle: onToggleTruesight },
        { kind: 'toggle', id: 'lattice', label: 'Word Tooltip', hint: isTruesight ? 'Per-word annotation grid' : 'Requires Truesight', icon: GridIcon, value: isLatticeGrid, onToggle: onToggleLatticeGrid, disabled: !isTruesight },
        { kind: 'toggle', id: 'mirror', label: 'Symmetrical', hint: 'Mirror the working', icon: SymmetryIcon, value: mirrored, onToggle: onToggleMirrored },
        { kind: 'toggle', id: 'predict', label: 'Ritual Prediction', hint: predictorReady ? 'Predictive completions' : 'Predictor warming…', icon: SparkleIcon, value: isPredictive, onToggle: onTogglePredictive },
        { kind: 'toggle', id: 'metrics', label: 'CODEx Metrics', hint: 'Score instrument panel', icon: MetricsIcon, value: showScorePanel, onToggle: onToggleScorePanel },
      ],
    },
    {
      id: 'engine',
      label: 'Analysis Engine',
      glyph: '⊕',
      controls: [
        {
          kind: 'segmented',
          id: 'mode',
          label: 'Mode',
          value: analysisMode,
          options: [
            { id: ANALYSIS_MODES.NONE, label: 'Idle' },
            { id: ANALYSIS_MODES.ASTROLOGY, label: 'Astrology', icon: AstrologyIcon },
            { id: ANALYSIS_MODES.ANALYZE, label: 'Leximancy', icon: AnalyzeIcon },
          ],
          onSelect: onModeChange,
        },
        { kind: 'readout', id: 'engine-status', label: 'Engine', value: isAnalyzing ? 'Channeling' : 'Idle', tone: isAnalyzing ? 'active' : 'neutral', live: isAnalyzing },
        { kind: 'readout', id: 'predictor-status', label: 'Predictor', value: predictorReady ? 'Ready' : 'Warming', tone: predictorReady ? 'ok' : 'warn' },
        { kind: 'readout', id: 'resonance-status', label: 'Resonance', value: resonanceDegraded ? 'Offline' : 'Online', tone: resonanceDegraded ? 'warn' : 'ok' },
      ],
    },
    {
      id: 'skin',
      label: 'Resonance Skin',
      glyph: '◇',
      controls: [
        { kind: 'school', id: 'school', label: 'School', value: selectedSchool, options: schoolList, onSelect: onSchoolChange },
      ],
    },
    {
      id: 'environment',
      label: 'Environment',
      glyph: '⋈',
      controls: [
        { kind: 'segmented', id: 'aurora', label: 'Aurora', value: auroraLevel, options: AURORA_OPTIONS, onSelect: onSetAurora },
        { kind: 'toggle', id: 'focus', label: 'Focus Mode', hint: 'Silence the chrome', icon: LayersIcon, value: focusMode, onToggle: onToggleFocus },
        { kind: 'toggle', id: 'oracle', label: 'Lexicon Oracle', hint: 'Dock the oracle panel', icon: ZapIcon, value: showOraclePanel, onToggle: onToggleOracle },
      ],
    },
    {
      id: 'system',
      label: 'System',
      glyph: '⚙',
      controls: [
        { kind: 'segmented', id: 'font', label: 'Glyph Scale', value: fontSize, options: FONT_SIZE_OPTIONS, onSelect: onFontSizeChange },
        { kind: 'toggle', id: 'compact', label: 'Compact Density', hint: 'Tighten the console', icon: GridIcon, value: compactMode, onToggle: onToggleCompact },
        { kind: 'toggle', id: 'reduced', label: 'Reduced Motion', hint: 'Still the arcane light', icon: LayersIcon, value: reducedMotion, onToggle: onToggleReducedMotion },
        { kind: 'toggle', id: 'haptic', label: 'Haptics', hint: 'Physical feedback', icon: ZapIcon, value: hapticEnabled, onToggle: onToggleHaptic },
      ],
    },
  ]), [
    isTruesight, onToggleTruesight, isLatticeGrid, onToggleLatticeGrid,
    mirrored, onToggleMirrored, isPredictive, onTogglePredictive,
    showScorePanel, onToggleScorePanel, analysisMode, onModeChange,
    isAnalyzing, predictorReady, resonanceDegraded, selectedSchool,
    onSchoolChange, schoolList, auroraLevel, onSetAurora, focusMode,
    onToggleFocus, showOraclePanel, onToggleOracle, fontSize, onFontSizeChange,
    compactMode, onToggleCompact, reducedMotion, onToggleReducedMotion,
    hapticEnabled, onToggleHaptic,
  ]);

  const telemetryItems = [
    { id: 'cursor', label: 'Cursor', value: `${telemetry.line}:${telemetry.col}` },
    { id: 'syllables', label: 'Syllables', value: telemetry.syllables },
    { id: 'lines', label: 'Lines', value: telemetry.lines },
    { id: 'power', label: 'Power', value: telemetry.power },
  ];

  return (
    <section className="control-console" aria-label="Technical control console">
      <header className="console-masthead">
        <span className="console-masthead-glyph" aria-hidden="true">⟡</span>
        <span className="console-masthead-title">Control Console</span>
        <span className={`console-masthead-pulse${isAnalyzing ? ' is-active' : ''}`} aria-hidden="true" />
      </header>

      {banks.map((bank) => (
        <ConsoleBank key={bank.id} bank={bank} />
      ))}

      <footer className="console-telemetry" aria-label="Live telemetry">
        <span className="console-telemetry-title" aria-hidden="true">Telemetry</span>
        <dl className="console-telemetry-grid">
          {telemetryItems.map((item) => (
            <div className="console-telemetry-cell" key={item.id}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </footer>

      {import.meta.env.DEV && <GrimDesignPanel />}
    </section>
  );
}

/** @param {{ bank: any }} props */
function ConsoleBank({ bank }) {
  const headingId = `console-bank-${bank.id}`;
  return (
    <div className="console-bank" role="group" aria-labelledby={headingId}>
      <h3 className="console-bank-title" id={headingId}>
        <span className="console-bank-glyph" aria-hidden="true">{bank.glyph}</span>
        {bank.label}
      </h3>
      <div className="console-bank-body">
        {bank.controls.map((control) => {
          switch (control.kind) {
            case 'toggle':
              return <ConsoleToggle key={control.id} control={control} />;
            case 'segmented':
              return <ConsoleSegmented key={control.id} control={control} />;
            case 'school':
              return <ConsoleSchoolSelect key={control.id} control={control} />;
            case 'readout':
              return <ConsoleReadout key={control.id} control={control} />;
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

/** @param {{ control: any }} props */
function ConsoleToggle({ control }) {
  const Icon = control.icon;
  return (
    <button
      type="button"
      className={`console-toggle${control.value ? ' is-on' : ''}`}
      aria-pressed={control.value}
      disabled={control.disabled}
      onClick={control.disabled ? undefined : control.onToggle}
      title={control.hint}
    >
      <span className="console-toggle-icon" aria-hidden="true">{Icon ? <Icon /> : null}</span>
      <span className="console-toggle-text">
        <span className="console-toggle-label">{control.label}</span>
        {control.hint && <span className="console-toggle-hint">{control.hint}</span>}
      </span>
      <span className={`console-led${control.value ? ' is-on' : ''}`} aria-hidden="true" />
    </button>
  );
}

/** @param {{ control: any }} props */
function ConsoleSegmented({ control }) {
  const groupLabel = `${control.label} selector`;
  return (
    <div className="console-row console-row--segmented">
      <span className="console-row-label">{control.label}</span>
      <div className="console-segmented" role="group" aria-label={groupLabel}>
        {control.options.map((opt) => {
          const OptIcon = opt.icon;
          const active = control.value === opt.id;
          return (
            <button
              key={String(opt.id)}
              type="button"
              className={`console-seg${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={active ? undefined : () => control.onSelect(opt.id)}
              title={opt.label}
            >
              {OptIcon && <span className="console-seg-icon" aria-hidden="true"><OptIcon /></span>}
              <span className="console-seg-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** @param {{ control: any }} props */
function ConsoleSchoolSelect({ control }) {
  const selectId = `console-${control.id}-select`;
  return (
    <div className="console-row console-row--school">
      <label className="console-row-label" htmlFor={selectId}>{control.label}</label>
      <div className="console-school-field">
        <span className="console-school-orb" aria-hidden="true" />
        <select
          id={selectId}
          className="console-school-select"
          value={control.value}
          onChange={(e) => control.onSelect(e.target.value)}
        >
          {control.options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.glyph} {opt.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** @param {{ control: any }} props */
function ConsoleReadout({ control }) {
  return (
    <div className={`console-readout console-readout--${control.tone || 'neutral'}`}>
      <span className="console-readout-label">{control.label}</span>
      <span className="console-readout-value">
        {control.live && <span className="console-readout-live" aria-hidden="true" />}
        {control.value}
      </span>
    </div>
  );
}
