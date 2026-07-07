import { composeCharacterSilhouette } from './character-silhouette-composer.js';
import { createCharacterSkeleton, hashCharacterSkeleton, validateCharacterSkeleton } from './character-construction-skeleton.js';
import { normalizeCharacterSpec, validateCharacterSpec, hashCharacterSpec } from './character-spec.js';
import { MATERIAL_PALETTES, resolveMaterialId } from './material-registry.js';
import { hashString } from './shared.js';
import { getRenderer } from './renderer-registry.js';
import { applyXBR2x } from './pixel-scale-amp.js';

import './character-body-profiles.js';
import './character-face-profiles.js';
import './character-hair-profiles.js';
import './character-clothing-profiles.js';
import './character-accessory-profiles.js';
import './character-detail-profiles.js';

const CHARACTER_DEFAULTS = {
  canvas: { width: 32, height: 48 },
};

function err(reason, context) {
  const e = new Error(`character-foundry: ${reason}`);
  e.cause = context;
  return e;
}

function resolveCharacterMaterial(materialName, defaultFallback = '#808080') {
  if (!materialName) return defaultFallback;
  const id = resolveMaterialId(materialName);
  const def = MATERIAL_PALETTES[id];
  if (!def || !def.anchors) return defaultFallback;
  return def.anchors.body || def.anchors.frost || defaultFallback;
}

function getPartColor(partId, spec, defaultColor = '#808080') {
  if (!spec?.materials) return defaultColor;
  switch (partId) {
    case 'body': return resolveCharacterMaterial(spec.materials.skin, '#F5D0A9');
    case 'hair': return resolveCharacterMaterial(spec.materials.hair, '#4A3828');
    case 'leftEye':
    case 'rightEye': return resolveCharacterMaterial(spec.materials.eyes, '#3A2010');
    default: return defaultColor;
  }
}

function materialFromSpec(spec) {
  return {
    skin: spec?.materials?.skin || 'skin_light',
    hair: spec?.materials?.hair || 'hair_brown',
    eyes: spec?.materials?.eyes || 'eye_brown',
  };
}

function isRimCell(x, y, cellKeySet) {
  if (!cellKeySet.has(`${x},${y}`)) return false;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    if (!cellKeySet.has(`${x+dx},${y+dy}`)) return true;
  }
  return false;
}

function getMaterialRamp(materialName, defaultColor = '#808080') {
  if (!materialName) return { void: defaultColor, deep: defaultColor, body: defaultColor, frost: defaultColor };
  const id = resolveMaterialId(materialName);
  const def = MATERIAL_PALETTES[id];
  if (!def || !def.anchors) return { void: defaultColor, deep: defaultColor, body: defaultColor, frost: defaultColor };
  return {
    void: def.anchors.void || def.anchors.shadow || defaultColor,
    deep: def.anchors.deep || def.anchors.shadow || defaultColor,
    body: def.anchors.body || defaultColor,
    frost: def.anchors.frost || def.anchors.body || defaultColor,
  };
}

