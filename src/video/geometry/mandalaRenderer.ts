import { getRmsAtFrame, getBeatPulse } from '../editor/core/audio-analysis';
import type { AudioAnalysis } from '../editor/core/audio-analysis';
import { SCHOOL_PALETTE, hexToRgb, hexToRgba } from './schoolPalette';
import type { SchoolId } from './schoolPalette';
import { polarToCartesian, nFoldVertices, lissajousPoints, beatPhase, beatCount } from './geometryMath';

export interface MandalaRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frame: number;
  fps: number;
  audioAnalysis?: AudioAnalysis;
  schoolId?: SchoolId;
}

export function renderMandalaFrame({
  ctx, width, height, frame, fps, audioAnalysis, schoolId = 'default',
}: MandalaRenderParams): void {
  const palette = SCHOOL_PALETTE[schoolId];
  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.38;

  const rms   = audioAnalysis ? getRmsAtFrame(audioAnalysis, frame) : 0.3;
  const pulse = audioAnalysis ? getBeatPulse(audioAnalysis, frame, 8) : 0;
  const bPhase = audioAnalysis ? beatPhase(frame, audioAnalysis.beats) : 0;
  const bCount  = audioAnalysis ? beatCount(frame, audioAnalysis.beats) : 0;

  const baseTheta = frame * 0.018;
  const fastTheta = frame * 0.036;

  ctx.clearRect(0, 0, width, height);

  drawBackground(ctx, width, height, palette.primary, rms);

  const n = 6 + (bCount % 3);
  drawPolygonRing(ctx, cx, cy, baseR, n, baseTheta, palette.primary, pulse);
  drawPetalBloom(ctx, cx, cy, baseR, rms, pulse, baseTheta, palette.primary, palette.accent);
  drawHarmonicSpokes(ctx, cx, cy, baseR, baseTheta, rms, bPhase, palette.accent);
  drawLissajousSigil(ctx, cx, cy, baseR * 0.55, bPhase, baseTheta, frame);
  drawOrbitalParticles(ctx, cx, cy, baseR * 1.15, 24, fastTheta, pulse, palette.accent);

  // Glow pass: screen-blend the sigil with shadow
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.shadowBlur = 24;
  ctx.shadowColor = palette.glow;
  ctx.globalAlpha = 0.22;
  drawLissajousSigil(ctx, cx, cy, baseR * 0.55, bPhase, baseTheta, frame);
  ctx.restore();

  drawScanlines(ctx, width, height);
}

// ── Layer helpers ────────────────────────────────────────────────────────────

function drawBackground(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  primaryHex: string, rms: number,
): void {
  const { r, g, b } = hexToRgb(primaryHex);
  const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
  grad.addColorStop(0,   '#000000');
  grad.addColorStop(0.5, `rgba(${r},${g},${b},${(0.04 + rms * 0.06).toFixed(3)})`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},${(0.08 + rms * 0.1).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawPolygonRing(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  r: number, n: number, theta: number, colorHex: string, pulse: number,
): void {
  const { r: cr, g: cg, b: cb } = hexToRgb(colorHex);
  ctx.save();
  ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.38 + pulse * 0.3).toFixed(3)})`;
  ctx.lineWidth = 1.5 + pulse * 1.5;
  ctx.shadowBlur = 8 + pulse * 16;
  ctx.shadowColor = colorHex;

  const drawPoly = (radius: number, t: number, alpha: number) => {
    const verts = nFoldVertices(cx, cy, radius, n, t);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();
  };

  drawPoly(r, theta, 1);
  drawPoly(r * 0.72, -theta * 1.3, 0.22 + pulse * 0.15);
  ctx.restore();
}

function drawPetalBloom(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  baseR: number, rms: number, pulse: number, theta: number,
  primaryHex: string, accentHex: string,
): void {
  const petalCount = 8;
  const petalR = baseR * (0.3 + rms * 0.45);
  const { r, g, b } = hexToRgb(primaryHex);
  const { r: ar, g: ag, b: ab } = hexToRgb(accentHex);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + theta;
    const tipX = cx + Math.cos(angle) * petalR;
    const tipY = cy + Math.sin(angle) * petalR;
    const cp1X = cx + Math.cos(angle - 0.4) * petalR * 0.6;
    const cp1Y = cy + Math.sin(angle - 0.4) * petalR * 0.6;
    const cp2X = cx + Math.cos(angle + 0.4) * petalR * 0.6;
    const cp2Y = cy + Math.sin(angle + 0.4) * petalR * 0.6;

    const grad = ctx.createLinearGradient(cx, cy, tipX, tipY);
    grad.addColorStop(0,   `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.55, `rgba(${r},${g},${b},${(0.14 + rms * 0.22).toFixed(3)})`);
    grad.addColorStop(1,   `rgba(${ar},${ag},${ab},${(0.4 + pulse * 0.4).toFixed(3)})`);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, tipX, tipY);
    ctx.bezierCurveTo(cp2X, cp2Y, cp1X, cp1Y, cx, cy);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
}

function drawHarmonicSpokes(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  baseR: number, theta: number, rms: number, bPhase: number, accentHex: string,
): void {
  const { r, g, b } = hexToRgb(accentHex);
  const spokeCount = 12;
  ctx.save();
  ctx.lineWidth = 0.8;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2 + theta * 0.5;
    const band = Math.sin(i * 1.7 + bPhase * Math.PI * 2) * 0.5 + 0.5;
    const spokeR = baseR * (0.38 + band * rms * 0.55);
    const alpha = 0.18 + band * 0.12;
    const { x, y } = polarToCartesian(cx, cy, spokeR, angle);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();
}

// a:b Lissajous ratio cycles every 90 frames (3s at 30fps)
const LISSAJOUS_RATIOS: [number, number][] = [[3, 2], [5, 3], [4, 3]];

function drawLissajousSigil(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  r: number, bPhase: number, theta: number, frame: number,
): void {
  const CYCLE = 90;
  const segment = Math.floor((frame / CYCLE) % LISSAJOUS_RATIOS.length);
  const nextSeg = (segment + 1) % LISSAJOUS_RATIOS.length;
  const t = (frame % CYCLE) / CYCLE;
  const [a1, b1] = LISSAJOUS_RATIOS[segment];
  const [a2, b2] = LISSAJOUS_RATIOS[nextSeg];
  const a = a1 + (a2 - a1) * t;
  const b = b1 + (b2 - b1) * t;
  const delta = bPhase * Math.PI * 0.5 + theta * 0.1;

  const points = lissajousPoints(a, b, delta, 320, r, cx, cy);

  ctx.save();
  ctx.strokeStyle = 'rgba(241,231,200,0.65)';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawOrbitalParticles(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  r: number, count: number, theta: number, pulse: number, accentHex: string,
): void {
  const { r: cr, g: cg, b: cb } = hexToRgb(accentHex);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + theta;
    const { x, y } = polarToCartesian(cx, cy, r, angle);
    const shimmer = 0.5 + 0.5 * Math.sin(i * 1.3 + theta);
    const alpha = 0.3 + pulse * 0.7 * shimmer;
    const radius = 2 + pulse * 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
    ctx.shadowBlur = 6 + pulse * 10;
    ctx.shadowColor = accentHex;
    ctx.fill();
    ctx.restore();
  }
}

function drawScanlines(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#000';
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  ctx.restore();
}
