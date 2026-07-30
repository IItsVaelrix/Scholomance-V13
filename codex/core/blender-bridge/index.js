/**
 * blender-bridge — public exports.
 *
 * The Blender Synthesis Bridge projects PixelBrain packets onto a Python-safe
 * wire, mints RENDER-domain SCD64 receipts, and carries energy attributes
 * losslessly. Blender is the Synthesis Engine: authority over light, motion,
 * and volume, nothing else.
 *
 * Slice 1: quantize, intern, wire, render-scd64, receipt, energy-bindings.
 * Slice 2: chained-receipt (SIMULATED), cross-engine (Remotion comparison),
 *          palette-wire (school palette serialization).
 * Slice 3: remotion-canvas-renderer (second consumer), sim-e2e (chained
 *          receipt orchestrator), palette-e2e (palette pipeline orchestrator).
 */

// Slice 1 — boundary + ingest + determinism
export { quantize, dequantize, INT32_MAX, INT32_MIN, SCALES, QuantizeError } from './quantize.js';
export { internTable, ABSENT_ID } from './intern.js';
export { toPythonWire, serializeWirePacket, assertNoNulls, WireError, WIRE_VERSION, COLOR_POLICIES, ENERGY_CHANNELS } from './wire.js';
export {
  renderSCD64, parseRenderSCD64, classifyDivergence, buildRenderCanonicals,
  RENDER_SLOT_NAMES, RENDER_SLOT_ALIASES, SYNTH_CLASSES, VERDICTS, RENDER_VERSION,
} from './render-scd64.js';
export { mintReceipt, compareReceipts, hashPixelDump, hashPixelBuffer, ReceiptError } from './receipt.js';
export { ENERGY_TYPES, ENERGY_BINDINGS, getBinding, unboundEnergyTypes, validateBinding } from './energy-bindings.js';

// Slice 2 — simulation, cross-engine, palette
export {
  chainedPixelHash, buildChain, verifyChain, mintChainedReceipt,
  compareChains, checkColdStart, ChainError,
} from './chained-receipt.js';
export {
  compareCrossEngine, buildRemotionClaim, expectedCrossEngineAgreement,
  CROSS_ENGINE_VERDICTS, CrossEngineError,
} from './cross-engine.js';
export {
  SCHOOL_PALETTE, SCHOOL_NAMES, hexToSrgb, srgbToLinear, hexToLinear,
  paletteToWire, allPalettesToWire, validatePaletteWire, PaletteError,
} from './palette-wire.js';

// Slice 3 — second consumer, simulation E2E, palette E2E
export {
  renderWireToPixels, hashCanvasPixels, buildCanvasClaim,
  crossEngineRender, hexIntToRgb, CanvasRenderError,
} from './remotion-canvas-renderer.js';
export {
  buildSimChain, mintSimReceipts, runSimE2E, compareSimRuns,
  hashFrameDumps, SimE2EError,
} from './sim-e2e.js';
export {
  preparePalettePayload, runPaletteE2E, comparePaletteRenders,
  PaletteE2EError,
} from './palette-e2e.js';