function applyCharacterFills({ silhouette, spec, direction } = {}) {
  const canvas = spec?.canvas || CHARACTER_DEFAULTS.canvas;
  const cells = [];
  const colors = new Set();
  const mat = materialFromSpec(spec);

  const partRamps = {
    'body': getMaterialRamp(mat.skin, '#F5D0A9'),
    'hair': getMaterialRamp(mat.hair, '#4A3828'),
    'leftEye': getMaterialRamp(mat.eyes, '#3A2010'),
    'rightEye': getMaterialRamp(mat.eyes, '#3A2010'),
    'nose': getMaterialRamp(mat.skin, '#F5D0A9'),
    'mouth': getMaterialRamp(mat.skin, '#F5D0A9'),
    'leftEar': getMaterialRamp(mat.skin, '#F5D0A9'),
    'rightEar': getMaterialRamp(mat.skin, '#F5D0A9'),
    'top': getMaterialRamp('cloth_linen', '#C8C0B0'),
    'bottom': getMaterialRamp('cloth_wool', '#807870'),
    'shoes': getMaterialRamp('leather_brown', '#6A4030'),
  };

  // Build Set once — O(n) not O(n²)
  const cellKeySet = new Set(silhouette.cells.map(c => `${c.x},${c.y}`));

  const isSubRimCell = (x, y) => {
    if (isRimCell(x, y, cellKeySet)) return false;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (isRimCell(x+dx, y+dy, cellKeySet)) return true;
    }
    return false;
  };

  const subRimCache = new Set();
  for (const c of silhouette.cells) {
    if (isSubRimCell(c.x, c.y)) {
      subRimCache.add(`${c.x},${c.y}`);
    }
  }

  // Per-part y-bounds for form-shading gradient (top-lit, bottom-shadowed volume)
  const partYBounds = new Map();
  for (const c of silhouette.cells) {
    const pid = silhouette.partOf.get(`${c.x},${c.y}`) || 'body';
    const b = partYBounds.get(pid);
    if (!b) {
      partYBounds.set(pid, { minY: c.y, maxY: c.y });
    } else {
      if (c.y < b.minY) b.minY = c.y;
      if (c.y > b.maxY) b.maxY = c.y;
    }
  }

  for (const c of silhouette.cells) {
    const partId = silhouette.partOf.get(`${c.x},${c.y}`) || 'body';
    const rawExplicitColor = silhouette.colorOf?.get(`${c.x},${c.y}`);
    const explicitRamp = rawExplicitColor ? getMaterialRamp(rawExplicitColor, rawExplicitColor) : null;
    const ramp = explicitRamp || partRamps[partId] || partRamps.body;

    const isRim = isRimCell(c.x, c.y, cellKeySet);
    let color = ramp.body;

    if (isRim) {
      color = ramp.void;
    } else if (subRimCache.has(`${c.x},${c.y}`)) {
      color = ramp.deep;
    } else {
      // Interior. Top-left light source + y-gradient form pass for volume.
      const isTopLeft =
        subRimCache.has(`${c.x-1},${c.y}`) ||
        subRimCache.has(`${c.x},${c.y-1}`) ||
        subRimCache.has(`${c.x-1},${c.y-1}`);

      // Right/bottom-right adjacency: cast shadow from top-left light source
      const isBottomRight =
        subRimCache.has(`${c.x+1},${c.y}`) ||
        subRimCache.has(`${c.x},${c.y+1}`) ||
        subRimCache.has(`${c.x+1},${c.y+1}`);

      const bounds = partYBounds.get(partId) || { minY: c.y, maxY: c.y };
      const yRange = bounds.maxY - bounds.minY;

      // Hair / comet / wing energy parts (small narrow fins, sweeps) need luminous bias.
      // Without this the general body gradient + rim logic over-applies deep/void to thin structures,
      // producing the classic "pillow or muddy small detail" amateur look.
      const isEnergyHair = partId === 'hair';

      if (yRange >= 6 && !isEnergyHair) {
        // Only apply gradient to parts tall enough to show form
        const yT = (c.y - bounds.minY) / yRange;
        if (yT < 0.28) {
          color = ramp.frost;                              // Top zone: lit from above
        } else if (yT > 0.75 && !isTopLeft) {
          color = ramp.deep;                               // Bottom zone: form shadow
        } else if (isTopLeft) {
          color = ramp.frost;                              // Top-left adjacency highlight
        } else if (isBottomRight && !isTopLeft) {
          color = ramp.deep;                               // Bottom-right adjacency shadow
        } else {
          color = ramp.body;
        }
      } else {
        // Small parts + all hair/energy: stronger adjacency + top bias so tiny wings/fins keep readable volume and glow.
        if (isTopLeft || (isEnergyHair && (c.y - bounds.minY) / Math.max(1, yRange) < 0.4)) {
          color = ramp.frost;
        } else if (isBottomRight) {
          color = ramp.deep;
        } else {
          color = ramp.body;
        }
      }
    }

    colors.add(color);
    cells.push({ x: c.x, y: c.y, color, partId, isRim });
  }

  const palette = [...colors].sort();

  return {
    coordinates: Object.freeze(cells),
    palette: Object.freeze(palette),
    partColors: Object.fromEntries(Object.entries(partRamps).map(([k, v]) => [k, v.body])),
    diagnostics: {
      totalCells: cells.length,
      uniqueColors: palette.length,
      rimCells: cells.filter(c => c.isRim).length,
    },
  };
}

function concatBytes(arrays) {
  let totalLen = 0;
  for (const a of arrays) totalLen += a.length;
  const r = new Uint8Array(totalLen);
  let off = 0;
  for (const a of arrays) { r.set(a, off); off += a.length; }
  return r;
}

function u32be(v) {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) >>> 0) | a) >>> 0;
}

