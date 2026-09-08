import assert from "node:assert/strict";
import test from "node:test";
import { assistIsStale, assistOutputCells, auditCanvasPixels, selectCanvasAssists } from "../src/lib/pixelbrain/canvas-assist.js";
import { previewConstructionGuides } from "../src/lib/pixelbrain/studio-authoring-facade.js";
import { cellsFromOutput, createDocumentController } from "../src/lib/pixelbrain/studio-document.js";
import {
  acceptStudioMutation,
  proposeStudioMutationExecution,
  rejectStudioMutation,
} from "../src/lib/pixelbrain/studio-facade.js";

const snapshot = {
  checksum: "studio-output1:base",
  width: 8,
  height: 8,
  palette: ["#000000", "#ffffff"],
  layers: [{ visible: true, cells: [{ x: 1, y: 1, color: "#ffffff" }, { x: 5, y: 5, color: "#ffffff" }] }],
};

test("auditCanvasPixels identifies isolated visible pixels deterministically", () => {
  assert.deepEqual(auditCanvasPixels(snapshot).isolatedCells, [{ x: 1, y: 1 }, { x: 5, y: 5 }]);
});

test("selectCanvasAssists caps stable evidence-backed suggestions at three", () => {
  const suggestions = selectCanvasAssists({
    snapshot,
    critique: { weakSilhouette: true, likelyCenterDrift: true },
    manifest: [
      { ampId: "square-sharpness-contrast", kind: "mutation", order: 8 },
      { ampId: "palette-quantization-amp", kind: "mutation", order: 9 },
    ],
  });
  assert.equal(suggestions.length, 3);
  assert.deepEqual(suggestions.map((item) => item.id), ["construction-guides", "pixel-audit", "square-sharpness-contrast"]);
  assert.ok(suggestions.every((item) => item.reason.length > 0 && item.baseChecksum === snapshot.checksum));
});

test("assist staleness and direct-array output normalization are explicit", () => {
  assert.equal(assistIsStale({ baseChecksum: "a" }, "b"), true);
  assert.deepEqual(assistOutputCells([{ x: 2, y: 3, color: "#abcdef" }]), [{ x: 2, y: 3, color: "#abcdef" }]);
});

test("previewConstructionGuides returns frozen overlay cells without mutating the snapshot", () => {
  const source = { checksum: "studio-output1:guides", width: 16, height: 12 };
  const before = JSON.stringify(source);
  const cells = previewConstructionGuides(source);
  assert.equal(JSON.stringify(source), before);
  assert.ok(Object.isFrozen(cells));
  assert.ok(cells.length > 0);
  assert.ok(cells.every((cell) => Object.isFrozen(cell) && Number.isInteger(cell.x) && Number.isInteger(cell.y)));
  assert.ok(cells.every((cell) => cell.x >= 0 && cell.x < 16 && cell.y >= 0 && cell.y < 12));
  assert.equal(cells[0].color, "#00e5ff");
  assert.equal(previewConstructionGuides(source, { color: "#ff00aa" })[0].color, "#ff00aa");
});

test("cellsFromOutput copies a direct array first and keeps object-form branches", () => {
  const input = [{ x: 2, y: 3, color: "#abcdef" }];
  const copied = cellsFromOutput(input);
  assert.deepEqual(copied, input);
  assert.notEqual(copied, input);
  assert.notEqual(copied[0], input[0]);
  assert.deepEqual(
    cellsFromOutput({ coordinates: [{ x: 1, y: 1, color: "#111111" }] }),
    [{ x: 1, y: 1, color: "#111111" }],
  );
  assert.deepEqual(
    cellsFromOutput({ cells: [{ x: 4, y: 5, color: "#222222" }] }),
    [{ x: 4, y: 5, color: "#222222" }],
  );
});

test("construction and pixel-audit overlays leave the document checksum unchanged", () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 1, y: 1, color: "#ffffff" }]);
  doc.paint([{ x: 8, y: 8, color: "#ffffff" }]);
  const before = doc.getSnapshot();
  const guides = previewConstructionGuides(before);
  const isolated = auditCanvasPixels(before).isolatedCells;
  assert.ok(guides.length > 0);
  assert.equal(isolated.length, 2);
  assert.equal(doc.getSnapshot().checksum, before.checksum);
  assert.equal(
    doc.getSnapshot().layers.some((layer) => String(layer.name).startsWith("ASSIST/")),
    false,
  );
});

test("freezeSnapshot omits symmetryAxes so Assist must inject doc.getGrid().symmetryAxes", () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 2, y: 2, color: "#c9a227" }]);
  const frozen = doc.getSnapshot();
  assert.equal(frozen.symmetryAxes, undefined);
  const withoutAxes = selectCanvasAssists({
    snapshot: frozen,
    critique: { likelyCenterDrift: false },
    manifest: [],
  });
  assert.ok(withoutAxes.some((item) => item.id === "symmetry-assist"));
  doc.toggleSymmetry("vertical");
  const afterToggle = doc.getSnapshot();
  assert.equal(afterToggle.checksum, frozen.checksum);
  const injected = {
    ...afterToggle,
    symmetryAxes: doc.getGrid().symmetryAxes || [],
  };
  const withAxes = selectCanvasAssists({
    snapshot: injected,
    critique: { likelyCenterDrift: false },
    manifest: [],
  });
  assert.ok(!withAxes.some((item) => item.id === "symmetry-assist"));
});

test("drawing after a mutation preview makes assistIsStale true and Apply refuses the stale base", async () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 1, y: 1, color: "#c9a227" }]);
  doc.paint([{ x: 10, y: 10, color: "#c9a227" }]);
  const baseline = doc.getSnapshot();
  const proposal = await proposeStudioMutationExecution({
    ampId: "square-sharpness-contrast",
    snapshot: baseline,
  });
  const previewCells = assistOutputCells(proposal.transaction.candidate.data ?? proposal.transaction.candidate);
  assert.ok(previewCells.length > 0);
  assert.equal(doc.getSnapshot().checksum, baseline.checksum);
  assert.equal(assistIsStale({ baseChecksum: proposal.transaction.baseChecksum }, baseline.checksum), false);

  doc.paint([{ x: 4, y: 4, color: "#336699" }]);
  const drawn = doc.getSnapshot();
  assert.equal(assistIsStale({ baseChecksum: proposal.transaction.baseChecksum }, drawn.checksum), true);
  assert.throws(
    () => acceptStudioMutation({ current: drawn, transaction: proposal.transaction }),
    /PB-STUDIO-STALE-BASELINE/,
  );
  const dismissed = rejectStudioMutation({ current: baseline, transaction: proposal.transaction });
  assert.equal(dismissed, baseline);
  assert.equal(
    drawn.layers.some((layer) => String(layer.name).startsWith("ASSIST/")),
    false,
  );
});
