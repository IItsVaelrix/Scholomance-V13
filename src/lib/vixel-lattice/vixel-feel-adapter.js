/**
 * VIXEL → PHOTONIC FEEL ADAPTER
 *
 * Bridges the Vixel Lattice into the existing Photonic Feel system.
 * The Feel AMPs (Geometry, Construction, Silhouette) operate on a
 * SpatialField: { cells: [{x, y, color, emphasis, occupied}], width, height }.
 *
 * This adapter converts a VixelField into that format, but ENRICHED:
 * the emphasis channel carries vector-aware salience (curvature + pressure
 * + boundary), not just raw SCDL emphasis. This means the Feel module
 * evaluates the FUSED composition, not just the pixel layer.
 *
 * Additionally exposes vixel-specific diagnostics that the base Feel
 * module cannot compute: texture-form coherence, vector match ratio,
 * and per-role distribution.
 *
 * DETERMINISM: Pure function. Frozen output. No side effects.
 *
 * @bytecode VIXEL-FEEL-ADAPTER-v1
 */

import { evaluatePerceptualFeel, diffPerceptualFeel } from '../photonic-retina/retina-feel.js';
import {
  evaluatePerceptualEvidence,
  attachPerceptualEvidence,
} from '../photonic-retina/perceptual/evaluate.js';

/**
 * Convert a VixelField into a SpatialField for the Photonic Feel AMPs.
 *
 * The key enrichment: emphasis is replaced with vixel salience, which
 * fuses pixel emphasis + vector curvature + vector pressure + boundary.
 * This means the Feel module "sees" the vector structure through the
 * emphasis channel — a smooth curve with high curvature at the rim
 * will register as more emphatic than a flat interior region.
 *
 * @param {import('./vixel-schema.js').VixelField} vixelField
 * @returns {{ cells: Array, width: number, height: number }}
 */
export function vixelFieldToSpatialField(vixelField) {
  if (!vixelField || !Array.isArray(vixelField.vixels)) {
    throw new Error('vixelFieldToSpatialField: invalid VixelField');
  }

  const cells = vixelField.vixels.map(v => ({
    x: v.x,
    y: v.y,
    color: v.pixel.color,
    // Enriched emphasis: vixel salience fuses pixel + vector + boundary
    emphasis: v.feel.salience,
    occupied: true,
    // Carry vixel metadata for downstream diagnostics
    _vixel: {
      material: v.pixel.material,
      partId: v.pixel.partId,
      pathRef: v.vector.pathRef,
      parametricT: v.vector.parametricT,
      curvature: v.vector.curvature,
      pressure: v.vector.pressure,
      feelRole: v.feel.role,
      isBoundary: v.feel.isBoundary,
    },
  }));

  return Object.freeze({
    cells: Object.freeze(cells),
    width: vixelField.width,
    height: vixelField.height,
  });
}

/**
 * Evaluate a VixelField through the full Photonic Feel pipeline,
 * plus vixel-specific diagnostics.
 *
 * @param {import('./vixel-schema.js').VixelField} vixelField
 * @param {{ geneIntent?: object, perceptualEvidence?: boolean, declaredParts?: string[], declaredWandRoles?: string[] }} [options]
 * @returns {object} VixelFeelReport
 */
export function evaluateVixelFeel(vixelField, options = {}) {
  const spatialField = vixelFieldToSpatialField(vixelField);

  // Run the standard Feel pipeline (Geometry + Construction + Silhouette)
  const feelReport = evaluatePerceptualFeel(spatialField);

  // Compute vixel-specific diagnostics
  const vixelDiagnostics = computeVixelDiagnostics(vixelField);

  let report = Object.freeze({
    contract: 'VIXEL-FEEL-v1',
    vixelHash: vixelField.vixelHash,
    fieldId: vixelField.id,

    // Standard Feel results (from the Eye)
    spatialAwareness: feelReport.spatialAwareness,
    verdict: feelReport.verdict,
    geometry: feelReport.geometry,
    construction: feelReport.construction,
    silhouette: feelReport.silhouette,
    suggestions: feelReport.suggestions,
    feelHash: feelReport.feelHash,

    // Vixel-specific diagnostics (from the fusion layer)
    vixelDiagnostics,

    // Provenance
    provenance: Object.freeze({
      pixelSource: vixelField.provenance.pixelSource,
      vectorSource: vixelField.provenance.vectorSource,
      matchRatio: vixelField.provenance.matchRatio,
      totalCells: vixelField.provenance.totalCells,
    }),
  });

  // Evidence sidecar — never mutates spatialAwareness / verdict / feelHash
  if (options.perceptualEvidence !== false) {
    const geneIntent = options.geneIntent ?? {};
    const declaredWandRoles = options.declaredWandRoles
      ?? [...new Set(vixelField.vixels.map((v) => v.vector?.pathRef).filter((r) => r && r !== 'unmatched'))];
    const evidence = evaluatePerceptualEvidence(vixelField, {
      geneIntent,
      declaredParts: options.declaredParts,
      declaredWandRoles,
      declaredSilhouette: options.declaredSilhouette,
      declaredTopology: options.declaredTopology,
      baseline: options.baseline,
    });
    report = attachPerceptualEvidence(report, evidence);
  }

  return report;
}

