/**
 * SEMANTIC-BRIDGE
 *
 * Connective tissue between PB-Semantics (SemQuant authoring unifier),
 * the existing image-to-semantic-bridge parameter system,
 * PixelBrain packets, and other authoring/processing paths.
 *
 * This bridge reconciles:
 * - Authoring-time semantic IR (roles, effects, parts from SCDL/Construction/SDF)
 * - Runtime semantic parameters (from images/NLU)
 * - Packet-level semanticPalette and coordinate metadata (partId, role)
 *
 * Small additive adapter. Does not replace either system.
 */

import { semanticUnifierPass, scdlAstToIR, constructionSpecToIR } from './semantic/index.js';
import { partsSpecToIR } from './semantic/adapters/parts-spec-to-ir.adapter.js';
import {
  imageToPixelBrainParams,
  mergeImageAndNLUParams,
} from './image-to-semantic-bridge.js';
import { createPixelBrainAssetPacket, normalizePixelBrainAssetPacket } from './pixelbrain-asset-packet.js';
import { evaluateSDF } from './sdf-evaluator.js';
import { getRotationAtTime } from './gear-glide-amp.js';
import { rasterLine, rasterRadials } from './raster-math.js';
import { resolveRole } from './semantic-registry.js';
import { traceBoundary } from './cell-boundary-tracer.js';

/**
 * Apply SemQuant (authoring semantic unifier) to an authoring source and return enriched result.
 * Supports SCDL AST, construction spec, or raw IR nodes.
 */
export function applyAuthoringSemantics(input, options = {}) {
  let irInput;

  if (input && Array.isArray(input.nodes)) {
    // Already IR
    irInput = input;
  } else if (input && input.parts && input.asset) {
    // Looks like SCDL AST
    irInput = scdlAstToIR(input, options);
  } else if (input && input.center && (input.rings || input.radials)) {
    // Construction spec
    irInput = constructionSpecToIR(input, options);
  } else if (input && Array.isArray(input.parts)) {
    // Generic parts-based spec (item foundry, template grid, aseprite, NL)
    irInput = partsSpecToIR(input, options);
  } else {
    return { nodes: [], diagnostics: [], annotations: [] };
  }

  const unified = semanticUnifierPass(irInput);

  // Collect top-level annotations for convenience
  const allAnnotations = unified.nodes.flatMap(n => n.annotations || []);

  return {
    ...unified,
    annotations: allAnnotations,
    sourceKind: irInput.sourceKind || 'unknown',
  };
}

/**
 * Merge authoring semantics (from SemQuant) with image/NLU semantic parameters.
 * Produces a combined semantic view for a PixelBrain asset.
 */
export function mergeAuthoringAndImageSemantics(authoringInput, imageAnalysis, nluParams = null, options = {}) {
  const authoringSem = applyAuthoringSemantics(authoringInput, options);
  const imageParams = imageToPixelBrainParams(imageAnalysis);

  let mergedParams = imageParams;
  if (nluParams) {
    mergedParams = mergeImageAndNLUParams(imageParams, nluParams, options.weight || 0.5);
  }

  // Derive high-level semantic roles/effects from authoring into params form
  const roleMap = {};
  const effectMap = {};
  (authoringSem.annotations || []).forEach(ann => {
    if (ann.domain === 'role' && ann.canonicalType) {
      roleMap[ann.canonicalType] = (roleMap[ann.canonicalType] || 0) + ann.confidence;
    }
    if (ann.domain === 'effect' && ann.canonicalType) {
      effectMap[ann.canonicalType] = ann;
    }
  });

  return {
    authoring: authoringSem,
    parameters: mergedParams,
    derived: {
      dominantRoles: Object.keys(roleMap).sort((a, b) => roleMap[b] - roleMap[a]),
      effects: Object.values(effectMap),
      hasConstruction: (authoringSem.annotations || []).some(a => a.canonicalType === 'constructionGuide'),
    },
  };
}

