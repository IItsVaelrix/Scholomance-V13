// IMMUNE_ALLOW: LING-0F03
// src/pages/DivWand/components/WorldScenePortal.jsx
//
// QBIT-Voxel Level 3 (The World) React component. Sibling to VoxelScenePortal;
// handles the `type: 'world'` DivWand node. Generates a ChunkedWorldVolume
// from the node's `worldSpec` prop, lazy-loads all chunks via the 8-step
// pipeline, applies the lex-min face cull predicate, and renders the union
// of visible faces into a single isometric SVG.
//
// The lex-min cull is defensive: the current iso visibility rules
// (`+X`/`+Y`/`+Z` only) mean no chunk emits a face on the negative side, so
// duplicates cannot exist today. The predicate protects against future
// changes to the visibility rules without re-introducing double-rendering.

import { useMemo } from 'react';

import {
  createChunkedWorldVolume, getOrLoadChunk, generateWorldChunk, chunkKey, parseChunkKey, applyMaterialBoundaryAlignment, collectWorldSeeds,
  collectFaces, project, makeFace,
  renderFacesToSVG,
  worldRenderOptions, seedsToLightPoints,
  runBiomeCoherenceAMPWorld,
} from '../../../lib/codex/pixelbrain.js';

/**
 * Build the set of all visible faces for a fully-loaded world. Iterates
 * chunks in deterministic order, collects each chunk's faces with
 * world-coordinate offsets, applies the lex-min cull predicate, and
 * returns a single sorted face array ready for the SVG renderer.
 *
 * Pure function with respect to `world` - does not mutate it.
 */
function collectWorldFaces(world) {
  const { chunkSize, chunkCount } = world.spec;
  const W = chunkSize.w, H = chunkSize.h, D = chunkSize.d;
  const allFaces = [];

  for (let cz = 0; cz < chunkCount.z; cz++) {
    for (let cy = 0; cy < chunkCount.y; cy++) {
      for (let cx = 0; cx < chunkCount.x; cx++) {
        const vol = world.chunks.get(chunkKey(cx, cy, cz));
        if (!vol) continue;
        const offX = cx * W, offY = cy * H, offZ = cz * D;

        // MaterialId and occupancy for this chunk's cells. We re-implement
        // the iso-projector visibility rules inline so we can route neighbor
        // checks across chunk boundaries (collectFaces only looks within a
        // single volume).
        const getMat = (x, y, z) => vol.cells[y * W * D + z * W + x] >> 4;
        const isOcc = (x, y, z) => (vol.cells[y * W * D + z * W + x] >> 4) > 0;

        for (let y = 0; y < H; y++) {
          for (let z = 0; z < D; z++) {
            for (let x = 0; x < W; x++) {
              if (!isOcc(x, y, z)) continue;
              const m = getMat(x, y, z);
              const wx = offX + x, wy = offY + y, wz = offZ + z;

              // Top face: visible if cell above (wy + 1) is not occupied.
              const aboveOccupied = (y + 1 < H)
                ? isOcc(x, y + 1, z)
                : (world.chunks.has(chunkKey(cx, cy + 1, cz))
                    && isChunkCellOccupied(world, cx, cy + 1, cz, x, y + 1 - H, z));
              if (!aboveOccupied) {
                if (shouldEmitFace('top', cx, cy, cz, world)) {
                  allFaces.push(buildWorldFace(wx, wy, wz, 'top', m));
                }
              }

              // Left face: visible if cell at +Z is not occupied.
              const leftOccupied = (z + 1 < D)
                ? isOcc(x, y, z + 1)
                : (world.chunks.has(chunkKey(cx, cy, cz + 1))
                    && isChunkCellOccupied(world, cx, cy, cz + 1, x, y, 0));
              if (!leftOccupied) {
                if (shouldEmitFace('left', cx, cy, cz, world)) {
                  allFaces.push(buildWorldFace(wx, wy, wz, 'left', m));
                }
              }

              // Right face: visible if cell at +X is not occupied.
              const rightOccupied = (x + 1 < W)
                ? isOcc(x + 1, y, z)
                : (world.chunks.has(chunkKey(cx + 1, cy, cz))
                    && isChunkCellOccupied(world, cx + 1, cy, cz, 0, y, z));
              if (!rightOccupied) {
                if (shouldEmitFace('right', cx, cy, cz, world)) {
                  allFaces.push(buildWorldFace(wx, wy, wz, 'right', m));
                }
              }
            }
          }
        }
      }
    }
  }

  // Re-sort by world sort key. Each face's sortKey was computed from its
  // (z, y, x, faceType) by makeFace; world-offset coords don't change the
  // relative ordering within a single chunk, but we need a global sort.
  // The existing per-chunk sortKey is `z + y` (chunk-local), so we
  // re-derive with world coords here.
  allFaces.sort((a, b) => a.worldSortKey - b.worldSortKey);
  return allFaces;
}

function isChunkCellOccupied(world, cx, cy, cz, x, y, z) {
  const vol = world.chunks.get(chunkKey(cx, cy, cz));
  if (!vol) return false;
  const idx = y * vol.width * vol.depth + z * vol.width + x;
  return (vol.cells[idx] >> 4) > 0;
}

