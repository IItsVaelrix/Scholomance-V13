import { readFileSync, writeFileSync } from 'node:fs';
import { compileSCDL, buildAsepritePayload } from './codex/core/pixelbrain/scdl/index.js';
import { buildGeometryAmpPayload } from './codex/core/pixelbrain/geometry-amp.js';
import { applySelout } from './codex/core/pixelbrain/selout-amp.js';
import { applyPixelAA } from './codex/core/pixelbrain/pixel-aa-amp.js';
import { buildSquareSharpnessContrastPayload } from './codex/core/pixelbrain/square-sharpness-contrast-amp.js';
import { applyPaletteQuantization } from './codex/core/pixelbrain/palette-quantization-amp.js';
import { resolveMaterialId, MATERIAL_PALETTES } from './codex/core/pixelbrain/material-registry.js';
import { encodeAsepriteBinary } from './codex/core/pixelbrain/aseprite-binary-codec.js';

const source = readFileSync('./docs/references/bespoke-chest.scdl', 'utf8');
const result = compileSCDL(source);
if (!result.ok) {
  console.error("Compile failed", result.errors);
  process.exit(1);
}

let packet = result.packet;
let coords = packet.geometry.coordinates;

console.log("Original Coords:", coords.length);

function materialResolver(target) {
  if (!target || !target.material) return null;
  const id = resolveMaterialId(target.material);
  const def = MATERIAL_PALETTES[id];
  if (!def) return null;
  const anchorKey = target.anchor && def.anchors?.[target.anchor] ? target.anchor : 'body';
  return def.anchors[anchorKey] || def.anchors.body || null;
}

const spec = {
  canvas: packet.canvas,
  light: { orientation: 'top-left' },
  parts: result.ast.parts || []
};

// Manually construct silhouette object for Geometry AMP since SCDL lacks hierarchy
const silhouette = {
  cells: coords.map(c => ({x: c.x, y: c.y})),
  partOf: new Map(coords.map(c => [`${c.x},${c.y}`, c.partId || 'base'])),
  anchors: new Map(),
  parts: []
};

let fills = { coordinates: coords };

const geomPayload = buildGeometryAmpPayload({
  spec,
  silhouette,
  construction: null
});
console.log("Geometry AMP fired, is valid:", geomPayload.valid);

fills = applySelout(fills, spec, materialResolver, spec.light);
console.log("After applySelout:", fills.coordinates.length);

fills = applyPixelAA(fills, spec);
console.log("After applyPixelAA:", fills.coordinates.length);

const hdMaterial = spec.parts[0]?.material || 'source';
const sharpness = buildSquareSharpnessContrastPayload({
  coordinates: fills.coordinates,
  material: hdMaterial,
  canvas: spec.canvas,
  options: { enabled: true },
  intent: 'enhance_square_render_readability',
});
fills = { ...fills, coordinates: sharpness.outputCoordinates };
console.log("After square-sharpness-contrast-amp:", fills.coordinates.length);

const quantization = applyPaletteQuantization(fills.coordinates, spec);
fills = { ...fills, coordinates: quantization.coordinates };
console.log("After palette-quantization-amp:", fills.coordinates.length);

const updatedPacket = {
  ...packet,
  geometry: {
    ...packet.geometry,
    coordinates: fills.coordinates
  }
};
const asepritePayload = buildAsepritePayload([updatedPacket]);
const binary = encodeAsepriteBinary(asepritePayload);

writeFileSync('./docs/references/bespoke-chest-enhanced.aseprite', binary);
console.log("Saved enhanced chest to docs/references/bespoke-chest-enhanced.aseprite");
