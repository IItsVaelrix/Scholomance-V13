import { useEffect, useRef } from "react";
import { createPhotonicStorm } from "./storm/photonicStorm.js";

/**
 * StormCanvas - mounts a photonic-storm engine on a <canvas>.
 *
 * variant "scene": full-bleed dungeon sky behind the orb.
 * variant "orb":   the contained scrying vision (style the element round in CSS).
 *
 * The storm routes every strike through the Photonic-Retina/Quantization bridge,
 * so cranking `intensity` is a real stress test of that pipeline.
 */
export default function StormCanvas({
  intensity = 1,
  variant = "scene",
  className = "",
  debug = false,
  onStrike,
  skipGalaxyPlate = false,
}) {
  const canvasRef = useRef(null);
  const onStrikeRef = useRef(onStrike);
  onStrikeRef.current = onStrike;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const storm = createPhotonicStorm({
      intensity,
      variant,
      debug,
      skipGalaxyPlate,
      onStrike: (telemetry) => onStrikeRef.current?.(telemetry),
    });

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      storm.resize(rect.width, rect.height);
      if (reduceMotion) storm.renderStatic(ctx);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let running = !reduceMotion;

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      storm.update(dt);
      storm.render(ctx);
      raf = requestAnimationFrame(frame);
    }

    if (!reduceMotion) raf = requestAnimationFrame(frame);

    function onVisibility() {
      if (reduceMotion) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);

    function handlePointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      storm.setMousePosition(x, y);
    }

    function handlePointerDown(e) {
      if (
        e.target.closest("a") ||
        e.target.closest("button") ||
        e.target.closest(".portal-gate") ||
        e.target.closest(".primary-nav")
      ) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      storm.triggerWandStrike(x, y);
    }

    if (variant === "scene") {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerdown", handlePointerDown);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (variant === "scene") {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerdown", handlePointerDown);
      }
      storm.dispose();
    };
  }, [intensity, variant, debug, skipGalaxyPlate]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
