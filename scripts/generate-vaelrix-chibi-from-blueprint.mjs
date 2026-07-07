#!/usr/bin/env node
/**
 * Blueprint compiler — forge a fresh 64x64 "Vaelrix" chibi from the construction
 * blueprint embedded in a pixelbrain.export.v1 (.pbrain.json) file.
 *
 * The blueprint provides: construction boxes (head/hair/face/eyes/body/arms/
 * legs/feet/accessories), anchors, the indexed palette, and the style flags
 * (chibi, top-left lighting, indexed, no AA/gradients). We render brand-new
 * coordinates that satisfy that blueprint — we do NOT reuse the previously
 * authored coordinates.
 *
 * Usage: node scripts/generate-vaelrix-chibi-from-blueprint.mjs [blueprint.pbrain.json]
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { extractConstructionSkeleton } from '../codex/core/pixelbrain/image-to-construction-skeleton.js';

const BLUEPRINT_PATH = resolve(process.argv[2] || 'assets/blueprints/vaelrix-chibi-64x64.blueprint.pbrain.json');
const OUT_DIR = resolve('output/foundry/vaelrix-chibi');

const blueprint = JSON.parse(readFileSync(BLUEPRINT_PATH, 'utf8'));
const con = blueprint.metadata.construction;
const W = blueprint.metadata.manifest.width;
const H = blueprint.metadata.manifest.height;
const boxes = con.boxes;

// palette by role (looked up from the blueprint's named indexed palette)
const byName = Object.fromEntries(blueprint.metadata.palette.indexed.map((p) => [p.name, p.hex]));
const PAL = {
  ink: byName['Ink Outline'],
  rim: byName['Soft Inner Rim'],
  skin: byName['Skin Base'],
  skinShadow: byName['Skin Shadow'],
  skinHi: byName['Skin Highlight'],
  hair: byName['Hair Base'],
  hairMid: byName['Hair Midtone'],
  hairHi: byName['Hair Violet Highlight'],
  eyeShine: byName['Eye Shine'],
  iris: byName['Violet Iris'],
  eyeBlack: byName['Eye Black'],
  coat: byName['Coat Base'],
  coatShadow: byName['Coat Shadow'],
  crimson: byName['Crimson Accent'],
  violet: byName['Violet Accent'],
};

// ---- raster grid -----------------------------------------------------------
const grid = new Map(); // "x,y" -> { color, partId }
const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
function paint(x, y, color, partId) {
  x = Math.round(x); y = Math.round(y);
  if (inBounds(x, y)) grid.set(key(x, y), { color, partId });
}
function at(x, y) { return grid.get(key(x, y)); }
function box(id) { const b = boxes[id]; return { x0: b.x, y0: b.y, x1: b.x + b.width - 1, y1: b.y + b.height - 1, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; }

function ellipse(cx, cy, rx, ry, fn) {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x += 1) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) fn(x, y);
    }
  }
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const nx = (x - cx) / rx, ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

// ---- 1. head + face + hair --------------------------------------------------
const head = box('head');
const face = box('face');
// head silhouette ellipse, centered on the head box
const hCx = head.cx, hCy = head.cy - 1, hRx = head.x1 - head.cx + 0.5, hRy = head.y1 - head.cy + 0.5;
// face oval (exposed skin) sits in the lower-centre of the head
const fCx = (face.x0 + face.x1) / 2, fCy = face.cy + 1, fRx = (face.x1 - face.x0) / 2 - 1, fRy = (face.y1 - face.y0) / 2;

ellipse(hCx, hCy, hRx, hRy, (x, y) => {
  if (inEllipse(x, y, fCx, fCy, fRx, fRy)) paint(x, y, PAL.skin, 'skin.base');
  else paint(x, y, PAL.hair, 'hair.base');
});
// front hair bangs dipping over the brow (top of face)
for (let x = face.x0; x <= face.x1; x += 1) {
  const t = (x - fCx) / fRx;
  const dip = Math.round(3 - 2.5 * t * t); // peak in the middle
  for (let y = face.y0; y <= face.y0 + dip; y += 1) {
    if (inEllipse(x, y, hCx, hCy, hRx, hRy)) paint(x, y, PAL.hair, 'hair.base');
  }
}

// neck (skin bridge to the body)
for (let y = head.y1; y <= head.y1 + 2; y += 1) {
  for (let x = 30; x <= 33; x += 1) paint(x, y, PAL.skin, 'skin.base');
}

// ---- 2. coat / body / arms / legs / feet -----------------------------------
function fillBox(id, color, partId, inset = 0) {
  const b = boxes[id];
  for (let y = b.y + inset; y <= b.y + b.height - 1 - inset; y += 1) {
    for (let x = b.x + inset; x <= b.x + b.width - 1 - inset; x += 1) paint(x, y, color, partId);
  }
}
// coat body as a downward-flaring trapezoid within the body box
{
  const b = boxes.body;
  for (let y = b.y; y <= b.y + b.height - 1; y += 1) {
    const t = (y - b.y) / Math.max(1, b.height - 1);
    const halfW = (b.width / 2) * (0.78 + 0.22 * t);
    const cx = b.x + b.width / 2;
    for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x += 1) paint(x, y, PAL.coat, 'outfit.coat.base');
  }
}
// sleeves
fillBox('armsLeft', PAL.coat, 'outfit.coat.base', 1);
fillBox('armsRight', PAL.coat, 'outfit.coat.base', 1);
// hands (skin) at the cuffs
for (const id of ['armsLeft', 'armsRight']) {
  const b = boxes[id];
  for (let y = b.y + b.height - 3; y <= b.y + b.height - 1; y += 1) {
    for (let x = b.x + 1; x <= b.x + b.width - 2; x += 1) paint(x, y, PAL.skin, 'skin.base');
  }
}
// legs + feet (dark)
fillBox('legsLeft', PAL.coatShadow, 'outfit.coat.base', 1);
fillBox('legsRight', PAL.coatShadow, 'outfit.coat.base', 1);
fillBox('feetLeft', PAL.coatShadow, 'outfit.coat.base', 0);
fillBox('feetRight', PAL.coatShadow, 'outfit.coat.base', 0);

// ---- 3. accessories: collar, sash, chest glyph -----------------------------
// crimson collar across the top of the coat
{
  const b = boxes.body;
  for (let x = b.x + 2; x <= b.x + b.width - 3; x += 1) {
    paint(x, b.y, PAL.crimson, 'accent.crimson');
    paint(x, b.y + 1, PAL.crimson, 'accent.crimson');
  }
}
// diagonal crimson sash across the chest (within the accessories box)
{
  const a = boxes.accessories;
  for (let i = 0; i < a.width; i += 1) {
    const x = a.x + i;
    const y = a.y + 2 + Math.round(i * 0.5);
    if (y <= a.y + a.height - 1 && at(x, y)) { paint(x, y, PAL.crimson, 'accent.crimson'); paint(x, y + 1, PAL.crimson, 'accent.crimson'); }
  }
}
// violet chest glyph (small diamond) at the body centre
{
  const gx = 32, gy = boxes.body.y + 8;
  for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    paint(gx + dx, gy + dy, PAL.violet, 'accent.violet');
  }
}

// ---- 4. eyes + mouth -------------------------------------------------------
function drawEye(ecx, ecy) {
  ellipse(ecx, ecy, 2.4, 3.0, (x, y) => paint(x, y, PAL.eyeBlack, 'face.eye_black'));
  ellipse(ecx, ecy + 0.3, 1.4, 2.0, (x, y) => paint(x, y, PAL.iris, 'face.iris'));
  paint(ecx - 1, ecy - 1, PAL.eyeShine, 'face.eye_shine');
}
const eyeL = con.anchors.find((a) => a.id === 'left_eye_center');
const eyeR = con.anchors.find((a) => a.id === 'right_eye_center');
drawEye(eyeL.x, eyeL.y);
drawEye(eyeR.x, eyeR.y);
// mouth (crimson)
paint(31, fCy + 5, PAL.crimson, 'face.mouth');
paint(32, fCy + 5, PAL.crimson, 'face.mouth');

// ---- 5. outline + shading (top-left light) ---------------------------------
const empty = (x, y) => !grid.has(key(x, y));

// outline pass: silhouette cells touching empty space become ink
const silhouette = [...grid.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { k, x, y }; });
for (const c of silhouette) {
  if (empty(c.x - 1, c.y) || empty(c.x + 1, c.y) || empty(c.x, c.y - 1) || empty(c.x, c.y + 1)) {
    grid.set(c.k, { color: PAL.ink, partId: 'outline.ink' });
  }
}

// shading pass: highlight just inside the top-left ink, shadow inside bottom-right
const ROOT = { 'skin.base': 'skin', 'hair.base': 'hair', 'outfit.coat.base': 'coat' };
const SHADE_PART = { skin: 'shade.skin', hair: 'shade.hair', coat: 'shade.coat' };
const HI_PART = { skin: 'highlight.skin', hair: 'highlight.hair', coat: 'highlight.outfit' };
const SHADE_COL = { skin: PAL.skinShadow, hair: PAL.hairMid, coat: PAL.coatShadow };
const HI_COL = { skin: PAL.skinHi, hair: PAL.hairHi, coat: PAL.rim };
const isInk = (x, y) => { const c = at(x, y); return !c || c.partId === 'outline.ink'; };

for (const c of silhouette) {
  const cur = at(c.x, c.y);
  const root = cur && ROOT[cur.partId];
  if (!root) continue;
  const tl = isInk(c.x - 1, c.y) || isInk(c.x, c.y - 1) || isInk(c.x - 1, c.y - 1);
  const br = isInk(c.x + 1, c.y) || isInk(c.x, c.y + 1) || isInk(c.x + 1, c.y + 1);
  if (tl && !br) grid.set(c.k, { color: HI_COL[root], partId: HI_PART[root] });
  else if (br) grid.set(c.k, { color: SHADE_COL[root], partId: SHADE_PART[root] });
}
// hair violet sheen accent on the top-left crown
for (const c of silhouette) {
  const cur = at(c.x, c.y);
  if (cur && cur.partId === 'hair.base' && c.y < hCy && c.x < hCx && ((c.x + c.y) % 3 === 0)) {
    grid.set(c.k, { color: PAL.hairHi, partId: 'highlight.hair' });
  }
}

// ---- export ----------------------------------------------------------------
function normalizePartId(pid) {
  // keep the blueprint's part vocabulary
  if (pid === 'shade.outfit') return 'shade.coat';
  if (pid === 'highlight.outfit') return 'highlight.outfit';
  return pid;
}
const coordinates = [...grid.entries()].map(([k, v]) => {
  const [x, y] = k.split(',').map(Number);
  return { x, y, color: v.color, partId: normalizePartId(v.partId) };
}).sort((a, b) => (a.y - b.y) || (a.x - b.x));

function maskFromCoords(coords) {
  const m = new Uint8Array(W * H);
  for (const c of coords) m[c.y * W + c.x] = 255;
  return m;
}
const recon = extractConstructionSkeleton({ mask: maskFromCoords(coordinates), width: W, height: H });

const colors = [...new Set(coordinates.map((c) => c.color))].sort();
const parts = {};
for (const c of coordinates) parts[c.partId] = (parts[c.partId] || 0) + 1;
const bb = recon.bounds;

const exportObj = {
  schema: 'pixelbrain.export.v1',
  schemaVersion: '1.0.0',
  format: 'json',
  material: 'source',
  coordinates,
  palettes: [{ id: 'vaelrix-chibi', colors }],
  metadata: {
    assetId: 'vaelrix.chibi.64x64.v2',
    title: 'Vaelrix Chibi 64x64 (blueprint-forged)',
    sourceBytecode: 'blueprint-forge-vaelrix-chibi-64x64-v2',
    fingerprint: createHash('sha256').update(JSON.stringify(coordinates)).digest('hex'),
    fingerprintSource: 'sha256:c14n:packet_with_metadata_fingerprint_null',
    manifest: {
      width: W, height: H, gridSize: 1, background: 'transparent', origin: 'top-left',
      coordinateBounds: { xMin: bb.minX, xMax: bb.maxX, yMin: bb.minY, yMax: bb.maxY },
    },
    style: blueprint.metadata.style,
    construction: con, // preserve the driving blueprint
    symmetry: blueprint.metadata.symmetry,
    palette: blueprint.metadata.palette,
    parts,
    bounds: bb,
    coordinateCount: coordinates.length,
    forgedFrom: 'assets/blueprints/vaelrix-chibi-64x64.blueprint.pbrain.json',
  },
  diagnostics: [{ ok: true, generator: 'generate-vaelrix-chibi-from-blueprint.mjs' }],
};

async function renderPng(coords, scale, file) {
  const sw = W * scale, sh = H * scale;
  const buf = Buffer.alloc(sw * sh * 4, 0);
  const hexToRgb = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  for (const c of coords) {
    const [r, g, b] = hexToRgb(c.color);
    for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
      const px = (c.x * scale + sx) + (c.y * scale + sy) * sw;
      buf[px * 4] = r; buf[px * 4 + 1] = g; buf[px * 4 + 2] = b; buf[px * 4 + 3] = 255;
    }
  }
  await sharp(buf, { raw: { width: sw, height: sh, channels: 4 } }).png().toFile(file);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = resolve(OUT_DIR, 'vaelrix-chibi-64x64.pixelbrain.export.v1.pbrain.json');
  writeFileSync(jsonPath, JSON.stringify(exportObj, null, 2));
  const pngPath = resolve(OUT_DIR, 'vaelrix-chibi-64x64.png');
  await renderPng(coordinates, 6, pngPath);
  console.log('Forged Vaelrix chibi from blueprint.');
  console.log('  blueprint :', BLUEPRINT_PATH);
  console.log('  cells     :', coordinates.length, '| palette:', colors.length);
  console.log('  bounds    :', JSON.stringify(bb));
  console.log('  parts     :', Object.keys(parts).sort().join(', '));
  console.log('  json      :', jsonPath);
  console.log('  png       :', pngPath);
}
main();
