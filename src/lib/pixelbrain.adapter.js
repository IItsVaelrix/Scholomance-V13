/**
 * PIXELBRAIN ADAPTER
 *
 * Bridge between UI surface and Codex-level logic.
 * Ensures UI files don't violate architectural boundaries.
 */

import { processorBridge } from './engine.adapter.js';
import { routeRetinaPacketToPhotonicBridge } from './photonic-retina/index.js';

// --- Coordinate & Formula Logic ---
import { 
  generatePixelArtFromImage as codexGeneratePixelArtFromImage,
  transcribeFullPixelData as codexTranscribeFullPixelData
} from '../../codex/core/pixelbrain/image-to-pixel-art.js';

import { 
  evaluateFormulaWithColor as codexEvaluateFormulaWithColor 
} from '../../codex/core/pixelbrain/formula-to-coordinates.js';

import { 
  parseErrorForAI as codexParseErrorForAI,
  decodeBytecodeError as codexDecodeBytecodeError,
  BytecodeError as codexBytecodeError,
  ERROR_CATEGORIES as codexERROR_CATEGORIES,
  ERROR_SEVERITY as codexERROR_SEVERITY,
  MODULE_IDS as codexMODULE_IDS,
  ERROR_CODES as codexERROR_CODES
} from '../../codex/core/pixelbrain/bytecode-error.js';

import {
  analyzeImageToFormula as codexAnalyzeImageToFormula,
  formulaToBytecode as codexFormulaToBytecode,
  parseBytecodeToFormula as codexParseBytecodeToFormula,
  FORMULA_TYPES as codexFORMULA_TYPES
} from '../../codex/core/pixelbrain/image-to-bytecode-formula.js';

// --- Grid & Template Logic ---
import {
  createTemplateGrid as codexCreateTemplateGrid,
  clearCell as codexClearCell,
  exportToAseprite as codexExportToAseprite,
  importFromAseprite as codexImportFromAseprite,
  importFromPixelBrainAssetPacket as codexImportFromPixelBrainAssetPacket,
  exportToPixelPerfectAseprite as codexExportToPixelPerfectAseprite,
  validateAsepriteImportPayload as codexValidateAsepriteImportPayload,
  generateGridPreview as codexGenerateGridPreview,
  getCellAtPosition as codexGetCellAtPosition,
  getCellOrigin as codexGetCellOrigin,
  getGridMetrics as codexGetGridMetrics,
  snapToGrid as codexSnapToGrid,
  applySymmetry as codexApplySymmetry,
  floodFill as codexFloodFill,
  GRID_TYPES as codexGRID_TYPES,
  setCell as codexSetCell,
  getCell as codexGetCell,
  toggleSymmetryAxis as codexToggleSymmetryAxis,
  // New editor extensions (PDR systems 1-8)
  createLayer as codexCreateLayer,
  setLayerOpacity as codexSetLayerOpacity,
  setLayerVisible as codexSetLayerVisible,
  setLayerLocked as codexSetLayerLocked,
  reorderLayers as codexReorderLayers,
  getFlattenedPreviewCells as codexGetFlattenedPreviewCells,
  createReferenceLayer as codexCreateReferenceLayer,
  attachAnnotation as codexAttachAnnotation,
  getCellAnnotations as codexGetCellAnnotations,
  selectRect as codexSelectRect,
  clearSelection as codexClearSelection,
  getSelectionCells as codexGetSelectionCells,
  transformCells as codexTransformCells,
  transformSelection as codexTransformSelection,
  applyAMPToCells as codexApplyAMPToCells,
  applyAMPToLayer as codexApplyAMPToLayer,
} from '../../codex/core/pixelbrain/template-grid-engine.js';

import {
  encodeAsepriteBinary as codexEncodeAsepriteBinary,
} from '../../codex/core/pixelbrain/aseprite-binary-codec.js';

// --- Character Creator (PDR 2026-06-12) ---
import {
  forgeCharacter as codexForgeCharacter,
  forgeCharacterFromWandVector as codexForgeCharacterFromWandVector,
  exportCharacterToPbrainBlueprint as codexExportCharacterToPbrainBlueprint,
  normalizeCharacterSpec as codexNormalizeCharacterSpec,
  validateCharacterSpec as codexValidateCharacterSpec,
  hashCharacterSpec as codexHashCharacterSpec,
  composeCharacterSilhouette as codexComposeCharacterSilhouette,
  createCharacterSkeleton as codexCreateCharacterSkeleton,
  exportCharacterToPhaserPipeline as codexExportCharacterToPhaserPipeline,
  exportCharacterToGodotScene as codexExportCharacterToGodotScene,
  exportCharacterToPixelLotusActor as codexExportCharacterToPixelLotusActor,
} from '../../codex/core/pixelbrain/character-foundry.js';

