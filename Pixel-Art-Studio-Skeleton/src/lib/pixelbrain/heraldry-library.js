import { rasterLine, rasterArc, rasterCircle, rasterPolygon, rasterPath } from './raster-math.js';

export const HERALDRY_MARKS = {
  cross: (cx, cy, emit) => {
    rasterLine(cx, cy - 8, cx, cy + 8, emit);
    rasterLine(cx - 6, cy - 2, cx + 6, cy - 2, emit);
    rasterLine(cx - 1, cy - 8, cx - 1, cy + 8, emit);
    rasterLine(cx + 1, cy - 8, cx + 1, cy + 8, emit);
    rasterLine(cx - 6, cy - 3, cx + 6, cy - 3, emit);
    rasterLine(cx - 6, cy - 1, cx + 6, cy - 1, emit);
  },
  lightning: (cx, cy, emit) => {
    rasterPolygon([[cx + 2, cy - 10], [cx - 4, cy], [cx - 1, cy], [cx - 3, cy + 10], [cx + 4, cy + 1], [cx + 1, cy + 1]], emit);
  },
  moon: (cx, cy, emit) => {
    for (let y = cy - 6; y <= cy + 6; y++) {
      for (let x = cx - 6; x <= cx; x++) {
        const r1 = Math.hypot(x - cx, y - cy);
        const r2 = Math.hypot(x - (cx - 2), y - cy);
        if (r1 <= 6 && r2 >= 4) emit(x, y);
      }
    }
  },
  eye: (cx, cy, emit) => {
    rasterPath([[cx - 8, cy], [cx, cy - 4], [cx + 8, cy], [cx, cy + 4], [cx - 8, cy]], emit);
    rasterCircle(cx, cy, 2, emit);
  },
  flame: (cx, cy, emit) => {
    for (let y = cy - 8; y <= cy + 6; y++) {
      for (let x = cx - 5; x <= cx + 5; x++) {
        if (y > cy + Math.abs(x) - 4 && y < cy + 6 - Math.abs(x)) emit(x, y);
      }
    }
  },
  rune: (cx, cy, emit) => {
    rasterLine(cx - 4, cy - 6, cx - 4, cy + 6, emit);
    rasterLine(cx - 3, cy - 6, cx - 3, cy + 6, emit);
    rasterLine(cx - 4, cy, cx + 4, cy - 6, emit);
    rasterLine(cx - 4, cy, cx + 4, cy + 6, emit);
  },
  lion: (cx, cy, emit) => {
    // A stylized geometric lion head
    rasterPolygon([[cx - 4, cy - 6], [cx + 4, cy - 6], [cx + 6, cy - 2], [cx + 4, cy + 4], [cx, cy + 8], [cx - 4, cy + 4], [cx - 6, cy - 2]], emit);
    // Eyes (remove cells later? no, just emit mane)
    rasterLine(cx, cy - 2, cx, cy + 4, emit); // Nose bridge
  },
  wing: (cx, cy, emit) => {
    rasterPath([[cx - 6, cy + 6], [cx - 2, cy - 6], [cx + 6, cy - 8], [cx + 2, cy], [cx + 8, cy - 2], [cx + 4, cy + 4], [cx + 8, cy + 4], [cx, cy + 8]], emit);
  },
  skull: (cx, cy, emit) => {
    rasterCircle(cx, cy - 2, 5, emit);
    rasterPolygon([[cx - 3, cy + 2], [cx + 3, cy + 2], [cx + 2, cy + 6], [cx - 2, cy + 6]], emit);
  },
  serpent: (cx, cy, emit) => {
    rasterPath([[cx + 2, cy - 8], [cx - 2, cy - 8], [cx - 4, cy - 4], [cx + 4, cy], [cx - 4, cy + 4], [cx + 2, cy + 8], [cx - 2, cy + 8]], emit);
  },

  // Sonic Thaumaturgist — horizontal WiFi emblem, rotated so the curves go downward.
  // Laid out horizontally (wide across the face of the kite shield).
  // Source/transmitter on the left, signal arcs extending to the right.
  // The arcs are oriented/rotated with centers offset so the characteristic
  // WiFi curves bow or open downward.
  // Bold, thick arcs for strong pixel silhouette and contrast (cyan on sapphire face).
  sonic_thaumaturgist: (cx, cy, emit) => {
    // Source / transmitter dot on the LEFT side of the horizontal emblem
    const sx = cx - 10;
    const sy = cy;

    // Dot (the WiFi "device" or source icon)
    rasterCircle(sx, sy, 2, emit);
    rasterCircle(sx, sy, 1, emit);

    // Short horizontal base bar just to the right of the dot (horizontal orientation)
    rasterLine(sx + 2, sy - 1, sx + 5, sy - 1, emit);
    rasterLine(sx + 2, sy + 1, sx + 5, sy + 1, emit);

    // === Horizontal WiFi arcs to the RIGHT, with curves going DOWNWARD ===
    // Centers placed above the line so arcs (drawn on the lower side of their circles)
    // bow/sag downward as they extend right. Staggered for three distinct curved bars.
    // Angles start more "up-forward" and sweep toward down-right for the classic rotated WiFi look.

    // Innermost bar
    const c1x = sx + 5;
    const c1y = sy - 2;
    rasterArc(c1x, c1y, 4, emit, 0.4, 1.7);
    rasterArc(c1x, c1y, 5, emit, 0.4, 1.7);

    // Middle bar (more downward curve)
    const c2x = sx + 4;
    const c2y = sy - 5;
    rasterArc(c2x, c2y, 7, emit, 0.2, 1.9);
    rasterArc(c2x, c2y, 8, emit, 0.2, 1.9);
    rasterArc(c2x, c2y, 9, emit, 0.2, 1.9);

    // Outer bar (widest, strongest downward sweep)
    const c3x = sx + 3;
    const c3y = sy - 8;
    rasterArc(c3x, c3y, 10, emit, 0.0, 2.1);
    rasterArc(c3x, c3y, 11, emit, 0.0, 2.1);
    rasterArc(c3x, c3y, 12, emit, 0.0, 2.1);
  }
};
