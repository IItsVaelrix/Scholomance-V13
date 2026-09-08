/**
 * CONSTRUCTION GUIDES
 *
 * Pure geometry for the 00_Reference construction layer (center cross,
 * concentric rings, radial spokes) used by shield/orb/radial drills.
 *
 * Contract: every emitted cell has integer, in-bounds coordinates — the
 * lattice engine keys cells by `"x,y"` and off-lattice fractional guides
 * are illegal (savage-audit regression: cx = 31.5 on a 64-wide grid).
 */

const DEFAULT_GUIDE_COLOR = '#00E5FF'; // bright cyan as per the Library

export function buildConstructionGuideCells({ width = 64, height = 64, color = DEFAULT_GUIDE_COLOR } = {}) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const cx = Math.floor((w - 1) / 2);
  const cy = Math.floor((h - 1) / 2);
  const maxRadius = Math.max(4, Math.floor(Math.min(w, h) / 2) - 1);

  const cells = [];
  const push = (x, y, extra) => {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      cells.push({ x, y, color, ...extra });
    }
  };

  // Center cross (cardinal ticks)
  push(cx, cy);
  for (let d = -2; d <= 2; d++) {
    if (d !== 0) {
      push(cx + d, cy);
      push(cx, cy + d);
    }
  }

  // Concentric rings (sample points on each ring)
  const ringStep = Math.max(4, Math.floor(maxRadius / 5));
  let ringIdx = 0;
  for (let r = ringStep; r <= maxRadius; r += ringStep) {
    const points = Math.max(12, Math.floor(r * 1.2));
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      push(
        Math.round(cx + r * Math.cos(angle)),
        Math.round(cy + r * Math.sin(angle)),
        { ring: ringIdx }
      );
    }
    ringIdx += 1;
  }

  // Radials (spokes)
  const numRadials = 8;
  for (let i = 0; i < numRadials; i++) {
    const angle = (i / numRadials) * Math.PI * 2;
    for (let r = 4; r <= maxRadius + 2; r += 1) {
      push(
        Math.round(cx + r * Math.cos(angle)),
        Math.round(cy + r * Math.sin(angle)),
        { radial: i }
      );
    }
  }

  return cells;
}
