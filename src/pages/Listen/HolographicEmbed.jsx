/**
 * HolographicEmbed - Transmission console DOM layer.
 *
 * Enhancements:
 * - Futuristic Web Audio API button sounds (synthesized, no file deps)
 * - Still-water ripple on click - expands from touch point
 * - Warm holographic glow pulse on hover
 * - Aetheric current overflow twitch - random, purely visual, never disturbs audio
 * - Music-reactive signal core (is-live class drives glow animation in CSS)
 */

import { motion } from 'framer-motion';
import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
} from 'lucide-react';
import { getTrackEmbedConfig } from "../../lib/musicEmbeds";

/* ─────────────────────────────────────────────────────────────────────────────
   Web Audio - synthesized button tones.
   AudioContext is created per-click and closed after the tone ends to avoid
   holding open audio resources between interactions.
───────────────────────────────────────────────────────────────────────────── */
function playButtonSound(type = 'tap', sinkId = '') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Apply sinkId if supported and provided
    if (sinkId && typeof ctx.setSinkId === 'function') {
      void ctx.setSinkId(sinkId).catch(err => {
        console.warn("Failed to set sinkId for button sound:", err);
      });
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const t = ctx.currentTime;

    if (type === 'play') {
      // Rising tri-wave chord: activation ascending ramp
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.14);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.start(t);
      osc.stop(t + 0.32);
    } else if (type === 'station') {
      // Two-tone sine sweep: tuning into a frequency
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1047, t);          // C6
      osc.frequency.exponentialRampToValueAtTime(523, t + 0.18);  // C5
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.start(t);
      osc.stop(t + 0.24);
    } else if (type === 'volume') {
      // Short soft sine blip
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.linearRampToValueAtTime(720, t + 0.06);
      gain.gain.setValueAtTime(0.038, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    } else {
      // Default tap: crisp high sine descend
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1320, t);
      osc.frequency.exponentialRampToValueAtTime(660, t + 0.07);
      gain.gain.setValueAtTime(0.042, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.start(t);
      osc.stop(t + 0.11);
    }

    osc.addEventListener('ended', () => { ctx.close().catch(() => {}); }, { once: true });
  } catch {
    // Silently degrade - audio API may be blocked or unavailable
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Ripple - injects a DOM span at the click point, animates via CSS keyframe,
   self-removes on animationend. Still-water effect: slow expansion, subtle fade.
───────────────────────────────────────────────────────────────────────────── */
function spawnRipple(btn, event) {
  const rect = btn.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const ripple = document.createElement('span');
  ripple.className = 'transport-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  btn.appendChild(ripple);

  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

/* ─────────────────────────────────────────────────────────────────────────────
   makeHandler - wraps a button's click handler with sound + ripple.
───────────────────────────────────────────────────────────────────────────── */
function makeHandler(handler, soundType = 'tap', sinkId = '') {
  return (e) => {
    playButtonSound(soundType, sinkId);
    spawnRipple(e.currentTarget, e);
    handler?.();
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   PowerArcIcon - Arcane ignition symbol.
   Styled arcing power button that fits the Resonance Chamber aesthetic.
───────────────────────────────────────────────────────────────────────────── */
const PowerArcIcon = ({ color, isPlaying, isTuning }) => (
  <svg viewBox="0 0 64 64" className={`power-arc-icon ${isPlaying ? 'is-active' : ''} ${isTuning ? 'is-tuning' : ''}`} aria-hidden="true">
    <defs>
      <filter id="powerGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feFlood floodColor={color} floodOpacity="0.5" result="glowColor" />
        <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
        <feMerge>
          <feMergeNode in="softGlow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    
    {/* Main Power Ring */}
    <path 
      className="power-arc-ring"
      d="M22 17C17.1 20.6 14 26.4 14 33C14 43.5 22.5 52 33 52C43.5 52 52 43.5 52 33C52 26.4 48.9 20.6 44 17" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      fill="none"
      filter="url(#powerGlow)"
    />
    
    {/* Central Stem (Lightning Bolt hybrid) */}
    <path 
      className="power-arc-stem"
      d="M33 10L33 22L30 26L33 34" 
      stroke={color} 
      strokeWidth="3" 
      strokeLinecap="round" 
      fill="none"
      filter="url(#powerGlow)"
    />
    
    {/* Static Arcs jumping the gap */}
    <g className="power-arc-secondary" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.4">
      <path d="M28 14L31 18" />
      <path d="M38 14L35 18" />
    </g>
  </svg>
);

/* ─────────────────────────────────────────────────────────────────────────────
   HolographicEmbed
───────────────────────────────────────────────────────────────────────────── */
export default function HolographicEmbed({
  trackUrl,
  trackId,
  title,
  glyph: _glyph,
  schoolColor = '#2ddbde',
  isPlaying = false,
  isTuning = false,
  volumePercent = 0,
  onPlay,
  onPause,
  onRewind,
  onFastForward,
  onVolumeDown,
  onVolumeUp,
  onPrevTrack,
  onNextTrack,
  onIgnite,
  sinkId = '',
}) {
  /* Resolve props */
  const resolvedTrackUrl = trackUrl || trackId || '';
  const embed = getTrackEmbedConfig(resolvedTrackUrl);
  const providerLabel = embed.provider ? String(embed.provider).toUpperCase() : 'OFFLINE';
  const displayTitle  = title || 'No signal';
  const controlsDisabled = !resolvedTrackUrl;

  const playerState = !resolvedTrackUrl
    ? 'standby'
    : isTuning  ? 'loading'
    : isPlaying ? 'playing'
    : 'paused';

  const signalStatusValue = {
    standby: 'Standby', loading: 'Synchronizing',
    playing: 'Transmitting', paused: 'Paused',
  }[playerState] ?? 'Standby';

  const coreClass = [
    'signal-core',
    !resolvedTrackUrl ? 'is-empty' : '',
    isPlaying ? 'is-live' : 'is-idle',
    isTuning  ? 'is-tuning' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      className={`listen-console listen-console--${playerState}`}
      aria-label={`${displayTitle} transmission console`}
      style={{ '--active-school-color': schoolColor }}
    >
      {/* ── TransmissionCore ──────────────────────────────────────────── */}
      <motion.div 
        className="listen-console__core-shell"
        layoutId="central-orb"
        transition={{ duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] }}
      >
        <div className={coreClass}>
          <div className="signal-core__halo" />
          <div className="signal-core__aperture">
            <div className="signal-core__bezel">
              <div className="signal-core__screen">
                <svg
                  className="signal-core__schematics"
                  viewBox="0 0 320 320"
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                >
                  <circle className="signal-core__ring-line signal-core__ring-line--outer" cx="160" cy="160" r="118" />
                  <circle className="signal-core__ring-line signal-core__ring-line--mid"   cx="160" cy="160" r="92"  />
                  <circle className="signal-core__ring-line signal-core__ring-line--inner" cx="160" cy="160" r="56"  />
                  <line className="signal-core__grid-line" x1="160" y1="38"  x2="160" y2="282" />
                  <line className="signal-core__grid-line" x1="38"  y1="160" x2="282" y2="160" />

                  <g className="signal-core__sigil-rotor">
                    <path className="signal-core__sigil-line"
                          d="M160 72 L234 198 H86 Z" />
                    <path className="signal-core__sigil-line signal-core__sigil-line--soft"
                          d="M160 64 L228 112 L228 208 L160 256 L92 208 L92 112 Z" />
                    <path className="signal-core__sigil-line signal-core__sigil-line--soft"
                          d="M160 96 L204 160 L160 224 L116 160 Z" />
                  </g>

                  <path className="signal-core__wave-line signal-core__wave-line--primary"
                        d="M26 176 C56 132, 92 208, 124 164 S188 110, 224 168 S280 212, 306 150" />
                  <path className="signal-core__wave-line signal-core__wave-line--secondary"
                        d="M24 144 C54 172, 90 118, 122 146 S188 190, 224 144 S280 108, 304 132" />
                </svg>

                {/* Central Power Ignition Icon - Replaces Glyph and Focus Dots */}
                <button 
                  className="signal-core__ignition-btn"
                  onClick={makeHandler(onIgnite, 'play', sinkId)}
                  aria-label="Ignite Station Matrix"
                >
                  <PowerArcIcon 
                    color={schoolColor} 
                    isPlaying={isPlaying} 
                    isTuning={isTuning} 
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── ConsoleDivider ────────────────────────────────────────────── */}
      <div className="listen-console__divider" aria-hidden="true" />

      {/* ── StationPlate ──────────────────────────────────────────────── */}
      <div className="listen-console__plate">
        <span className="listen-console__plate-glyph" aria-hidden="true">✦</span>
        <h2 className="listen-console__title">{displayTitle}</h2>
        <span className="listen-console__plate-glyph" aria-hidden="true">✦</span>
      </div>

      {/* ── TransportConsole - compact command deck ───────────────────── */}
      <div
        className="transport-console"
        role="group"
        aria-label={`${displayTitle} transport controls`}
      >
        <div className="transport-console__header">
          <div className="transport-console__identity">
            <span className="transport-console__status-dot" aria-hidden="true" />
            <span className="transport-console__kicker">Transmission</span>
            <span className="transport-console__state">{signalStatusValue}</span>
          </div>
          <div className="transport-console__telemetry" aria-hidden="true">
            <span>{providerLabel}</span>
            <span>VOL {volumePercent}</span>
          </div>
        </div>

        <div className="transport-console__command-deck">
          <div className="transport-console__cluster" role="group" aria-label="Station and playback controls">
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onPrevTrack, 'station', sinkId)}
              disabled={controlsDisabled}
              aria-label="Previous station"
              title="Previous station"
            >
              <SkipBack size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onRewind, 'tap', sinkId)}
              disabled={controlsDisabled}
              aria-label="Rewind 10 seconds"
              title="Rewind 10 seconds"
            >
              <RotateCcw size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="transport-console__btn transport-console__btn--play"
              onClick={makeHandler(isPlaying ? onPause : onPlay, isPlaying ? 'tap' : 'play', sinkId)}
              disabled={controlsDisabled}
              aria-label={isPlaying ? 'Pause transmission' : 'Play transmission'}
              aria-pressed={isPlaying}
              title={isPlaying ? 'Pause transmission' : 'Play transmission'}
            >
              {isPlaying
                ? <Pause size={19} strokeWidth={1.9} aria-hidden="true" />
                : <Play size={19} strokeWidth={1.9} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onFastForward, 'tap', sinkId)}
              disabled={controlsDisabled}
              aria-label="Fast forward 10 seconds"
              title="Fast forward 10 seconds"
            >
              <RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onNextTrack, 'station', sinkId)}
              disabled={controlsDisabled}
              aria-label="Next station"
              title="Next station"
            >
              <SkipForward size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>

          <span className="transport-console__separator" aria-hidden="true" />

          <div className="transport-console__cluster transport-console__cluster--volume" role="group" aria-label="Volume controls">
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onVolumeDown, 'volume', sinkId)}
              disabled={controlsDisabled}
              aria-label="Decrease volume by 5 percent"
              title="Decrease volume"
            >
              <Volume1 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <div
              className="transport-console__volume-readout"
              aria-live="polite"
              aria-label={`Volume ${volumePercent} percent`}
            >
              {volumePercent}
            </div>
            <button
              type="button"
              className="transport-console__btn"
              onClick={makeHandler(onVolumeUp, 'volume', sinkId)}
              disabled={controlsDisabled}
              aria-label="Increase volume by 5 percent"
              title="Increase volume"
            >
              <Volume2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── SignalStatus ──────────────────────────────────────────────── */}
      <div
        className="signal-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="signal-status__label">Current Signal:</span>
        <span className="signal-status__value">{signalStatusValue}</span>
        <span className="signal-status__divider" aria-hidden="true">|</span>
        <span className="signal-status__label">Protocol:</span>
        <span className="signal-status__value">Scholomance v11.3</span>
      </div>
    </section>
  );
}
