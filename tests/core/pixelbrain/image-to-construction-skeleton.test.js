import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  extractConstructionSkeleton,
  maskFromCoordinates,
  pbrainToConstructionSkeleton,
  imageToConstructionSkeleton,
} from '../../../codex/core/pixelbrain/image-to-construction-skeleton.js';
import { getPartProfile } from '../../../codex/core/pixelbrain/part-profile-library.js';
import '../../../codex/core/pixelbrain/character-body-profiles.js';

// --- synthetic mask helpers ---------------------------------------------------
const W = 32;
const H = 48;

function blankMask(w = W, h = H) {
  return new Uint8Array(w * h);
}

// fill an inclusive horizontal span [x0..x1] on row y with full coverage
function fillRow(mask, y, x0, x1, w = W, value = 255) {
  for (let x = x0; x <= x1; x += 1) {
    if (x >= 0 && x < w && y >= 0) mask[y * w + x] = value;
  }
}

// Build a canonical centered chibi silhouette (head is the dominant mass, as in
// real chibi proportions) with clear landmarks:
//   head   rows 2..13   (half-width 7, cx 16, widest)  -> x 9..23
//   neck   rows 14..15  (half-width 2, pinch)          -> x 14..18
//   should rows 16..21  (half-width 6)                 -> x 10..22
//   hips   rows 22..29  (half-width 4, tapered)        -> x 12..20
//   legs   rows 30..45  two columns w/ center gap
function canonicalFigure() {
  const m = blankMask();
  // head (dominant mass)
  for (let y = 2; y <= 13; y += 1) fillRow(m, y, 9, 23);
  // neck pinch
  for (let y = 14; y <= 15; y += 1) fillRow(m, y, 14, 18);
  // shoulders / upper body (wider than hips)
  for (let y = 16; y <= 21; y += 1) fillRow(m, y, 10, 22);
  // lower torso tapering to hips
  for (let y = 22; y <= 29; y += 1) fillRow(m, y, 12, 20);
  // legs: left 11..14, right 18..21, gap 15..17
  for (let y = 30; y <= 45; y += 1) {
    fillRow(m, y, 11, 14);
    fillRow(m, y, 18, 21);
  }
  return m;
}

describe('extractConstructionSkeleton — input validation', () => {
  it('throws a clear error on a fully transparent mask', () => {
    expect(() => extractConstructionSkeleton({ mask: blankMask(), width: W, height: H }))
      .toThrow(/no figure pixels/i);
  });

  it('throws when width/height do not match the mask', () => {
    expect(() => extractConstructionSkeleton({ mask: blankMask(), width: 0, height: H }))
      .toThrow(/width\/height/i);
  });
});

describe('extractConstructionSkeleton — geometry on a canonical figure', () => {
  const result = extractConstructionSkeleton({ mask: canonicalFigure(), width: W, height: H });

  it('detects the silhouette bounding box', () => {
    expect(result.bounds.minY).toBe(2);
    expect(result.bounds.maxY).toBe(45);
    expect(result.bounds.minX).toBe(9);  // widest head span
    expect(result.bounds.maxX).toBe(23);
  });

  it('finds the vertical midline near x=16', () => {
    expect(Math.abs(result.center.x - 16)).toBeLessThanOrEqual(1);
  });

  it('places head top at the silhouette top and chin at the neck pinch', () => {
    expect(result.skeleton.head.top.y).toBe(2);
    // neck pinch is rows 14..15; chin should land in that band
    expect(result.skeleton.head.chin.y).toBeGreaterThanOrEqual(13);
    expect(result.skeleton.head.chin.y).toBeLessThanOrEqual(16);
  });

  it('detects shoulders at the widest upper row', () => {
    expect(Math.abs(result.skeleton.torso.shoulderL.y - 16)).toBeLessThanOrEqual(1);
    expect(result.skeleton.torso.shoulderL.x).toBeLessThan(result.center.x);
    expect(result.skeleton.torso.shoulderR.x).toBeGreaterThan(result.center.x);
    // shoulders are wider than hips
    const shoulderSpan = result.skeleton.torso.shoulderR.x - result.skeleton.torso.shoulderL.x;
    const hipSpan = result.skeleton.torso.hipR.x - result.skeleton.torso.hipL.x;
    expect(shoulderSpan).toBeGreaterThan(hipSpan);
  });

  it('detects the leg split and orders knees above ankles', () => {
    expect(result.skeleton.legs.ankleL.y).toBeGreaterThan(result.skeleton.legs.kneeL.y);
    expect(result.skeleton.legs.ankleL.x).toBeLessThan(result.center.x);
    expect(result.skeleton.legs.ankleR.x).toBeGreaterThan(result.center.x);
    expect(result.provenance.legTop).toBe('measured');
  });

  it('marks measured vs prior landmarks in provenance', () => {
    expect(result.provenance.headChin).toBe('measured');
    expect(result.provenance.shoulderY).toBe('measured');
  });
});