function storedDeflate(data) {
  // PNG IDAT must be a zlib stream, not bare deflate blocks: CMF/FLG
  // header, stored blocks capped at 0xffff bytes each (BFINAL only on
  // the last), then an Adler-32 of the uncompressed data.
  const MAX_BLOCK = 0xffff;
  const blockCount = Math.max(1, Math.ceil(data.length / MAX_BLOCK));
  const parts = [new Uint8Array([0x78, 0x01])];
  for (let i = 0; i < blockCount; i += 1) {
    const start = i * MAX_BLOCK;
    const block = data.subarray(start, Math.min(start + MAX_BLOCK, data.length));
    const len = block.length;
    const header = new Uint8Array(5);
    header[0] = i === blockCount - 1 ? 1 : 0;
    header[1] = len & 0xff;
    header[2] = (len >>> 8) & 0xff;
    header[3] = (~len) & 0xff;
    header[4] = ((~len) >>> 8) & 0xff;
    parts.push(header, block);
  }
  parts.push(new Uint8Array(u32be(adler32(data))));
  return concatBytes(parts);
}

export function rasterizeCells(coordinates, width, height, scale = 4) {
  const outW = width * scale;
  const outH = height * scale;
  const pixels = new Uint8Array(outW * outH * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 10; pixels[i + 1] = 10; pixels[i + 2] = 18; pixels[i + 3] = 255;
  }
  for (const c of coordinates) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const hex = String(c.color || '').trim();
    const m = hex.replace('#', '');
    if (m.length !== 6) continue;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const off = ((y * scale + dy) * outW + (x * scale + dx)) * 4;
        pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = 255;
      }
    }
  }
  return pixels;
}

