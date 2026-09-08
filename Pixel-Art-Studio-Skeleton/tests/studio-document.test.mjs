import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_HISTORY_LIMIT,
  DEFAULT_LAYER_VOCABULARY,
  EVENT_HISTORY_LIMIT,
  STUDIO_FAULT_FAMILIES,
  STUDIO_PALETTE_LIMIT,
  createDocumentController,
  createStudioFault,
  reduceIndexedPalette,
} from "../src/lib/pixelbrain/studio-document.js";

test("names the bounded document caps used by Phase B", () => {
  assert.equal(COMMAND_HISTORY_LIMIT, 50);
  assert.equal(EVENT_HISTORY_LIMIT, 40);
  assert.equal(STUDIO_PALETTE_LIMIT, 32);
  assert.deepEqual(DEFAULT_LAYER_VOCABULARY, [
    "00_Reference",
    "Structure",
    "Energy",
    "Focal",
    "Shading",
    "Glow",
    "Final",
  ]);
  assert.ok(STUDIO_FAULT_FAMILIES.includes("PB-STUDIO-STALE-REVISION"));
  assert.ok(STUDIO_FAULT_FAMILIES.includes("PB-STUDIO-FORGE-CAPABILITY"));
});

test("creates a revisioned document with protected reference layer vocabulary", () => {
  const doc = createDocumentController();
  const snapshot = doc.getSnapshot();
  assert.equal(snapshot.width, 160);
  assert.equal(snapshot.height, 144);
  assert.equal(snapshot.gridType, "rectangular");
  assert.equal(snapshot.cellSize, 1);
  assert.equal(snapshot.revision, 0);
  assert.match(snapshot.checksum, /^studio-output1:/);
  assert.deepEqual(
    snapshot.layers.map((layer) => layer.name),
    DEFAULT_LAYER_VOCABULARY,
  );
  assert.equal(snapshot.layers[0].locked, true);
  assert.equal(doc.getActiveLayerIndex(), 1);
  assert.ok(Object.isFrozen(snapshot));
});

test("committed strokes emit a new immutable snapshot and stay undoable", () => {
  const doc = createDocumentController();
  const before = doc.getSnapshot();
  const painted = doc.paint([{ x: 4, y: 5, color: "#79d45e" }]);
  assert.notEqual(painted.checksum, before.checksum);
  assert.equal(painted.revision, 1);
  assert.equal(before.revision, 0);
  const cell = painted.layers.find((layer) => layer.name === "Structure").cells.find(
    (entry) => entry.x === 4 && entry.y === 5,
  );
  assert.equal(cell.color, "#79d45e");
  const undone = doc.undo();
  assert.equal(undone.checksum, before.checksum);
  assert.equal(
    undone.layers.find((layer) => layer.name === "Structure").cells.length,
    0,
  );
  const redone = doc.redo();
  assert.equal(redone.checksum, painted.checksum);
});

test("history is capped and stale revision installs are refused", () => {
  const doc = createDocumentController({ historyLimit: 3 });
  const genesis = doc.getSnapshot();
  doc.paint([{ x: 0, y: 0, color: "#111111" }]);
  doc.paint([{ x: 1, y: 0, color: "#222222" }]);
  doc.paint([{ x: 2, y: 0, color: "#333333" }]);
  doc.paint([{ x: 3, y: 0, color: "#444444" }]);
  assert.equal(doc.getHistory().length, 3);
  assert.equal(doc.undo().revision, 3);
  assert.equal(doc.undo().revision, 2);
  assert.equal(doc.undo().revision, 1);
  assert.equal(doc.undo(), null);
  const stale = createStudioFault("PB-STUDIO-STALE-REVISION", "stale proposal", {
    expected: doc.getSnapshot().checksum,
    received: genesis.checksum,
  });
  assert.equal(stale.family, "PB-STUDIO-STALE-REVISION");
  assert.throws(
    () =>
      doc.installGeneratedOutput(
        { coordinates: [{ x: 1, y: 1, color: "#ffffff" }] },
        { baseChecksum: genesis.checksum, ampId: "stale-amp", outputChecksum: "x" },
      ),
    /PB-STUDIO-STALE-REVISION/,
  );
});

test("palette reduction is deterministic and reports the 32-color ceiling", () => {
  const colors = Array.from({ length: 40 }, (_, index) => `#${index.toString(16).padStart(6, "0")}`);
  const first = reduceIndexedPalette(colors, 32);
  const second = reduceIndexedPalette(colors, 32);
  assert.deepEqual(first.palette, second.palette);
  assert.equal(first.palette.length, 32);
  assert.equal(first.reduced, true);
  assert.equal(first.before, 40);
  assert.equal(first.after, 32);
  const small = reduceIndexedPalette(["#112233", "#445566"], 32);
  assert.equal(small.reduced, false);
  assert.equal(small.palette.length, 2);
});

test("failed imports do not partially replace the current document", () => {
  const doc = createDocumentController();
  doc.paint([{ x: 2, y: 2, color: "#abcdef" }]);
  const current = doc.getSnapshot();
  assert.throws(() => doc.importPayload({ kind: "png", bytes: new Uint8Array([1, 2, 3]) }), /PB-STUDIO-PNG-DECODE/);
  assert.equal(doc.getSnapshot().checksum, current.checksum);
  const cell = current.layers.find((layer) => layer.name === "Structure").cells[0];
  assert.equal(cell.color, "#abcdef");
});

test("event history is bounded and newest-first", () => {
  const doc = createDocumentController({ eventLimit: 5 });
  for (let index = 0; index < 8; index += 1) {
    doc.paint([{ x: index, y: 0, color: "#010101" }]);
  }
  const events = doc.getEvents();
  assert.equal(events.length, 5);
  assert.ok(Object.isFrozen(events));
  assert.equal(events[0].revision, 8);
});
