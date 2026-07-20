import { useEffect, useRef } from 'react';

/**
 * BytecodeVisualiser - a deterministic, audio-reactive sacred-geometry mandala
 * on a 2D canvas. Concentric rings + radial spectral bars (from FFT) + a rotating
 * merkaba + flower-of-life nodes + a glowing core, composited additively for a
 * holographic look. Rotation tracks BPM. Reduced-motion renders one static frame.
 *
 * It is decorative: aria-hidden. The accessible/textual data lives in the
 * surrounding readout panels.
 *
 * Perf law (Deck / Aw Snap): never uncapped 60fps with ~100 strokes + lighter
 * composite. Cap frame rate, cut bar count on coarse/low-core, reuse stroke
 * styles — shadowBlur stays forbidden.
 */

interface BytecodeVisualiserProps {
  /** FFT accessor (fills the array). If absent, a deterministic synthetic spectrum animates. */
  getByteFrequencyData?: (a: Uint8Array) => void;
  bpm?: number;
  hue?: number;          // base hue 0..360
  reducedMotion?: boolean;
  binCount?: number;
  /** Skip the merkaba/flower geometry (for overlaying on an orb that already has it). */
  minimal?: boolean;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function strokePolygon(ctx: CanvasRenderingContext2D, radius: number, sides: number, rotation: number, stroke: string, lw = 1.6) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i += 1) {
    const a = rotation + (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export function BytecodeVisualiser({
  getByteFrequencyData,
  bpm = 120,
  hue = 286,
  reducedMotion = false,
  binCount = 48,
  minimal = false,
}: BytecodeVisualiserProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const context = canvasElement.getContext('2d', { alpha: true });
    if (!context) return;
    const canvas: HTMLCanvasElement = canvasElement;
    const ctx: CanvasRenderingContext2D = context;

    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const lowCore = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;
    const constrained = coarse || lowCore;
    const dpr = Math.min(constrained ? 1 : 1.5, window.devicePixelRatio || 1);
    // Share GPU with SpectralStrip (~30fps). Deck targets ~24fps.
    const minFrameMs = constrained ? 42 : 33;
    const drawBins = constrained ? Math.min(binCount, 32) : binCount;
    const ringCount = constrained ? 3 : 5;
    const data = new Uint8Array(Math.max(binCount * 2, 256));
    const sampleStep = Math.max(1, Math.floor(binCount / drawBins));

    // Mag-bucket stroke styles — avoid 96 hsl() string allocs per frame.
    const barStyles = [
      hsl(hue, 88, 56, 0.55),
      hsl(hue + 18, 90, 60, 0.7),
      hsl(hue + 36, 92, 66, 0.85),
      hsl(hue + 54, 94, 72, 0.95),
    ];

    let raf = 0;
    let visible = true;
    let lastW = 0;
    let lastH = 0;
    let lastDraw = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      // Ignore sub-pixel churn that clears the buffer every tick.
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w;
      lastH = h;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const io = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVis = () => {
      if (!document.hidden && !reducedMotion && !raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);

    function draw(tMs: number) {
      raf = 0;
      if (document.hidden || !visible) {
        if (!reducedMotion) return;
      }
      if (!reducedMotion && tMs - lastDraw < minFrameMs) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDraw = tMs;

      const t = tMs / 1000;
      const W = canvas.width;
      const H = canvas.height;
      const R = Math.min(W, H) * 0.44;

      if (getByteFrequencyData) {
        getByteFrequencyData(data);
      } else {
        const synthPulse = 0.6 + 0.4 * Math.sin(t * (bpm / 60) * Math.PI);
        const n = drawBins * sampleStep;
        for (let i = 0; i < n; i += 1) {
          const env = Math.max(0, 1 - i / n);
          data[i] = Math.round(Math.max(0, (0.5 + 0.5 * Math.sin(t * 2.1 + i * 0.21)) * 210 * env * synthPulse));
        }
      }

      let energy = 0;
      for (let i = 0; i < drawBins; i += 1) energy += data[i * sampleStep];
      energy /= drawBins * 255;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      // 'source-over' on constrained GPUs — 'lighter' is a fill-rate tax.
      ctx.globalCompositeOperation = constrained ? 'source-over' : 'lighter';

      const beat = t * (bpm / 60);
      const rot = reducedMotion ? 0.3 : beat * 0.12 * Math.PI;
      const pulse = 1 + energy * 0.08 * Math.sin(beat * Math.PI);

      for (let k = 1; k <= ringCount; k += 1) {
        const rr = R * (0.2 + k * (0.75 / ringCount)) * pulse;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(hue + k * 10, 85, 64, 0.28 + energy * 0.25);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // Radial spectral bars — sampled, style-bucketed (no per-bar hsl()).
      ctx.lineWidth = constrained ? 2 : 2.2;
      const twoPi = Math.PI * 2;
      for (let i = 0; i < drawBins; i += 1) {
        const mag = data[i * sampleStep] / 255;
        const ang = (i / drawBins) * twoPi + rot * 0.3;
        const r0 = R * 0.46;
        const r1 = R * (0.46 + 0.46 * mag);
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(c * r0, s * r0);
        ctx.lineTo(c * r1, s * r1);
        ctx.strokeStyle = barStyles[(mag * 3.99) | 0];
        ctx.stroke();
      }

      if (!minimal) {
        const gr = R * 0.42 * pulse;
        strokePolygon(ctx, gr, 3, rot, hsl(hue + 24, 92, 66, 0.85), 2.2);
        strokePolygon(ctx, gr, 3, rot + Math.PI, hsl(hue - 30, 92, 66, 0.85), 2.2);
        if (!constrained) {
          strokePolygon(ctx, gr * 0.72, 6, -rot * 0.5, hsl(hue + 8, 88, 66, 0.5), 1.6);
          strokePolygon(ctx, gr * 0.46, 3, rot * 1.4, hsl(310, 92, 70, 0.7), 1.6);
          strokePolygon(ctx, gr * 0.46, 3, rot * 1.4 + Math.PI, hsl(196, 92, 64, 0.7), 1.6);
          strokePolygon(ctx, gr * 0.96, 4, rot * 0.3, hsl(hue, 72, 62, 0.4), 1.3);

          const nodeR = R * 0.13;
          for (let i = 0; i < 6; i += 1) {
            const a = (i / 6) * twoPi + rot * 0.5;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44, nodeR, 0, twoPi);
            ctx.strokeStyle = hsl(hue, 86, 66, 0.36 + energy * 0.2);
            ctx.lineWidth = 1.3;
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, nodeR, 0, twoPi);
          ctx.strokeStyle = hsl(hue, 86, 66, 0.42);
          ctx.stroke();
        }
      }

      const coreR = R * 0.08 * (1 + energy * 0.6);
      if (constrained) {
        ctx.fillStyle = hsl(312, 96, 74, 0.55 + energy * 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, coreR * 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 5);
        grad.addColorStop(0, hsl(312, 96, 74, 0.95));
        grad.addColorStop(0.35, hsl(300, 92, 64, 0.45));
        grad.addColorStop(1, hsl(300, 92, 60, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, coreR * 5, 0, Math.PI * 2);
        ctx.fill();

        const beamH = R * 1.95;
        const beamW = R * (0.05 + energy * 0.07);
        const bg = ctx.createLinearGradient(0, -beamH, 0, beamH);
        bg.addColorStop(0, hsl(312, 96, 70, 0));
        bg.addColorStop(0.5, hsl(312, 96, 74, 0.45 + energy * 0.35));
        bg.addColorStop(1, hsl(312, 96, 70, 0));
        ctx.fillStyle = bg;
        ctx.fillRect(-beamW / 2, -beamH, beamW, beamH * 2);
      }

      ctx.restore();

      if (!reducedMotion && !document.hidden && visible) raf = requestAnimationFrame(draw);
    }

    if (reducedMotion) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [getByteFrequencyData, bpm, hue, reducedMotion, binCount, minimal]);

  return <canvas ref={canvasRef} className="bcv-canvas" aria-hidden="true" />;
}
