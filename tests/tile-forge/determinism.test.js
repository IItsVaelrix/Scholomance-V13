import { test, expect } from "vitest";
import { generateTileForgeCandidate } from "./test-utils.js";

test("Minimal Determinism Test", () => {
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

  const resultA = generateTileForgeCandidate(intent);
  const resultB = generateTileForgeCandidate(intent);

  expect(JSON.stringify(resultA.exportPacket)).toBe(JSON.stringify(resultB.exportPacket));
  expect(resultA.memorySnapshot.layerSnapshots.isoTileHash).toBe(resultB.memorySnapshot.layerSnapshots.isoTileHash);
  
  expect(resultA.validation.ok).toBe(true);
  expect(resultA.snapValidation.ok).toBe(true);
});