/**
 * Diff two VixelFeelReports (for iteration tracking).
 * Combines the standard Feel diff with vixel-specific deltas.
 *
 * @param {object} prevReport
 * @param {object} currReport
 * @returns {object}
 */
export function diffVixelFeel(prevReport, currReport) {
  const feelDelta = diffPerceptualFeel(
    { feelHash: prevReport.feelHash, spatialAwareness: prevReport.spatialAwareness,
      geometry: prevReport.geometry, construction: prevReport.construction,
      silhouette: prevReport.silhouette },
    { feelHash: currReport.feelHash, spatialAwareness: currReport.spatialAwareness,
      geometry: currReport.geometry, construction: currReport.construction,
      silhouette: currReport.silhouette }
  );

  const matchDelta = currReport.provenance.matchRatio - prevReport.provenance.matchRatio;

  return Object.freeze({
    feelDelta,
    matchRatioDelta: Math.round(matchDelta * 1000) / 1000,
    spatialAwarenessDelta: Math.round(
      (currReport.spatialAwareness - prevReport.spatialAwareness) * 1000
    ) / 1000,
    summary: `Feel: ${feelDelta.summary || 'n/a'} | Vector match: ${matchDelta >= 0 ? '+' : ''}${Math.round(matchDelta * 1000) / 1000}`,
  });
}

// ─── Vixel-specific diagnostics ──────────────────────────────────────────────

/**
 * Compute diagnostics that only make sense in the fused representation.
 * These measure the QUALITY OF THE FUSION itself — not just the pixels
 * or the vectors, but how well they cohere.
 */
function computeVixelDiagnostics(vixelField) {
  const vixels = vixelField.vixels;
  const total = vixels.length;
  if (total === 0) {
    return Object.freeze({
      matchRatio: 0,
      textureFormCoherence: 0,
      roleDistribution: {},
      curvatureHistogram: {},
      note: 'empty field',
    });
  }

  // 1. Vector match ratio (how many cells found a vector provenance)
  const matched = vixels.filter(v => v.vector.pathRef !== 'unmatched').length;
  const matchRatio = Math.round((matched / total) * 1000) / 1000;

  // 2. Texture-form coherence: do materials follow the curve?
  //    Measure: for cells on the same path, do adjacent cells share material?
  //    High coherence = material regions align with vector regions.
  const pathMaterialMap = new Map();
  for (const v of vixels) {
    if (v.vector.pathRef === 'unmatched') continue;
    const key = v.vector.pathRef;
    if (!pathMaterialMap.has(key)) pathMaterialMap.set(key, new Set());
    pathMaterialMap.get(key).add(v.pixel.material);
  }
  let coherenceSum = 0;
  let coherenceCount = 0;
  for (const [, materials] of pathMaterialMap) {
    // Fewer distinct materials per path = higher coherence
    // 1 material = perfect coherence (1.0), many = low
    coherenceSum += 1 / materials.size;
    coherenceCount++;
  }
  const textureFormCoherence = coherenceCount > 0
    ? Math.round((coherenceSum / coherenceCount) * 1000) / 1000
    : 0;

  // 3. Role distribution
  const roleDistribution = {};
  for (const v of vixels) {
    roleDistribution[v.feel.role] = (roleDistribution[v.feel.role] || 0) + 1;
  }
  // Normalize to ratios
  for (const role of Object.keys(roleDistribution)) {
    roleDistribution[role] = Math.round((roleDistribution[role] / total) * 1000) / 1000;
  }

  // 4. Curvature histogram (binned: flat / gentle / moderate / sharp)
  const curvatureHistogram = { flat: 0, gentle: 0, moderate: 0, sharp: 0 };
  for (const v of vixels) {
    const c = v.vector.curvature;
    if (c < 0.05) curvatureHistogram.flat++;
    else if (c < 0.2) curvatureHistogram.gentle++;
    else if (c < 0.5) curvatureHistogram.moderate++;
    else curvatureHistogram.sharp++;
  }
  for (const bin of Object.keys(curvatureHistogram)) {
    curvatureHistogram[bin] = Math.round((curvatureHistogram[bin] / total) * 1000) / 1000;
  }

  // 5. Boundary cells with high curvature (the "expressive contour" metric)
  const expressiveContour = vixels.filter(
    v => v.feel.isBoundary && v.vector.curvature > 0.2
  ).length;
  const boundaryTotal = vixels.filter(v => v.feel.isBoundary).length;
  const expressiveContourRatio = boundaryTotal > 0
    ? Math.round((expressiveContour / boundaryTotal) * 1000) / 1000
    : 0;

  return Object.freeze({
    matchRatio,
    textureFormCoherence,
    roleDistribution: Object.freeze(roleDistribution),
    curvatureHistogram: Object.freeze(curvatureHistogram),
    expressiveContourRatio,
    boundaryCellCount: boundaryTotal,
    totalCells: total,
  });
}
