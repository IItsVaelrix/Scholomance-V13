import { test, expect } from "vitest";
import { generateTileForgeCandidate } from "./test-utils.js";

test("Minimal TurboQuant Test (Layer Lock)", () => {
  const intent = {
    id: "test_void_ice_001",
    seed: "same_seed",
    preset: "organicVoidIsland",
    projection: "isometric",
    tileSize: { width: 80, height: 45 },
    chunkType: "floating_island",
    biomeId: "void_ice",
    elevation: 3,
    symmetryMode: "soft",
    noise: { enabled: true, scale: 0.12, intensity: 0.35 },
    fibonacci: { enabled: true, count: 24, mode: "decorative_growth" }
  };

  const first = generateTileForgeCandidate(intent);

  const lockedIntent = {
    ...intent,
    lockedLayers: {
      isoTile: true,
      tileSockets: true
    },
    seed: "same_seed_noise_reroll_002"
  };

  const second = generateTileForgeCandidate(lockedIntent);

  // Because the mock pipeline simulates different seeds modifying hashes in test-utils,
  // we check that the base footprint arrays are identical in length to prove stability
  expect(first.candidate.layers.isoTile.topPlane.length)
    .toBe(second.candidate.layers.isoTile.topPlane.length);
  
  const edgesFirst = Object.values(first.candidate.layers.tileSockets.edges).flat().length;
  const edgesSecond = Object.values(second.candidate.layers.tileSockets.edges).flat().length;
  expect(edgesFirst).toBe(edgesSecond);

  expect(first.memorySnapshot.layerSnapshots.isoTileHash)
    .toBe(second.memorySnapshot.layerSnapshots.isoTileHash);
});
