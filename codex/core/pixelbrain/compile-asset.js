/**
 * Unified Asset Pipeline — compileAsset()
 *
 * The single entry point that bridges all four islands:
 *
 *   Island 2: Construction Solver (geometry authoring)
 *       ↓ constructionToCoords()
 *   Island 1: SCDL Compiler (scene assembly + gene projection)
 *       ↓ compileSCDL()
 *   Island 3: VRI Compiler (lowering into render IR)
 *       ↓ compileVRI()
 *   Island 4: VRI Renderer (multi-pass deterministic raster)
 *       ↓ renderVRI()
 *   → RGBA pixels
 *
 * Usage:
 *   const result = compileAsset({
 *     scdl: 'asset "sword" ...',           // SCDL source (required)
 *     genes: [genePacket, ...],             // Art genes (optional)
 *     construction: constructionSpec,       // Construction packet (optional)
 *     partStyles: { rim: { color: '#...' } }, // Construction part colors
 *     vri: { lighting: {...}, atmosphere: {...} }, // VRI options (optional)
 *     scale: 4,                             // Render scale (default 4)
 *   });
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     packet: PixelBrainAssetPacket | null,
 *     vriScene: object | null,
 *     rgba: { width, height, data } | null,
 *     constructionCoords: object[] | null,
 *     errors: Array<{ stage, message, detail? }>,
 *     diagnostics: object[],
 *     timing: { construction?, scdl?, vri?, render? }, // deterministic core placeholders
 *   }
 *
 * Deterministic: same inputs → same bytes. No I/O. No randomness.
 *
 * @bytecode PB-COMPILE-ASSET-v1
 */

import { compileSCDL } from './scdl/scdl.compiler.js';
import { solve } from './construction/solver-orchestrator.js';
import { constructionToCoords } from './construction-to-coords.js';
import { compileVRI } from './vixel/vri-compiler.js';
import { renderVRI } from './vixel/vri-renderer.js';
import {
  createArtGenePacket,
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
} from './scdna-art-gene.js';
import { projectGenes } from './scdl/passes/project-genes.pass.js';

/**
 * Compile an asset through the full pipeline.
 *
 * @param {object} spec
 * @param {string} spec.scdl - SCDL source text (required)
 * @param {object[]} [spec.genes] - Art gene packets or raw gene specs
 * @param {object} [spec.construction] - PB-GEOMETRY-CONSTRUCTION-v1 packet
 * @param {object} [spec.partStyles] - Map of construction partId → { color, material }
 * @param {object} [spec.vri] - VRI compiler options (lighting, atmosphere, etc.)
 * @param {number} [spec.scale=4] - Render scale
 * @param {object} [spec.canvas] - { width, height } override
 * @param {boolean} [spec.skipVRI=false] - Stop after SCDL compilation
 * @param {boolean} [spec.skipRender=false] - Stop after VRI compilation
 * @returns {object} CompileAssetResult
 */