// --- Forge Craft Gate (PixelBrain Immunity, task 7aff0e39) ---
import {
  runForgeCraftGate as codexRunForgeCraftGate,
} from '../../codex/core/pixelbrain/forge-craft-gate.js';

import {
  parseSilhouetteBlueprint as codexParseSilhouetteBlueprint,
} from '../../codex/core/pixelbrain/silhouette-blueprint.js';

// --- Lattice Grid Engine (NEW) ---
import {
  generateLatticeGrid as codexGenerateLatticeGrid,
  renderLattice as codexRenderLattice,
  paintCell as codexPaintCell,
  clearCell as codexClearLatticeCell,
  exportLatticeToAseprite as codexExportLatticeToAseprite,
  buildOccupancySet as codexBuildOccupancySet,
  resolveLatticeClick as codexResolveLatticeClick,
} from '../../codex/core/pixelbrain/lattice-grid-engine.js';

// --- Symmetry AMP ---
import {
  detectSymmetry as codexDetectSymmetry,
  applySymmetryToLattice as codexApplySymmetryToLattice,
  generateSymmetryOverlay as codexGenerateSymmetryOverlay,
} from '../../codex/core/pixelbrain/symmetry-amp.js';

// --- Physics & Animation ---
import {
  getRotationAtTime as codexGetRotationAtTime
} from '../../codex/core/pixelbrain/gear-glide-amp.js';

import { roundTo as codexRoundTo } from '../../codex/core/pixelbrain/shared.js';

// --- NLP Morph Engine (in-place phonetic asset edit) ---
import {
  deriveVerseMorphTarget as codexDeriveVerseMorphTarget,
  morphCoordinatesToward as codexMorphCoordinatesToward,
  interpretInstruction as codexInterpretInstruction,
} from '../../codex/core/pixelbrain/nlp-morph-engine.js';

// --- Template / Fill Bridge (geometry↔fill separation) ---
import {
  templatize as codexTemplatize,
  fillTemplate as codexFillTemplate,
} from '../../codex/core/pixelbrain/template-fill-bridge.js';

// --- Sketch AMP (silhouette authoring → auto-shaded template) ---
import {
  sketchToSilhouette as codexSketchToSilhouette,
} from '../../codex/core/pixelbrain/sketch-amp.js';

// --- Asset Packet / Connective Tissue ---
import {
  createPixelBrainAssetPacket as codexCreatePixelBrainAssetPacket,
  normalizePixelBrainAssetPacket as codexNormalizePixelBrainAssetPacket,
  derivePixelBrainRenderPacket as codexDerivePixelBrainRenderPacket,
  derivePixelBrainExportPacket as codexDerivePixelBrainExportPacket,
} from '../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

import {
  resolvePixelBrainPaletteAuthority as codexResolvePixelBrainPaletteAuthority,
} from '../../codex/core/pixelbrain/palette-authority-bridge.js';

import {
  templateGridToPixelBrainAssetPacket as codexTemplateGridToPixelBrainAssetPacket,
} from '../../codex/core/pixelbrain/template-grid-asset-bridge.js';

import {
  exportFoundryToAseprite as codexExportFoundryToAseprite,
  exportFoundryToAsepriteBinary as codexExportFoundryToAsepriteBinary,
  decodeFoundryAsepriteBinary as codexDecodeFoundryAsepriteBinary,
  importAsepriteToFoundryAsset as codexImportAsepriteToFoundryAsset,
  importAsepriteBinaryToFoundryAsset as codexImportAsepriteBinaryToFoundryAsset,
} from '../../codex/core/pixelbrain/foundry-aseprite-bridge.js';

// Editor Command Stack (System 7) + new editor primitives
import {
  createCommandStack as codexCreateCommandStack,
  Command as codexCommand,
  createPaintCommand as codexCreatePaintCommand,
  createFillCommand as codexCreateFillCommand,
  PhosphorylationCommand as codexPhosphorylationCommand,
  createPhosphorylationCommand as codexCreatePhosphorylationCommand,
  LayerOpCommand,
  rehydrateEditorCommand,
} from '../../codex/core/pixelbrain/editor-command-stack.js';

import {
  buildKinase as codexBuildKinase,
} from '../../codex/core/pixelbrain/qbit-phosphorylation.js';

import {
  createSpriteCache as codexCreateSpriteCache,
} from '../../codex/core/pixelbrain/qbit-sprite-cache.js';

import {
  buildConstructionGuideCells as codexBuildConstructionGuideCells,
} from '../../codex/core/pixelbrain/construction-guides.js';

