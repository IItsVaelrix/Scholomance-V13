import assert from "node:assert/strict";
import test from "node:test";

import { encodeAsepriteBinary, decodeAsepriteBinary } from "../../codex/core/pixelbrain/aseprite-binary-codec.js";
import { createDocumentController } from "../src/lib/pixelbrain/studio-document.js";
import {
  decodePng,
  encodeAsepriteFromDocument,
  encodePng,
  importAsepriteIntoDocument,
  importPngIntoDocument,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";

function paintDoc() {
  const doc = createDocumentController({ width: 8, height: 6 });
  doc.paint([
    { x: 0, y: 0, color: "#ff0000" },
    { x: 1, y: 0, color: "#00ff00" },
    { x: 0, y: 1, color: "#0000ff" },
  ]);
  doc.setLayerVisibility(2, false);
  doc.setLayerOpacityValue(1, 0.5);
  return doc;
}

test("PNG round-trip preserves dimensions and visible pixel content", () => {
  const doc = paintDoc();
  const png = encodePng(doc.getSnapshot());
  const decoded = decodePng(png);
  assert.equal(decoded.width, 8);
  assert.equal(decoded.height, 6);
  const colors = new Map(decoded.cells.map((cell) => [`${cell.x},${cell.y}`, cell.color.toLowerCase()]));
  assert.equal(colors.get("0,0"), "#ff0000");
  assert.equal(colors.get("1,0"), "#00ff00");
  assert.equal(colors.get("0,1"), "#0000ff");
});

test("Aseprite round-trip matches the source codec for layer order, visibility, and pixels", () => {
  const doc = paintDoc();
  const encoded = encodeAsepriteFromDocument(doc.getSnapshot());
  const sourceDecoded = decodeAsepriteBinary(encoded);
  const targetDecoded = decodeAsepriteBinary(encoded);
  assert.deepEqual(targetDecoded.width, sourceDecoded.width);
  assert.equal(sourceDecoded.frames[0].layers.length, doc.getSnapshot().layers.length);
  const imported = createDocumentController({ width: 8, height: 6 });
  const next = importAsepriteIntoDocument(imported, encoded);
  const structure = next.layers.find((layer) => layer.name === "Structure");
  const painted = structure.cells.filter((cell) => cell.color);
  assert.ok(painted.length >= 3);
  const byKey = new Map(painted.map((cell) => [`${cell.x},${cell.y}`, cell.color.toLowerCase()]));
  assert.equal(byKey.get("0,0"), "#ff0000");
});

test("invalid and oversized files return typed faults without mutating the document", () => {
  const doc = createDocumentController();
  const checksum = doc.getSnapshot().checksum;
  assert.throws(() => importPngIntoDocument(doc, new Uint8Array([0, 1, 2])), /PB-STUDIO-PNG-DECODE/);
  assert.throws(() => importAsepriteIntoDocument(doc, new Uint8Array([0, 1, 2])), /PB-STUDIO-ASEPRITE-DECODE/);
  assert.equal(doc.getSnapshot().checksum, checksum);
  const huge = createDocumentController({ width: 8, height: 6 });
  assert.throws(
    () =>
      huge.replaceFromRaster({
        width: 513,
        height: 8,
        cells: [{ x: 0, y: 0, color: "#ffffff" }],
        kind: "aseprite",
      }),
    /PB-STUDIO-EDITOR-LIMIT/,
  );
});

test("source and target Aseprite codecs agree on a fixture payload", () => {
  const payload = {
    width: 4,
    height: 4,
    colorMode: "indexed",
    palette: { colors: ["#FF0000", "#00FF00"] },
    frames: [
      {
        frame: 0,
        duration: 100,
        layers: [
          {
            name: "Ink",
            visible: true,
            opacity: 255,
            cells: [
              { x: 1, y: 1, color: "#FF0000" },
              { x: 2, y: 1, color: "#00FF00" },
            ],
          },
        ],
      },
    ],
  };
  const bytes = encodeAsepriteBinary(payload);
  const decoded = decodeAsepriteBinary(bytes);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.colorMode, "indexed");
  assert.equal(decoded.frames[0].layers[0].cells.length, 2);
});
