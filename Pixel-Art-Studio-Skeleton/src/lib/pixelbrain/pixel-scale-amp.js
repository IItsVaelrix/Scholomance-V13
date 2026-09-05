// codex/core/pixelbrain/pixel-scale-amp.js

/**
 * YUV colour distance (perceptual weights matching xBR reference: Y=48, U=7, V=6).
 * Inputs: [r,g,b] arrays (0-255 each).
 */
export function colorDist(a, b) {
  const aY =  0.299*a[0] + 0.587*a[1] + 0.114*a[2];
  const aU = -0.169*a[0] - 0.331*a[1] + 0.500*a[2];
  const aV =  0.500*a[0] - 0.419*a[1] - 0.081*a[2];
  const bY =  0.299*b[0] + 0.587*b[1] + 0.114*b[2];
  const bU = -0.169*b[0] - 0.331*b[1] + 0.500*b[2];
  const bV =  0.500*b[0] - 0.419*b[1] - 0.081*b[2];
  return 48 * Math.abs(aY - bY) + 7 * Math.abs(aU - bU) + 6 * Math.abs(aV - bV);
}

function getPixel(rgba, width, height, x, y) {
  const px = Math.max(0, Math.min(width  - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  const off = (py * width + px) * 4;
  return [rgba[off], rgba[off + 1], rgba[off + 2]];
}

function blend75(e, n) {
  return [
    Math.round(0.75 * e[0] + 0.25 * n[0]),
    Math.round(0.75 * e[1] + 0.25 * n[1]),
    Math.round(0.75 * e[2] + 0.25 * n[2]),
  ];
}

function putPixel(out, outW, x, y, c) {
  const off = (y * outW + x) * 4;
  out[off] = c[0]; out[off + 1] = c[1]; out[off + 2] = c[2]; out[off + 3] = 255; // opaque pixel art only
}

/**
 * xBR-style 2× pixel-art upscaler.
 *
 * Uses Scale2x neighbourhood pattern matching with YUV colour distance instead of
 * equality, and 75/25 sub-pixel blending instead of hard colour copies.
 * Straight horizontal/vertical lines are preserved exactly; 45° staircase edges
 * are smoothed by blending the corner sub-pixel toward its diagonal neighbour.
 *
 * @param {Uint8Array} rgba   — source pixels, width×height×4 bytes (RGBA)
 * @param {number}     width  — source width in pixels
 * @param {number}     height — source height in pixels
 * @returns {Uint8Array}      — upscaled pixels, (width×2)×(height×2)×4 bytes
 */
export function applyXBR2x(rgba, width, height) {
  const outW = width  * 2;
  const outH = height * 2;
  const out  = new Uint8Array(outW * outH * 4);

  const p = (x, y) => getPixel(rgba, width, height, x, y);
  const d = colorDist;

  // 30 YUV units: tight threshold appropriate for clean pixel art with distinct palette colours.
  // At Y-weight 48, this is ~0.6 luma steps — enough to group identical source pixels while
  // keeping every intentional colour boundary sharp.
  const EQ = 30;
  const eq = (a, b) => d(a, b) < EQ;
  const ne = (a, b) => !eq(a, b);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      //  A  B  C
      //  D [E] F
      //  G  H  I
      const A = p(x-1, y-1), B = p(x, y-1), C = p(x+1, y-1);
      const D = p(x-1, y  ), E = p(x, y  ), F = p(x+1, y  );
      const G = p(x-1, y+1), H = p(x, y+1), I = p(x+1, y+1);

      const e0 = (eq(D,B) && ne(D,H) && ne(B,F)) ? blend75(E,A) : E;
      const e1 = (eq(B,F) && ne(B,D) && ne(F,H)) ? blend75(E,C) : E;
      const e2 = (eq(D,H) && ne(D,B) && ne(H,F)) ? blend75(E,G) : E;
      const e3 = (eq(H,F) && ne(H,B) && ne(D,H)) ? blend75(E,I) : E; // SE → I

      putPixel(out, outW, x*2,   y*2,   e0);
      putPixel(out, outW, x*2+1, y*2,   e1);
      putPixel(out, outW, x*2,   y*2+1, e2);
      putPixel(out, outW, x*2+1, y*2+1, e3);
    }
  }

  return out;
}
