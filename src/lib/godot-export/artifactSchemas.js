export const GODOT_ARTIFACT_VERSION = 1;

export const PIXELBRAIN_GODOT_KIND = 'scholomance.pixelbrain.godot.v1';
export const WAND_GODOT_KIND = 'scholomance.wand.godot.v1';
export const DIVWAND_GODOT_KIND = 'scholomance.divwand.godot.v1';
export const QBIT_WORLD_GODOT_KIND = 'scholomance.qbitworld.godot.v1';

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createPixelBrainArtifact({ canvas, palettes, coordinates, formula, bytecode } = {}) {
  return {
    kind: PIXELBRAIN_GODOT_KIND,
    version: GODOT_ARTIFACT_VERSION,
    canvas: {
      width: toFiniteNumber(canvas?.width, 160),
      height: toFiniteNumber(canvas?.height, 144),
      gridSize: toFiniteNumber(canvas?.gridSize, 1),
    },
    palettes: Array.isArray(palettes) ? palettes : [],
    coordinates: Array.isArray(coordinates) ? coordinates : [],
    formula: formula ?? null,
    bytecode: bytecode == null ? '' : String(bytecode),
  };
}

export function createWandArtifact({ proposal, validation } = {}) {
  return {
    kind: WAND_GODOT_KIND,
    version: GODOT_ARTIFACT_VERSION,
    valid: Boolean(validation?.ok ?? validation?.valid),
    validation: validation ?? null,
    proposal: proposal ?? null,
  };
}

export function createDivWandArtifact({ proposal, validation } = {}) {
  return {
    kind: DIVWAND_GODOT_KIND,
    version: GODOT_ARTIFACT_VERSION,
    valid: Boolean(validation?.ok ?? validation?.valid),
    validation: validation ?? null,
    proposal: proposal ?? null,
  };
}

export function createQbitWorldArtifact({
  schoolWeights,
  params,
  telemetry,
  faces,
  pixelBrainAsset,
  wandProposal,
  divWandNode,
} = {}) {
  return {
    kind: QBIT_WORLD_GODOT_KIND,
    version: GODOT_ARTIFACT_VERSION,
    schoolWeights: schoolWeights && typeof schoolWeights === 'object' ? schoolWeights : {},
    params: params ?? null,
    telemetry: telemetry ?? null,
    faces: Array.isArray(faces) ? faces : [],
    pixelBrainAsset: pixelBrainAsset ?? null,
    wandProposal: wandProposal ?? null,
    divWandNode: divWandNode ?? null,
  };
}
