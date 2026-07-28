/**
 * PHOTONIC FEEL — The Retina's Spatial Proprioception
 *
 * This is the Eye learning to FEEL. Not just "there are pixels at (x,y)"
 * but "the composition leans left, the silhouette mumbles, the gesture
 * stutters." A painter's spatial awareness, codified as three AMPs:
 *
 *   1. Geometry AMP     — weight, balance, focal point, proportion, tension
 *   2. Construction AMP — horizon, axes, alignment, diagonal energy
 *   3. Silhouette AMP   — contour, figure-ground, negative space, gesture
 *
 * The composer runs all three, aggregates into a single spatial-awareness
 * score, and generates actionable SCDL suggestions for low-scoring signals.
 *
 * DETERMINISM: All scoring is pure math on spatial coordinates. No randomness,
 * no Date.now(), no external state. Identical input → identical report.
 *
 * @bytecode PB-FEEL-v1
 */

import { stableHash } from './retina-hash.js';
import { runGeometryFeelAMP } from './retina-feel-geometry.js';
import { runConstructionFeelAMP } from './retina-feel-construction.js';
import { runSilhouetteFeelAMP } from './retina-feel-silhouette.js';

export const FEEL_CONTRACT = 'PB-FEEL-v1';

/**
 * Validate that the input is a usable SpatialField.
 * @param {object} field
 * @returns {string[]} validation errors (empty = valid)
 */
function validateSpatialField(field) {
  const errors = [];
  if (!field || typeof field !== 'object') {
    errors.push('field must be an object');
    return errors;
  }
  if (!Array.isArray(field.cells)) {
    errors.push('field.cells must be an array');
  }
  if (typeof field.width !== 'number' || field.width <= 0) {
    errors.push('field.width must be a positive number');
  }
  if (typeof field.height !== 'number' || field.height <= 0) {
    errors.push('field.height must be a positive number');
  }
  return errors;
}

/**
 * Generate actionable SCDL suggestions from low-scoring signals.
 * These are directives the artist (human or AI) can apply to improve
 * the composition.
 *
 * @param {object} geometry - Geometry AMP result
 * @param {object} construction - Construction AMP result
 * @param {object} silhouette - Silhouette AMP result
 * @returns {string[]} SCDL-actionable suggestions
 */
