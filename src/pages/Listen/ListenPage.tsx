import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { AlchemicalLabBackground } from "./AlchemicalLabBackground";
import { SignalChamberConsole } from "./SignalChamberConsole";
import { useAmbientPlayer } from "../../hooks/useAmbientPlayer";
import { SCHOOLS, generateSchoolColor } from "../../data/schools";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { ScholoCandy } from "../../components/ParaEQ/ScholoCandy";
import { useSonicAnalysis } from "../../hooks/useSonicAnalysis";
import { MagicNamePlate } from "./MagicNamePlate";
import { OutputDeviceSelector } from "./OutputDeviceSelector";
import { ScholomanceStation } from "./ScholomanceStation";
import { triggerHapticPulse, UI_HAPTICS } from "../../lib/platform/haptics";
import ResonanceDebugPanel from "../../lib/ambient/resonance/ResonanceDebugPanel";
import { resolveTrackId } from "../../lib/catalog.api.js";
import "./ListenPage.css";

/**
 * ListenPage - The Scholomance Resonance Chamber.
 * An immersive 3D/HUD hybrid cockpit.
 */
export default function ListenPage() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const allSchoolIds = useMemo(() => Object.keys(SCHOOLS), []);

  const {
    currentSchoolId,
    isPlaying,
    isTuning,
    signalLevel,
    volume,
    setVolume,
    togglePlayPause,
    tuneToSchool,
    getByteFrequencyData,
    ensureContextRunning,
    outputDevices,
    sinkId,
    setOutputDevice,
    updateOutputDevices,
    trackUrl,
    addEqBand,
    updateEqBand,
    removeEqBand,
    setEqBands,
    getEqNodes,
    eqBands,
  } = useAmbientPlayer(allSchoolIds);

  const { detectedSchoolId } = useSonicAnalysis(isPlaying);

  // ── View Mode: CHAMBER (Cockpit) vs STATION (Orb Focus) ─────────────
  const [viewMode, setViewMode] = useState<'CHAMBER' | 'STATION'>('CHAMBER');

  // Derive the station currently "Painting" the UI
  // Priority: Tuning Target > Detected School (Sonic) > Station Selection (Player)
  const activeStation = useMemo(() => {
    const id = (isTuning ? currentSchoolId : detectedSchoolId) || currentSchoolId || 'SONIC'; // canonical base school (was non-canonical 'chrono')
    const school = (SCHOOLS as any)[id] || Object.values(SCHOOLS)[0];
    return { ...school, color: generateSchoolColor(id) };
  }, [detectedSchoolId, currentSchoolId, isTuning]);

  // ── Animation AMP Integration - DISABLED for stability ──────────────────

  const sidebarProps = {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.3 }
  };

  // const layerMotion = useAnimationIntent(layerIntent);
  const layerProps = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 }
  };

  // ── Entropy tracking - UI-only: punishes looping the same school ──────────
  const [entropyLevel, setEntropyLevel] = useState(0);
  const playCountRef = useRef<Record<string, number>>({});
  const prevIsPlayingRef = useRef(false);

  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;
    if (isPlaying && !wasPlaying && currentSchoolId) {
      playCountRef.current[currentSchoolId] =
        (playCountRef.current[currentSchoolId] ?? 0) + 1;
      const count = playCountRef.current[currentSchoolId];
      // Grace: 2 free plays. Entropy accumulates over the next 8 loops.
      const raw = Math.max(0, (count - 2) / 8);
      setEntropyLevel(Math.min(100, Math.round(raw * 100)));
    }
  }, [isPlaying, currentSchoolId]);

  // Recalculate entropy when switching stations
  useEffect(() => {
    if (currentSchoolId) {
      const count = playCountRef.current[currentSchoolId] ?? 0;
      const raw = Math.max(0, (count - 2) / 8);
      setEntropyLevel(Math.min(100, Math.round(raw * 100)));
    }
  }, [currentSchoolId]);

  const entropyClass = entropyLevel >= 80
    ? 'entropy-critical'
    : entropyLevel >= 40
    ? 'entropy-high'
    : '';

  // ── Keyboard Controls ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle play/pause on Space
      if (e.code === 'Space') {
        // Prevent page scroll
        e.preventDefault();
        
        // Don't trigger if user is in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        // Force resume context on interaction
        void ensureContextRunning();
        void togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, ensureContextRunning]);

  // Phoneme density warning with hysteresis to prevent flickering
  // Enters warning at 0.75, exits at 0.68 (7% hysteresis band)
  const [phonemeWarning, setPhonemeWarning] = useState(false);
  useEffect(() => {
    if (signalLevel > 0.75) {
      setPhonemeWarning(true);
    } else if (signalLevel < 0.68) {
      setPhonemeWarning(false);
    }
  }, [signalLevel]);

  const currentStation = useMemo(
    () => {
      const id = currentSchoolId || 'SONIC'; // canonical base school (was non-canonical 'chrono')
      const school = (SCHOOLS as any)[id] || Object.values(SCHOOLS)[0];
      return { ...school, color: generateSchoolColor(id) };
    },
    [currentSchoolId]
  );

  // ── View Mode Transitions ──────────────────────────────────────────
  const triggerIgnition = useCallback(() => {
    triggerHapticPulse(UI_HAPTICS.HEAVY);

    // Functional Ignition: start music if it's not already active
    if (!isPlaying && !isTuning) {
      void togglePlayPause();
    }
    // Open Scholomance Station menu with sacred geometry sphere
    setViewMode('STATION');
  }, [isPlaying, isTuning, togglePlayPause, setViewMode]);

  return (
    <section
      className={`listen-chamber ${prefersReducedMotion ? "is-reduced-motion" : ""} ${entropyClass}`}
      style={{ '--entropy': entropyLevel / 100 } as React.CSSProperties}
    >
      {/* ── Layer 0: 3D Environment (Phaser atmosphere) ───────────── */}
      {/* Pause chamber GPU work while Scholomance Station is open so only
          the station orb animates. Station CrystalBall is unmounted when closed. */}
      <AlchemicalLabBackground
        signalLevel={signalLevel}
        paused={viewMode === 'STATION'}
      />
      <div className="chamber-scanlines" />

      <AnimatePresence>
        {viewMode === 'CHAMBER' && (
          <motion.div
            key="chamber-view"
            className="view-layer"
            {...layerProps}
          >
            {/* Left Sidebar: Aperture Control */}
            <motion.aside 
              className="hud-sidebar hud-sidebar--left" 
              {...sidebarProps}
            >
              <div className="sidebar-header">
                <h3>APERTURE</h3>
                <p>SIGNAL_PATH_04</p>
              </div>
              
              <nav className="sidebar-menu">
                <button 
                  className={`menu-item ${currentSchoolId === 'SONIC' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHapticPulse(UI_HAPTICS.LIGHT);
                    void tuneToSchool('SONIC');
                  }}
                >
                  <span className="material-symbols-outlined">waves</span>
                  <span>OSCILLOSCOPE</span>
                </button>
                <button 
                  className={`menu-item ${currentSchoolId === 'ALCHEMY' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHapticPulse(UI_HAPTICS.LIGHT);
                    void tuneToSchool('ALCHEMY');
                  }}
                >
                  <span className="material-symbols-outlined">science</span>
                  <span>ALCHEMICAL</span>
                </button>
                <button 
                  className={`menu-item ${currentSchoolId === 'WILL' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHapticPulse(UI_HAPTICS.LIGHT);
                    void tuneToSchool('WILL');
                  }}
                >
                  <span className="material-symbols-outlined">auto_graph</span>
                  <span>RESONANCE</span>
                </button>
                <button 
                  className={`menu-item ${currentSchoolId === 'PSYCHIC' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHapticPulse(UI_HAPTICS.LIGHT);
                    void tuneToSchool('PSYCHIC');
                  }}
                >
                  <span className="material-symbols-outlined">cyclone</span>
                  <span>VORTEX</span>
                </button>
                <button 
                  className={`menu-item ${currentSchoolId === 'VOID' ? 'active' : ''}`}
                  onClick={() => {
                    triggerHapticPulse(UI_HAPTICS.LIGHT);
                    void tuneToSchool('VOID');
                  }}
                >
                  <span className="material-symbols-outlined">blur_on</span>
                  <span>NULL_VOID</span>
                </button>
              </nav>

              {/* Playback is owned by the harness: the central orb ignition,
                  the HolographicEmbed transport, and the Space hotkey. The old
                  sidebar PLAYBACK_CONTROL button was a redundant fourth control
                  and has been removed. */}
            </motion.aside>

            {/* Center: The Core 3D Console */}
            <main className="hud-center">
              <h1 className="chamber-heading">Scholomance Signal Chamber</h1>
              {/* Floating Status Plate */}
              <div className="core-status-plate" style={{ '--accent': activeStation.color } as any}>
                <div className="status-indicator">
                  <span className={`pulse-dot ${isPlaying ? 'is-active' : ''}`} />
                  {isTuning ? "SYNCHRONIZING..." : "RESONANCE_LOCKED"}
                </div>
                
                <MagicNamePlate 
                  name={activeStation.name} 
                  color={activeStation.color} 
                />

                <div className="frequency-readout">
                  {((activeStation.baseFrequency || 432) + signalLevel * 8).toFixed(2)} Hz
                </div>
              </div>

              <div className={`core-mount ${isPlaying ? 'is-playing' : ''}`}>
                <SignalChamberConsole 
                  overrideSchoolId={activeStation.id} 
                  onOrbClick={triggerIgnition}
                />
              </div>
            </main>

            {/* Right Sidebar: Parameters */}
            <motion.aside 
              className="hud-sidebar hud-sidebar--right" 
              {...sidebarProps}
              initial={sidebarProps.initial || { opacity: 0, x: 30 }}
              animate={sidebarProps.animate || { opacity: 1, x: 0 }}
            >
              <div className="sidebar-header">
                <h3>PARAMETERS</h3>
                <p>AURAL_INTEGRITY</p>
              </div>

              <div className="parameter-grid">
                {/* Spectrum Analyzer - replaces static frequency bar */}
                <div className="param-node param-node--spectrum">
                  <div className="param-label">
                    <span>WAVEFORM_ANALYSIS</span>
                    <span className="val">{isPlaying ? 'ACTIVE' : 'STANDBY'}</span>
                  </div>
                  <div className="spectrum-canvas">
                    <ScholoCandy
                      isPlaying={isPlaying}
                      getByteFrequencyData={getByteFrequencyData}
                      currentSchoolId={currentSchoolId}
                      detectedSchoolId={detectedSchoolId}
                      signalLevel={signalLevel}
                      eqNodes={getEqNodes()}
                      onBandsChanged={setEqBands}
                    />
                  </div>
                </div>

                {/* Parameter sliders - moved below spectrum */}
                <div className="param-section">
                  <div className="param-node">
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
                        setVolume((e.clientX - rect.left) / rect.width);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                          setVolume(Math.min(1, volume + 0.05));
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                          setVolume(Math.max(0, volume - 0.05));
                        }
                      }}
                      onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const handleDrag = (moveEvent: globalThis.MouseEvent) => {
                          const newValue = (moveEvent.clientX - rect.left) / rect.width;
                          setVolume(Math.max(0, Math.min(1, newValue)));
                        };
                        const stopDrag = () => {
                          document.removeEventListener('mousemove', handleDrag);
                          document.removeEventListener('mouseup', stopDrag);
                        };
                        document.addEventListener('mousemove', handleDrag);
                        document.addEventListener('mouseup', stopDrag);
                        handleDrag(e.nativeEvent);
                      }}
                      onTouchStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const handleTouch = (moveEvent: globalThis.TouchEvent) => {
                          const newValue = (moveEvent.touches[0].clientX - rect.left) / rect.width;
                          setVolume(Math.max(0, Math.min(1, newValue)));
                        };
                        const stopTouch = () => {
                          document.removeEventListener('touchmove', handleTouch);
                          document.removeEventListener('touchend', stopTouch);
                        };
                        document.addEventListener('touchmove', handleTouch, { passive: false });
                        document.addEventListener('touchend', stopTouch);
                        handleTouch(e.nativeEvent);
                      }}
                    >
                      <div className="param-fill" style={{ width: `${volume * 100}%`, backgroundColor: 'var(--text-secondary)' }} />
                      <div className="param-handle" style={{ left: `${volume * 100}%` }} />
                    </div>
                  </div>

                  <div className="param-node">
                    <div className="param-label">
                      <span>AURA_NODE</span>
                      <span className="val">{currentStation.id.toUpperCase()}</span>
                    </div>
                    <div className="param-track">
                      <div className="param-fill" style={{ width: '100%', opacity: 0.3 }} />
                    </div>
                  </div>
                </div>

                {/* Hardware Configuration - Output Device Selection */}
                <OutputDeviceSelector 
                  devices={outputDevices}
                  currentSinkId={sinkId}
                  onSelect={setOutputDevice}
                  onRefresh={updateOutputDevices}
                  color={activeStation.color}
                />

                {/* Entropy meter - fills as the player loops the same school */}
                <div className="param-node">
                  <div className="param-label">
                    <span>ENTROPY</span>
                    <span className={`val ${entropyLevel >= 80 ? 'val--critical' : entropyLevel >= 40 ? 'val--warn' : ''}`}>
                      {entropyLevel}%
                    </span>
                  </div>
                  <div className="param-track param-track--entropy">
                    <motion.div
                      className={`param-fill param-fill--entropy ${entropyLevel >= 80 ? 'is-critical' : entropyLevel >= 40 ? 'is-warn' : ''}`}
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

              <div className="analytics-block">
                <div className={`vfa-header ${phonemeWarning ? 'vfa-header--warn' : ''}`}>
                  PHONEME_DENSITY
                  {phonemeWarning && (
                    <span className="vfa-warn-badge" aria-label="Anti-exploit threshold reached">⚠</span>
                  )}
                </div>
                <div className={`vfa-viz ${phonemeWarning ? 'vfa-viz--warn' : ''}`}>
                  {[...Array(16)].map((_, i) => (
                    <div
                      key={i}
                      className={`vfa-bar ${phonemeWarning && i >= 11 ? 'vfa-bar--warn' : ''}`}
                      style={{ '--bar-index': i } as React.CSSProperties}
                    />
                  ))}
                  {/* Threshold line always rendered, visibility controlled by CSS */}
                  <div className={`phoneme-threshold-line ${phonemeWarning ? 'is-visible' : ''}`} aria-hidden="true" />
                </div>
                {/* Exploit label always rendered, visibility controlled by CSS */}
                <div className={`phoneme-exploit-label ${phonemeWarning ? 'is-visible' : ''}`} aria-live="assertive">
                  HEURISTIC LIMIT - RETURNS DECAY
                </div>
                <div className="phase-controls">
                  <button className="phase-btn">CONSONANT</button>
                  <button className="phase-btn">VOWEL</button>
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Station mounts only when ignited — CrystalBall Phaser cannot run off-screen. */}
      {viewMode === 'STATION' && (
        <div
          key="station-view"
          className="scholomance-station-wrapper"
        >
          <ScholomanceStation
            active
            activeStation={activeStation}
            signalLevel={signalLevel}
            isPlaying={isPlaying}
            isTuning={isTuning}
            trackUrl={trackUrl}
            onClose={() => setViewMode('CHAMBER')}
            onSelectTrack={(url, schoolId) => {
              void tuneToSchool(schoolId, { trackUrl: url, forceRetune: true });
            }}
          />
        </div>
      )}

      {/* Global Hud Noise/Grit Overlay */}
      <div className="hud-noise" />

      {/* Resonance Bytecode Fingerprint Debugger */}
      <ResonanceDebugPanel />
    </section>
  );
}
