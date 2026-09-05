import { PALETTES } from "./grass-palettes.js";
import { defaultParams, generateGrass } from "./grass-engine.js";
import {
  commitStudioAmp,
  getStudioAdapterCoverage as readStudioAdapterCoverage,
  inspectStudioSupport,
  previewStudioAmp,
  proposeStudioMutation,
  studioOutputChecksum,
} from "./studio/studio-amp-execution.js";
import { STUDIO_AMP_RECORDS } from "./studio/studio-amp-manifest.generated.js";
import { createStudioAmpPlan } from "./studio/studio-amp-planner.js";
import {
  acceptMutation,
  createMutationCandidate,
  rejectMutation,
} from "./studio/studio-mutation-transaction.js";

export function getStudioAmpManifest() {
  return STUDIO_AMP_RECORDS;
}

export function planStudioAmps(input) {
  return createStudioAmpPlan({ ...input, records: STUDIO_AMP_RECORDS });
}

export function getStudioAdapterCoverage() {
  return readStudioAdapterCoverage(STUDIO_AMP_RECORDS);
}

export function inspectStudioSupportExecution(ampId) {
  return inspectStudioSupport(ampId);
}

export function previewStudioAmpExecution(input) {
  return previewStudioAmp(input);
}

export function commitStudioAmpExecution(input) {
  return commitStudioAmp(input);
}

export function proposeStudioMutationExecution(input) {
  return proposeStudioMutation(input);
}

export function createStudioAssetSnapshot(grid, source = null) {
  const layers = (grid?.layers || []).map((layer) => ({
    name: layer?.name || "Layer",
    visible: layer?.visible !== false,
    locked: layer?.locked === true,
    opacity: typeof layer?.opacity === "number" ? layer.opacity : 1,
    cells:
      layer?.cells instanceof Map
        ? [...layer.cells.values()].map((cell) => ({ ...cell }))
        : Array.isArray(layer?.cells)
          ? layer.cells.map((cell) => ({ ...cell }))
          : [],
  }));
  const body = {
    width: grid?.width || 64,
    height: grid?.height || 80,
    gridType: grid?.gridType || "rectangular",
    cellSize: grid?.cellSize || 1,
    palette: [...(grid?.palette || [])],
    layers,
    source,
  };
  return Object.freeze({ ...body, checksum: studioOutputChecksum(body) });
}

export function getStudioGrassDefaults() {
  return defaultParams();
}

export function getStudioGrassPalettes() {
  return PALETTES;
}

export function generateStudioGrass(params) {
  return generateGrass(params);
}

export function beginStudioMutation({ base, result, ampId }) {
  return createMutationCandidate(base, result, ampId);
}

export function acceptStudioMutation({ current, transaction }) {
  return acceptMutation(current, transaction);
}

export function rejectStudioMutation({ current, transaction }) {
  return rejectMutation(current, transaction);
}
