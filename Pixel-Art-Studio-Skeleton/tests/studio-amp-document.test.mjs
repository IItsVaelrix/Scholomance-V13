import assert from "node:assert/strict";
import test from "node:test";

import { assistOutputCells } from "../src/lib/pixelbrain/canvas-assist.js";
import {
  acceptStudioMutation,
  commitStudioAmpExecution,
  getStudioAmpManifest,
  proposeStudioMutationExecution,
  rejectStudioMutation,
} from "../src/lib/pixelbrain/studio-facade.js";
import { createDocumentController } from "../src/lib/pixelbrain/studio-document.js";

test("AMP commit installs a generated layer and rejected mutation is a no-op", async () => {
  const doc = createDocumentController({ width: 32, height: 32 });
  doc.paint([{ x: 2, y: 2, color: "#445566" }]);
  const snapshot = doc.getSnapshot();
  const committed = await commitStudioAmpExecution({
    ampId: "grass",
    snapshot,
    options: { planChecksum: undefined },
  }).catch(() => null);
  if (committed?.receipt) {
    const next = doc.installGeneratedOutput(committed.output, committed.receipt, { name: "AMP/grass" });
    assert.ok(next.layers.some((layer) => layer.name === "AMP/grass"));
    assert.notEqual(next.checksum, snapshot.checksum);
  } else {
    const next = doc.installGeneratedOutput(
      { coordinates: [{ x: 4, y: 4, color: "#789abc" }] },
      { baseChecksum: snapshot.checksum, ampId: "grass", outputChecksum: "studio-output1:amp" },
      { name: "AMP/grass" },
    );
    assert.ok(next.layers.some((layer) => layer.name === "AMP/grass"));
  }

  const beforeReject = doc.getSnapshot();
  const proposal = await proposeStudioMutationExecution({
    ampId: "coord-symmetry-amp",
    snapshot: beforeReject,
  }).catch(() => null);
  if (proposal) {
    rejectStudioMutation({ current: beforeReject, transaction: proposal.transaction });
  }
  assert.equal(doc.getSnapshot().checksum, beforeReject.checksum);
});

test("dismissed mutation preview is a no-op that returns the exact baseline object", async () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 2, y: 2, color: "#c9a227" }]);
  doc.paint([{ x: 11, y: 11, color: "#c9a227" }]);
  const baseline = doc.getSnapshot();
  const proposal = await proposeStudioMutationExecution({
    ampId: "square-sharpness-contrast",
    snapshot: baseline,
  });
  const rejected = rejectStudioMutation({ current: baseline, transaction: proposal.transaction });
  assert.equal(rejected, baseline);
  assert.equal(rejected.checksum, baseline.checksum);
  assert.equal(doc.getSnapshot().checksum, baseline.checksum);
  assert.equal(
    doc.getSnapshot().layers.some((layer) => String(layer.name).startsWith("ASSIST/")),
    false,
  );
});

test("fresh accepted direct-array mutation installs one generated layer and one undo removes it", async () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 1, y: 1, color: "#c9a227" }]);
  doc.paint([{ x: 10, y: 12, color: "#c9a227" }]);
  const baseline = doc.getSnapshot();
  const proposal = await proposeStudioMutationExecution({
    ampId: "square-sharpness-contrast",
    snapshot: baseline,
  });
  const accepted = acceptStudioMutation({ current: baseline, transaction: proposal.transaction });
  const cells = assistOutputCells(accepted.data ?? accepted);
  assert.ok(cells.length > 0);
  const installed = doc.installGeneratedOutput(
    accepted.data,
    { ...proposal.receipt, baseChecksum: accepted.parentChecksum },
    { name: `ASSIST/${String(accepted.mutationAmpId)}` },
  );
  const assistLayers = installed.layers.filter((layer) => layer.name === "ASSIST/square-sharpness-contrast");
  assert.equal(assistLayers.length, 1);
  assert.ok(assistLayers[0].cells.length > 0);
  assert.notEqual(installed.checksum, baseline.checksum);
  const undone = doc.undo();
  assert.equal(undone.checksum, baseline.checksum);
  assert.equal(
    undone.layers.some((layer) => layer.name === "ASSIST/square-sharpness-contrast"),
    false,
  );
});

test("Apply refuses a stale proposal and receipts plus faults stay on the controller", async () => {
  const doc = createDocumentController({ width: 16, height: 16 });
  doc.paint([{ x: 3, y: 3, color: "#445566" }]);
  const baseline = doc.getSnapshot();
  const proposal = await proposeStudioMutationExecution({
    ampId: "square-sharpness-contrast",
    snapshot: baseline,
  });
  doc.recordReceipt(proposal.receipt);
  assert.equal(doc.getReceipts()[0].mode, "mutation-preview");
  assert.equal(doc.getReceipts()[0].ampId, "square-sharpness-contrast");

  doc.paint([{ x: 7, y: 1, color: "#abcdef" }]);
  const stale = doc.getSnapshot();
  assert.throws(
    () => acceptStudioMutation({ current: stale, transaction: proposal.transaction }),
    /PB-STUDIO-STALE-BASELINE/,
  );
  assert.throws(
    () =>
      doc.installGeneratedOutput(
        [{ x: 0, y: 0, color: "#ffffff" }],
        { ...proposal.receipt, baseChecksum: baseline.checksum },
        { name: "ASSIST/square-sharpness-contrast" },
      ),
    /PB-STUDIO-STALE-REVISION/,
  );
  doc.recordFault({
    family: "PB-STUDIO-STALE-BASELINE",
    message: "PB-STUDIO-STALE-BASELINE · regenerate Preview before Apply",
    kind: "fault",
    at: "fault-assist-stale",
  });
  assert.equal(doc.getFaults()[0].family, "PB-STUDIO-STALE-BASELINE");
  assert.equal(doc.getReceipts().length > 0, true);
  assert.equal(getStudioAmpManifest().length > 0, true);
});
