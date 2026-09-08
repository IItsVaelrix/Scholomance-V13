import assert from "node:assert/strict";
import test from "node:test";

import * as sourceGrid from "../../codex/core/pixelbrain/template-grid-engine.js";
import * as targetGrid from "../src/lib/pixelbrain/template-grid-engine.js";
import {
  createFillCommand as sourceFill,
  createPaintCommand as sourcePaint,
  createCommandStack as sourceStack,
} from "../../codex/core/pixelbrain/editor-command-stack.js";
import {
  createFillCommand as targetFill,
  createPaintCommand as targetPaint,
  createCommandStack as targetStack,
} from "../src/lib/pixelbrain/editor-command-stack.js";
import { createDocumentController } from "../src/lib/pixelbrain/studio-document.js";
import {
  flattenDocumentCells,
  renameLayer,
  reorderDocumentLayers,
  setLayerLock,
  setLayerOpacityValue,
  setLayerVisibility,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";

function makePair(width = 16, height = 12) {
  const source = sourceGrid.createTemplateGrid({
    width,
    height,
    cellSize: 1,
    gridType: sourceGrid.GRID_TYPES.RECTANGULAR,
  });
  const target = targetGrid.createTemplateGrid({
    width,
    height,
    cellSize: 1,
    gridType: targetGrid.GRID_TYPES.RECTANGULAR,
  });
  return { source, target };
}

test("target template-grid-engine matches source paint, erase, fill, and layer ops", () => {
  const { source, target } = makePair();
  sourceGrid.setCell(source.layers[0], 2, 3, "#ff0000");
  targetGrid.setCell(target.layers[0], 2, 3, "#ff0000");
  assert.deepEqual(targetGrid.getCell(target.layers[0], 2, 3), sourceGrid.getCell(source.layers[0], 2, 3));

  sourceGrid.setCell(source.layers[0], 3, 3, "#ff0000");
  targetGrid.setCell(target.layers[0], 3, 3, "#ff0000");
  sourceGrid.floodFill(source, source.layers[0], 2, 3, "#00ff00");
  targetGrid.floodFill(target, target.layers[0], 2, 3, "#00ff00");
  assert.equal(targetGrid.getCell(target.layers[0], 3, 3).color, "#00ff00");
  assert.equal(sourceGrid.getCell(source.layers[0], 3, 3).color, "#00ff00");

  sourceGrid.clearCell(source.layers[0], 2, 3);
  targetGrid.clearCell(target.layers[0], 2, 3);
  assert.equal(targetGrid.getCell(target.layers[0], 2, 3), undefined);

  const extra = targetGrid.createLayer("Shading");
  target.layers.push(extra);
  targetGrid.setLayerVisible(target, 1, false);
  targetGrid.setLayerLocked(target, 1, true);
  targetGrid.setLayerOpacity(target, 1, 0.5);
  assert.equal(target.layers[1].visible, false);
  assert.equal(target.layers[1].locked, true);
  assert.equal(target.layers[1].opacity, 0.5);
});

test("command stacks undo paint and fill identically to source", () => {
  const { source, target } = makePair();
  const sourceCommands = sourceStack();
  const targetCommands = targetStack();
  sourceCommands.execute(sourcePaint(source, 0, 1, 1, "#abcabc"));
  targetCommands.execute(targetPaint(target, 0, 1, 1, "#abcabc"));
  sourceCommands.execute(sourceFill(source, source.layers[0], 1, 1, "#ffffff"));
  targetCommands.execute(targetFill(target, target.layers[0], 1, 1, "#ffffff"));
  assert.equal(targetGrid.getCell(target.layers[0], 1, 1).color, "#ffffff");
  targetCommands.undo();
  sourceCommands.undo();
  assert.equal(targetGrid.getCell(target.layers[0], 1, 1).color, "#abcabc");
  assert.equal(sourceGrid.getCell(source.layers[0], 1, 1).color, "#abcabc");
});

test("document layer operations are undoable and protect the reference layer", () => {
  const doc = createDocumentController();
  const created = doc.createLayer("Detail");
  assert.equal(created.layers.at(-1).name, "Detail");
  const renamed = renameLayer(doc, created.layers.length - 1, "Ink");
  assert.equal(renamed.layers.at(-1).name, "Ink");
  setLayerVisibility(doc, 2, false);
  setLayerLock(doc, 2, true);
  setLayerOpacityValue(doc, 2, 0.25);
  const moved = reorderDocumentLayers(doc, 2, 3);
  assert.equal(moved.layers[3].name, "Energy");
  assert.throws(() => doc.deleteLayer(0), /PB-STUDIO-EDITOR-INPUT/);
  const flattened = flattenDocumentCells(doc);
  assert.ok(Array.isArray(flattened.cells));
  doc.undo();
  doc.undo();
  assert.equal(doc.getSnapshot().layers[2].name, "Energy");
});
