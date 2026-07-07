#!/usr/bin/env node
/**
 * Generate the Frost Acolyte chibi — an icy spellcaster built on the chibi body
 * profile, forged through the PixelBrain character foundry and exported to the
 * pixelbrain.export.v1 (.pbrain.json) format. Construction metadata is filled in
 * by image-to-construction-skeleton (reverse-engineered from the forged pixels).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { forgeCharacter } from '../codex/core/pixelbrain/character-foundry.js';
import { extractConstructionSkeleton } from '../codex/core/pixelbrain/image-to-construction-skeleton.js';
import { MATERIAL_PALETTES, resolveMaterialId } from '../codex/core/pixelbrain/material-registry.js';

// The beginner clothing profiles emit geometry only; the foundry colors them
// from hardcoded default ramps (linen/wool/leather). To realise the frost theme
// we remap each clothing part tone-for-tone onto a frost material, which keeps
// the foundry's rim/form shading intact.
function ramp4(name) {
  const a = MATERIAL_PALETTES[resolveMaterialId(name)].anchors;
  return { void: a.void || a.shadow, deep: a.deep || a.shadow, body: a.body, frost: a.frost || a.body };
}
function toneMap(fromName, toName) {
  const f = ramp4(fromName), t = ramp4(toName);
  const m = new Map();
  for (const k of ['void', 'deep', 'body', 'frost']) m.set(f[k], t[k]);
  return m;
}
const FROST_REMAP = {
  top: toneMap('cloth_linen', 'sapphire_enamel'),
  bottom: toneMap('cloth_wool', 'deep_indigo_steel'),
  shoes: toneMap('leather_brown', 'silver'),
};
function recolorFrost(coords) {
  return coords.map((c) => {
    const m = FROST_REMAP[c.partId];
    return m && m.has(c.color) ? { ...c, color: m.get(c.color) } : c;
  });
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

async function renderPng(coords, scale, file) {
  const sw = W * scale, sh = H * scale;
  const buf = Buffer.alloc(sw * sh * 4, 0);
  for (const c of coords) {
    if (!c.color) continue;
    const [r, g, b] = hexToRgb(c.color);
    for (let sy = 0; sy < scale; sy += 1) {
      for (let sx = 0; sx < scale; sx += 1) {
        const px = (c.x * scale + sx) + (c.y * scale + sy) * sw;
        buf[px * 4 + 0] = r; buf[px * 4 + 1] = g; buf[px * 4 + 2] = b; buf[px * 4 + 3] = 255;
      }
    }
  }
  await sharp(buf, { raw: { width: sw, height: sh, channels: 4 } }).png().toFile(file);
}

const OUT_DIR = resolve('output/foundry/frost-acolyte-chibi');
const W = 32;
const H = 48;
const DIRECTION = 'south';

function buildSpec() {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'scholar.frost.acolyte.v1',
    class: 'character',
    archetype: 'human',
    canvas: { width: W, height: H, gridSize: 1 },
    seed: 3107,
    bytecode: 'VW-FROST-ACOLYTE-CHIBI',
    presentation: { gender: 'androgynous', heightClass: 'short', buildClass: 'slender' },
    directions: [DIRECTION],
    materials: { skin: 'skin_light', hair: '#CFE8FF', eyes: 'eye_void_glow' },
    body: { profile: 'character.body.chibi.starboundEsper', params: { compact: 0.72 } },
    face: [
      { id: 'leftEye',  profile: 'character.face.eye.voidTouched', params: { iris: 'eye_void_glow' }, attach: { parent: 'body', at: 'face.eyeLeft' } },
      { id: 'rightEye', profile: 'character.face.eye.voidTouched', params: { iris: 'eye_void_glow' }, attach: { parent: 'body', at: 'face.eyeRight' } },
      { id: 'nose',     profile: 'character.face.nose.humanSoft',  attach: { parent: 'body', at: 'face.nose' } },
      { id: 'mouth',    profile: 'character.face.mouth.small',     attach: { parent: 'body', at: 'face.mouth' } },
    ],
    hair: {
      profile: 'character.hair.longStraight',
      params: { color: '#CFE8FF', streak: '#8FC7FF' },
      attach: { parent: 'body', at: 'headTop' },
    },
    clothing: [
      { id: 'bottom', profile: 'character.clothing.bottom.beginnerLeggings', params: { color: '#9FB8D8', trim: 'silver' } },
      { id: 'top',    profile: 'character.clothing.top.beginnerRobe',        params: { color: '#BFE7FF', trim: 'silver' } },
      { id: 'shoes',  profile: 'character.clothing.shoes.beginnerSlippers',  params: { color: '#7FA0C8', trim: 'silver' } },
    ],
    accessories: [
      { id: 'halo',    profile: 'character.accessory.halo.ice', params: { glow: 'cyan_glow' } },
      { id: 'pendant', profile: 'character.accessory.jewelry.runePendant', params: { gem: 'sapphire', metal: 'silver' } },
    ],
    details: [
      { id: 'cheekSigil', profile: 'character.detail.cheekSigil.snow', params: { color: '#BFE7FF' } },
      { id: 'eyeGlow',    profile: 'character.detail.eyeGlow',         params: { color: 'cyan_glow' } },
    ],
  };
}

function maskFromCells(coords) {
  const mask = new Uint8Array(W * H);
  for (const c of coords) {
    const x = Math.round(c.x), y = Math.round(c.y);
    if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = 255;
  }
  return mask;
}

function buildExport(coords) {

  // unique palette
  const palette = [...new Set(coords.map((c) => c.color))].filter(Boolean).sort();

  // reverse-engineer construction lines from the forged pixels
  const con = extractConstructionSkeleton({ mask: maskFromCells(coords), width: W, height: H });
  const s = con.skeleton;
  const bodyCenterY = Math.round((s.torso.shoulderL.y + s.torso.hipL.y) / 2);
  const anchors = [
    { id: 'head_center',     x: s.head.center.x, y: s.head.center.y, role: 'head origin' },
    { id: 'left_eye_center', x: s.face.eyeLeft.x, y: s.face.eyeLeft.y, role: 'eye anchor' },
    { id: 'right_eye_center', x: s.face.eyeRight.x, y: s.face.eyeRight.y, role: 'eye anchor' },
    { id: 'body_center',     x: con.center.x, y: bodyCenterY, role: 'body origin' },
    { id: 'feet_ground',     x: con.center.x, y: s.legs.ankleL.y, role: 'ground contact' },
  ];

  const fingerprintSource = JSON.stringify({ id: 'scholar.frost.acolyte.v1', coords });
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex');

  return {
    schema: 'pixelbrain.export.v1',
    schemaVersion: '1.0.0',
    format: 'json',
    material: 'source',
    coordinates: coords,
    palettes: [{ id: 'frost-acolyte', colors: palette }],
    metadata: {
      assetId: 'frost.acolyte.chibi.v1',
      title: 'Frost Acolyte Chibi',
      sourceBytecode: 'VW-FROST-ACOLYTE-CHIBI',
      fingerprint,
      fingerprintSource: 'sha256:c14n:packet_with_metadata_fingerprint_null',
      manifest: {
        width: W, height: H, gridSize: 1, background: 'transparent', origin: 'top-left',
        coordinateBounds: { xMin: con.bounds.minX, xMax: con.bounds.maxX, yMin: con.bounds.minY, yMax: con.bounds.maxY },
      },
      style: {
        proportions: 'chibi', lighting: 'top-left', antiAliasing: false, gradients: false,
        semiTransparentPixels: false, paletteMode: 'indexed', silhouette: 'large-head-small-body-readable',
      },
      construction: {
        contract: con.contract,
        skeletonId: 'frost-acolyte-chibi-construction-v1',
        center: con.center,
        bounds: { width: W, height: H, gridSize: 1 },
        axes: true,
        anchors,
        provenance: con.provenance,
      },
      bounds: con.bounds,
      coordinateCount: coords.length,
    },
    diagnostics: [{ ok: true, generator: 'generate-frost-acolyte-chibi.mjs' }],
  };
}

async function main() {
  const character = forgeCharacter(buildSpec(), { renderer: 'pixelart' });
  mkdirSync(OUT_DIR, { recursive: true });

  const rawCoords = character.fills[DIRECTION].coordinates.map((c) => ({
    x: c.x, y: c.y, color: c.color, partId: c.partId || 'body',
  }));
  const coords = recolorFrost(rawCoords);

  const exportObj = buildExport(coords);
  const jsonPath = resolve(OUT_DIR, 'frost-acolyte-chibi.pixelbrain.export.v1.pbrain.json');
  writeFileSync(jsonPath, JSON.stringify(exportObj, null, 2));

  const pngPath = resolve(OUT_DIR, 'frost-acolyte-chibi.south.png');
  await renderPng(coords, 6, pngPath);

  console.log('Forged Frost Acolyte chibi.');
  console.log('  cells     :', exportObj.coordinates.length);
  console.log('  palette   :', exportObj.palettes[0].colors.length, 'colors');
  console.log('  bounds    :', JSON.stringify(exportObj.metadata.bounds));
  console.log('  anchors   :', exportObj.metadata.construction.anchors.map((a) => `${a.id}(${a.x},${a.y})`).join(' '));
  console.log('  json      :', jsonPath);
  console.log('  png       :', pngPath);
}

main();
