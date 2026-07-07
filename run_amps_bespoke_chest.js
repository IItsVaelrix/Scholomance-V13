import { readFileSync, writeFileSync } from 'node:fs';
import { compileSCDL } from './codex/core/pixelbrain/scdl/index.js';
import { buildGeometryAmpPayload } from './codex/core/pixelbrain/geometry-amp.js';
import { applySelout } from './codex/core/pixelbrain/selout-amp.js';
import { applyPixelAA } from './codex/core/pixelbrain/pixel-aa-amp.js';
import { buildSquareSharpnessContrastPayload } from './codex/core/pixelbrain/square-sharpness-contrast-amp.js';
import { applyPaletteQuantization } from './codex/core/pixelbrain/palette-quantization-amp.js';
import { buildAsepritePayload } from './codex/core/pixelbrain/scdl/index.js';
import { encodeAsepriteBinary } from './codex/core/pixelbrain/aseprite-binary-codec.js';

// Read SCDL
const source = readFileSync('./docs/references/bespoke-chest.scdl', 'utf8');
const result = compileSCDL(source);
if (!result.ok) {
  console.error("Compile failed", result.errors);
  process.exit(1);
}
let packet = result.packet;
let coords = packet.geometry.coordinates;
const canvas = packet.canvas;

console.log("Original Coords:", coords.length);

// 1. Geometry AMP (generates mask and metrics, doesn't usually mutate directly but returns payload)
const geomPayload = buildGeometryAmpPayload({
  coordinates: coords,
  canvas
});
console.log("Geometry AMP ran, valid:", geomPayload.valid);

// The other AMPs usually take an object like { coordinates: coords, ... }
// Let's check how they are called in item-foundry.js!