function encodePng(outW, outH, rgba) {
  const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const IHDR = new Uint8Array(13);
  const hdrW = u32be(outW), hdrH = u32be(outH);
  IHDR[0] = hdrW[0]; IHDR[1] = hdrW[1]; IHDR[2] = hdrW[2]; IHDR[3] = hdrW[3];
  IHDR[4] = hdrH[0]; IHDR[5] = hdrH[1]; IHDR[6] = hdrH[2]; IHDR[7] = hdrH[3];
  IHDR[8] = 8; IHDR[9] = 6; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;
  const stride = outW * 4;
  const filtered = new Uint8Array((stride + 1) * outH);
  for (let y = 0; y < outH; y += 1) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = storedDeflate(filtered);
  return concatBytes([SIG, chunk('IHDR', IHDR), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
}

function chunk(type, data) {
  const enc = new TextEncoder();
  const typeBuf = enc.encode(type);
  const len = data.length;
  const lengthBuf = new Uint8Array([(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
  const crcInput = concatBytes([typeBuf, data]);
  const c = crc32(crcInput);
  const crcBuf = new Uint8Array([(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff]);
  return concatBytes([lengthBuf, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let c;
  const table = (crc32._t ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function assembleSpritesheet(dirRgbas, frameWidth, frameHeight, scale = 4) {
  // Composes from raw RGBA frames — encoded PNG bytes must never be
  // indexed as pixel data.
  const outW = frameWidth * 4 * scale;
  const outH = frameHeight * scale;
  const pixels = new Uint8Array(outW * outH * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 10; pixels[i + 1] = 10; pixels[i + 2] = 18; pixels[i + 3] = 255;
  }

  const dirOrder = ['south', 'east', 'north', 'west'];
  for (let di = 0; di < dirOrder.length; di += 1) {
    const rgba = dirRgbas[dirOrder[di]];
    if (!rgba) continue;
    const dirWidth = frameWidth * scale;
    if (rgba.length !== dirWidth * frameHeight * scale * 4) {
      throw err('SPRITESHEET_FRAME_NOT_RGBA', {
        direction: dirOrder[di],
        expectedBytes: dirWidth * frameHeight * scale * 4,
        actualBytes: rgba.length,
      });
    }
    for (let y = 0; y < frameHeight * scale; y += 1) {
      const srcOff = y * dirWidth * 4;
      const dstOff = (y * outW + di * dirWidth) * 4;
      pixels.set(rgba.subarray(srcOff, srcOff + dirWidth * 4), dstOff);
    }
  }

  return encodePng(outW, outH, pixels);
}

export function exportCharacterToPhaserPipeline(character) {
  if (!character) return null;
  return Object.freeze({
    spritesheet: character.spritesheet,
    frameConfig: {
      frameWidth: character.canvas?.width || 32,
      frameHeight: character.canvas?.height || 48,
      frames: {
        walkSouth: [0],
        walkEast: [1],
        walkNorth: [2],
        walkWest: [3],
      },
    },
    pipeline: 'phaser.character.v1',
  });
}

export function exportCharacterToGodotScene(character) {
  if (!character) return null;
  const frameWidth = character.canvas?.width || 32;
  const frameHeight = character.canvas?.height || 48;
  const dirs = ['south', 'east', 'north', 'west'];

  const animations = dirs.map((dir, idx) => `
[sub_resource type="SpriteFrames" id="SpriteFrames_${idx}"]
  animations = [{
    "name": "idle_${dir}",
    "speed": 5.0,
    "loop": true,
    "frames": [{
      "duration": 1.0,
      "texture": ExtResource("1")
    }]
  }]
`).join('\n');

  const scene = `[gd_scene load_steps=2 format=3 uid="uid://character_${character.spec?.id || 'unknown'}"]

[ext_resource type="Texture2D" path="res://assets/characters/${character.spec?.id || 'unknown'}.png" id="1"]

[node name="Character" type="AnimatedSprite2D"]
position = Vector2(0, 0)
scale = Vector2(4, 4)
sprite_frames = SubResource("SpriteFrames_0")
animation = "idle_south"
frame = 0
metadata/character_id = "${character.spec?.id || 'unknown'}"

[resource]
script = null
`;

  return scene;
}

export function uint8ToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function exportCharacterToPixelLotusActor(character) {
  if (!character) return null;
  const spec = character.spec || {};
  const id = spec.id || 'unknown';
  return Object.freeze({
    actorId: id,
    displayName: id.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
    spriteKey: `character/${id.replace(/\./g, '_')}`,
    combatProfile: {
      hp: 100,
      mp: 80,
      school: 'SCHOLAR',
      resonance: 50,
      stance: 'balanced',
      abilities: ['arcaneBolt', 'scholarWard', 'resonancePulse'],
    },
    appearance: {
      spritesheet: character.spritesheet ? uint8ToBase64(character.spritesheet) : '',
      frameWidth: character.canvas?.width || 32,
      frameHeight: character.canvas?.height || 48,
    },
  });
}

export function forgeCharacter(rawSpec, opts = {}) {
  const spec = normalizeCharacterSpec(rawSpec);
  validateCharacterSpec(spec);

  const pngScale = Math.max(1, Math.round(opts.pngScale || 4));
  const directions = spec.directions || ['south', 'east', 'north', 'west'];
  const canvas = spec.canvas || CHARACTER_DEFAULTS.canvas;

  const silhouettes = {};
  const filledResults = {};
  const dirPngs = {};
  const dirRgbas = {};
  const skeletons = {};

  let specHash = hashCharacterSpec(spec);
  let allCells = [];

  for (const dir of directions) {
    const silhouette = composeCharacterSilhouette(spec, { direction: dir });
    silhouettes[dir] = silhouette;

    const skeleton = silhouette.skeleton;
    skeletons[dir] = skeleton;

    const fills = applyCharacterFills({ silhouette, spec, direction: dir });
    filledResults[dir] = fills;

    let rgba = rasterizeCells(fills.coordinates, canvas.width, canvas.height, 1);
    rgba = applyXBR2x(rgba, canvas.width,     canvas.height);
    rgba = applyXBR2x(rgba, canvas.width * 2, canvas.height * 2);
    dirRgbas[dir] = rgba;
    dirPngs[dir] = encodePng(canvas.width * 4, canvas.height * 4, rgba);

    for (const c of fills.coordinates) {
      allCells.push({ ...c, direction: dir });
    }
  }

  const spritesheet = assembleSpritesheet(dirRgbas, canvas.width, canvas.height, 4);

  const rendererName = opts?.renderer ?? 'pixelart';
  const { render, outputType } = getRenderer(rendererName);

  if (outputType === 'svg') {
    const primaryDir = directions[0];
    const primaryFills = filledResults[primaryDir];
    const svgString = render(primaryFills, spec, opts);
    return Object.freeze({ svg: svgString, spec, specHash, canvas, fills: filledResults });
  }

  const character = Object.freeze({
    spec,
    specHash,
    canvas,
    silhouette: silhouettes,
    fills: filledResults,
    sprites: Object.fromEntries(
      Object.entries(dirPngs).map(([dir, png]) => [dir, png])
    ),
    spritesheet,
    construction: skeletons,
    phaserPipeline: exportCharacterToPhaserPipeline({ spritesheet, canvas, spec }),
    godotScene: exportCharacterToGodotScene({ spritesheet, canvas, spec }),
    pixelLotusActor: exportCharacterToPixelLotusActor({ spritesheet, canvas, spec }),
    diagnostics: {
      totalCells: allCells.length,
      paletteSizes: Object.fromEntries(
        Object.entries(filledResults).map(([dir, fills]) => [dir, fills.diagnostics.uniqueColors])
      ),
      directions,
    },
  });

  return character;
}

export { composeCharacterSilhouette } from './character-silhouette-composer.js';
export { normalizeCharacterSpec, validateCharacterSpec, hashCharacterSpec } from './character-spec.js';
export { createCharacterSkeleton } from './character-construction-skeleton.js';
