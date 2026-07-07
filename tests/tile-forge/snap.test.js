import { test, expect } from "vitest";
import { generateTileForgeCandidate } from "./test-utils.js";

test("Minimal Snap Test", () => {
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

  const result = generateTileForgeCandidate(intent);
  const edges = result.candidate.layers.tileSockets.edges;
  const allEdgeCells = Object.values(edges).flat();

  expect(allEdgeCells.length).toBeGreaterThan(0);

  for (const cell of allEdgeCells) {
    expect(cell.snapProfile).toBeDefined();
    expect(cell.snapProfile.biomeId).toBeDefined();
    expect(cell.snapProfile.socketType).toBeDefined();
    expect(cell.snapProfile.elevationClass).toBeDefined();
    expect(cell.snapProfile.walkable).toBeDefined();
  }
});
