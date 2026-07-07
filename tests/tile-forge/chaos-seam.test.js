import { test, expect } from "vitest";
import { generateTileForgeCandidate } from "./test-utils.js";
import { canSnapEdges } from "../../codex/core/pixelbrain/tile-forge/tile-forge.snap-validator.js";
import { BIOME_COMPATIBILITY, SOCKET_COMPATIBILITY } from "../../codex/core/pixelbrain/tile-forge/tile-forge.schema.js";

test("The Chaos Seam Paradox (Topology Isolation)", () => {
  // SCENARIO: The "Chaos Seam" or "Butterfly Effect" tear.
  // In many procedural engines, modifying a chunk's internal biome or noise logic
  // inadvertently shifts the edge topology, causing adjacent chunks to suddenly 
  // fail to snap. This triggers a cascading invalidation across the world map.
  // 
  // We test our pipeline's isolation guarantees: altering the biome, noise intensity,
  // and procedural seeds of a locked chunk MUST NOT alter its snapping geometry.

  const baseIntent = {
    id: "test_island_001",
    seed: "calm_meadow_seed",
    preset: "organicVoidIsland",
    projection: "isometric",
    tileSize: { width: 80, height: 45 },
    chunkType: "floating_island",
    biomeId: "void_ice",
    elevation: 3,
    symmetryMode: "soft",
    noise: { enabled: true, scale: 0.1, intensity: 0.1 },
    fibonacci: { enabled: true, count: 10, mode: "decorative_growth" }
  };

  // Generate the baseline chunk
  const baseChunk = generateTileForgeCandidate(baseIntent);

  // Now, simulate an extreme biome shift and noise chaos on a chunk 
  // that shares the same geometry lock (e.g. we want to keep the footprint 
  // but change it to a corrupted chaotic biome)
  const chaoticIntent = {
    ...baseIntent,
    seed: "pure_chaos_seed_9999",
    biomeId: "corrupted_void", // Completely different biome
    noise: { enabled: true, scale: 0.9, intensity: 0.99 }, // Extreme noise
    fibonacci: { enabled: true, count: 500, mode: "chaotic_spread" },
    lockedLayers: {
      isoTile: true,
      tileSockets: true
    }
  };

  const chaoticChunk = generateTileForgeCandidate(chaoticIntent);

  // 1. Prove the Chaos took effect internally
  // The noise masks should be radically different due to the new seed & intensity
  expect(baseChunk.memorySnapshot.layerSnapshots.noiseHash)
    .not.toBe(chaoticChunk.memorySnapshot.layerSnapshots.noiseHash);
  
  // The material assignments should differ because of the biome change
  const baseMaterials = baseChunk.candidate.layers.biomeMaterial.materialCells;
  const chaoticMaterials = chaoticChunk.candidate.layers.biomeMaterial.materialCells;
  
  // 2. Prove the Geometry remained perfectly isolated
  const baseEdges = baseChunk.candidate.layers.tileSockets.edges;
  const chaoticEdges = chaoticChunk.candidate.layers.tileSockets.edges;

  // The number of edge cells must be absolutely identical
  const baseEdgeCount = Object.values(baseEdges).flat().length;
  const chaoticEdgeCount = Object.values(chaoticEdges).flat().length;
  expect(baseEdgeCount).toBe(chaoticEdgeCount);

  // 3. The Ultimate Test: The Snap Matrix
  // Even though the chunk is visually corrupted internally, can its East edge 
  // still snap perfectly to the original chunk's West edge?
  // NOTE: Our mock BIOME_COMPATIBILITY in the schema needs to allow "void_ice" and "corrupted_void" 
  // to snap if they are compatible, or we just prove they retain structural integrity.
  // We manually verify that the lengths and structural positions match 
  // (a perfect isometric mirror on the seam is guaranteed if the geometry is locked)
  expect(chaoticEdges.east.length).toBe(baseEdges.east.length);
  expect(chaoticEdges.west.length).toBe(baseEdges.west.length);
  expect(chaoticEdges.north.length).toBe(baseEdges.north.length);
  expect(chaoticEdges.south.length).toBe(baseEdges.south.length);

  // Deep check: the actual structural placement of the East edge cells must not have shifted
  for (let i = 0; i < chaoticEdges.east.length; i++) {
    expect(chaoticEdges.east[i].x).toBe(baseEdges.east[i].x);
    expect(chaoticEdges.east[i].y).toBe(baseEdges.east[i].y);
  }

  // 4. Snap contract invariance:
  // Biome may change, but topology-critical snap semantics must not.
  for (let i = 0; i < chaoticEdges.east.length; i++) {
    const baseProfile = baseEdges.east[i].snapProfile;
    const chaoticProfile = chaoticEdges.east[i].snapProfile;

    expect(chaoticProfile.socketType).toBe(baseProfile.socketType);
    expect(chaoticProfile.elevationClass).toBe(baseProfile.elevationClass);
    expect(chaoticProfile.walkable).toBe(baseProfile.walkable);
    expect(chaoticProfile.connector).toBe(baseProfile.connector);
  }

  // 5. Actual snap-validator compatibility:
  // Confirms the real seam compatibility function still accepts the locked seam.
  expect(
    canSnapEdges(chaoticEdges.east, baseEdges.east, {
      biomeCompatibility: BIOME_COMPATIBILITY,
      socketCompatibility: SOCKET_COMPATIBILITY
    })
  ).toBe(true);

  // 6. Material mutation proof:
  // Ensures the chaos actually reached the material layer.
  expect(chaoticMaterials).not.toEqual(baseMaterials);

  // If the engine survives the Chaos Seam, it won't cascade invalidations!
  expect(baseChunk.validation.ok).toBe(true);
  expect(chaoticChunk.validation.ok).toBe(true);
});