import {
  registerPixelBrainShaderUniformProvider as codexRegisterPixelBrainShaderUniformProvider,
  resolvePixelBrainShaderUniforms as codexResolvePixelBrainShaderUniforms,
} from '../../codex/core/pixelbrain/pixelbrain-shader-uniform-providers.js';

import {
  enhanceSquaresForRender as codexEnhanceSquaresForRender,
  buildSquareSharpnessContrastPayload as codexBuildSquareSharpnessContrastPayload,
} from '../../codex/core/pixelbrain/square-sharpness-contrast-amp.js';

// --- SDF & Coherent Noise AMPs (full PDR 2026-06-12 integration for editor + foundry) ---
import {
  SDFShapeAMP as codexSDFShapeAMP,
  SDF_SHAPE_AMP_ID as codexSDF_ID,
  SDF_SHAPE_AMP_SEAM as codexSDF_SEAM,
} from '../../codex/core/pixelbrain/sdf-shape-amp.js';

import {
  NoiseFillAMP as codexNoiseFillAMP,
  NOISE_FILL_AMP_ID as codexNOISE_ID,
  NOISE_FILL_AMP_SEAM as codexNOISE_SEAM,
} from '../../codex/core/pixelbrain/noise-fill-amp.js';

import {
  normalizePB_SDF_v1 as codexNormalizePB_SDF_v1,
  normalizePB_NOISE_v1 as codexNormalizePB_NOISE_v1,
} from '../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

// --- WAND → Fill Bridge (proposal → fill bytecode) ---
import {
  deriveWandFillBytecode as codexDeriveWandFillBytecode,
} from '../../codex/core/pixelbrain/wand-fill-bridge.js';

import {
  buildColorIntensityPayload as codexBuildColorIntensityPayload,
} from '../../codex/core/pixelbrain/color-intensity-rating-microprocessor.js';

import {
  compileEffectsBytecode as codexCompileEffectsBytecode,
} from '../../codex/core/pixelbrain/character-bytecode-compiler.js';

// --- Custom Shaders System (NEW) ---
import {
  createShaderPacket as codexCreateShaderPacket,
  validateShaderPacket as codexValidateShaderPacket,
  hashShaderPacket as codexHashShaderPacket,
  normalizeShaderSource as codexNormalizeShaderSource,
} from '../../codex/core/pixelbrain/shader-packet.js';

import {
  resolveShaderUniforms as codexResolveShaderUniforms,
  DEFAULT_SHADER_UNIFORMS as codexDEFAULT_SHADER_UNIFORMS,
} from '../../codex/core/pixelbrain/shader-uniform-resolver.js';

import {
  registerUniformProvider as codexRegisterUniformProvider,
  getUniformProviders as codexGetUniformProviders,
  clearUniformRegistry as codexClearUniformRegistry,
} from '../../codex/core/pixelbrain/shader-uniform-registry.js';

import {
  createShaderCompileError as codexCreateShaderCompileError,
} from '../../codex/core/pixelbrain/shader-errors.js';

import {
  compileShaderProgram as codexCompileShaderProgram,
  parseShaderCompileLog as codexParseShaderCompileLog,
  renderShaderFrame as codexRenderShaderFrame,
  disposeShaderProgram as codexDisposeShaderProgram,
  createFullscreenQuad as codexCreateFullscreenQuad,
  disposeFullscreenQuad as codexDisposeFullscreenQuad,
  wrapShaderSource as codexWrapShaderSource,
  DEFAULT_FRAGMENT_SOURCE as codexDEFAULT_FRAGMENT_SOURCE,
} from './pixelbrain/shader-webgl-preview.js';

import {
  exportToGodotShader as codexExportToGodotShader,
} from './exporters/pixelbrainGodotShaderExport.js';

import {
  exportToPhaserPipeline as codexExportToPhaserPipeline,
} from './exporters/pixelbrainPhaserShaderExport.js';

// --- EXPORTS ---

export const FORMULA_TYPES = codexFORMULA_TYPES;
export const GRID_TYPES = codexGRID_TYPES;

export { processorBridge };
export const BytecodeError = codexBytecodeError;
export const ERROR_CATEGORIES = codexERROR_CATEGORIES;
export const ERROR_SEVERITY = codexERROR_SEVERITY;
export const MODULE_IDS = codexMODULE_IDS;
export const ERROR_CODES = codexERROR_CODES;
export const decodeBytecodeError = codexDecodeBytecodeError;
export const compileEffectsBytecode = codexCompileEffectsBytecode;

/**
 * Run the PixelBrain Forge Craft Gate over an ITEM-SPEC-v1 spec and return a
 * normalized, UI-safe verdict. The codex gate throws a BytecodeError on any
 * blocking immunity failure; the UI must never see raw codex error instances,
 * so we catch and flatten to a plain result the surface can render.
 *
 * @returns {{ ok: boolean, vaccine?: string, bytecode?: string, reason?: string, detail?: object }}
 */
