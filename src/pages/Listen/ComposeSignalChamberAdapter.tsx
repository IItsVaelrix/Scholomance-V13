import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SCHOOLS, generateSchoolColor } from '../../data/schools';
import {
  createSignalChamberScene,
  assertSignalChamberReferenceIntegrity,
} from '../../core/compose/kits/signalChamber.compose.js';
import { SignalChamberConsole } from './SignalChamberConsole';
import { MagicNamePlate } from './MagicNamePlate';
import { OutputDeviceSelector } from './OutputDeviceSelector';
import { ScholoCandy } from '../../components/ParaEQ/ScholoCandy';
import { triggerHapticPulse, UI_HAPTICS } from '../../lib/platform/haptics';

export interface ComposeSignalChamberAdapterProps {
  currentSchoolId?: string;
  isPlaying?: boolean;
  isTuning?: boolean;
  signalLevel?: number;
  volume?: number;
  entropyLevel?: number;
  outputDevices?: any[];
  sinkId?: string;
  onTogglePlayPause?: () => void;
  onTuneToSchool?: (schoolId: string) => void;
  onSetVolume?: (volume: number) => void;
  onSetOutputDevice?: (deviceId: string) => void;
  onOrbClick?: () => void;
  getByteFrequencyData?: (array: Uint8Array) => void;
  getEqNodes?: () => any;
  setEqBands?: (bands: any) => void;
  updateOutputDevices?: () => void;
  detectedSchoolId?: string;
}