function generateSuggestions(geometry, construction, silhouette) {
  const suggestions = [];

  // --- Geometry suggestions ---
  if (geometry.balance.score < 0.6) {
    const { comX } = geometry.balance;
    if (comX < 0.4) {
      suggestions.push('SHIFT weight rightward: add a secondary element in the right third, or extend forms toward x > 0.6');
    } else if (comX > 0.6) {
      suggestions.push('SHIFT weight leftward: anchor the left side with a grounding element near x < 0.4');
    }
  }

  if (geometry.focalPoint.score < 0.5) {
    suggestions.push('CREATE a focal point: place the highest-emphasis element at a rule-of-thirds intersection (x≈0.33 or 0.67, y≈0.33 or 0.67). Use `emphasis: 1.0` and isolate it from neighbors.');
  }

  if (geometry.proportion.score < 0.5) {
    const { aspectRatio } = geometry.proportion;
    if (aspectRatio > 2) {
      suggestions.push('COMPRESS width or EXTEND height: the form is too wide. Aim for a 3:2 or golden-ratio bounding box.');
    } else if (aspectRatio < 0.5) {
      suggestions.push('WIDEN the composition: the form is too tall and narrow. Add lateral elements to approach a 2:3 ratio.');
    } else {
      suggestions.push('ADJUST margins: center the content with even breathing room, or intentionally bias one margin for tension.');
    }
  }

  if (geometry.tension.score < 0.4) {
    suggestions.push('BREAK symmetry: offset one quadrant\'s weight by 10-20%. Perfect evenness is death; slight imbalance is life.');
  }

  // --- Construction suggestions ---
  if (construction.horizon.score < 0.5) {
    const { horizonY } = construction.horizon;
    if (horizonY < 0.4) {
      suggestions.push('LOWER the horizon: place the ground line near y≈0.62 (golden section). Let the sky breathe above.');
    } else if (horizonY > 0.8) {
      suggestions.push('RAISE the horizon: the ground dominates. Move the densest band upward toward y≈0.6.');
    }
  }

  if (construction.axes.score < 0.4) {
    suggestions.push('ESTABLISH a dominant axis: align major elements along a clear horizontal, vertical, or diagonal. Use `symmetry: mirror-x` for horizontal calm or offset elements for diagonal energy.');
  }

  if (construction.alignment.score < 0.4) {
    suggestions.push('ALIGN to construction lines: snap key element edges to the 1/3 and 2/3 grid lines. Shared coordinates create invisible structure.');
  }

  if (construction.diagonals.score < 0.3) {
    suggestions.push('ADD diagonal energy: place two emphatic elements on a diagonal (e.g., top-left and bottom-right). The implied line creates movement.');
  }

  // --- Silhouette suggestions ---
  if (silhouette.contour.score < 0.5) {
    const { boundaryRatio } = silhouette.contour;
    if (boundaryRatio > 0.6) {
      suggestions.push('CONSOLIDATE the form: too many boundary cells. Fill interior gaps, merge fragments. The silhouette should read as one shape, not scattered debris.');
    } else {
      suggestions.push('ADD edge detail: the form is a solid blob. Use `rim: 2` or vary boundary emphasis to give the contour life.');
    }
  }

  if (silhouette.figureGround.score < 0.5) {
    const { fillRatio } = silhouette.figureGround;
    if (fillRatio > 0.75) {
      suggestions.push('CARVE negative space: the form fills too much of the frame. Remove interior cells or reduce the bounding area. Let silence exist.');
    } else if (fillRatio < 0.1) {
      suggestions.push('STRENGTHEN the figure: too little presence. Increase emphasis, add cells, or reduce the frame size so the subject commands the space.');
    }
  }

  if (silhouette.negativeSpace.score < 0.5) {
    suggestions.push('SHAPE the negative space: the empty regions should have intentional form. Use `fill` ops to create shaped voids, not random gaps.');
  }

  if (silhouette.gesture.score < 0.5) {
    suggestions.push('TRACE a gesture line: arrange the most emphatic elements along a single sweeping curve (C-curve or S-curve). The eye should travel the form in one breath.');
  }

  return suggestions;
}

/**
 * Compute the aggregate "spatial awareness" score — the painter's feel.
 * Weighted blend of all three AMPs, with a slight bonus for coherence
 * (all three agreeing the composition works).
 */
function computeSpatialAwareness(geometry, construction, silhouette) {
  const base = (
    geometry.aggregate * 0.35 +
    construction.aggregate * 0.30 +
    silhouette.aggregate * 0.35
  );

  // Coherence bonus: if all three are high, the composition is unified
  const minScore = Math.min(geometry.aggregate, construction.aggregate, silhouette.aggregate);
  const coherenceBonus = minScore > 0.6 ? (minScore - 0.6) * 0.25 : 0;

  // Dissonance penalty: if one is very low, it drags the whole feel down
  const dissonancePenalty = minScore < 0.3 ? (0.3 - minScore) * 0.3 : 0;

  return Math.max(0, Math.min(1, base + coherenceBonus - dissonancePenalty));
}

/**
 * Classify the overall feel into a painter's verdict.
 */
function classifyFeel(spatialAwareness) {
  if (spatialAwareness > 0.8) return 'The composition breathes. Weight, structure, and shape are in accord.';
  if (spatialAwareness > 0.6) return 'The composition holds. Minor tensions remain but the whole reads true.';
  if (spatialAwareness > 0.4) return 'The composition wavers. Some signals sing, others falter. Refine the weak channels.';
  if (spatialAwareness > 0.2) return 'The composition struggles. The spatial logic is unclear — rebuild from construction lines.';
  return 'The composition is lost. No coherent spatial awareness emerges. Start over from the gesture.';
}