export function runForgeCraftGate(spec) {
  try {
    const result = codexRunForgeCraftGate(spec);
    return { ok: true, vaccine: result.vaccine, bundle: result.bundle };
  } catch (err) {
    const detail = typeof err?.toJSON === 'function' ? err.toJSON() : null;
    return {
      ok: false,
      bytecode: err?.bytecode || null,
      reason: detail?.context?.reason || err?.message || 'Forge craft gate failure',
      detail,
    };
  }
}

export function runForgeCraftGateWithBlueprint(spec, silhText) {
  try {
    const blueprint = codexParseSilhouetteBlueprint(silhText);
    const result = codexRunForgeCraftGate(spec, { blueprint });
    return {
      ok: true,
      vaccine: result.vaccine,
      bundle: result.bundle,
      digest: blueprint.digest,
    };
  } catch (err) {
    const detail = typeof err?.toJSON === 'function' ? err.toJSON() : null;
    return {
      ok: false,
      bytecode: err?.bytecode || null,
      reason: detail?.context?.reason || err?.message || 'Silhouette blueprint gate failure',
      view: detail?.context?.view || null,
      phase: detail?.context?.phase || null,
      detail,
    };
  }
}

export const DEFAULT_SHADER_UNIFORMS = codexDEFAULT_SHADER_UNIFORMS;
export const DEFAULT_FRAGMENT_SOURCE = codexDEFAULT_FRAGMENT_SOURCE;

export function createShaderPacket(options) {
  return codexCreateShaderPacket(options);
}
export function validateShaderPacket(packet) {
  return codexValidateShaderPacket(packet);
}
export function hashShaderPacket(packet) {
  return codexHashShaderPacket(packet);
}
export function normalizeShaderSource(src) {
  return codexNormalizeShaderSource(src);
}
export function resolveShaderUniforms(packet, runtimeState) {
  return codexResolveShaderUniforms(packet, runtimeState);
}
export function createShaderCompileError(params) {
  return codexCreateShaderCompileError(params);
}
export function compileShaderProgram(gl, fsUserCode) {
  return codexCompileShaderProgram(gl, fsUserCode);
}
export function parseShaderCompileLog(log) {
  return codexParseShaderCompileLog(log);
}
export function renderShaderFrame(gl, program, quad, resolvedUniforms) {
  return codexRenderShaderFrame(gl, program, quad, resolvedUniforms);
}
export function disposeShaderProgram(gl, program) {
  return codexDisposeShaderProgram(gl, program);
}
export function createFullscreenQuad(gl) {
  return codexCreateFullscreenQuad(gl);
}
export function disposeFullscreenQuad(gl, quad) {
  return codexDisposeFullscreenQuad(gl, quad);
}
export function wrapShaderSource(userCode) {
  return codexWrapShaderSource(userCode);
}
export function exportToGodotShader(packet) {
  return codexExportToGodotShader(packet);
}
export function exportToPhaserPipeline(packet) {
  return codexExportToPhaserPipeline(packet);
}

export function generatePixelArtFromImage(analysis, canvasSize, extension) {
  return codexGeneratePixelArtFromImage(analysis, canvasSize, extension);
}

export function transcribeFullPixelData(pixelData, dimensions, canvasSize) {
  return codexTranscribeFullPixelData(pixelData, dimensions, canvasSize);
}

export function evaluateFormulaWithColor(formula, canvasSize, time) {
  return codexEvaluateFormulaWithColor(formula, canvasSize, time);
}

export function parseErrorForAI(error) {
  return codexParseErrorForAI(error);
}

export function analyzeImageToFormula(analysis) {
  return codexAnalyzeImageToFormula(analysis);
}

export function formulaToBytecode(formula) {
  return codexFormulaToBytecode(formula);
}

export function parseBytecodeToFormula(bytecode) {
  return codexParseBytecodeToFormula(bytecode);
}

export function createTemplateGrid(config) {
  return codexCreateTemplateGrid(config);
}

export function clearCell(layer, x, y) {
  return codexClearCell(layer, x, y);
}

export function exportToAseprite(grid) {
  return codexExportToAseprite(grid);
}

export function generateGridPreview(grid) {
  return codexGenerateGridPreview(grid);
}

export function getCellAtPosition(grid, x, y) {
  return codexGetCellAtPosition(grid, x, y);
}

export function getCellOrigin(grid, col, row) {
  return codexGetCellOrigin(grid, col, row);
}

export function getGridMetrics(grid) {
  return codexGetGridMetrics(grid);
}

export function snapToGrid(x, y, grid) {
  return codexSnapToGrid(x, y, grid);
}

