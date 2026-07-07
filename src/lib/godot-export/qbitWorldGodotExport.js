import {
  buildQbitWorldGameLoop,
  QBIT_WORLD_PRESETS,
} from '../../../codex/core/pixelbrain/qbit-world-game-loop.js';
import { createQbitWorldArtifact } from './artifactSchemas.js';
import { serializeStable } from './stableSerialize.js';

const MATERIAL_COLORS = {
  top:   { 1: '#6b7280', 2: '#9ca3af', 3: '#d1d5db', 4: '#bae6fd' },
  left:  { 1: '#374151', 2: '#4b5563', 3: '#6b7280', 4: '#7dd3fc' },
  right: { 1: '#1f2937', 2: '#374151', 3: '#4b5563', 4: '#38bdf8' },
};

function facePolygon(face, tileSize = 16) {
  const { type, sx, sy } = face;
  const hw = tileSize;
  const hh = tileSize / 2;
  const fh = tileSize;

  if (type === 'top') {
    return [[sx, sy], [sx + hw, sy + hh], [sx, sy + 2 * hh], [sx - hw, sy + hh]];
  }
  if (type === 'left') {
    return [[sx - hw, sy + hh], [sx, sy + 2 * hh], [sx, sy + 2 * hh + fh], [sx - hw, sy + hh + fh]];
  }
  if (type === 'right') {
    return [[sx, sy + 2 * hh], [sx + hw, sy + hh], [sx + hw, sy + hh + fh], [sx, sy + 2 * hh + fh]];
  }
  return [];
}

function computeOffset(faces, tileSize, padding) {
  let minX = Infinity;
  let minY = Infinity;

  for (const face of faces) {
    for (const [x, y] of facePolygon(face, tileSize)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
  }

  return {
    x: Number.isFinite(minX) ? -minX + padding : 0,
    y: Number.isFinite(minY) ? -minY + padding : 0,
  };
}

function serializeFace(face, offset, tileSize) {
  return {
    id: face.id,
    type: face.type,
    materialId: face.materialId,
    fill: MATERIAL_COLORS[face.type]?.[face.materialId] ?? '#64748b',
    voxel: { x: face.x, y: face.y, z: face.z },
    sortKey: face.sortKey,
    polygon: facePolygon(face, tileSize).map(([x, y]) => ({
      x: x + offset.x,
      y: y + offset.y,
    })),
    resource: face.resource,
  };
}

export function buildQbitWorldGodotExport({
  schoolWeights = QBIT_WORLD_PRESETS.QBIT,
  options = {},
} = {}) {
  const tileSize = options.tileSize ?? 16;
  const padding = options.padding ?? 44;
  const world = buildQbitWorldGameLoop(schoolWeights, options);
  const offset = computeOffset(world.faces, tileSize, padding);
  const faces = world.faces.map((face) => serializeFace(face, offset, tileSize));
  const artifact = createQbitWorldArtifact({
    schoolWeights,
    params: world.params,
    telemetry: world.telemetry,
    faces,
    pixelBrainAsset: world.pixelBrainAsset,
    wandProposal: world.wandProposal,
    divWandNode: world.divWandNode,
  });

  return `${serializeStable(artifact)}\n`;
}
