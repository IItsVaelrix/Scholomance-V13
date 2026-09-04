/**
 * VRI Index — Public API for the Vixel Render IR layer.
 *
 * Usage:
 *   import { compileVRI, renderVRI, VRI_VERSION } from 'codex/core/pixelbrain/vixel/index.js';
 *
 *   const scene = compileVRI(scdlPacket, { artGenes, shaderPacket, lighting });
 *   const rgba = renderVRI(scene, 8); // 8× scale
 *
 * @bytecode PB-VRI-v1
 */

export { VRI_VERSION, STROKE_CONTRACT, LAYER_TYPES, BLEND_MODES, TEXTURE_KINDS, MARK_KINDS, LIGHT_KINDS, QUANTIZATION_MODES } from './vri-schema.js';
export { createQuantizationSpec } from './vri-schema.js';
export { createGeometryLayer, createTextureLayer, createMarkLayer, createRasterPatchLayer, createVRIScene } from './vri-schema.js';
export { compileVRI, fnv1aNum, fnv1aHex, DEFAULT_KEY_DIRECTION, SYNTHETIC_RELIEF_CONTRACT } from './vri-compiler.js';
export { renderVRI, RENDERER_CAPABILITIES } from './vri-renderer.js';
export { extractContours } from './stroke-extractor.js';
export { stylizeStrokes } from './stroke-stylizer.js';

import { compileVRI as _compileVRI } from './vri-compiler.js';
import { renderVRI as _renderVRI } from './vri-renderer.js';

/**
 * Compile + render a flat coordinate list through the VRI engine in one call.
 *
 * Every caller that bridges a non-SCDL coordinate list into VRI (item-foundry's
 * Door B, the character-foundry bridge) was hand-assembling the same
 * `{ id, canvas, geometry: { mode: 'coordinates', coordinates } }` packet and
 * calling compileVRI then renderVRI itself. That's the composition step this
 * engine's own public API should own — one source of truth for "coordinates in,
 * scene+raster out," so the two bridges can't drift on packet shape.
 *
 * Deliberately does NOT digest or PNG-encode: those are caller concerns (each
 * bridge already has its own digest/encoder in scope, and this module stays
 * dependency-free of the composition boundary in asset-pipeline.js).
 *
 * @param {Array<{x:number,y:number,color:string,material?:string,partId?:string}>} coordinates
 * @param {{width:number,height:number}} canvas
 * @param {object} [options]
 * @param {string} [options.id='vri-coordinates'] - VRI packet id
 * @param {number} [options.scale=4]
 * @param {object} [options.compile] - forwarded to compileVRI (relief, quantize, lighting, ...)
 * @param {object} [options.render] - forwarded to renderVRI (e.g. { strokes: true })
 * @returns {{ scene: object, raster: object }}
 */
export function renderCoordinatesVri(coordinates, canvas, options = {}) {
  const { id = 'vri-coordinates', scale = 4, compile = {}, render = {} } = options;
  const packet = {
    id,
    canvas: { width: canvas.width, height: canvas.height },
    geometry: { mode: 'coordinates', coordinates },
  };
  const scene = _compileVRI(packet, compile);
  const raster = _renderVRI(scene, scale, render);
  return { scene, raster };
}