export function applySymmetry(coordinates, grid) {
  return codexApplySymmetry(coordinates, grid);
}

export function importFromAseprite(data, options = {}) {
  return codexImportFromAseprite(data, options);
}

export function importFromPixelBrainAssetPacket(packet, options = {}) {
  return codexImportFromPixelBrainAssetPacket(packet, options);
}

export function exportToPixelPerfectAseprite(grid, options = {}) {
  return codexExportToPixelPerfectAseprite(grid, options);
}

export function exportToPixelPerfectAsepriteBinary(grid, options = {}) {
  return codexEncodeAsepriteBinary(codexExportToPixelPerfectAseprite(grid, options));
}

export function validateAsepriteImportPayload(data, options = {}) {
  return codexValidateAsepriteImportPayload(data, options);
}

export function floodFill(grid, layer, x, y, color) {
  return codexFloodFill(grid, layer, x, y, color);
}

export function setCell(layer, x, y, color, emphasis) {
  return codexSetCell(layer, x, y, color, emphasis);
}

export function getCell(layer, x, y) {
  return codexGetCell(layer, x, y);
}

export function toggleSymmetryAxis(grid, axis) {
  return codexToggleSymmetryAxis(grid, axis);
}

export function getRotationAtTime(time, bpm) {
  return codexGetRotationAtTime(time, bpm);
}

export function roundTo(val, precision) {
  return codexRoundTo(val, precision);
}

// --- NLP MORPH ENGINE EXPORTS ---

export function deriveVerseMorphTarget(versePayload) {
  return codexDeriveVerseMorphTarget(versePayload);
}

export function morphCoordinatesToward(baseCoordinates, target, t) {
  return codexMorphCoordinatesToward(baseCoordinates, target, t);
}

export function interpretInstruction(text) {
  return codexInterpretInstruction(text);
}

// --- TEMPLATE / FILL BRIDGE EXPORTS ---

export function templatize(coordinates, options) {
  return codexTemplatize(coordinates, options);
}

export function fillTemplate(template, bytecode, options) {
  return codexFillTemplate(template, bytecode, options);
}

// --- SKETCH AMP EXPORTS ---

export function sketchToSilhouette(occupied, dimensions, options) {
  return codexSketchToSilhouette(occupied, dimensions, options);
}

// --- ASSET PACKET / CONNECTIVE TISSUE EXPORTS ---

export function createPixelBrainAssetPacket(input) {
  return codexCreatePixelBrainAssetPacket(input);
}

export function normalizePixelBrainAssetPacket(packet) {
  return codexNormalizePixelBrainAssetPacket(packet);
}

export function derivePixelBrainRenderPacket(packet, options) {
  return codexDerivePixelBrainRenderPacket(packet, options);
}

export function derivePixelBrainExportPacket(packet, target, options) {
  return codexDerivePixelBrainExportPacket(packet, target, options);
}

export function resolvePixelBrainPaletteAuthority(input) {
  return codexResolvePixelBrainPaletteAuthority(input);
}

export function templateGridToPixelBrainAssetPacket(grid, options) {
  return codexTemplateGridToPixelBrainAssetPacket(grid, options);
}

export function exportFoundryToAseprite(foundry, options) {
  return codexExportFoundryToAseprite(foundry, options);
}

export function exportFoundryToAsepriteBinary(foundry, options) {
  return codexExportFoundryToAsepriteBinary(foundry, options);
}

export function decodeFoundryAsepriteBinary(buffer) {
  return codexDecodeFoundryAsepriteBinary(buffer);
}

export function importAsepriteToFoundryAsset(payload, options) {
  return codexImportAsepriteToFoundryAsset(payload, options);
}

export function importAsepriteBinaryToFoundryAsset(buffer, options) {
  return codexImportAsepriteBinaryToFoundryAsset(buffer, options);
}

export function registerPixelBrainShaderUniformProvider() {
  return codexRegisterPixelBrainShaderUniformProvider();
}

export function resolvePixelBrainShaderUniforms(context) {
  return codexResolvePixelBrainShaderUniforms(context);
}

export function runPixelBrainPipeline(input, context) {
  return processorBridge.execute('pixelbrain.pipeline.run', input, context);
}

export function enhanceSquaresForRender(coordinates, options) {
  return codexEnhanceSquaresForRender(coordinates, options);
}

export function buildSquareSharpnessContrastPayload(input) {
  return codexBuildSquareSharpnessContrastPayload(input);
}

export function buildColorIntensityPayload(input) {
  return codexBuildColorIntensityPayload(input);
}

// --- WAND → FILL BRIDGE EXPORTS ---

export function deriveWandFillBytecode(proposal) {
  return codexDeriveWandFillBytecode(proposal);
}

