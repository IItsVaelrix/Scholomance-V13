/**
 * VRI Index — Public API for the Vixel Render IR layer.
 *
 * Usage:
 *   import { compileVRI, renderVRI, VRI_VERSION } from 'codex/core/pixelbrain/vixel/index.js';
 *
 *   const scene = compileVRI(scdlPacket, { artGenes, shaderPacket, lighting });
 *   const rgba = renderVRI(scene, 8); // 8× scale
 *
 * @bytecode PB-VRI-v2
 */

export { VRI_VERSION, LAYER_TYPES, BLEND_MODES, TEXTURE_KINDS, MARK_KINDS, LIGHT_KINDS, QUANTIZATION_MODES } from './vri-schema.js';
export { createQuantizationSpec } from './vri-schema.js';
export { createGeometryLayer, createTextureLayer, createMarkLayer, createRasterPatchLayer, createVRIScene } from './vri-schema.js';
export { compileVRI, fnv1aNum, fnv1aHex } from './vri-compiler.js';
export { renderVRI, RENDERER_CAPABILITIES } from './vri-renderer.js';
