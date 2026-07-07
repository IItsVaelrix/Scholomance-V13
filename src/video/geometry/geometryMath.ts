export interface Point { x: number; y: number; }

export function polarToCartesian(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export function nFoldVertices(
  cx: number, cy: number, r: number, n: number, theta: number
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + theta;
    pts.push(polarToCartesian(cx, cy, r, angle));
  }
  return pts;
}

export function lissajousPoints(
  a: number, b: number, delta: number, count: number, r: number, cx: number, cy: number
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push({ x: cx + Math.sin(a * t + delta) * r, y: cy + Math.sin(b * t) * r });
  }
  return pts;
}

export function beatPhase(frame: number, beats: number[]): number {
  if (!beats.length) return 0;
  let closestDist = Infinity;
  for (const b of beats) {
    const dist = Math.abs(b - frame);
    if (dist < closestDist) closestDist = dist;
  }
  let halfPeriod = 15;
  if (beats.length > 1) {
    let total = 0;
    for (let i = 1; i < beats.length; i++) total += beats[i] - beats[i - 1];
    halfPeriod = (total / (beats.length - 1)) * 0.5;
  }
  return Math.min(1, closestDist / halfPeriod);
}

export function beatCount(frame: number, beats: number[]): number {
  let count = 0;
  for (const b of beats) { if (b <= frame) count++; }
  return count;
}