function normalizePixelBrainCoordinate(coord) {
  return Object.freeze({
    x: Number(coord?.snappedX ?? coord?.x ?? 0),
    y: Number(coord?.snappedY ?? coord?.y ?? 0),
    color: coord?.color || '#ffffff',
    emphasis: Number(coord?.emphasis ?? coord?.pressure ?? 1),
  });
}

export function buildPixelBrainPhotonicRoute(payload, options = {}) {
  try {
    const coordinates = Array.isArray(payload?.coordinates) ? payload.coordinates : [];

    if (coordinates.length === 0) {
      return null;
    }

    const canvas = payload?.canvas || {};
    const dimensions = {
      width: Number(canvas.width) || 160,
      height: Number(canvas.height) || 144,
    };

    return routeRetinaPacketToPhotonicBridge(
      {
        sourceKind: 'coordinates',
        dimensions,
        payload: coordinates.map(normalizePixelBrainCoordinate),
        metadata: {
          sourceSystem: 'pixelbrain',
          paletteCount: Array.isArray(payload?.palettes) ? payload.palettes.length : 0,
        },
      },
      {
        retina: {
          targetDimension: options.targetDimension || 64,
          bitWidth: options.bitWidth || 4,
        },
        bridge: {
          mode: options.mode || 'shadow',
        },
        previousPacket: options.previousPacket,
        previewLength: options.previewLength || 24,
      }
    );
  } catch (error) {
    if (options.mode === 'warn') {
      console.warn('[PixelBrain Photonic Retina] routing failed:', error);
    }

    return null;
  }
}

// --- LATTICE GRID ENGINE EXPORTS ---

export async function generateLatticeGrid(analysis) {
  return codexGenerateLatticeGrid(analysis);
}

export function renderLattice(canvas, lattice, zoom) {
  return codexRenderLattice(canvas, lattice, zoom);
}

export function paintCell(lattice, col, row, color) {
  return codexPaintCell(lattice, col, row, color);
}

export function clearLatticeCell(lattice, col, row) {
  return codexClearLatticeCell(lattice, col, row);
}

export function exportLatticeToAseprite(lattice, targetWidth, targetHeight) {
  return codexExportLatticeToAseprite(lattice, targetWidth, targetHeight);
}

export function buildOccupancySet(lattice) {
  return codexBuildOccupancySet(lattice);
}

export function resolveLatticeClick(clientX, clientY, rect, lattice, zoom, offsetX, offsetY) {
  return codexResolveLatticeClick(clientX, clientY, rect, lattice, zoom, offsetX, offsetY);
}

// --- SYMMETRY AMP EXPORTS ---

export function detectSymmetry(pixelData, dimensions) {
  return codexDetectSymmetry(pixelData, dimensions);
}

export function applySymmetryToLattice(lattice, symmetry) {
  return codexApplySymmetryToLattice(lattice, symmetry);
}

export function generateSymmetryOverlay(symmetry, width, height, zoom) {
  return codexGenerateSymmetryOverlay(symmetry, width, height, zoom);
}

// --- SYMMETRY AMP MICROPROCESSOR ---
/**
 * Run Symmetry AMP as a microprocessor stage
 * @param {Object} input - SymmetryAmpInput contract
 * @returns {SymmetryAmpOutput} SymmetryAmpOutput contract
 */
export function runSymmetryAmpProcessor(input) {
  return processorBridge.execute('amp.symmetry', input);
}

/**
 * Run Coord Symmetry AMP as a microprocessor stage
 * @param {Object} input - CoordSymmetryInput contract
 * @returns {CoordSymmetryOutput} CoordSymmetryOutput contract
 */
export function runCoordSymmetryAmp(input) {
  return processorBridge.execute('amp.coord-symmetry', input);
}

export function registerUniformProvider(providerId, provider) {
  return codexRegisterUniformProvider(providerId, provider);
}

export function getUniformProviders() {
  return codexGetUniformProviders();
}

export function clearUniformRegistry() {
  return codexClearUniformRegistry();
}

// Re-export transform functions for testing
export {
  verticalMirror,
  horizontalMirror,
  radialRotate,
  diagonalMirror,
} from '../../codex/core/pixelbrain/coord-symmetry-amp.js';

// ═══════════════════════════════════════════════════════════════════════
// EDITOR SYSTEMS (full implementation of the 8 Aseprite-rival features + AMP-Aware)
// All UI code must use these (via the adapter).
// ═══════════════════════════════════════════════════════════════════════

// Command Stack (System 7)
export const createCommandStack = codexCreateCommandStack;
export const Command = codexCommand;
export const createPaintCommand = codexCreatePaintCommand; // convenience re-export, aliased to avoid duplicate declaration in this barrel module scope
export const createFillCommand = codexCreateFillCommand;
export { LayerOpCommand, rehydrateEditorCommand };