/**
 * Main entry point: evaluate the perceptual feel of a spatial field.
 *
 * @param {object} field - SpatialField { cells: [{x,y,color,emphasis,occupied,semanticRole}], width, height }
 * @param {object} [options] - { suggestions: boolean (default true) }
 * @returns {object} frozen PerceptualFeelReport
 */
export function evaluatePerceptualFeel(field, options = {}) {
  const { suggestions: includeSuggestions = true } = options;

  const validationErrors = validateSpatialField(field);
  if (validationErrors.length > 0) {
    return Object.freeze({
      contract: FEEL_CONTRACT,
      ok: false,
      errors: Object.freeze(validationErrors),
      spatialAwareness: 0,
      verdict: 'Invalid spatial field — cannot evaluate feel.',
      geometry: null,
      construction: null,
      silhouette: null,
      suggestions: Object.freeze([]),
      feelHash: stableHash({ errors: validationErrors }),
    });
  }

  // Run all three AMPs
  const geometry = runGeometryFeelAMP(field);
  const construction = runConstructionFeelAMP(field);
  const silhouette = runSilhouetteFeelAMP(field);

  // Aggregate
  const spatialAwareness = computeSpatialAwareness(geometry, construction, silhouette);
  const verdict = classifyFeel(spatialAwareness);

  // Suggestions
  const suggestions = includeSuggestions
    ? generateSuggestions(geometry, construction, silhouette)
    : [];

  const diagnostics = [
    ...geometry.diagnostics,
    ...construction.diagnostics,
    ...silhouette.diagnostics,
    `SPATIAL_AWARENESS ${spatialAwareness.toFixed(3)}`,
    `VERDICT ${verdict}`,
  ];

  return Object.freeze({
    contract: FEEL_CONTRACT,
    ok: true,
    spatialAwareness,
    verdict,
    geometry,
    construction,
    silhouette,
    suggestions: Object.freeze(suggestions),
    diagnostics: Object.freeze(diagnostics),
    feelHash: stableHash({
      geometry: geometry.feelHash,
      construction: construction.feelHash,
      silhouette: silhouette.feelHash,
      spatialAwareness,
    }),
  });
}

/**
 * Diff two PerceptualFeelReports. Returns which signals improved or degraded.
 * Useful for the compile→feel→adjust→recompile loop.
 *
 * @param {object} prev - previous report
 * @param {object} curr - current report
 * @returns {object} frozen delta
 */
export function diffPerceptualFeel(prev, curr) {
  if (!prev || !curr) {
    return Object.freeze({ ok: false, note: 'both reports required for diff' });
  }

  const delta = curr.spatialAwareness - prev.spatialAwareness;

  const channelDeltas = Object.freeze({
    geometry: curr.geometry.aggregate - prev.geometry.aggregate,
    construction: curr.construction.aggregate - prev.construction.aggregate,
    silhouette: curr.silhouette.aggregate - prev.silhouette.aggregate,
  });

  // Which channels improved?
  const improved = [];
  const degraded = [];
  for (const [channel, d] of Object.entries(channelDeltas)) {
    if (d > 0.02) improved.push(channel);
    else if (d < -0.02) degraded.push(channel);
  }

  const verdict = delta > 0.05
    ? 'The composition breathes more freely. The adjustment served the whole.'
    : delta < -0.05
      ? 'The composition lost coherence. The adjustment wounded the spatial logic.'
      : 'The composition holds steady. The adjustment neither healed nor harmed.';

  return Object.freeze({
    ok: true,
    delta,
    channelDeltas,
    improved: Object.freeze(improved),
    degraded: Object.freeze(degraded),
    verdict,
    prevHash: prev.feelHash,
    currHash: curr.feelHash,
  });
}
