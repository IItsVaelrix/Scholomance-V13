import { useEffect, useRef, useState } from 'react';
import { getActivePhase } from '../../phaser/battle-transition.fx.js';
import { freshRng } from '../../lib/math/seededRng.js';
import {
  POLARIS_MATRIX_INTRO_DURATION_MS,
  POLARIS_MATRIX_INTRO_EXIT_MS,
  POLARIS_MATRIX_INTRO_REDUCED_MS,
  POLARIS_TELEPORT_READY_EVENT,
  POLARIS_TRANSITION_START_EVENT,
} from '../../game/world/polarisTransition.js';
import styles from './PolarisMatrixIntro.module.css';

const PHASE_STATUS = {
  encounter_detected: 'POLARIS://WORLD/LOAD',
  code_flood: 'DECOMPILING VOID COURTYARD...',
  wireframe_flicker: 'RESONANCE LATTICE SPINNING...',
  silhouette_dissolve: 'THAUMATURGIC FREQUENCIES LOCKED...',
  clutter_dissolve: 'SONIC CANOPY MANIFESTING...',
  grid_reveal: 'Welcome to Polaris',
  tile_reveal: 'Our World',
  combat_ready: 'SONIC THAUMATURGY FOREST ONLINE',
};

/**
 * Matrix loading screen shown when stepping through the cleared portal into Polaris.
 */
export default function PolarisMatrixIntro({
  reducedMotion = false,
  onComplete,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(Date.now());
  const [phase, setPhase] = useState(reducedMotion ? 'visible' : 'enter');
  const [statusLine, setStatusLine] = useState(PHASE_STATUS.encounter_detected);

  const durationMs = reducedMotion ? POLARIS_MATRIX_INTRO_REDUCED_MS : POLARIS_MATRIX_INTRO_DURATION_MS;
  const exitMs = reducedMotion ? 220 : POLARIS_MATRIX_INTRO_EXIT_MS;
  const mode = 'full';

  useEffect(() => {
    startRef.current = Date.now();
    const statusTimer = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const active = getActivePhase(elapsed, mode);
      if (active?.id && PHASE_STATUS[active.id]) {
        setStatusLine(PHASE_STATUS[active.id]);
      }
    }, 120);
    return () => window.clearInterval(statusTimer);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const glyphs = '♪01◉';
    const rng = freshRng();
    const fontSize = 15;
    let columns = 0;
    let drops = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      columns = Math.max(1, Math.floor(width / fontSize));
      drops = Array.from({ length: columns }, () => Math.floor(rng() * height / fontSize));
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.fillStyle = 'rgba(4, 3, 10, 0.16)';
      ctx.fillRect(0, 0, width, height);

      for (let column = 0; column < columns; column += 1) {
        const x = column * fontSize;
        const y = drops[column] * fontSize;
        const glyph = glyphs[Math.floor(rng() * glyphs.length)];

        ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = 'rgba(68, 232, 192, 0.9)';
        ctx.fillText(glyph, x, y);

        if (rng() > 0.988) {
          ctx.fillStyle = 'rgba(136, 238, 255, 0.95)';
          ctx.fillText('♪', x, y - fontSize * 0.7);
        }

        if (y > height && rng() > 0.965) {
          drops[column] = 0;
        }
        drops[column] += 1;
      }

      rafRef.current = window.requestAnimationFrame(draw);
    };

    rafRef.current = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(POLARIS_TRANSITION_START_EVENT));

    const exitTimer = window.setTimeout(() => {
      if (!reducedMotion) setPhase('exit');
    }, durationMs - exitMs);

    const doneTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(POLARIS_TELEPORT_READY_EVENT));
      onComplete?.();
    }, durationMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [durationMs, exitMs, onComplete, reducedMotion]);

  const showWelcome = statusLine === PHASE_STATUS.grid_reveal
    || statusLine === PHASE_STATUS.tile_reveal
    || statusLine === PHASE_STATUS.combat_ready;

  return (
    <div
      className={`${styles.root} ${styles[phase]}`}
      style={{
        '--matrix-duration': `${durationMs}ms`,
        '--matrix-exit': `${exitMs}ms`,
      }}
      role="status"
      aria-live="polite"
      aria-label="Welcome to Polaris"
    >
      {!reducedMotion && <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />}
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <div className={styles.hud}>
        <p className={styles.eyebrow}>polaris://world/recompile</p>
        {showWelcome ? (
          <>
            <h2 className={styles.title}>Welcome to Polaris</h2>
            <p className={styles.subtitle}>Our World</p>
          </>
        ) : (
          <h2 className={styles.title}>Dimensional Transit</h2>
        )}
        <p className={styles.status}>{statusLine}</p>
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressBar} />
        </div>
      </div>
    </div>
  );
}