// Phosphorylation gate (System 7 extension — material-gated brush stroke)
export const PhosphorylationCommand = codexPhosphorylationCommand;
export const createPhosphorylationCommand = codexCreatePhosphorylationCommand;
export const buildKinase = codexBuildKinase;
export const createSpriteCache = codexCreateSpriteCache;

// Construction guides (00_Reference geometry for shields / radials)
export const buildConstructionGuideCells = codexBuildConstructionGuideCells;

// Layer Stack (System 2)
export const createLayer = codexCreateLayer;
export const setLayerOpacity = codexSetLayerOpacity;
export const setLayerVisible = codexSetLayerVisible;
export const setLayerLocked = codexSetLayerLocked;
export const reorderLayers = codexReorderLayers;
export const getFlattenedPreviewCells = codexGetFlattenedPreviewCells;

// Reference / Annotation Layer (System 8)
export const createReferenceLayer = codexCreateReferenceLayer;
export const attachAnnotation = codexAttachAnnotation;
export const getCellAnnotations = codexGetCellAnnotations;

// Selection + Transform (System 6)
export const selectRect = codexSelectRect;
export const clearSelection = codexClearSelection;
export const getSelectionCells = codexGetSelectionCells;
export const transformCells = codexTransformCells;
export const transformSelection = codexTransformSelection;

// AMP-Aware Editing (System 5) - the differentiator
export const applyAMPToCells = codexApplyAMPToCells;
export const applyAMPToLayer = codexApplyAMPToLayer;

// Capability registry (disparity reconciliation boon — makes previously orphaned AMPs and processors discoverable by UI surfaces without hard-coding).
export const PIXELBRAIN_REGISTERED_AMPS = Object.freeze([
  { id: 'square-sharpness-contrast', label: 'Sharpness / Contrast', ampName: 'squareSharpness' },
  { id: 'chromatic-transmutation', label: 'Chromatic Transmutation', ampName: 'chromatic' },
  { id: 'color-intensity', label: 'Color Intensity Rating', ampName: 'intensity' },
  { id: 'symmetry', label: 'Symmetry', ampName: 'symmetry' },
  // PDR 2026-06-12: SDF + coherent noise now first-class in editor AMP cockpit (lattice only, deterministic, construction-guided)
  { id: 'sdf-shape', label: 'SDF Shape (PDR)', ampName: 'sdfShape' },
  { id: 'noise-fill', label: 'Noise Fill (PDR)', ampName: 'noiseFill' },
]);

export function getRegisteredAMPs() {
  return PIXELBRAIN_REGISTERED_AMPS;
}

// Editor-friendly wrappers so SDF/Noise fit the (cells, options) => processedCells contract used by applyAMPTo* + command stack.
// SDF is generative (builds silhouette from descriptor); Noise modulates existing without removing required cells.
function makeDefaultSDFDescriptor() {
  return codexNormalizePB_SDF_v1({
    contract: 'PB-SDF-v1',
    id: 'editor-sdf-capsule',
    primitives: [
      { type: 'capsule', params: { p1: { x: 32, y: 12 }, p2: { x: 32, y: 68 }, radius: 7.5 } }
    ],
    operations: []
  });
}
function makeDefaultNoiseDescriptor() {
  return codexNormalizePB_NOISE_v1({
    contract: 'PB-NOISE-v1',
    id: 'editor-noise-fbm',
    type: 'fbm',
    seed: 0xC0DEFEED,
    frequency: 0.12,
    octaves: 3,
    amplitude: 0.55
  });
}

