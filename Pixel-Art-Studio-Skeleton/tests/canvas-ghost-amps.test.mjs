import assert from "node:assert/strict";
import test from "node:test";
import {
  GHOST_AMP_PRESETS,
  FLAME_ELEMENTS,
  FLAME_PALETTES,
  generateGhostHints,
  generateFlameGhostHints,
  generateBevelGhostHints,
  generateShadowGhostHints,
  generateSeloutGhostHints,
  generatePixelAAGhostHints,
  generateCrystalCoreGhostHints,
  isGhostLayerStale,
  getSnapshotVisibleCells,
} from "../src/lib/pixelbrain/canvas-ghost-amps.js";

const swordCells = [
  { x: 16, y: 8, color: "#cbd5e1" },
  { x: 16, y: 9, color: "#cbd5e1" },
  { x: 16, y: 10, color: "#94a3b8" },
  { x: 16, y: 11, color: "#94a3b8" },
  { x: 16, y: 12, color: "#64748b" },
  { x: 16, y: 13, color: "#64748b" },
  { x: 15, y: 14, color: "#334155" },
  { x: 16, y: 14, color: "#334155" },
  { x: 17, y: 14, color: "#334155" },
  { x: 16, y: 15, color: "#78350f" },
];

const mockSnapshot = {
  width: 32,
  height: 32,
  checksum: "test-snap-sword-1",
  layers: [
    {
      name: "Sword",
      visible: true,
      cells: swordCells,
    },
  ],
};

test("GHOST_AMP_PRESETS contains flame amp and popular presets", () => {
  assert.ok(GHOST_AMP_PRESETS.length >= 8);
  const flame = GHOST_AMP_PRESETS.find((p) => p.id === "flame");
  assert.ok(flame);
  assert.equal(flame.name, "Flame AMP");
  assert.equal(flame.hasElements, true);
});

test("FLAME_ELEMENTS provides classic, holy, icy, shadow, and poison", () => {
  const ids = FLAME_ELEMENTS.map((e) => e.id);
  assert.ok(ids.includes("classic"));
  assert.ok(ids.includes("holy"));
  assert.ok(ids.includes("icy"));
  assert.ok(ids.includes("shadow"));
  assert.ok(ids.includes("poison"));
});

test("generateFlameGhostHints produces blade glow, rising plumes, and embers for a sword", () => {
  const res = generateFlameGhostHints(swordCells, 32, 32, { element: "classic", intensity: "medium" });
  assert.ok(res.hintCount > 0);
  assert.ok(res.cells.length > 0);
  assert.ok(res.cells.some((c) => c.role === "blade-glow"));
  assert.ok(res.cells.some((c) => c.role === "flame-core"));
  assert.ok(res.cells.some((c) => c.role === "ember"));
  assert.ok(res.summary.includes("Flame AMP (classic)"));
});

test("generateFlameGhostHints respects holy and icy element palettes", () => {
  const holy = generateFlameGhostHints(swordCells, 32, 32, { element: "holy" });
  assert.ok(holy.cells.some((c) => c.color === FLAME_PALETTES.holy.core));

  const icy = generateFlameGhostHints(swordCells, 32, 32, { element: "icy" });
  assert.ok(icy.cells.some((c) => c.color === FLAME_PALETTES.icy.core));
});

test("generateBevelGhostHints detects specular highlights on top/left edges", () => {
  const res = generateBevelGhostHints(swordCells, 32, 32);
  assert.ok(res.hintCount > 0);
  assert.ok(res.cells.some((c) => c.role === "specular-highlight"));
});

test("generateShadowGhostHints detects ground and cast shadow", () => {
  const res = generateShadowGhostHints(swordCells, 32, 32);
  assert.ok(res.hintCount > 0);
  assert.ok(res.cells.some((c) => c.role === "ground-shadow" || c.role === "cast-shadow"));
});

test("generateGhostHints dispatcher runs flame amp on snapshot", async () => {
  const ghost = await generateGhostHints("flame", mockSnapshot, { element: "holy" });
  assert.equal(ghost.ampId, "pixelbrain.flame-tip-amp");
  assert.ok(ghost.hintCount > 0);
  assert.equal(ghost.baseChecksum, "test-snap-sword-1");
  assert.equal(isGhostLayerStale(ghost, "test-snap-sword-1"), false);
  assert.equal(isGhostLayerStale(ghost, "test-snap-sword-2"), true);
});

test("empty canvas returns 0 hint pixels gracefully", async () => {
  const empty = { width: 32, height: 32, checksum: "empty", layers: [] };
  const res = await generateGhostHints("flame", empty);
  assert.equal(res.hintCount, 0);
  assert.equal(res.cells.length, 0);
});