describe('extractConstructionSkeleton — output contract & construction lines', () => {
  const result = extractConstructionSkeleton({ mask: canonicalFigure(), width: W, height: H });

  it('emits a valid PB-CONSTRUCTION-SKELETON-v1 skeleton', () => {
    expect(result.contract).toBe('PB-CONSTRUCTION-SKELETON-v1');
    expect(result.skeleton.contract).toBe('PB-CONSTRUCTION-SKELETON-v1');
    for (const key of ['top', 'center', 'chin']) {
      expect(typeof result.skeleton.head[key].x).toBe('number');
      expect(typeof result.skeleton.head[key].y).toBe('number');
    }
  });

  it('emits a vertical axis, head circle, and per-landmark horizontal guides', () => {
    const kinds = result.constructionLines.map(l => l.kind);
    expect(kinds).toContain('axis-vertical');
    expect(kinds).toContain('head-circle');
    expect(kinds.filter(k => k === 'guide-horizontal').length).toBeGreaterThanOrEqual(5);
  });

  it('rasterizes guide cells with integer, in-bounds coordinates', () => {
    for (const line of result.constructionLines) {
      for (const cell of line.cells) {
        expect(Number.isInteger(cell.x)).toBe(true);
        expect(Number.isInteger(cell.y)).toBe(true);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(W);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(H);
      }
    }
  });

  it('is deterministic — same mask in, identical result out', () => {
    const a = extractConstructionSkeleton({ mask: canonicalFigure(), width: W, height: H });
    const b = extractConstructionSkeleton({ mask: canonicalFigure(), width: W, height: H });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('extractConstructionSkeleton — robe/no-leg-gap fallback', () => {
  it('falls back to proportional legs when there is no center gap', () => {
    const m = blankMask();
    for (let y = 2; y <= 13; y += 1) fillRow(m, y, 9, 23);    // head (dominant)
    for (let y = 14; y <= 15; y += 1) fillRow(m, y, 14, 18);  // neck pinch
    for (let y = 16; y <= 45; y += 1) fillRow(m, y, 12, 20);  // solid robe, no gap
    const result = extractConstructionSkeleton({ mask: m, width: W, height: H });
    expect(result.provenance.legTop).toBe('prior');
    // still produces ankle anchors (from proportion), no crash
    expect(typeof result.skeleton.legs.ankleL.y).toBe('number');
  });
});

describe('maskFromCoordinates', () => {
  it('rasterizes a pbrain coordinate list into an alpha mask', () => {
    const coords = [
      { x: 5, y: 5, partId: 'skin.base' },
      { x: 6, y: 5, partId: 'outline.ink' },
    ];
    const mask = maskFromCoordinates(coords, W, H);
    expect(mask[5 * W + 5]).toBeGreaterThan(0);
    expect(mask[5 * W + 6]).toBeGreaterThan(0);
    expect(mask[0]).toBe(0);
  });

  it('excludes construction/reference guide cells from the silhouette', () => {
    const coords = [
      { x: 5, y: 5, partId: 'skin.base' },
      { x: 7, y: 5, partId: 'reference', role: 'construction', isGuide: true },
    ];
    const mask = maskFromCoordinates(coords, W, H);
    expect(mask[5 * W + 5]).toBeGreaterThan(0);
    expect(mask[5 * W + 7]).toBe(0); // guide cell is not silhouette
  });
});

describe('pbrainToConstructionSkeleton', () => {
  it('reads a pbrain export object and infers construction lines', () => {
    const pbrain = {
      coordinates: [],
      metadata: { manifest: { width: W, height: H } },
    };
    const m = canonicalFigure();
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (m[y * W + x] > 0) pbrain.coordinates.push({ x, y, partId: 'skin.base' });
      }
    }
    const result = pbrainToConstructionSkeleton(pbrain);
    expect(result.contract).toBe('PB-CONSTRUCTION-SKELETON-v1');
    expect(result.skeleton.head.top.y).toBe(2);
    expect(Math.abs(result.center.x - 16)).toBeLessThanOrEqual(1);
  });
});

describe('imageToConstructionSkeleton (PNG via sharp)', () => {
  it('decodes a PNG by its alpha channel and infers construction lines', async () => {
    const m = canonicalFigure();
    const rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < m.length; i += 1) {
      rgba[i * 4 + 0] = 200;
      rgba[i * 4 + 1] = 200;
      rgba[i * 4 + 2] = 200;
      rgba[i * 4 + 3] = m[i]; // alpha = silhouette
    }
    const file = path.join(os.tmpdir(), `pb-construction-${Date.now()}.png`);
    await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
    const result = await imageToConstructionSkeleton(file);
    await fs.unlink(file).catch(() => {});
    expect(result.contract).toBe('PB-CONSTRUCTION-SKELETON-v1');
    expect(result.skeleton.head.top.y).toBe(2);
    expect(Math.abs(result.center.x - 16)).toBeLessThanOrEqual(1);
  });
});

describe('round-trip against the foundry (ground truth)', () => {
  const profileFn = getPartProfile('character.body.chibi.starboundEsper');
  const gen = profileFn(
    { compact: 0.72 },
    { direction: 'south', canvas: { width: 32, height: 48 }, width: 32, height: 48 },
  );
  const cw = 32, ch = 48;
  const mask = new Uint8Array(cw * ch);
  for (const c of gen.cells) {
    if (c.x >= 0 && c.x < cw && c.y >= 0 && c.y < ch) mask[c.y * cw + c.x] = 255;
  }
  const result = extractConstructionSkeleton({ mask, width: cw, height: ch });
  const a = gen.anchors;

  it('recovers the midline', () => {
    expect(Math.abs(result.center.x - a.headTop.x)).toBeLessThanOrEqual(2);
  });

  it('recovers the chin / neck line within tolerance', () => {
    expect(result.provenance.headChin).toBe('measured');
    expect(Math.abs(result.skeleton.head.chin.y - a.headChin.y)).toBeLessThanOrEqual(2);
  });

  it('recovers the shoulder line within tolerance', () => {
    expect(Math.abs(result.skeleton.torso.shoulderL.y - a.shoulderL.y)).toBeLessThanOrEqual(2);
  });

  it('recovers the hip line within tolerance', () => {
    expect(Math.abs(result.skeleton.torso.hipL.y - a.hipL.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(result.skeleton.torso.hipL.x - a.hipL.x)).toBeLessThanOrEqual(2);
  });
});
