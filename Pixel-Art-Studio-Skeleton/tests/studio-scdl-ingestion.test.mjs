import assert from "node:assert/strict";
import test from "node:test";

import { compileSCDL as compileSourceScdl } from "../../codex/core/pixelbrain/scdl/scdl.compiler.js";
import { compileSCDL as compileStudioScdl } from "../src/lib/pixelbrain/scdl/scdl.compiler.js";
import { createDocumentController } from "../src/lib/pixelbrain/studio-document.js";

const VALID_SCDL = `asset studio_test canvas 8x6
palette {
  ink = #223344
  glow = #88ccff
}
part body material source {
  cell 1 2 ink
  cell 2 2 ink
}
part gleam material source {
  cell 3 1 glow
}`;

test("SCDL ingestion compiles source into editable part layers", async () => {
  const authoring = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  assert.equal(typeof authoring.ingestScdlIntoDocument, "function");

  const doc = createDocumentController({ width: 4, height: 4 });
  const result = authoring.ingestScdlIntoDocument(doc, VALID_SCDL);

  assert.equal(result.ok, true);
  assert.equal(result.assetId, "studio_test");
  assert.equal(result.snapshot.width, 8);
  assert.equal(result.snapshot.height, 6);
  assert.deepEqual(result.snapshot.layers.map((layer) => layer.name), ["00_Reference", "body", "gleam"]);
  assert.deepEqual(
    result.snapshot.layers.slice(1).map((layer) => layer.cells.map(({ x, y, color }) => ({ x, y, color }))),
    [
      [
        { x: 1, y: 2, color: "#223344" },
        { x: 2, y: 2, color: "#223344" },
      ],
      [{ x: 3, y: 1, color: "#88ccff" }],
    ],
  );
  assert.equal(result.receipt.contract, "PB-STUDIO-SCDL-INGEST-v1");
  assert.equal(result.receipt.coordinateCount, 3);
});

test("invalid SCDL returns line diagnostics without changing the document", async () => {
  const { ingestScdlIntoDocument } = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  doc.paint([{ x: 1, y: 1, color: "#abcdef" }]);
  const before = doc.getSnapshot();

  const result = ingestScdlIntoDocument(doc, "asset broken canvas 8x8\npart ink {\n  mystery 1 2\n}");

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, before);
  assert.equal(doc.getSnapshot(), before);
  assert.ok(result.diagnostics.length > 0);
  assert.equal(typeof result.diagnostics[0].line, "number");
  assert.match(result.diagnostics[0].message, /unknown|unsupported/i);
});

test("animated SCDL is refused instead of silently dropping frames", async () => {
  const { ingestScdlIntoDocument } = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  const before = doc.getSnapshot();
  const animated = `asset pulse canvas 4x4
part core material source {
  cell 1 1 #ffffff
}
loop pulse duration 100
frame 1 "bright" {
  part core material source {
    cell 2 1 #ffffff
  }
}`;

  const result = ingestScdlIntoDocument(doc, animated);

  assert.equal(result.ok, false);
  assert.equal(doc.getSnapshot(), before);
  assert.equal(result.diagnostics[0].code, "PB-STUDIO-SCDL-FRAMES");
});

test("static scene-graph SCDL is rendered into an editable layer", async () => {
  const { ingestScdlIntoDocument } = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  const source = `asset graph_sprite canvas 8x8
palette { ink = #445566 }
def dot {
  part pixel material source { cell 0 0 ink }
}
instance dot at 2 3`;

  const result = ingestScdlIntoDocument(doc, source);

  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.layers.map((layer) => layer.name), ["00_Reference", "Scene Graph"]);
  assert.deepEqual(result.snapshot.layers[1].cells, [{ x: 2, y: 3, color: "#445566" }]);
});

test("standalone compiler matches canonical SCDL packet and error semantics", () => {
  const sourceValid = compileSourceScdl(VALID_SCDL);
  const studioValid = compileStudioScdl(VALID_SCDL);
  assert.deepEqual(studioValid.packet, sourceValid.packet);

  const invalid = "asset broken canvas 8x8\npart ink {\n  mystery 1 2\n}";
  const sourceInvalid = compileSourceScdl(invalid);
  const studioInvalid = compileStudioScdl(invalid);
  const simplify = (result) =>
    result.errors.map(({ code, label, severity, message, loc }) => ({ code, label, severity, message, loc }));
  assert.deepEqual(simplify(studioInvalid), simplify(sourceInvalid));
});