export function ComposeSignalChamberAdapter({
  currentSchoolId = 'SONIC',
  isPlaying = false,
  isTuning = false,
  signalLevel = 0,
  volume = 0.8,
  entropyLevel = 0,
  outputDevices = [],
  sinkId = '',
  onTogglePlayPause,
  onTuneToSchool,
  onSetVolume,
  onSetOutputDevice,
  onOrbClick,
  getByteFrequencyData,
  getEqNodes,
  setEqBands,
  updateOutputDevices,
  detectedSchoolId,
}: ComposeSignalChamberAdapterProps) {
  const scene = useMemo(() => {
    try {
      const s = createSignalChamberScene();
      assertSignalChamberReferenceIntegrity(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  const activeStation = useMemo(() => {
    const id = currentSchoolId || 'SONIC';
    const school =
      (SCHOOLS as any)[id] ||
      Object.values(SCHOOLS)[0] || { name: 'SONIC RESONANCE', baseFrequency: 432 };
    return { ...school, id, color: generateSchoolColor(id) };
  }, [currentSchoolId]);

  // Exponential Moving Average (EMA) smoothing for jitter-free visual rendering
  const [smoothedSignal, setSmoothedSignal] = useState(signalLevel);

  useEffect(() => {
    setSmoothedSignal(signalLevel);

    let animationFrameId: number;
    let current = signalLevel;

    const smoothStep = () => {
      // Smooth 12% interpolation factor per frame for silky dynamics without jitter
      const diff = signalLevel - current;
      if (Math.abs(diff) > 0.001) {
        current = current + diff * 0.12;
        setSmoothedSignal(current);
        animationFrameId = requestAnimationFrame(smoothStep);
      }
    };

    animationFrameId = requestAnimationFrame(smoothStep);
    return () => cancelAnimationFrame(animationFrameId);
  }, [signalLevel]);

  // Safe wrapper around WebAudio getByteFrequencyData to prevent playback runtime errors
  const safeGetByteFrequencyData = useMemo(() => {
    if (!getByteFrequencyData) return undefined;
    return (array: Uint8Array) => {
      try {
        getByteFrequencyData(array);
      } catch {
        // Suppress transient audio context recovery errors
      }
    };
  }, [getByteFrequencyData]);

  // Phoneme density warning with hysteresis to prevent flickering
  const [phonemeWarning, setPhonemeWarning] = useState(false);
  useEffect(() => {
    if (smoothedSignal > 0.75) {
      setPhonemeWarning(true);
    } else if (smoothedSignal < 0.68) {
      setPhonemeWarning(false);
    }
  }, [smoothedSignal]);

  // Calculate dynamic compressor values using smoothed signal level
  const gainReductionDb = useMemo(() => {
    if (smoothedSignal <= 0.75) return 0;
    return -((smoothedSignal - 0.75) * 40);
  }, [smoothedSignal]);

  const compressorRatio = useMemo(() => {
    if (smoothedSignal >= 0.75) return '∞:1 HARD LIMIT';
    if (smoothedSignal >= 0.50) return '4:1 COMPRESSING';
    return '1:1 LINEAR';
  }, [smoothedSignal]);

  const compressorStatus = useMemo(() => {
    if (smoothedSignal >= 0.75) return 'LIMITING';
    if (smoothedSignal >= 0.50) return 'ATTENUATING';
    return 'NORMAL';
  }, [smoothedSignal]);

  const sidebarProps = {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.3 },
  };

  const apertureOptions = [
    { id: 'SONIC', label: 'OSCILLOSCOPE', icon: 'waves' },
    { id: 'ALCHEMY', label: 'ALCHEMICAL', icon: 'science' },
    { id: 'WILL', label: 'RESONANCE', icon: 'auto_graph' },
    { id: 'PSYCHIC', label: 'VORTEX', icon: 'cyclone' },
    { id: 'VOID', label: 'NULL_VOID', icon: 'blur_on' },
  ];

  return (
    <div
      className="view-layer view-layer--compose"
      data-compose-kind="signal-chamber-shell"
      data-compose-school={currentSchoolId}
      data-compose-scene-id={scene?.id || 'listen-signal-chamber-ui-kit'}
      role="main"
      aria-label="Scholomance Signal Chamber"
    >
      {/* Left Sidebar: Aperture Rail */}
      <motion.aside
        className="hud-sidebar hud-sidebar--left"
        data-compose-part="apertureRail"
        data-compose-kind="aperture-rail"
        aria-label="Aperture analysis modes"
        {...sidebarProps}
      >
        <div className="sidebar-header">
          <h3>APERTURE</h3>
          <p>SIGNAL_PATH_04</p>
        </div>

        <nav className="sidebar-menu" role="tablist">
          {apertureOptions.map((opt) => {
            const isSelected = currentSchoolId === opt.id;
            return (
              <button
                key={opt.id}
                className={`menu-item ${isSelected ? 'active' : ''}`}
                data-compose-kind="aperture-option"
                data-compose-selected={isSelected}
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  triggerHapticPulse(UI_HAPTICS.LIGHT);
                  onTuneToSchool?.(opt.id);
                }}
              >
                <span className="material-symbols-outlined">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </nav>
      </motion.aside>

      {/* Center: Resonance Core Console */}
      <main
        className="hud-center"
        data-compose-part="core"
        data-compose-kind="resonance-core"
      >
        <h1 className="chamber-heading">Scholomance Signal Chamber</h1>

        {/* Lock Plate Heading */}
        <div
          className="core-status-plate"
          data-compose-part="heading"
          data-compose-kind="signal-lock-plate"
          style={{ '--accent': activeStation.color } as React.CSSProperties}
        >
          <div className="status-indicator">
            <span
              className={`pulse-dot ${isPlaying ? 'is-active' : ''}`}
              data-compose-visual="pulse-dot"
            />
            {isTuning ? 'SYNCHRONIZING...' : 'RESONANCE_LOCKED'}
          </div>

          <MagicNamePlate name={activeStation.name} color={activeStation.color} />

          <div className="frequency-readout">
            {((activeStation.baseFrequency || 432) + signalLevel * 8).toFixed(2)} Hz
          </div>
        </div>

        <div className={`core-mount ${isPlaying ? 'is-playing' : ''}`}>
          <SignalChamberConsole
            overrideSchoolId={activeStation.id}
            onOrbClick={onOrbClick}
          />
        </div>
      </main>

      {/* Right Sidebar: Parameter Rail */}
      <motion.aside
        className="hud-sidebar hud-sidebar--right"
        data-compose-part="parameterRail"
        data-compose-kind="parameter-rail"
        aria-label="Signal parameters"
        {...sidebarProps}
      >
        <div className="sidebar-header">
          <h3>PARAMETERS</h3>
          <p>AURAL_INTEGRITY</p>
        </div>

        <div className="parameter-grid">
          {/* Spectrum Analyzer / Scope */}
          <div className="param-node param-node--spectrum" data-compose-kind="waveform-scope">
            <div className="param-label">
              <span>WAVEFORM_ANALYSIS</span>
              <span className="val">{isPlaying ? 'ACTIVE' : 'STANDBY'}</span>
            </div>
            <div className="spectrum-canvas">
              {safeGetByteFrequencyData ? (
                <ScholoCandy
                  isPlaying={isPlaying}
                  getByteFrequencyData={safeGetByteFrequencyData}
                  currentSchoolId={currentSchoolId}
                  detectedSchoolId={detectedSchoolId}
                  signalLevel={smoothedSignal}
                  eqNodes={getEqNodes?.() ?? []}
                  onBandsChanged={setEqBands}
                />
              ) : (
                <div
                  className="waveform-lattice-placeholder"
                  data-compose-visual="waveform-lattice"
                >
                  <div className="spectrum-dummy" />
                </div>
              )}
            </div>
          </div>

          {/* Parameter Sliders */}
          <div className="param-section">
            <div className="param-node" data-compose-kind="metric-bar">
              <div className="param-label">
                <span>VIBRATION</span>
                <span className="val">{Math.round(volume * 100)}%</span>
              </div>
              <div
                className="param-track"
                role="slider"
                aria-label="Volume control"
                aria-valuenow={Math.round(volume * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                tabIndex={0}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSetVolume?.((e.clientX - rect.left) / rect.width);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    onSetVolume?.(Math.min(1, volume + 0.05));
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    onSetVolume?.(Math.max(0, volume - 0.05));
                  }
                }}
              >
                <div
                  className="param-fill"
                  style={{ width: `${volume * 100}%`, backgroundColor: 'var(--text-secondary)' }}
                />
                <div className="param-handle" style={{ left: `${volume * 100}%` }} />
              </div>
            </div>

            <div className="param-node" data-compose-kind="signal-field">
              <div className="param-label">
                <span>AURA_NODE</span>
                <span className="val">{activeStation.id.toUpperCase()}</span>
              </div>
              <div className="param-track">
                <div className="param-fill" style={{ width: '100%', opacity: 0.3 }} />
              </div>
            </div>
          </div>

          {/* Output Device Selector */}
          <div data-compose-kind="signal-field">
            <OutputDeviceSelector
              devices={outputDevices}
              currentSinkId={sinkId}
              onSelect={onSetOutputDevice}
              onRefresh={updateOutputDevices}
              color={activeStation.color}
            />
          </div>

          {/* Entropy Meter */}
          <div className="param-node" data-compose-kind="metric-bar">
            <div className="param-label">
              <span>ENTROPY</span>
              <span
                className={`val ${
                  entropyLevel >= 80
                    ? 'val--critical'
                    : entropyLevel >= 40
                    ? 'val--warn'
                    : ''
                }`}
              >
                {entropyLevel}%
              </span>
            </div>
            <div className="param-track param-track--entropy">
              <motion.div
                className={`param-fill param-fill--entropy ${
                  entropyLevel >= 80
                    ? 'is-critical'
                    : entropyLevel >= 40
                    ? 'is-warn'
                    : ''
                }`}
                animate={{ width: `${entropyLevel}%` }}
                transition={{ duration: 1.8, ease: 'easeOut' }}
              />
            </div>
            {entropyLevel >= 40 && (
              <div className="entropy-warning-label" aria-live="polite">
                {entropyLevel >= 80 ? '⚠ DIMINISHING RETURNS' : '↑ PATTERN DETECTED'}
              </div>
            )}
          </div>
        </div>

        {/* Studio Dynamics Audio Compressor UI */}
        <div
          className={`analytics-block compressor-console ${phonemeWarning ? 'compressor-console--warn' : ''}`}
          data-compose-kind="phoneme-compressor-unit"
          data-compose-part="compressorConsole"
          data-compose-status={compressorStatus}
          data-compose-warning={phonemeWarning}
        >
          <div className="compressor-header">
            <div className="compressor-eyebrow">
              <span className="material-symbols-outlined">tune</span>
              <span>PHONEME_DYNAMICS_C1</span>
            </div>
            <span
              className={`compressor-ratio-badge compressor-ratio-badge--${compressorStatus.toLowerCase()}`}
            >
              {compressorRatio}
            </span>
          </div>

          {/* Meter Bridge: IN & GR */}
          <div className="compressor-meter-bridge">
            <div className="meter-lane">
              <div className="meter-label">
                <span>IN</span>
                <span className="meter-val">{Math.round(smoothedSignal * 100)}%</span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill meter-fill--in"
                  style={{ width: `${Math.min(100, smoothedSignal * 100)}%` }}
                />
              </div>
            </div>

            <div className="meter-lane">
              <div className="meter-label">
                <span>GR</span>
                <span className="meter-val gr-meter-val">
                  {gainReductionDb < 0 ? `${gainReductionDb.toFixed(1)} dB` : '0.0 dB'}
                </span>
              </div>
              <div className="meter-track meter-track--gr">
                <div
                  className="meter-fill meter-fill--gr"
                  style={{
                    width: `${Math.min(100, (Math.abs(gainReductionDb) / 18) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Transfer Curve Micro SVG */}
          <div className="compressor-transfer-graph" data-compose-part="transferCurve">
            <svg viewBox="0 0 100 60" className="transfer-svg" aria-hidden="true">
              <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <line x1="10" y1="10" x2="10" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              {/* Threshold indicator line at x=70 */}
              <line x1="70" y1="10" x2="70" y2="50" stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" strokeWidth="1" />
              {/* Knee response path */}
              <path
                d="M 10 50 L 70 20 L 90 20"
                fill="none"
                stroke={phonemeWarning ? 'var(--ritual-danger, #ff4444)' : 'var(--ritual-glow, #858fa7)'}
                strokeWidth="2"
              />
              {/* Current operating point dot */}
              <circle
                cx={10 + Math.min(80, smoothedSignal * 80)}
                cy={50 - Math.min(30, smoothedSignal * 30 + (gainReductionDb < 0 ? Math.abs(gainReductionDb) * 0.5 : 0))}
                r="3"
                fill={phonemeWarning ? 'var(--ritual-danger, #ff4444)' : '#ffffff'}
              />
            </svg>
          </div>

          {/* Parameter Readouts */}
          <div className="compressor-params-grid">
            <div className="param-tag">
              <span className="lbl">THRESH</span>
              <span className="val">-12.0 dB</span>
            </div>
            <div className="param-tag">
              <span className="lbl">ATT/REL</span>
              <span className="val">12ms / 150ms</span>
            </div>
          </div>

          {/* Alert Banner */}
          {phonemeWarning && (
            <div className="compressor-limiter-banner" aria-live="assertive">
              <span className="material-symbols-outlined">warning</span>
              <span>HEURISTIC LIMITER ACTIVE - RETURNS DECAY</span>
            </div>
          )}

          {/* Phase Filter Controls */}
          <div className="phase-controls">
            <button className="phase-btn">CONSONANT</button>
            <button className="phase-btn">VOWEL</button>
          </div>
        </div>
      </motion.aside>

      {/* Transport Deck */}
      <div
        className="hud-transport-wrapper"
        data-compose-part="transport"
        data-compose-kind="transport-deck"
      >
        <button
          className="transport-toggle-btn"
          data-compose-kind="transport-control"
          onClick={onTogglePlayPause}
          aria-label={isPlaying ? 'Pause transmission' : 'Play transmission'}
        >
          <span className="material-symbols-outlined">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>

      {/* Status Line Footer */}
      <div
        className="hud-footer"
        data-compose-part="footer"
        data-compose-kind="signal-status-line"
      >
        <span>Scholomance v11.3</span>
        <span>{isPlaying ? 'TRANSMITTING' : isTuning ? 'SYNCING' : 'STANDBY'}</span>
      </div>
    </div>
  );
}

export default ComposeSignalChamberAdapter;
