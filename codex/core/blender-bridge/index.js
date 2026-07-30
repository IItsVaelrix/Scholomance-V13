/**
 * blender-bridge — public exports.
 *
 * The Blender Synthesis Bridge projects PixelBrain packets onto a Python-safe
 * wire, mints RENDER-domain SCD64 receipts, and carries energy attributes
 * losslessly. Blender is the Synthesis Engine: authority over light, motion,
 * and volume, nothing else.
 */

export { quantize, dequantize, INT32_MAX, INT32_MIN, SCALES, QuantizeError } from './quantize.js';
export { internTable, ABSENT_ID } from './intern.js';
export { toPythonWire, serializeWirePacket, assertNoNulls, WireError, WIRE_VERSION, COLOR_POLICIES, ENERGY_CHANNELS } from './wire.js';
export {
  renderSCD64, parseRenderSCD64, classifyDivergence, buildRenderCanonicals,
  RENDER_SLOT_NAMES, RENDER_SLOT_ALIASES, SYNTH_CLASSES, VERDICTS, RENDER_VERSION,
} from './render-scd64.js';
export { mintReceipt, compareReceipts, hashPixelDump, hashPixelBuffer, ReceiptError } from './receipt.js';
export { ENERGY_TYPES, ENERGY_BINDINGS, getBinding, unboundEnergyTypes, validateBinding } from './energy-bindings.js';
