import { getRmsAtFrame, getBeatPulse } from '../editor/core/audio-analysis';
import type { AudioAnalysis } from '../editor/core/audio-analysis';
import { polarToCartesian, lissajousPoints, beatPhase, beatCount } from './geometryMath';

// ── Palette ──────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const P: Record<string, RGB> = {
  indigo:  [99,  102, 241],
  violet:  [139, 92,  246],
  ice:     [199, 210, 254],
  silver:  [224, 231, 255],
  crimson: [248, 113, 113],
  azure:   [96,  165, 250],
  plasma:  [167, 139, 250],
  gold:    [197, 162, 111],
};

function rgb([r, g, b]: RGB, a: number): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// Deterministic per-seed random (no Math.random — Remotion frames must be deterministic)
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface DarkStarRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frame: number;
  fps: number;
  audioAnalysis?: AudioAnalysis;
}

export function renderDarkStarFrame({
  ctx, width, height, frame, fps, audioAnalysis,
}: DarkStarRenderParams): void {
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  const baseR  = minDim * 0.38;

  const rms    = audioAnalysis ? getRmsAtFrame(audioAnalysis, frame) : 0.3;
  const pulse  = audioAnalysis ? getBeatPulse(audioAnalysis, frame, 8) : 0;
  const bPhase = audioAnalysis ? beatPhase(frame, audioAnalysis.beats) : 0;
  const bCount = audioAnalysis ? beatCount(frame, audioAnalysis.beats) : 0;
  const beats  = audioAnalysis?.beats ?? [];

  const theta     = frame * 0.014;
  const fastTheta = frame * 0.031;

  // --- 0. Pure void fill
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // --- 1. Nebula plasma clouds
  drawNebula(ctx, cx, cy, minDim, frame, rms);

  // --- 2. Star field (two parallax depths, left→right travel)
  drawStarfield(ctx, width, height, frame, 280, 0.50, 0.30);
  drawStarfield(ctx, width, height, frame,  90, 0.88, 0.90);

  // --- 3. Binary code rain
  drawBinaryRain(ctx, width, height, frame, cx, cy, rms, pulse);

  // --- 4. Burning comet (every 45s, left→right, varied height)
  drawComet(ctx, width, height, frame, fps);

  // --- 5. Expanding beat-pulse rings
  drawWarpRings(ctx, cx, cy, baseR, beats, frame);

  // --- 6. Mirror-symmetric mandala arms
  drawMirrorArms(ctx, cx, cy, baseR, theta, rms, pulse, bCount);

  // --- 7. Event horizon (black hole + accretion)
  drawEventHorizon(ctx, cx, cy, baseR * 0.13, pulse, fastTheta);

  // --- 8. Chromatic Lissajous sigil
  drawChromaticLissajous(ctx, cx, cy, baseR * 0.58, bPhase, theta, frame, rms, pulse);

  // --- 9. Spectrogram audio-wave ring (pulsating circular spectrum)
  drawSpectrogramRing(ctx, cx, cy, baseR, theta, rms, pulse, frame, audioAnalysis);

  // --- 10. Orbital particle rings (3 layers)
  drawOrbitalRing(ctx, cx, cy, baseR * 0.52, 12, fastTheta * 1.5,  pulse,       P.ice,    2.5);
  drawOrbitalRing(ctx, cx, cy, baseR * 0.88, 20, -theta * 1.2,     pulse * 0.7, P.indigo, 2.0);
  drawOrbitalRing(ctx, cx, cy, baseR * 1.22, 28, fastTheta * 0.55, pulse * 0.5, P.violet, 1.5);

  // --- 10b. UFO flyby (every 60s) — symmetric pair above the star, scanning it
  drawUfos(ctx, width, height, frame, fps, cx, cy, baseR);

  // --- 11. Beat flash — snare positions only (beats 2 and 4 in the bar).
  // bCount is a 1-based running beat index; modulo 4 maps it to bar position:
  //   %4 === 1 → beat 1 (kick), %4 === 2 → beat 2 (snare),
  //   %4 === 3 → beat 3 (kick), %4 === 0 → beat 4 (snare, when bCount > 0).
  const isSnare = bCount > 0 && (bCount % 4 === 2 || bCount % 4 === 0);
  if (isSnare && pulse > 0.62) {
    const fa = ((pulse - 0.62) / 0.38) * 0.14;
    ctx.save();
    ctx.globalAlpha = fa;
    ctx.fillStyle = '#c7d2fe';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // --- 10. Radial vignette
  drawVignette(ctx, cx, cy, width, height);

  // --- 11. Scanlines
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#000';
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  ctx.restore();

  // --- 12. Stylized arcane border (drawn last so it frames everything)
  drawBorder(ctx, width, height, frame);
}

// ── Stylized border ───────────────────────────────────────────────────────────
// A grimoire frame: an edge-darkening inset, a gold double-rule, and arcane
// corner brackets that breathe softly. Painted, deterministic.

function drawBorder(
  ctx: CanvasRenderingContext2D,
  width: number, height: number, frame: number,
): void {
  const m       = Math.round(Math.min(width, height) * 0.035); // frame inset
  const breathe = 0.85 + 0.15 * Math.sin(frame * 0.04);
  const GOLD    = '197,162,111';
  const PARCH   = '241,231,200';

  ctx.save();

  // 1. Edge-darkening band so the frame sits on a deeper vignette.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, width, m);                       // top
  ctx.fillRect(0, height - m, width, m);              // bottom
  ctx.fillRect(0, 0, m, height);                      // left
  ctx.fillRect(width - m, 0, m, height);              // right

  // 2. Gold double-rule.
  ctx.strokeStyle = `rgba(${GOLD},${(0.55 * breathe).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(m, m, width - 2 * m, height - 2 * m);

  const m2 = m + 7;
  ctx.strokeStyle = `rgba(${GOLD},0.28)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(m2, m2, width - 2 * m2, height - 2 * m2);

  // 3. Arcane corner brackets with a small node at each vertex.
  const len = Math.round(Math.min(width, height) * 0.05);
  ctx.strokeStyle = `rgba(${PARCH},${(0.75 * breathe).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 8 * breathe;
  ctx.shadowColor = `rgba(${GOLD},0.7)`;

  const corners: [number, number, number, number][] = [
    [m,         m,          1,  1],   // top-left
    [width - m, m,         -1,  1],   // top-right
    [m,         height - m,  1, -1],  // bottom-left
    [width - m, height - m, -1, -1],  // bottom-right
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * len);
    ctx.stroke();
    // node dot
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${PARCH},${(0.9 * breathe).toFixed(3)})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── Nebula plasma ─────────────────────────────────────────────────────────────

function drawNebula(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, minDim: number,
  frame: number, rms: number,
): void {
  const blobs = [
    { ox:  0.18, oy: -0.12, r: 0.72, col: P.indigo,  spd: 0.0031 },
    { ox: -0.22, oy:  0.15, r: 0.65, col: P.violet,  spd: 0.0023 },
    { ox:  0.05, oy:  0.20, r: 0.58, col: P.plasma,  spd: 0.0041 },
    { ox: -0.12, oy: -0.18, r: 0.48, col: P.indigo,  spd: 0.0019 },
    { ox:  0.25, oy:  0.08, r: 0.52, col: P.violet,  spd: 0.0035 },
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const blob of blobs) {
    const angle = frame * blob.spd;
    const bx = cx + Math.cos(angle) * blob.ox * minDim;
    const by = cy + Math.sin(angle) * blob.oy * minDim;
    const br = blob.r * minDim * 0.5;
    const [r, g, b] = blob.col;
    const peak = 0.065 + rms * 0.07;
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0,   `rgba(${r},${g},${b},${peak.toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${(peak * 0.28).toFixed(3)})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Binary code rain ─────────────────────────────────────────────────────────

function drawBinaryRain(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  frame: number,
  cx: number, cy: number,
  rms: number, pulse: number,
): void {
  const CELL = 16;
  const COLS = Math.floor(width / CELL);
  const ROWS = Math.ceil(height / CELL);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.font = `${CELL - 1}px "JetBrains Mono", "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let col = 0; col < COLS; col++) {
    const x = (col + 0.5) * CELL;

    // Columns near the horizontal center fade out so the mandala punches through
    const distFromCenter = Math.abs(x - cx) / (width * 0.5);
    const centerFade = Math.min(1, Math.max(0, (distFromCenter - 0.08) / 0.55));
    if (centerFade < 0.02) continue;

    const speed     = 0.28 + seeded(col * 7 + 1) * 0.44;
    const streamLen = 18 + Math.floor(seeded(col * 7 + 2) * 24);
    const phaseOffset = seeded(col * 7 + 3) * (ROWS + streamLen);

    const headRow = ((frame * speed + phaseOffset) % (ROWS + streamLen)) - streamLen;

    for (let pos = 0; pos < streamLen; pos++) {
      const row = Math.floor(headRow + pos);
      if (row < 0 || row >= ROWS) continue;

      // Characters cycle every 5 frames — varied per column/row so streams differ
      const charSeed = col * 1337 + row + Math.floor(frame / 5) * 31;
      const char = seeded(charSeed) > 0.5 ? '1' : '0';

      // t=0 is tail (oldest), t=1 is head (newest/brightest)
      const t = 1 - pos / streamLen;
      const baseAlpha = t * t * centerFade * (0.55 + rms * 0.25);
      if (baseAlpha < 0.01) continue;

      // Palette: tail→violet, mid→indigo, near-head→ice, head→silver (flash on beat)
      let col_rgb: RGB;
      if (pos === 0) {
        col_rgb = P.silver;
      } else if (pos <= 2) {
        col_rgb = P.ice;
      } else if (t > 0.5) {
        col_rgb = P.indigo;
      } else {
        col_rgb = P.violet;
      }

      // Beat pulse brightens heads
      const headBoost = pos === 0 ? pulse * 0.4 : 0;

      const [r, g, b] = col_rgb;
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, baseAlpha + headBoost).toFixed(3)})`;
      ctx.fillText(char, x, row * CELL);
    }
  }

  ctx.restore();
}

// ── Burning comet ─────────────────────────────────────────────────────────────
// Deterministic from `frame`: every 45s an epoch begins, the comet flies left→
// right over ~4.5s, then space is empty until the next epoch. Each epoch seeds a
// different height + glide slope so it never crosses the same place twice.
// Painted (gradient fills + a few embers), no per-segment algorithm.

function drawComet(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  frame: number, fps: number,
): void {
  const period = Math.max(1, Math.round(45 * fps));   // one pass per 45 seconds
  const travel = Math.max(1, Math.round(4.5 * fps));  // visible flight time
  const local  = frame % period;
  if (local > travel) return;                          // empty space the rest of the time

  const epoch = Math.floor(frame / period);
  const t = local / travel;                            // 0 → 1 across the screen

  // Horizontal: enter from off the left, exit off the right (constant speed).
  const margin = width * 0.28;
  const headX  = -margin + t * (width + margin * 2);

  // Vertical: a different band each epoch, with a gentle glide + lazy arc.
  const baseY  = height * (0.16 + seeded(epoch * 3 + 1) * 0.6);
  const slope  = (seeded(epoch * 3 + 2) - 0.5) * height * 0.22;
  const arc    = Math.sin(t * Math.PI) * (seeded(epoch * 3 + 3) - 0.5) * height * 0.14;
  const headY  = baseY + slope * (t - 0.5) * 2 + arc;

  // Soft fade-in / fade-out so the glow never pops.
  const fade = ease(Math.min(1, t / 0.12)) * ease(Math.min(1, (1 - t) / 0.12));
  if (fade <= 0.001) return;

  const scale   = Math.min(width, height);
  const comaR   = scale * 0.018;
  const tailLen = width * (0.30 + seeded(epoch * 3 + 4) * 0.14);

  // Tail streams back and slightly up (classic Halley fan).
  const ux = -0.985, uy = -0.172;                      // unit vector, back + up
  const px = -uy,    py = ux;                           // perpendicular
  const tailEndX = headX + ux * tailLen;
  const tailEndY = headY + uy * tailLen;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Shimmer factor pulses the tail width/alpha over time.
  const shimmer = 0.82 + 0.18 * Math.sin(frame * 0.5 + epoch * 2.0);

  // 1. Outer dust tail — wide, faint, fanned.
  paintTail(
    ctx, headX, headY, tailEndX, tailEndY, px, py,
    comaR * 2.4 * shimmer, fade * 0.5,
    [248, 113, 113], [255, 150, 60],
  );

  // 2. Inner ion tail — narrower, hotter, brighter.
  const innerEndX = headX + ux * tailLen * 0.74;
  const innerEndY = headY + uy * tailLen * 0.74;
  paintTail(
    ctx, headX, headY, innerEndX, innerEndY, px, py,
    comaR * 1.1 * (2 - shimmer), fade * 0.8,
    [255, 200, 120], [255, 120, 50],
  );

  // 3. Shimmering embers drifting down the tail.
  const EMBERS = 16;
  for (let i = 0; i < EMBERS; i++) {
    const s = (i + 0.5) / EMBERS;                       // position along tail
    const tw = 0.5 + 0.5 * Math.sin(frame * 0.4 + i * 1.7 + epoch);
    const jitter = (seeded(i * 5 + epoch) - 0.5) * comaR * 3.2 * s;
    const ex = headX + ux * tailLen * s + px * jitter;
    const ey = headY + uy * tailLen * s + py * jitter;
    const er = (comaR * 0.5) * (1 - s) * (0.6 + tw * 0.7);
    const ea = fade * (1 - s) * (0.25 + tw * 0.55);
    if (ea < 0.02 || er < 0.3) continue;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,${Math.round(140 + tw * 90)},${Math.round(40 + tw * 50)},${ea.toFixed(3)})`;
    ctx.fill();
  }

  // 4. Coma — soft glowing halo around the nucleus.
  const coma = ctx.createRadialGradient(headX, headY, 0, headX, headY, comaR * 3.2);
  coma.addColorStop(0,   `rgba(255,240,210,${(fade * 0.9).toFixed(3)})`);
  coma.addColorStop(0.3, `rgba(255,170,90,${(fade * 0.5).toFixed(3)})`);
  coma.addColorStop(1,   `rgba(255,90,40,0)`);
  ctx.fillStyle = coma;
  ctx.beginPath();
  ctx.arc(headX, headY, comaR * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 5. White-hot nucleus.
  ctx.beginPath();
  ctx.arc(headX, headY, comaR * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,250,235,${fade.toFixed(3)})`;
  ctx.shadowBlur = comaR * 2;
  ctx.shadowColor = 'rgba(255,180,110,0.9)';
  ctx.fill();

  ctx.restore();
}

// One fanned tail: a tapered triangle (apex at head) filled with a fading
// head→tip gradient. Single path, single fill.
function paintTail(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number, ex: number, ey: number,
  px: number, py: number,
  halfW: number, alpha: number,
  tipRGB: RGB, midRGB: RGB,
): void {
  const [tr, tg, tb] = tipRGB;
  const [mr, mg, mb] = midRGB;
  const grad = ctx.createLinearGradient(hx, hy, ex, ey);
  grad.addColorStop(0,   `rgba(${mr},${mg},${mb},${alpha.toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(${tr},${tg},${tb},${(alpha * 0.45).toFixed(3)})`);
  grad.addColorStop(1,   `rgba(${tr},${tg},${tb},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(ex + px * halfW, ey + py * halfW);
  ctx.lineTo(ex - px * halfW, ey - py * halfW);
  ctx.closePath();
  ctx.fill();
}

// ── UFO flyby ─────────────────────────────────────────────────────────────────
// Deterministic from `frame`: every 60s a symmetric pair of saucers descends
// above the star (mirrored across the vertical axis), hovers while sweeping
// holographic tractor beams that converge on and scan the sphere, then rises
// away. All painted — gradient discs, a glass dome, blinking lights, and a
// clipped scan-band beam — no per-pixel work.

function drawUfos(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  frame: number, fps: number,
  cx: number, cy: number, baseR: number,
): void {
  const period = Math.max(1, Math.round(60 * fps));   // one visit per minute
  const appear = Math.max(1, Math.round(8 * fps));     // ~8s on screen
  const local  = frame % period;
  if (local > appear) return;

  const t = local / appear;                            // 0 → 1 over the visit
  // env: descend in (0→1), hold, ascend out (1→0). Drives both Y and opacity.
  const env = Math.min(ease(Math.min(1, t / 0.16)), ease(Math.min(1, (1 - t) / 0.16)));
  if (env <= 0.001) return;

  const s       = Math.min(width, height) * 0.05;      // saucer half-width
  // Hover near the top of the frame (on-screen) but clamped to stay above the
  // star's outer rings so the saucers always read as "above the star".
  const hoverY  = Math.min(height * 0.16, cy - baseR * 1.05);
  const startY  = -height * 0.2;                        // off the top of the screen
  const ufoY    = startY + (hoverY - startY) * env;    // descend / ascend
  const sweep   = Math.sin(frame * 0.045) * baseR * 0.3; // beams scan side to side

  // Symmetric pair: mirrored across the vertical centre axis.
  for (const side of [-1, 1] as const) {
    const ufoX    = cx + side * baseR * 0.92;
    const targetX = cx + side * sweep;                 // mirrored scan target on the star
    paintTractorBeam(ctx, ufoX, ufoY + s * 0.28, targetX, cy, s * 0.42, baseR * 0.42, frame, env);
    paintUfo(ctx, ufoX, ufoY, s, env, frame);
  }

  // Where the beams land: a soft cyan scan-bloom pulsing on the sphere.
  const sg = 0.3 + 0.22 * Math.sin(frame * 0.22);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const lg = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.42);
  lg.addColorStop(0, `rgba(150,240,255,${(0.24 * env * sg).toFixed(3)})`);
  lg.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Holographic tractor beam: a cone from the saucer underside to a target on the
// star, filled with a fading cyan gradient, bright edges, and scan bands that
// travel down the cone (clipped to its shape) to read as an active scan.
function paintTractorBeam(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  w0: number, w1: number, frame: number, alpha: number,
): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const corner = (sParam: number, w: number, sign: number) => ({
    x: x0 + ux * len * sParam + px * w * sign,
    y: y0 + uy * len * sParam + py * w * sign,
  });

  const aL = corner(0, w0, 1), aR = corner(0, w0, -1);
  const bL = corner(1, w1, 1), bR = corner(1, w1, -1);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Cone fill
  ctx.beginPath();
  ctx.moveTo(aL.x, aL.y);
  ctx.lineTo(bL.x, bL.y);
  ctx.lineTo(bR.x, bR.y);
  ctx.lineTo(aR.x, aR.y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0,   `rgba(150,245,255,${(0.32 * alpha).toFixed(3)})`);
  g.addColorStop(0.6, `rgba(100,210,255,${(0.13 * alpha).toFixed(3)})`);
  g.addColorStop(1,   'rgba(80,180,255,0)');
  ctx.fillStyle = g;
  ctx.fill();

  // Bright holographic edges
  ctx.strokeStyle = `rgba(190,250,255,${(0.5 * alpha).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(aL.x, aL.y); ctx.lineTo(bL.x, bL.y);
  ctx.moveTo(aR.x, aR.y); ctx.lineTo(bR.x, bR.y);
  ctx.stroke();

  // Travelling scan bands (clipped to the cone)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(aL.x, aL.y);
  ctx.lineTo(bL.x, bL.y);
  ctx.lineTo(bR.x, bR.y);
  ctx.lineTo(aR.x, aR.y);
  ctx.closePath();
  ctx.clip();
  const BANDS = 4;
  for (let i = 0; i < BANDS; i++) {
    const sp = ((frame * 0.012 + i / BANDS) % 1 + 1) % 1;
    const w  = w0 + (w1 - w0) * sp;
    const c1 = corner(sp, w, 1), c2 = corner(sp, w, -1);
    ctx.strokeStyle = `rgba(205,255,255,${(0.42 * alpha * (1 - sp)).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

// Classic saucer: metallic disc, glass dome, and a row of blinking belly lights.
function paintUfo(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, s: number, alpha: number, frame: number,
): void {
  const rx = s, ry = s * 0.32;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Disc body
  const bg = ctx.createLinearGradient(x, y - ry, x, y + ry);
  bg.addColorStop(0,    '#9fb4d4');
  bg.addColorStop(0.45, '#46587a');
  bg.addColorStop(1,    '#0d121b');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,220,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glass dome (top half)
  const dr = s * 0.5;
  const dg = ctx.createRadialGradient(x - dr * 0.3, y - ry - dr * 0.3, dr * 0.1, x, y - ry * 0.6, dr);
  dg.addColorStop(0,   'rgba(180,250,255,0.95)');
  dg.addColorStop(0.6, 'rgba(90,200,230,0.7)');
  dg.addColorStop(1,   'rgba(40,90,130,0.5)');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(x, y - ry * 0.5, dr, dr * 0.85, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Blinking belly lights
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const LIGHTS = 7;
  for (let i = 0; i < LIGHTS; i++) {
    const u  = i / (LIGHTS - 1) - 0.5;                 // -0.5 .. 0.5
    const lx = x + u * rx * 1.7;
    const ly = y + ry * 0.55 - Math.abs(u) * ry * 0.5; // ride the underside curve
    const blink = 0.4 + 0.6 * Math.sin(frame * 0.3 + i * 1.3);
    ctx.beginPath();
    ctx.arc(lx, ly, s * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(140,240,255,${(alpha * blink).toFixed(3)})`;
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(140,240,255,0.9)';
    ctx.fill();
  }
  ctx.restore();
}

// ── Star field ────────────────────────────────────────────────────────────────
// Stars travel left→right. Size-correlated parallax: bigger (closer) stars move
// faster and leave a horizontal motion streak. Two layers are called with
// different baseSpeed values to create depth separation.

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number, height: number,
  frame: number, count: number, maxAlpha: number,
  baseSpeed: number,   // pixels per frame for a "size 1" star
): void {
  ctx.save();

  for (let i = 0; i < count; i++) {
    const originX  = seeded(i * 3 + 1) * width;
    const py       = seeded(i * 3 + 2) * height;
    const size     = seeded(i * 3 + 3) * 1.6 + 0.4;

    // Larger stars are closer → move faster (parallax)
    const speedScale = 0.5 + size * 0.7;           // 0.78→1.82× for size 0.4→1.6
    const speed      = baseSpeed * speedScale;

    // Twinkle — slower rate than before so it doesn't fight the motion
    const twinkle = 0.6 + 0.4 * Math.sin(frame * 0.03 + seeded(i + 77) * Math.PI * 6);
    const alpha   = twinkle * maxAlpha * (0.35 + seeded(i * 2 + 9) * 0.65);

    // Wrap on X axis so the stream is continuous
    const px = ((originX + frame * speed) % width + width) % width;

    ctx.globalAlpha = alpha;

    const trailLen = speed * 5; // streak proportional to actual velocity

    if (trailLen > 2.5) {
      // Fast/close star — draw as a horizontal streak
      const grad = ctx.createLinearGradient(px - trailLen, py, px, py);
      grad.addColorStop(0, 'rgba(224,231,255,0)');
      grad.addColorStop(1, 'rgba(224,231,255,1)');
      ctx.strokeStyle = grad;
      ctx.lineWidth   = size * 0.9;
      ctx.beginPath();
      ctx.moveTo(px - trailLen, py);
      ctx.lineTo(px, py);
      ctx.stroke();
      // Bright dot at the leading tip
      ctx.beginPath();
      ctx.arc(px, py, size * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224,231,255,1)';
      ctx.fill();
    } else {
      // Slow/distant star — simple dot
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = '#e0e7ff';
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── Warp rings ────────────────────────────────────────────────────────────────

function drawWarpRings(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseR: number,
  beats: number[],
  frame: number,
): void {
  const RING_LIFE = 50;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const b of beats) {
    const age = frame - b;
    if (age < 0 || age > RING_LIFE) continue;
    const t  = age / RING_LIFE;
    const r  = baseR * 0.06 + t * baseR * 1.65;
    const alpha = (1 - t) * (1 - t) * 0.55;
    if (alpha < 0.01) continue;
    const lw = Math.max(0.5, (1.8 - t) * 2.0);
    // Primary expansion ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgb(P.ice, alpha);
    ctx.lineWidth = lw;
    ctx.stroke();
    // Inner echo ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.76, 0, Math.PI * 2);
    ctx.strokeStyle = rgb(P.indigo, alpha * 0.4);
    ctx.lineWidth = Math.max(0.3, lw * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Mirror arms ───────────────────────────────────────────────────────────────

function drawMirrorArms(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseR: number, theta: number,
  rms: number, pulse: number, bCount: number,
): void {
  const ARM_COUNT = 6;
  const armR = baseR * (0.88 + rms * 0.18);

  ctx.save();
  ctx.translate(cx, cy);

  for (let i = 0; i < ARM_COUNT; i++) {
    const angle = (i / ARM_COUNT) * Math.PI * 2 + theta;
    ctx.save();
    ctx.rotate(angle);
    // Original arm
    drawSingleArm(ctx, armR, rms, pulse, i);
    // Mirror arm (reflection across the arm axis)
    ctx.scale(1, -1);
    drawSingleArm(ctx, armR, rms, pulse, i);
    ctx.restore();
  }

  ctx.restore();
}

function drawSingleArm(
  ctx: CanvasRenderingContext2D,
  armR: number, rms: number, pulse: number, seed: number,
): void {
  // Tapered gradient line
  const grad = ctx.createLinearGradient(0, 0, armR, 0);
  grad.addColorStop(0,    rgb(P.indigo, 0));
  grad.addColorStop(0.28, rgb(P.ice,    0.38 + pulse * 0.32));
  grad.addColorStop(0.72, rgb(P.indigo, 0.22 + rms * 0.18));
  grad.addColorStop(1,    rgb(P.ice,    0));
  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(armR, 0);
  ctx.stroke();
  ctx.restore();

  // Plasma bezier bulge
  const bulgeAmp = armR * (0.06 + rms * 0.07) * (seed % 2 === 0 ? 1 : 0.65);
  ctx.save();
  ctx.strokeStyle = rgb(P.plasma, 0.18 + pulse * 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(armR * 0.14, 0);
  ctx.bezierCurveTo(armR * 0.34, bulgeAmp, armR * 0.64, bulgeAmp * 1.2, armR * 0.92, 0);
  ctx.stroke();
  ctx.restore();

  // Tick marks
  ctx.save();
  ctx.strokeStyle = rgb(P.ice, 0.28);
  ctx.lineWidth = 0.6;
  for (let j = 1; j <= 6; j++) {
    const tx = (j / 7) * armR;
    const h  = j === 3 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(tx, -h);
    ctx.lineTo(tx,  h);
    ctx.stroke();
  }
  ctx.restore();

  // Tip particle
  ctx.save();
  ctx.beginPath();
  ctx.arc(armR * 0.94, 0, 2.5 + pulse * 4, 0, Math.PI * 2);
  ctx.fillStyle = rgb(P.ice, 0.5 + pulse * 0.5);
  ctx.shadowBlur  = 8 + pulse * 14;
  ctx.shadowColor = '#c7d2fe';
  ctx.fill();
  ctx.restore();
}

// ── Event horizon ─────────────────────────────────────────────────────────────

function drawEventHorizon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  coreR: number, pulse: number, theta: number,
): void {
  const lensR = coreR * 3.2;

  // Chromatic gravitational lensing arcs
  const lensChannels: [RGB, number][] = [
    [P.crimson,  -0.055],
    [P.ice,       0    ],
    [P.azure,     0.055],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [[r, g, b], offset] of lensChannels) {
    ctx.beginPath();
    ctx.arc(cx + offset * lensR, cy, lensR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},0.11)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Rotating partial arcs (lensing shimmer)
  for (let i = 0; i < 4; i++) {
    const arcBase = theta * 0.65 + (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, lensR * (0.88 + i * 0.07), arcBase, arcBase + Math.PI * 0.32);
    const [r, g, b] = i % 2 === 0 ? P.indigo : P.azure;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  const holeR = coreR * (1 + pulse * 0.2);

  // Gravitationally-warped red glare (drawn UNDER the void disc so the warped
  // photon ring hugs the shadow's edge like a lensed accretion disk).
  drawGravitationalGlare(ctx, cx, cy, holeR, pulse, theta);

  // Absolute void disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // Re-stroke the hot photon ring ON TOP of the shadow edge so the red glare
  // appears to wrap over the near rim of the disc (the lensing "over-the-top" arc).
  drawPhotonRing(ctx, cx, cy, holeR, pulse, theta);

  // Accretion ring glow (cool indigo halo, sits outside the red glare)
  ctx.save();
  const ag = ctx.createRadialGradient(cx, cy, holeR * 1.1, cx, cy, holeR * 2.1);
  ag.addColorStop(0,   `rgba(99,102,241,${(0.30 + pulse * 0.28).toFixed(3)})`);
  ag.addColorStop(0.5, `rgba(139,92,246,0.10)`);
  ag.addColorStop(1,   `rgba(99,102,241,0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, holeR * 2.1, 0, Math.PI * 2);
  ctx.fillStyle = ag;
  ctx.globalCompositeOperation = 'screen';
  ctx.fill();
  ctx.restore();
}

// smoothstep — eases the beat swell (slow-in / slow-out) so the glare breathes
// instead of snapping. Classic animation easing, not a per-pixel algorithm.
function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// The glare is PAINTED, not computed: a few broad gradient fills plus one warped
// ellipse stroke. Warp comes from drawing in a squashed/rotated frame (the disk
// seen near edge-on); Doppler asymmetry comes from offsetting the gradient
// centers, not from per-segment math. No loops, no shadowBlur spam.
function drawGravitationalGlare(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  holeR: number, pulse: number, theta: number,
): void {
  const ep      = ease(pulse);            // eased swell
  const beamDir = theta * 0.5;            // bright side orbits slowly
  const bx      = Math.cos(beamDir);      // -1..1 horizontal Doppler offset
  const by      = Math.sin(beamDir) * 0.45;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  // Disk plane: rotate gently (precession) and squash vertically so everything
  // painted inside reads as an edge-on, gravitationally-tilted disk.
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(theta * 0.3) * 0.10);
  ctx.scale(1.0, 0.62);

  // 1. Broad ember bloom — offset toward the bright side for the warped look.
  const haloCx = bx * holeR * 0.5;
  const halo = ctx.createRadialGradient(haloCx, 0, holeR * 0.5, haloCx, 0, holeR * 4.0);
  halo.addColorStop(0,    `rgba(255,80,45,${(0.30 + ep * 0.26).toFixed(3)})`);
  halo.addColorStop(0.32, `rgba(214,40,40,${(0.15 + ep * 0.13).toFixed(3)})`);
  halo.addColorStop(0.7,  `rgba(150,20,30,0.06)`);
  halo.addColorStop(1,    `rgba(120,15,25,0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, holeR * 4.0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Doppler hot spot — one soft blob riding the approaching rim.
  const hotCx = bx * holeR * 1.6;
  const hotCy = by * holeR * 1.6;
  const hot = ctx.createRadialGradient(hotCx, hotCy, 0, hotCx, hotCy, holeR * 1.7);
  hot.addColorStop(0,   `rgba(255,205,150,${(0.45 + ep * 0.35).toFixed(3)})`);
  hot.addColorStop(0.5, `rgba(255,110,55,${(0.18 + ep * 0.12).toFixed(3)})`);
  hot.addColorStop(1,   `rgba(255,90,40,0)`);
  ctx.fillStyle = hot;
  ctx.beginPath();
  ctx.arc(hotCx, hotCy, holeR * 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Hot photon ring: ONE warped ellipse stroke with a Doppler gradient.
// Drawn over the shadow rim. Single path, single shadow → cheap and smooth.
function drawPhotonRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  holeR: number, pulse: number, theta: number,
): void {
  const ep      = ease(pulse);
  const beamDir = theta * 0.5;
  const bx      = Math.cos(beamDir);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Warp = a vertically taller ellipse (light lensed up over and under the hole),
  // tilted by the same precession as the disk plane.
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(theta * 0.3) * 0.10);

  const rx = holeR * 1.06;
  const ry = holeR * (1.16 + ep * 0.05);

  // Horizontal gradient = approaching (bright orange) vs receding (dim red) side.
  const grad = ctx.createLinearGradient(-rx * bx, 0, rx * bx, 0);
  grad.addColorStop(0,   `rgba(180,30,30,${(0.20 + ep * 0.15).toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(255,110,55,${(0.45 + ep * 0.30).toFixed(3)})`);
  grad.addColorStop(1,   `rgba(255,190,130,${(0.70 + ep * 0.30).toFixed(3)})`);

  ctx.strokeStyle = grad;
  ctx.lineWidth   = 2.0 + ep * 1.8;
  ctx.shadowBlur  = 12 + ep * 14;
  ctx.shadowColor = 'rgba(255,90,40,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// ── Chromatic Lissajous sigil ─────────────────────────────────────────────────

const LISSAJOUS_RATIOS: [number, number][] = [[3, 2], [5, 3], [4, 3], [7, 4], [5, 4]];

function drawChromaticLissajous(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number, bPhase: number, theta: number, frame: number,
  rms: number, pulse: number,
): void {
  const CYCLE = 90;
  const seg     = Math.floor((frame / CYCLE) % LISSAJOUS_RATIOS.length);
  const nextSeg = (seg + 1) % LISSAJOUS_RATIOS.length;
  const t       = (frame % CYCLE) / CYCLE;
  const [a1, b1] = LISSAJOUS_RATIOS[seg];
  const [a2, b2] = LISSAJOUS_RATIOS[nextSeg];
  const a = a1 + (a2 - a1) * t;
  const b = b1 + (b2 - b1) * t;
  const delta = bPhase * Math.PI * 0.5 + theta * 0.08;
  const aberr  = 4 + pulse * 7;

  function drawLayer(dx: number, col: RGB, alpha: number) {
    const [cr, cg, cb] = col;
    const pts = lissajousPoints(a, b, delta, 360, r, cx + dx, cy);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
    ctx.lineWidth   = 1.4;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  drawLayer( aberr, P.crimson, 0.32);
  drawLayer(-aberr, P.azure,   0.32);
  drawLayer(0,      P.silver,  0.68);
  ctx.restore();

  // Glow pass
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.shadowBlur  = 20 + pulse * 22;
  ctx.shadowColor = '#818cf8';
  ctx.globalAlpha = 0.16 + rms * 0.14;
  const glowPts = lissajousPoints(a, b, delta, 360, r, cx, cy);
  ctx.beginPath();
  ctx.moveTo(glowPts[0].x, glowPts[0].y);
  for (let i = 1; i < glowPts.length; i++) ctx.lineTo(glowPts[i].x, glowPts[i].y);
  ctx.closePath();
  ctx.strokeStyle = rgb(P.ice, 0.6);
  ctx.lineWidth   = 1.4;
  ctx.stroke();
  ctx.restore();
}

// ── Spectrogram audio-wave ring ───────────────────────────────────────────────
// The analysis only carries an RMS amplitude envelope (no FFT bins), so we derive
// a real spectrum from it: the modulation spectrum — a DFT of the recent RMS
// history. Low bins = slow loudness swells, high bins = fast tremolo/transients.
// That genuine per-band magnitude drives a mirrored circular bar spectrum that
// pulsates with the beat, reading as a spectrogram wrapped into a ring.

const SPECTRUM_BANDS  = 64;   // distinct frequency bins (mirrored → 128 bars)
const SPECTRUM_WINDOW = 96;   // RMS samples (frames) fed into the DFT

function rmsModulationSpectrum(
  analysis: AudioAnalysis | undefined,
  frame: number,
  bands: number,
  windowLen: number,
): number[] {
  const out = new Array<number>(bands).fill(0);
  if (!analysis || !analysis.rms.length) return out;

  // Gather the RMS history window ending at the current frame.
  const win = new Array<number>(windowLen);
  let mean = 0;
  for (let t = 0; t < windowLen; t++) {
    const v = getRmsAtFrame(analysis, frame - (windowLen - 1 - t));
    win[t] = v;
    mean += v;
  }
  mean /= windowLen;

  // DFT magnitude per band (DC removed so bin 0 isn't a constant offset).
  for (let k = 1; k <= bands; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < windowLen; t++) {
      const v = win[t] - mean;
      const ang = (2 * Math.PI * k * t) / windowLen;
      re += v * Math.cos(ang);
      im += v * Math.sin(ang);
    }
    // Normalize, then apply a gentle high-band boost so upper bins stay visible.
    const mag = (Math.sqrt(re * re + im * im) / windowLen) * (1 + (k / bands) * 1.6);
    out[k - 1] = mag;
  }

  // Normalize to the window's own peak so the ring always reads full-scale.
  let peak = 1e-4;
  for (const m of out) if (m > peak) peak = m;
  for (let i = 0; i < bands; i++) out[i] = Math.min(1, out[i] / peak);

  return out;
}

function bandColor(t: number): RGB {
  // t: 0 (low band) → 1 (high band). Warm violet → indigo → ice → silver.
  if (t < 0.33) return P.violet;
  if (t < 0.60) return P.indigo;
  if (t < 0.85) return P.ice;
  return P.silver;
}

function drawSpectrogramRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseR: number, theta: number, rms: number, pulse: number,
  frame: number, analysis: AudioAnalysis | undefined,
): void {
  const spectrum = rmsModulationSpectrum(analysis, frame, SPECTRUM_BANDS, SPECTRUM_WINDOW);

  // Ring breathes with overall loudness + punches outward on the beat.
  const innerR  = baseR * (0.30 + rms * 0.05 + pulse * 0.03);
  const maxBar  = baseR * (0.30 + rms * 0.10);
  const barCount = SPECTRUM_BANDS * 2;             // mirrored, symmetric ring
  const angStep  = (Math.PI * 2) / barCount;
  const ringTheta = theta * 0.4;                   // slow rotation of the whole ring

  // Precompute each bar's tip radius for the connecting outline.
  const tipR = new Array<number>(barCount);
  for (let i = 0; i < barCount; i++) {
    // Mirror: bars 0..N run up the spectrum, N..2N run back down → bilateral symmetry.
    const band = i < SPECTRUM_BANDS ? i : (barCount - 1 - i);
    const mag  = spectrum[band] ?? 0;
    // A touch of beat pulse lifts the floor so the ring never fully collapses.
    tipR[i] = innerR + (mag * 0.9 + pulse * 0.1) * maxBar;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // 1. Radial spectrum bars.
  ctx.lineCap = 'round';
  for (let i = 0; i < barCount; i++) {
    const angle = i * angStep + ringTheta;
    const band  = i < SPECTRUM_BANDS ? i : (barCount - 1 - i);
    const t     = band / (SPECTRUM_BANDS - 1);
    const [r, g, b] = bandColor(t);
    const mag   = (tipR[i] - innerR) / Math.max(1, maxBar);
    const alpha = 0.22 + mag * 0.5 + pulse * 0.15;

    const { x: x1, y: y1 } = polarToCartesian(cx, cy, innerR, angle);
    const { x: x2, y: y2 } = polarToCartesian(cx, cy, tipR[i], angle);
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.4).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 2. Connecting waveform outline through the bar tips (the "audio wave" line).
  ctx.beginPath();
  for (let i = 0; i <= barCount; i++) {
    const idx = i % barCount;
    const angle = idx * angStep + ringTheta;
    const { x, y } = polarToCartesian(cx, cy, tipR[idx], angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = rgb(P.ice, 0.4 + pulse * 0.3);
  ctx.lineWidth = 1.1;
  ctx.shadowBlur = 10 + pulse * 16;
  ctx.shadowColor = '#c7d2fe';
  ctx.stroke();

  // 3. Bright tip dots on the strongest bands.
  for (let i = 0; i < barCount; i++) {
    const mag = (tipR[i] - innerR) / Math.max(1, maxBar);
    if (mag < 0.55) continue;
    const angle = i * angStep + ringTheta;
    const { x, y } = polarToCartesian(cx, cy, tipR[i], angle);
    ctx.beginPath();
    ctx.arc(x, y, 1.3 + mag * 2, 0, Math.PI * 2);
    ctx.fillStyle = rgb(P.silver, 0.5 + mag * 0.4);
    ctx.fill();
  }

  ctx.restore();
}

// ── Orbital ring ──────────────────────────────────────────────────────────────

function drawOrbitalRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number, count: number, theta: number,
  pulse: number, col: RGB, size: number,
): void {
  const [cr, cg, cb] = col;
  for (let i = 0; i < count; i++) {
    const angle   = (i / count) * Math.PI * 2 + theta;
    const shimmer = 0.5 + 0.5 * Math.sin(i * 1.9 + theta * 3.1);
    const alpha   = 0.24 + pulse * 0.65 * shimmer;
    const { x, y } = polarToCartesian(cx, cy, r, angle);
    const pr = size * (0.7 + pulse * 0.6 * shimmer);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, pr), 0, Math.PI * 2);
    ctx.fillStyle   = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
    ctx.shadowBlur  = 6 + pulse * 14;
    ctx.shadowColor = `rgb(${cr},${cg},${cb})`;
    ctx.fill();
    ctx.restore();
  }
}

// ── Radial vignette ───────────────────────────────────────────────────────────

function drawVignette(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, width: number, height: number,
): void {
  const inner = Math.min(width, height) * 0.35;
  const outer = Math.max(width, height) * 0.78;
  const grad  = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}
