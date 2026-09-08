import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDocumentController,
  detectAmpsFromSource,
  ingestScdlIntoDocument,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";
import { generateGhostHints } from "../src/lib/pixelbrain/canvas-ghost-amps.js";
import { selectCanvasAssists } from "../src/lib/pixelbrain/canvas-assist.js";

test("detectAmpsFromSource extracts pipeline and 10 AMPs from master maple tree", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const result = detectAmpsFromSource(source);

  assert.equal(result.pipeline, "render-fidelity");
  assert.ok(result.detectedAmps.length >= 10);
  assert.ok(result.activeAmpIds.length >= 10);

  // Check that canonical IDs are mapped to manifest IDs
  const shadow = result.detectedAmps.find((a) => a.ampId === "pixelbrain.shadow");
  assert.ok(shadow, "Should detect pixelbrain.shadow");
  assert.equal(shadow.manifestId, "pixelbrain.shadow-amp");
  assert.equal(shadow.name, "Drop Shadow & Depth");
  assert.equal(shadow.inManifest, true);
  assert.equal(shadow.isGhostSupported, true);

  const selout = result.detectedAmps.find((a) => a.ampId === "pixelbrain.selout");
  assert.ok(selout, "Should detect pixelbrain.selout");
  assert.equal(selout.manifestId, "selout-amp");
  assert.equal(selout.inManifest, true);

  const quant = result.detectedAmps.find((a) => a.ampId === "pixelbrain.palette-quantization");
  assert.ok(quant, "Should detect pixelbrain.palette-quantization");
  assert.equal(quant.manifestId, "palette-quantization-amp");

  // Primary visual finish AMP should be shadow
  assert.ok(result.primaryDetectedAmp);
  assert.equal(result.primaryDetectedAmp.manifestId, "pixelbrain.shadow-amp");
});

test("detectAmpsFromSource prioritizes explicit APPLY_AMP directives", () => {
  const source = `SCDL 2
ASSET test_explicit
CANVAS WIDTH 16 HEIGHT 16
APPLY_AMP pixelbrain.flame-tip-amp
SELECT_AMPS PIPELINE render-fidelity
LAYER base ORDER 1 {
  PAINT (RECT CENTER (VEC2 (PX 8) (PX 8)) SIZE (VEC2 (PX 4) (PX 4))) FILL #ff0000 RASTER MIDPOINT
}
`;
  const result = detectAmpsFromSource(source);
  assert.ok(result.detectedAmps.some((a) => a.ampId.includes("flame")));
  assert.equal(result.primaryDetectedAmp.ampId, "pixelbrain.flame-tip-amp");
  assert.equal(result.primaryDetectedAmp.source, "explicit");
});

test("ingestScdlIntoDocument populates document metadata and receipt with detected AMPs", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController();
  const ingest = ingestScdlIntoDocument(doc, source);

  assert.equal(ingest.ok, true);
  assert.equal(ingest.assetId, "scholomium_master_maple");
  assert.equal(ingest.pipeline, "render-fidelity");
  assert.ok(ingest.detectedAmps.length >= 10);
  assert.equal(ingest.primaryDetectedAmp?.manifestId, "pixelbrain.shadow-amp");

  // Verify receipt
  assert.ok(ingest.receipt.detectedAmpCount >= 10);
  assert.equal(ingest.receipt.pipeline, "render-fidelity");
  assert.deepEqual(ingest.receipt.activeAmpIds, ingest.activeAmpIds);

  // Verify snapshot preservation
  const snapshot = doc.getSnapshot();
  assert.equal(snapshot.pipeline, "render-fidelity");
  assert.ok(snapshot.detectedAmps.length >= 10);
  assert.ok(snapshot.activeAmpIds.length >= 10);
  assert.equal(snapshot.primaryDetectedAmp?.manifestId, "pixelbrain.shadow-amp");
  assert.ok(snapshot.scdlSource.includes("SELECT_AMPS PIPELINE render-fidelity"));

  // Verify controller getters
  assert.equal(doc.getPipeline(), "render-fidelity");
  assert.ok(doc.getDetectedAmps().length >= 10);
  assert.ok(doc.getActiveAmpIds().length >= 10);
  assert.equal(doc.getPrimaryDetectedAmp()?.manifestId, "pixelbrain.shadow-amp");
  assert.ok(doc.getScdlSource().includes("ASSET scholomium_master_maple"));
});

test("generateGhostHints successfully generates shadow and selout hints from canonical IDs", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController();
  ingestScdlIntoDocument(doc, source);
  const snapshot = doc.getSnapshot();

  // Test calling with canonical SCDL ID
  const shadowHints = await generateGhostHints("pixelbrain.shadow", snapshot);
  assert.equal(shadowHints.ampId, "pixelbrain.shadow-amp");
  assert.equal(shadowHints.ampName, "Drop Shadow & Depth");
  assert.ok(shadowHints.hintCount > 0, "Should produce ground and drop shadow hints");
  assert.equal(shadowHints.baseChecksum, snapshot.checksum);

  // Test calling with canonical SCDL selout ID
  const seloutHints = await generateGhostHints("pixelbrain.selout", snapshot);
  assert.equal(seloutHints.ampId, "selout-amp");
  assert.equal(seloutHints.ampName, "Selout (Soft Outline)");
  assert.ok(seloutHints.hintCount > 0, "Should produce selective outline hints");
});

test("selectCanvasAssists surfaces source-declared AMPs when present on snapshot", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController();
  ingestScdlIntoDocument(doc, source);
  const snapshot = doc.getSnapshot();

  const assists = selectCanvasAssists({ snapshot });
  assert.ok(assists.length > 0);
  const sourceAssist = assists.find((a) => a.id.startsWith("source-amp-"));
  assert.ok(sourceAssist, "Should include a source-declared AMP assist suggestion");
  assert.match(sourceAssist.reason, /Declared in source code/);
});

test("sequential execution of all detected source AMPs bakes layers and transforms document", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController();
  ingestScdlIntoDocument(doc, source);
  const beforeSnap = doc.getSnapshot();
  const initialLayerCount = beforeSnap.layers.length;

  let appliedCount = 0;
  let totalPixels = 0;

  for (const amp of beforeSnap.detectedAmps) {
    const targetId = amp.manifestId || amp.ampId;
    const res = await generateGhostHints(targetId, doc.getSnapshot());
    if (res && res.cells && res.cells.length > 0) {
      doc.createLayer(`AMP/${amp.shortName || amp.name}`);
      doc.paint(res.cells.map((c) => ({ x: c.x, y: c.y, color: c.color || "#ffaa00" })));
      appliedCount++;
      totalPixels += res.cells.length;
    }
  }

  const afterSnap = doc.getSnapshot();
  assert.ok(appliedCount >= 5, "Should apply at least 5 active AMP passes (shadow, selout, volume, etc.)");
  assert.ok(totalPixels > 1000, "Should apply over 1000 hint recommendation pixels across passes");
  assert.equal(afterSnap.layers.length, initialLayerCount + appliedCount);
  assert.ok(afterSnap.layers.some((l) => l.name.includes("Drop Shadow")));
  assert.ok(afterSnap.layers.some((l) => l.name.includes("Selout")));
});

