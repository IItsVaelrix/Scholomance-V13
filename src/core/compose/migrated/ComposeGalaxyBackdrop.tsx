/**
 * Always-on Compose galaxy backdrop — baked plate + storm overlay (skipGalaxyPlate).
 * Falls back to full StormCanvas when scene validate fails or plate bake fails.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGalaxyBackdropScene,
} from './GalaxyBackdrop';
import { validateComposeScene } from '../packets';
import { bakeGalaxyPlate, PATTERN_SPEED } from '../../../pages/Landing/storm/galaxySim.js';
import StormCanvas from '../../../pages/Landing/StormCanvas.jsx';

export type ComposeGalaxyBackdropProps = {
  intensity?: number;
  debug?: boolean;
  variant?: 'scene';
  className?: string;
  onStrike?: (telemetry: unknown) => void;
};

function periodSeconds(speed: number) {
  return (Math.PI * 2) / speed;
}

export function ComposeGalaxyBackdrop({
  intensity = 1,
  debug = false,
  variant = 'scene',
  className = '',
  onStrike,
}: ComposeGalaxyBackdropProps) {
  const plateRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [bakeFailed, setBakeFailed] = useState(false);

  const { sceneValid } = useMemo(() => {
    const scene = createGalaxyBackdropScene();
    return { sceneValid: validateComposeScene(scene).ok };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(Boolean(mq?.matches));
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!sceneValid || bakeFailed) return undefined;
    const host = hostRef.current;
    const canvas = plateRef.current;
    if (!host || !canvas) return undefined;

    const dprCap = Math.min(window.devicePixelRatio || 1, 2);

    function bake() {
      const rect = host!.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width || host!.clientWidth || 1));
      const cssH = Math.max(1, Math.round(rect.height || host!.clientHeight || 1));
      const w = Math.max(1, Math.round(cssW * dprCap));
      const h = Math.max(1, Math.round(cssH * dprCap));
      let plate: ReturnType<typeof bakeGalaxyPlate>;
      try {
        plate = bakeGalaxyPlate(w, h);
      } catch {
        // Real bake failure → fall back to full StormCanvas (do not leave hybrid without a plate)
        setBakeFailed(true);
        return;
      }
      canvas!.width = w;
      canvas!.height = h;
      const ctx = canvas!.getContext('2d');
      if (!ctx) {
        setBakeFailed(true);
        return;
      }
      if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (typeof ctx.clearRect === 'function') {
        ctx.clearRect(0, 0, w, h);
      }
      // Missing drawImage in jsdom must not flip to fallback — shell tests rely on hybrid DOM.
      if (typeof ctx.drawImage === 'function' && plate.canvas) {
        ctx.drawImage(plate.canvas, 0, 0);
      }
      const ox = (plate.centerX / w) * 100;
      const oy = (plate.centerY / h) * 100;
      canvas!.style.transformOrigin = `${ox}% ${oy}%`;
      canvas!.style.animationDuration = `${periodSeconds(PATTERN_SPEED)}s`;
    }

    bake();
    const ro = new ResizeObserver(bake);
    ro.observe(host);
    return () => ro.disconnect();
  }, [sceneValid, bakeFailed]);

  if (!sceneValid || bakeFailed) {
    return (
      <StormCanvas
        className={className || 'portal-storm'}
        variant={variant}
        intensity={intensity}
        debug={debug}
        onStrike={onStrike}
        skipGalaxyPlate={false}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={`compose-galaxy-backdrop ${className}`.trim()}
      data-compose-galaxy="true"
      aria-hidden="true"
    >
      <div className="compose-galaxy-backdrop__plate-host" data-part="galaxy-plate">
        <canvas
          ref={plateRef}
          className={`galaxy-plate${reducedMotion ? ' galaxy-plate--static' : ''}`}
        />
      </div>
      <div className="compose-galaxy-backdrop__storm-host" data-part="storm-overlay">
        <StormCanvas
          className="portal-storm-overlay"
          variant={variant}
          intensity={intensity}
          debug={debug}
          onStrike={onStrike}
          skipGalaxyPlate
        />
      </div>
    </div>
  );
}
