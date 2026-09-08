import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentController } from "../src/lib/pixelbrain/studio-document.js";
import {
  critiqueDocument,
  discardLocal,
  evaluateForgeGate,
  keepLocally,
  loadStudioLibrary,
  transmuteStyle,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";

test("Forge Gate emits PASS/FAIL with measurable reasons and refuses observed sampling", () => {
  const empty = createDocumentController();
  const fail = evaluateForgeGate({ snapshot: empty.getSnapshot() });
  assert.equal(fail.verdict, "FAIL");
  assert.equal(fail.family, "PB-STUDIO-FORGE-GATE");
  assert.ok(fail.findings.some((finding) => finding.pass === false));

  const doc = createDocumentController();
  const cells = [];
  for (let y = 20; y < 80; y += 1) {
    for (let x = 40; x < 120; x += 1) cells.push({ x, y, color: "#c9a227" });
  }
  doc.paint(cells);
  const pass = evaluateForgeGate({ snapshot: doc.getSnapshot() });
  assert.equal(pass.verdict, "PASS");

  const capability = evaluateForgeGate({
    snapshot: doc.getSnapshot(),
    observedSampling: true,
  });
  assert.equal(capability.verdict, "FAIL");
  assert.equal(capability.family, "PB-STUDIO-FORGE-CAPABILITY");
});

test("style transmutation is deterministic for fixed inputs", () => {
  const doc = createDocumentController();
  doc.paint([
    { x: 3, y: 3, color: "#112233" },
    { x: 4, y: 3, color: "#ddeeff" },
  ]);
  const snapshot = doc.getSnapshot();
  const a = transmuteStyle(snapshot, { schoolId: "VOID", styleId: "gameboy" });
  const b = transmuteStyle(snapshot, { schoolId: "VOID", styleId: "gameboy" });
  assert.deepEqual(a.cells, b.cells);
  assert.equal(a.algorithmId, "pb-studio-finish-v1");
  assert.equal(a.checksum, b.checksum);
  assert.notEqual(a.checksum, snapshot.checksum);
});

test("mentor critique is derived from the active document and never claims an AI service", () => {
  const doc = createDocumentController();
  const empty = critiqueDocument(doc.getSnapshot());
  assert.equal(empty.coordCount, 0);
  assert.equal(empty.externalService, false);
  doc.paint(
    Array.from({ length: 40 }, (_, index) => ({ x: index % 8, y: Math.floor(index / 8), color: "#789abc" })),
  );
  const live = critiqueDocument(doc.getSnapshot());
  assert.ok(live.coordCount >= 40);
  assert.equal(live.revision, doc.getSnapshot().revision);
  assert.ok(live.steps.length >= 1);
  assert.equal(live.externalService, false);
});

test("Keep locally is explicit, download is separate, and v1 records are normalized without rewrite", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  storage.setItem(
    "pixelbrain.sward.library.v1",
    JSON.stringify([{ id: "sward-1", name: "Sward 1", width: 32 }]),
  );
  const loaded = loadStudioLibrary(storage);
  assert.equal(loaded.records.some((record) => record.id === "sward-1"), true);
  assert.equal(storage.getItem("pixelbrain.sward.library.v1").includes("sward-1"), true);
  const doc = createDocumentController({ width: 8, height: 8 });
  doc.paint([{ x: 1, y: 1, color: "#445566" }]);
  const kept = keepLocally(storage, doc.getSnapshot(), { name: "Glyph" });
  assert.equal(kept.kept, true);
  const after = loadStudioLibrary(storage);
  assert.ok(after.records.some((record) => record.name === "Glyph"));
  discardLocal(storage, kept.record.id);
  assert.equal(
    loadStudioLibrary(storage).records.some((record) => record.id === kept.record.id),
    false,
  );
});