const V2_EXACT_ORB = `SCDL 2
ASSET exact_orb
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 128 GENERATED_SHAPES 2 RASTER_CELLS 81

CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $spark (PIXEL AT (VEC2 (PX 1) (PX 1)))
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))

LAYER ink ORDER 10 {
  PAINT $orb FILL $ink RASTER MIDPOINT
  PAINT $spark FILL #FFFFFF RASTER CENTER
}
`;

const V2_MULTI_LAYER = `SCDL 2
ASSET dual_layer
CANVAS WIDTH 8 HEIGHT 8
BUDGET INSTRUCTIONS 128 GENERATED_SHAPES 2 RASTER_CELLS 64

SHAPE $bg (PIXEL AT (VEC2 (PX 0) (PX 0)))
SHAPE $fg (PIXEL AT (VEC2 (PX 1) (PX 1)))

LAYER background ORDER 0 {
  PAINT $bg FILL #112233 RASTER CENTER
}

LAYER foreground ORDER 10 {
  PAINT $fg FILL #AABBCC RASTER CENTER
}
`;

test("SCDL v2 ingestion compiles source into editable part layers", async () => {
  const authoring = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  const result = authoring.ingestScdlIntoDocument(doc, V2_EXACT_ORB);

  assert.equal(result.ok, true);
  assert.equal(result.assetId, "exact_orb");
  assert.equal(result.snapshot.width, 9);
  assert.equal(result.snapshot.height, 9);
  assert.deepEqual(result.snapshot.layers.map((layer) => layer.name), ["00_Reference", "ink"]);
  assert.ok(result.snapshot.layers[1].cells.length > 0);
  assert.equal(result.receipt.contract, "PB-STUDIO-SCDL-INGEST-v1");
  assert.equal(result.receipt.coordinateCount, result.snapshot.layers[1].cells.length);
  assert.equal(result.receipt.partCount, 1);
});

test("SCDL v2 multi-layer source creates distinct named layers in document", async () => {
  const authoring = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  const result = authoring.ingestScdlIntoDocument(doc, V2_MULTI_LAYER);

  assert.equal(result.ok, true);
  assert.equal(result.assetId, "dual_layer");
  assert.deepEqual(result.snapshot.layers.map((layer) => layer.name), ["00_Reference", "background", "foreground"]);
  assert.deepEqual(result.snapshot.layers[1].cells, [{ x: 0, y: 0, color: "#112233" }]);
  assert.deepEqual(result.snapshot.layers[2].cells, [{ x: 1, y: 1, color: "#aabbcc" }]);
  assert.equal(result.receipt.partCount, 2);
});

test("SCDL v2 invalid syntax preserves current document and returns diagnostics", async () => {
  const authoring = await import("../src/lib/pixelbrain/studio-authoring-facade.js");
  const doc = createDocumentController({ width: 4, height: 4 });
  const before = doc.getSnapshot();
  const invalidV2 = `SCDL 2\nASSET broken_v2\nCANVAS WIDTH 8 HEIGHT 8\nINVALID_STUFF`;
  const result = authoring.ingestScdlIntoDocument(doc, invalidV2);

  assert.equal(result.ok, false);
  assert.equal(doc.getSnapshot(), before);
  assert.ok(result.diagnostics.length > 0);
  assert.ok(result.diagnostics[0].line >= 1);
  assert.ok(result.diagnostics[0].col >= 1);
});

test("standalone compiler matches canonical SCDL v2 compilation and packet", () => {
  const sourceValid = compileSourceScdl(V2_EXACT_ORB);
  const studioValid = compileStudioScdl(V2_EXACT_ORB);
  assert.equal(studioValid.ok, true);
  assert.equal(sourceValid.ok, true);
  assert.deepEqual(studioValid.packet, sourceValid.packet);
  assert.deepEqual(studioValid.bytecode, sourceValid.bytecode);
});
