import { useEffect, useRef } from 'react';

interface SpectralStripProps {
  getByteFrequencyData?: (a: Uint8Array) => void;
  reducedMotion?: boolean;
  binCount?: number;
}

/** Live FFT bar strip. Idle baseline when analyser is absent — never fake sines. */
export function SpectralStrip({
  getByteFrequencyData,
  reducedMotion = false,
  binCount = 16,
}: SpectralStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const el = canvas;
    const g = ctx;

    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(coarse ? 1.25 : 2, window.devicePixelRatio || 1);
    const data = new Uint8Array(256);
    let raf = 0;
    let visible = true;
    let lastW = 0;
    let lastH = 0;
    let lastDraw = 0;
    const minFrameMs = 33; // ~30fps — share GPU budget with mandala canvas

    const resize = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w;
      lastH = h;
      el.width = w;
      el.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);

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
      const W = el.width;
      const H = el.height;
      g.clearRect(0, 0, W, H);

      const live = Boolean(getByteFrequencyData);
      if (live) getByteFrequencyData!(data);
      else data.fill(0);

      const gap = 2 * dpr;
      const barW = Math.max(2 * dpr, (W - gap * (binCount - 1)) / binCount);
      const step = Math.max(1, Math.floor(data.length / binCount));
      const world = getComputedStyle(el).getPropertyValue('--bcv-world').trim() || 'hsl(286, 70%, 55%)';

      // Solid fills only — per-bar createLinearGradient every frame was
      // stacking with CSS filter animation and killing the GPU process.
      g.fillStyle = world;
      for (let i = 0; i < binCount; i += 1) {
        let sum = 0;
        const start = i * step;
        for (let j = 0; j < step && start + j < data.length; j += 1) sum += data[start + j];
        const avg = live ? sum / (step * 255) : 0.06;
        const h = Math.max(H * 0.04, avg * H * 0.92);
        const x = i * (barW + gap);
        const y = H - h;
        g.globalAlpha = live ? 0.55 + avg * 0.45 : 0.28;
        g.fillRect(x, y, barW, h);
      }
      g.globalAlpha = 1;

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
  }, [getByteFrequencyData, reducedMotion, binCount]);

  return (
    <canvas
      ref={canvasRef}
      className={`bcv-spectral${getByteFrequencyData ? ' is-live' : ' is-idle'}`}
      aria-hidden="true"
    />
  );
}