const FACE_DIRECTION_OFFSETS = {
  top:   [0,  1,  0],   // +Y direction
  left:  [0,  0,  1],   // +Z direction
  right: [1,  0,  0],   // +X direction
};

/**
 * Lex-min cull predicate. A face emitted by chunk (cx, cy, cz) in faceType
 * direction `d` is rendered iff (cx, cy, cz) is lexicographically
 * ≤ the neighbor chunk in that direction. Since the chunk in the +X/+Y/+Z
 * direction is always greater than (cx, cy, cz), this is a no-op for the
 * current iso visibility rules. It is defensive against future changes
 * that might allow the neighbor to emit the same face.
 */
function shouldEmitFace(faceType, cx, cy, cz, world) {
  const [dx, dy, dz] = FACE_DIRECTION_OFFSETS[faceType];
  const ncx = cx + dx, ncy = cy + dy, ncz = cz + dz;
  // No neighbor in this direction - the face is the world's outer boundary.
  if (ncx < 0 || ncx >= world.spec.chunkCount.x) return true;
  if (ncy < 0 || ncy >= world.spec.chunkCount.y) return true;
  if (ncz < 0 || ncz >= world.spec.chunkCount.z) return true;
  // Lex-min predicate: the emitting chunk is the owner iff it is lex-min
  // of itself and the neighbor. For all positive (dx, dy, dz), (cx,cy,cz) <
  // (cx+dx, cy+dy, cz+dz), so we are always the owner. The predicate is
  // a no-op for the current iso rules.
  return true;
}

/**
 * Build a face descriptor with world-coordinate sort key. The existing
 * makeFace() in iso-projector.js computes the sort key from chunk-local
 * (x, y, z); for the world, we need a global sort based on (wx, wy, wz)
 * to keep the painter's algorithm correct across chunks.
 */
function buildWorldFace(wx, wy, wz, faceType, materialId) {
  const { sx, sy } = project(wx, wy, wz);
  const faceTypeIndex = { top: 0, left: 1, right: 2 }[faceType];
  // Sort key: world (z + y) primary, world x secondary, face type tertiary.
  // Identical to the per-chunk sort key but using world coords. Across
  // chunks, this gives a stable back-to-front order.
  const worldSortKey = (wz + wy) * 1_000_000 + wx * 100 + faceTypeIndex;
  return { x: wx, y: wy, z: wz, faceType, materialId, sx, sy, sortKey: worldSortKey };
}

function runWorldPipeline(worldSpec) {
  // 1. Create the world.
  const world = createChunkedWorldVolume({
    chunkSize: worldSpec.chunkSize,
    chunkCount: worldSpec.chunkCount,
    formula: worldSpec.formula,
    seed: worldSpec.seed,
    overlapRadius: worldSpec.overlapRadius,
    attenuationModel: worldSpec.attenuationModel,
  });

  // 2. Lazy-load all chunks in deterministic order.
  for (let cx = 0; cx < worldSpec.chunkCount.x; cx++) {
    for (let cy = 0; cy < worldSpec.chunkCount.y; cy++) {
      for (let cz = 0; cz < worldSpec.chunkCount.z; cz++) {
        getOrLoadChunk(world, cx, cy, cz, generateWorldChunk);
      }
    }
  }

  // 3. Run chunk-aware biome coherence across the world.
  const getField = (cx, cy, cz, x, y, z) => {
    const vol = world.chunks.get(chunkKey(cx, cy, cz));
    if (!vol) return 0;
    return vol.energyField[y * vol.width * vol.depth + z * vol.width + x];
  };
  runBiomeCoherenceAMPWorld(world, getField);

  // 3b. Material-aware boundary alignment (Phase 4). The energy-field seam
  // closes the gradient, but discrete material thresholds can still flip
  // the material at the boundary. This post-process forces the boundary
  // row of both adjacent chunks to agree on the lex-min chunk's material,
  // closing the F-7 gap.
  applyMaterialBoundaryAlignment(world);

  // 4. Collect world-coord faces with the lex-min cull.
  const faces = collectWorldFaces(world);

  // 5. Render to SVG - shared world look (AO + antialias) plus a soft glow cue
  // from the world's energy seeds (lifted to world coords, contained to a
  // chunk-span radius so it reads as atmosphere, not a prop).
  const lightPoints = seedsToLightPoints(collectWorldSeeds(world), {
    schoolId: worldSpec.schoolId,
    size: worldSpec.chunkSize.w,
  });
  return renderFacesToSVG(faces, worldRenderOptions(lightPoints));
}

export function WorldScenePortal({ node }) {
  const worldSpec = node.props?.worldSpec;
  const layoutStyle = {
    width:  node.layout?.width  != null ? `${node.layout.width}px`  : '100%',
    height: node.layout?.height != null ? `${node.layout.height}px` : '400px',
    overflow: 'hidden',
  };

  // Memoize the SVG by serializing the worldSpec. The pipeline is pure with
  // respect to the spec, so identical specs produce byte-identical output.
  const specKey = worldSpec ? JSON.stringify(worldSpec) : '';
  const svgString = useMemo(
    () => (worldSpec ? runWorldPipeline(worldSpec) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specKey]
  );

  return (
    <div
      id={node.id}
      className="div-node div-world-scene"
      style={layoutStyle}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}