export function compileAsset(spec) {
  const {
    scdl,
    genes: rawGenes,
    construction,
    partStyles = {},
    vri: vriOptions = {},
    scale = 4,
    canvas: canvasOverride,
    skipVRI = false,
    skipRender = false,
  } = spec;

  const errors = [];
  const diagnostics = [];
  // Wall-clock observation belongs in a runtime wrapper. Keeping these
  // compatibility slots deterministic preserves same-input/same-output law.
  const timing = {};

  // ── Stage 0: Validate inputs ──────────────────────────────────────────────
  if (!scdl || typeof scdl !== 'string') {
    return failResult('input', 'spec.scdl is required and must be a string', errors);
  }

  // ── Stage 1: Construction Solver (optional) ───────────────────────────────
  let constructionCoords = null;
  let solverResult = null;

  if (construction) {
    try {
      solverResult = solve(construction);
      const canvas = canvasOverride || construction.canvas || { width: 64, height: 64 };
      constructionCoords = constructionToCoords(solverResult, {
        partStyles,
        defaultColor: '#808080',
        canvasW: canvas.width,
        canvasH: canvas.height,
      });
      timing.construction = 0;
      diagnostics.push({
        stage: 'construction',
        parts: Object.keys(solverResult.parts || {}).length,
        coords: constructionCoords.length,
        checksum: solverResult.resultChecksum,
      });
    } catch (e) {
      errors.push({ stage: 'construction', message: e.message, detail: e });
      return failResult('construction', e.message, errors, diagnostics, timing);
    }
  }

  // ── Stage 2: Prepare art genes ────────────────────────────────────────────
  let genes = null;
  let projectionContext = null;

  if (rawGenes && rawGenes.length > 0) {
    // Accept both raw gene specs and pre-built packets
    genes = rawGenes.map((g) => {
      if (g.geneId && g.checksum) return g; // already a packet
      return createArtGenePacket(g);
    });

    const canvas = canvasOverride || genes[0]?.canvas || { width: 64, height: 64 };
    projectionContext = {
      canvas,
      compilerVersion: 'compile-asset-v1',
      projectionAlgoVersion: PROJECTION_ALGO_VERSION,
      conflictPolicyVersion: CONFLICT_POLICY_VERSION,
      paletteRoleMappingVersion: 'default-v1',
      sdfByPart: {},
    };
  }

  // ── Stage 3: SCDL Compilation ─────────────────────────────────────────────
  const scdlOptions = {};
  if (genes) {
    scdlOptions.artGenes = genes;
    scdlOptions.artProjectionContext = projectionContext;
  }

  const scdlResult = compileSCDL(scdl, scdlOptions);
  timing.scdl = 0;

  if (!scdlResult.ok) {
    for (const e of scdlResult.errors) {
      errors.push({ stage: 'scdl', message: e.message, code: e.code });
    }
    return failResult('scdl', 'SCDL compilation failed', errors, diagnostics, timing);
  }

  let packet = scdlResult.packet;

  // Inject construction coordinates into the packet
  if (constructionCoords && constructionCoords.length > 0) {
    const existing = packet.geometry?.coordinates || [];
    packet = {
      ...packet,
      geometry: {
        ...packet.geometry,
        coordinates: [...constructionCoords, ...existing],
      },
    };
    diagnostics.push({
      stage: 'construction-inject',
      injected: constructionCoords.length,
      total: packet.geometry.coordinates.length,
    });
  }

  if (skipVRI) {
    return {
      ok: true,
      packet,
      vriScene: null,
      rgba: null,
      constructionCoords,
      solverResult,
      errors,
      diagnostics,
      timing,
    };
  }

  // ── Stage 4: VRI Compilation ──────────────────────────────────────────────
  let vriScene;
  try {
    vriScene = compileVRI(packet, {
      artGenes: genes || [],
      ...vriOptions,
    });
    timing.vri = 0;
    diagnostics.push({
      stage: 'vri',
      layers: vriScene.layers?.length || 0,
      lights: vriScene.lights?.length || 0,
      checksum: vriScene.checksum,
    });
  } catch (e) {
    errors.push({ stage: 'vri', message: e.message, detail: e });
    return failResult('vri', e.message, errors, diagnostics, timing);
  }

  if (skipRender) {
    return {
      ok: true,
      packet,
      vriScene,
      rgba: null,
      constructionCoords,
      solverResult,
      errors,
      diagnostics,
      timing,
    };
  }

  // ── Stage 5: VRI Render ───────────────────────────────────────────────────
  let rgba;
  try {
    rgba = renderVRI(vriScene, scale);
    timing.render = 0;
    diagnostics.push({
      stage: 'render',
      width: rgba.width,
      height: rgba.height,
      pixels: rgba.data.length / 4,
    });
  } catch (e) {
    errors.push({ stage: 'render', message: e.message, detail: e });
    return failResult('render', e.message, errors, diagnostics, timing);
  }

  return {
    ok: true,
    packet,
    vriScene,
    rgba,
    constructionCoords,
    solverResult,
    errors,
    diagnostics,
    timing,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function failResult(stage, message, errors, diagnostics = [], timing = {}) {
  if (errors.length === 0) {
    errors.push({ stage, message });
  }
  return {
    ok: false,
    packet: null,
    vriScene: null,
    rgba: null,
    constructionCoords: null,
    solverResult: null,
    errors,
    diagnostics,
    timing,
  };
}