export function sdfShapeEditorAmp(cells = [], options = {}) {
  let sdf = options.sdf ? codexNormalizePB_SDF_v1(options.sdf) : makeDefaultSDFDescriptor();

  // Improve bounds: if caller passed cells (from current layer/selection), compute tight domain + small padding.
  // This prevents the AMP from flooding the entire canvas and makes the result respect where the user is working (PDR construction-guided spirit for editor use).
  if (Array.isArray(cells) && cells.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cells.forEach(c => {
      const x = Number(c.x || c.snappedX || 0);
      const y = Number(c.y || c.snappedY || 0);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
    const pad = 4;
    const domain = {
      min: { x: Math.max(0, Math.floor(minX - pad)), y: Math.max(0, Math.floor(minY - pad)) },
      max: { x: Math.ceil(maxX + pad), y: Math.ceil(maxY + pad) }
    };
    sdf = codexNormalizePB_SDF_v1({ ...sdf, domain });
  }

  const res = codexSDFShapeAMP({ }, { sdf, partId: options.partId || 'sdf-editor', defaultColor: options.color || '#D4D4D4', minCells: 1, feather: options.feather || 0 });
  return (res.partCells || []).map(c => ({
    x: c.x, y: c.y,
    color: options.color || c.color || '#D4D4D4',
    emphasis: 1
  }));
}

export function noiseFillEditorAmp(cells = [], options = {}) {
  const noise = options.noise || makeDefaultNoiseDescriptor();
  const res = codexNoiseFillAMP(cells, noise, options);
  const fills = res.fills || cells;
  return fills.map(cell => {
    const i = (typeof cell.intensity === 'number') ? cell.intensity : 0.7;
    const col = String(cell.color || '#AAAAAA');
    const r = parseInt(col.slice(1,3), 16) || 180;
    const g = parseInt(col.slice(3,5), 16) || 180;
    const b = parseInt(col.slice(5,7), 16) || 180;
    const f = 0.6 + 0.4 * i;
    const nr = Math.max(0, Math.min(255, Math.floor(r * f)));
    const ng = Math.max(0, Math.min(255, Math.floor(g * f)));
    const nb = Math.max(0, Math.min(255, Math.floor(b * f)));
    const newCol = '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { ...cell, color: newCol, emphasis: Math.round(i * 10) / 10 };
  });
}

// Raw + seam + normalizer re-exports for advanced use (page or foundry consumers via adapter only)
export const SDFShapeAMP = codexSDFShapeAMP;
export const NoiseFillAMP = codexNoiseFillAMP;
export const SDF_SHAPE_AMP_ID = codexSDF_ID;
export const NOISE_FILL_AMP_ID = codexNOISE_ID;
export const SDF_SHAPE_AMP_SEAM = codexSDF_SEAM;
export const NOISE_FILL_AMP_SEAM = codexNOISE_SEAM;
export const normalizePB_SDF_v1 = codexNormalizePB_SDF_v1;
export const normalizePB_NOISE_v1 = codexNormalizePB_NOISE_v1;

// --- CHARACTER CREATOR EXPORTS ---

export function forgeCharacter(spec, opts) {
  return codexForgeCharacter(spec, opts);
}

export function forgeCharacterFromWandVector(wandProposal, baseSpec = {}, opts = {}) {
  return codexForgeCharacterFromWandVector(wandProposal, baseSpec, opts);
}

export function exportCharacterToPbrainBlueprint(character) {
  return codexExportCharacterToPbrainBlueprint(character);
}

export function normalizeCharacterSpec(spec) {
  return codexNormalizeCharacterSpec(spec);
}

export function validateCharacterSpec(spec) {
  return codexValidateCharacterSpec(spec);
}

export function hashCharacterSpec(spec) {
  return codexHashCharacterSpec(spec);
}

export function composeCharacterSilhouette(spec, options) {
  return codexComposeCharacterSilhouette(spec, options);
}

export function createCharacterSkeleton(bodyResult, direction) {
  return codexCreateCharacterSkeleton(bodyResult, direction);
}

export function exportCharacterToPhaserPipeline(character) {
  return codexExportCharacterToPhaserPipeline(character);
}

export function exportCharacterToGodotScene(character) {
  return codexExportCharacterToGodotScene(character);
}

export function exportCharacterToPixelLotusActor(character) {
  return codexExportCharacterToPixelLotusActor(character);
}

// Note: setCell, clearCell, floodFill, snapToGrid, applySymmetry, etc. already exported above.

// PixelBrain Edit Compiler (the missing system: deltas, importer, semantic verbs, sessions, profiles)
import {
  importPolishedRasterToPacket,
  applyPolishDelta,
  validatePixelBrainEdit,
  widenPauldrons,
  moveCore,
  remapTrimMaterial,
  attachMasks,
  transformRelativeToAnchor,
  createEditableAssetSession,
  POLISH_DELTA_KINDS,
} from '../../codex/core/pixelbrain/edit-compiler.js';

import {
  VOID_CHESTPLATE_PARTS,
  VOID_CHESTPLATE_ANCHORS,
  VOID_CHESTPLATE_MASKS,
  VAELRIX_VOID_ARMOR_POLISH_PROFILE,
  rehydrateVoidChestplateCells,
} from '../../codex/core/pixelbrain/void-chestplate-profile.js';

export {
  importPolishedRasterToPacket,
  applyPolishDelta,
  validatePixelBrainEdit,
  widenPauldrons,
  moveCore,
  remapTrimMaterial,
  attachMasks,
  transformRelativeToAnchor,
  createEditableAssetSession,
  POLISH_DELTA_KINDS,
  VOID_CHESTPLATE_PARTS,
  VOID_CHESTPLATE_ANCHORS,
  VOID_CHESTPLATE_MASKS,
  VAELRIX_VOID_ARMOR_POLISH_PROFILE,
  rehydrateVoidChestplateCells,
};