/**
 * Enrich a raw packet input or packet with semantic annotations from authoring.
 * Preserves existing fields; adds semantic metadata.
 */
export function enrichPacketWithSemantics(packetInput, authoringSource, options = {}) {
  const basePacket = normalizePixelBrainAssetPacket(packetInput || {});

  if (!authoringSource) return basePacket;

  const authoringSem = applyAuthoringSemantics(authoringSource, options);

  // Attach top-level semantic summary
  const semantic = {
    annotations: authoringSem.annotations || [],
    roles: [...new Set((authoringSem.annotations || []).filter(a => a.domain === 'role').map(a => a.canonicalType))],
    effects: [...new Set((authoringSem.annotations || []).filter(a => a.domain === 'effect').map(a => a.canonicalType))],
    parts: [...new Set((authoringSem.annotations || []).filter(a => a.domain === 'part').map(a => a.canonicalType))],
    sourceKind: authoringSem.sourceKind,
  };

  // Optionally attach per-coordinate if coords have matching sourceOpId (from SCDL path)
  const enrichedCoords = (basePacket.geometry?.coordinates || []).map(coord => {
    const matchingAnn = (authoringSem.annotations || []).find(ann =>
      ann.sourceRefs && ann.sourceRefs.some(ref => ref.opId === coord.sourceOpId)
    );
    if (matchingAnn) {
      return {
        ...coord,
        semanticRole: matchingAnn.canonicalType,
        semanticDomain: matchingAnn.domain,
      };
    }
    return coord;
  });

  return {
    ...basePacket,
    semantic,
    geometry: {
      ...basePacket.geometry,
      coordinates: enrichedCoords,
    },
    // Contribute to semanticPalette concept if roles suggest palette hints (lightweight)
    palette: {
      ...basePacket.palette,
      semanticPalette: basePacket.palette?.semanticPalette || [],
    },
  };
}

/**
 * The packet-creation seam: create the canonical packet AND enrich it with
 * authoring semantics in one step. Every producer that has any authoring
 * context (SCDL AST, construction spec, or a parts-based spec) should emit
 * through this instead of bare createPixelBrainAssetPacket, so packets carry
 * semantic metadata regardless of authoring origin.
 *
 * Per the additive-semantics policy (SCDL white paper §5.6), enrichment never
 * changes the packet id: the id derives from render-authoritative fields
 * before semantic fields are attached.
 */
export function forgePacket(input, authoringSource = null, options = {}) {
  const packet = createPixelBrainAssetPacket(input);
  if (!authoringSource) return packet;
  return Object.freeze(enrichPacketWithSemantics(packet, authoringSource, options));
}

/**
 * Simple adapter: turn SemQuant role into image-style semantic params hint.
 */
export function roleToSemanticParams(role, baseParams = {}) {
  const roleHints = {
    body: { surface: { material: 'metal' } },
    rim: { surface: { material: 'crystal' } },
    core: { light: { intensity: 0.9 } },
    aura: { form: { complexity: 0.8 }, effect: 'glow' },
    constructionGuide: { form: { symmetry: 'radial' } },
  };

  const hint = roleHints[role] || {};
  return {
    ...baseParams,
    ...Object.keys(hint).reduce((acc, k) => {
      acc[k] = { ...(baseParams[k] || {}), ...hint[k] };
      return acc;
    }, {}),
  };
}

/**
 * Wire SDF for advanced vector/boolean/transform support in authoring.
 */
export function applySDFToIR(sdfDesc, context = {}) {
  // Delegate to sdf-evaluator for complex shapes
  return { sdf: sdfDesc, cells: [] }; // resolved in expand
}

/**
 * Wire gear-glide for rotations in semantic effects.
 */
export function applyRotationSemantic(timeMs, bpm = 60, degrees = 90) {
  return getRotationAtTime(timeMs, bpm, degrees);
}

/**
 * Wire raster-math radials for N-fold symmetry.
 */
export function applyRadialSymmetry(cx, cy, count, radius, emit) {
  rasterRadials(cx, cy, count, radius, emit);
}
