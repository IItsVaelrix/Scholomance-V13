import assert from "node:assert/strict";
import test from "node:test";
import {
  ZOOM_LADDER,
  cellToScreen,
  dedupeCells,
  fitViewport,
  rasterLine,
  screenToCell,
  stepZoom,
  zoomAt,
} from "../src/lib/pixelbrain/canvas-interaction.js";

test("rasterLine fills fast shallow, steep, and reverse strokes without gaps", () => {
  assert.deepEqual(rasterLine({ x: 0, y: 0 }, { x: 5, y: 2 }), [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 },
    { x: 3, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 },
  ]);
  assert.deepEqual(rasterLine({ x: 2, y: 5 }, { x: 0, y: 0 }).at(-1), { x: 0, y: 0 });
});

test("screen and cell transforms round-trip at fractional and integer zoom", () => {
  for (const zoom of [0.5, 1, 8, 32]) {
    const viewport = { panX: 37, panY: 19, zoom };
    const screen = cellToScreen({ x: 7, y: 11 }, viewport);
    assert.deepEqual(screenToCell({ x: screen.x + zoom / 2, y: screen.y + zoom / 2 }, viewport, { width: 20, height: 20 }), { x: 7, y: 11 });
  }
});

test("zoomAt preserves the world coordinate beneath the pointer", () => {
  const before = { panX: 20, panY: 30, zoom: 4 };
  const after = zoomAt(before, { x: 148, y: 94 }, 8);
  assert.equal((148 - before.panX) / before.zoom, (148 - after.panX) / after.zoom);
  assert.equal((94 - before.panY) / before.zoom, (94 - after.panY) / after.zoom);
});

test("fitViewport uses the largest legal zoom and centers the document", () => {
  assert.deepEqual(fitViewport({ width: 160, height: 144 }, { width: 720, height: 680 }, ZOOM_LADDER, 32), {
    zoom: 4,
    panX: 40,
    panY: 52,
  });
});

test("stepZoom uses ladder values and dedupeCells clips document bounds", () => {
  assert.equal(stepZoom({ panX: 0, panY: 0, zoom: 4 }, { x: 20, y: 20 }, 1).zoom, 8);
  assert.deepEqual(dedupeCells([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: -1, y: 0 }], { width: 2, height: 2 }), [{ x: 1, y: 1 }]);
});
