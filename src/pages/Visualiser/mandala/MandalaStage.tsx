import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { compileMandalaProgram, evalMandala } from './mandalaBytecode';
import './MandalaStage.css';

export interface MandalaStageProps {
  seed: number;
  bpm: number;
  hue?: number;
  /** Audio clock seconds when playing; falls back to performance clock. */
  timeSeconds?: number;
  /** Prefer over timeSeconds — read each frame so React playhead ticks never restart RAF. */
  getTimeSeconds?: () => number | undefined;
  reducedMotion?: boolean;
  /** Force-disable thin canvas (Deck-safe default when coarse). */
  thinCanvas?: boolean;
}

function useThinCanvasAllowed(forced?: boolean): boolean {
  return useMemo(() => {
    if (forced === false) return false;
    if (forced === true) return true;
    if (typeof window === 'undefined' || typeof matchMedia !== 'function') return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (matchMedia('(pointer: coarse)').matches) return false;
    return true;
  }, [forced]);
}

/**
 * BPM + bytecode IR mandala: SVG transforms primary; optional thin canvas ≤15fps.
 * No FFT. No uncapped 60fps stroke storm.
 */
export function MandalaStage({
  seed,
  bpm,
  hue = 286,
  timeSeconds,
  getTimeSeconds,
  reducedMotion = false,
  thinCanvas,
}: MandalaStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const program = useMemo(() => compileMandalaProgram(seed, bpm), [seed, bpm]);
  const allowThin = useThinCanvasAllowed(thinCanvas) && !reducedMotion;
  const t0Ref = useRef<number | null>(null);
  const timeRef = useRef(timeSeconds);
  timeRef.current = timeSeconds;
  const getTimeRef = useRef(getTimeSeconds);
  getTimeRef.current = getTimeSeconds;
  const hueRef = useRef(hue);
  hueRef.current = hue;

  const readClock = (now: number, t0: number) => {
    const fromGetter = getTimeRef.current?.();
    if (typeof fromGetter === 'number' && Number.isFinite(fromGetter)) return fromGetter;
    const clock = timeRef.current;
    if (typeof clock === 'number' && Number.isFinite(clock)) return clock;
    return (now - t0) / 1000;
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let last = 0;
    const intervalMs = reducedMotion ? 1e9 : 80; // ~12.5 Hz CSS updates

    const tick = (now: number) => {
      raf = 0;
      if (!reducedMotion && now - last < intervalMs) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = now;

      if (t0Ref.current == null) t0Ref.current = now;
      const t = readClock(now, t0Ref.current);

      const pose = reducedMotion ? evalMandala(program, 0) : evalMandala(program, t);
      root.style.setProperty('--m-hue', String(hueRef.current));
      pose.rings.forEach((r, i) => {
        root.style.setProperty(`--m-ring-rot-${i}`, `${r.rotDeg}deg`);
        root.style.setProperty(`--m-ring-scale-${i}`, String(r.scale));
      });
      pose.polys.forEach((p, i) => {
        root.style.setProperty(`--m-poly-rot-${i}`, `${p.rotDeg}deg`);
        root.style.setProperty(`--m-poly-scale-${i}`, String(p.scale));
      });
      root.style.setProperty('--m-core-scale', String(pose.coreScale));

      if (!reducedMotion) raf = requestAnimationFrame(tick);
    };

    if (reducedMotion) tick(0);
    else raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [program, reducedMotion]);

  // Thin canvas: same IR, ≤8 strokes, ≤15 fps — desktop only.
  useEffect(() => {
    if (!allowThin) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let lastW = 0;
    let lastH = 0;
    const minFrameMs = 66;
    const t0 = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w;
      lastH = h;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      raf = 0;
      if (document.hidden) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (now - last < minFrameMs) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = now;

      const t = readClock(now, t0);
      const pose = evalMandala(program, t);
      const hueNow = hueRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const R = Math.min(W, H) * 0.42;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.globalCompositeOperation = 'source-over';

      pose.rings.forEach((ring, i) => {
        const rr = R * (0.28 + i * 0.22) * ring.scale;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hueNow + i * 12}, 80%, 62%, 0.35)`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      });

      pose.polys.slice(0, 2).forEach((poly) => {
        const rad = (poly.rotDeg * Math.PI) / 180;
        const gr = R * poly.scale;
        ctx.beginPath();
        for (let s = 0; s <= poly.sides; s += 1) {
          const a = rad + (s / poly.sides) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a) * gr;
          const y = Math.sin(a) * gr;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hueNow + 20}, 90%, 66%, 0.75)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      const coreR = R * 0.07 * pose.coreScale;
      ctx.fillStyle = `hsla(312, 92%, 70%, 0.55)`;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [allowThin, program]);

  return (
    <div
      ref={rootRef}
      className={`bcv-mandala${allowThin ? ' has-thin-canvas' : ''}`}
      aria-hidden="true"
      style={{ '--m-hue': hue } as CSSProperties}
    >
      <svg className="bcv-mandala__svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="bcv-mandala-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${hue + 26}, 96%, 74%)`} stopOpacity="0.95" />
            <stop offset="55%" stopColor={`hsl(${hue}, 90%, 55%)`} stopOpacity="0.35" />
            <stop offset="100%" stopColor={`hsl(${hue}, 90%, 50%)`} stopOpacity="0" />
          </radialGradient>
        </defs>
        {[0, 1, 2].map((i) => (
          <circle
            key={`ring-${i}`}
            className={`bcv-mandala__ring bcv-mandala__ring--${i}`}
            cx="100"
            cy="100"
            r={36 + i * 22}
            fill="none"
            stroke={`hsla(${hue + i * 10}, 85%, 64%, 0.4)`}
            strokeWidth="1.2"
          />
        ))}
        <g className="bcv-mandala__poly bcv-mandala__poly--0">
          <polygon
            points="100,52 142,124 58,124"
            fill="none"
            stroke={`hsla(${hue + 24}, 92%, 66%, 0.85)`}
            strokeWidth="1.8"
          />
        </g>
        <g className="bcv-mandala__poly bcv-mandala__poly--1">
          <polygon
            points="100,148 58,76 142,76"
            fill="none"
            stroke={`hsla(${hue - 30}, 92%, 66%, 0.85)`}
            strokeWidth="1.8"
          />
        </g>
        <circle
          className="bcv-mandala__core"
          cx="100"
          cy="100"
          r="14"
          fill="url(#bcv-mandala-core)"
        />
      </svg>
      {allowThin ? (
        <canvas ref={canvasRef} className="bcv-mandala__canvas" />
      ) : null}
    </div>
  );
}
