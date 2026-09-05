/**
 * QA Validation: PixelBrain Editor Command Stack
 *
 * Regression tests for the savage-audit findings on the editor undo system:
 * - Flood fill must be undoable (it previously bypassed the command stack,
 *   so Ctrl+Z after a fill silently undid the previous paint stroke instead).
 * - LayerOpCommand must actually mutate layers (it was a placeholder whose
 *   doFn/undoFn returned objects and changed nothing).
 * - PaintCommand must round-trip through the engine's "x,y" cell contract.
 */

import { describe, it, expect } from 'vitest';
import {
  createTemplateGrid,
  setCell,
  getCell,
  GRID_TYPES,
} from '../../../codex/core/pixelbrain/template-grid-engine.js';
import {
  createCommandStack,
  createPaintCommand,
  createFillCommand,
  LayerOpCommand,
} from '../../../codex/core/pixelbrain/editor-command-stack.js';
import { createPlane } from '../../../codex/core/pixelbrain/build-plane.js';

function makeGrid() {
  return createTemplateGrid({
    width: 16,
    height: 16,
    cellSize: 1,
    gridType: GRID_TYPES.RECTANGULAR,
  });
}

describe('PaintCommand', () => {
  it('paints a cell and undo removes it when the cell was empty', () => {
    const grid = makeGrid();
    const layer = grid.layers[0];
    const stack = createCommandStack();

    stack.execute(createPaintCommand(grid, 0, 3, 4, '#FF0000', null));
    expect(getCell(layer, 3, 4)?.color).toBe('#FF0000');

    stack.undo();
    expect(getCell(layer, 3, 4)).toBeUndefined();
  });

  it('undo restores the previous color when the cell was occupied', () => {
    const grid = makeGrid();
    const layer = grid.layers[0];
    setCell(layer, 3, 4, '#00FF00');
    const stack = createCommandStack();

    stack.execute(createPaintCommand(grid, 0, 3, 4, '#FF0000', '#00FF00'));
    expect(getCell(layer, 3, 4)?.color).toBe('#FF0000');

    stack.undo();
    expect(getCell(layer, 3, 4)?.color).toBe('#00FF00');
  });
});

describe('command history retention', () => {
  it('retains at most 20 undo snapshots by default', () => {
    const grid = makeGrid();
    const stack = createCommandStack();

    for (let index = 0; index < 25; index += 1) {
      stack.execute(createPaintCommand(grid, 0, index % 16, Math.floor(index / 16), '#FF0000'));
    }

    expect(stack.getHistory()).toHaveLength(20);
    for (let index = 0; index < 20; index += 1) stack.undo();
    expect(stack.canUndo()).toBe(false);
  });
});

describe('createFillCommand', () => {
  it('fills the empty region and undo restores the exact prior state', () => {
    const grid = makeGrid();
    const layer = grid.layers[0];
    // A wall splitting the canvas, plus one pre-existing colored cell inside the fill region
    for (let y = 0; y < 16; y++) setCell(layer, 8, y, '#FFFFFF');
    setCell(layer, 2, 2, '#0000FF');
    const before = layer.cells.size;

    const stack = createCommandStack();
    stack.execute(createFillCommand(grid, layer, 1, 1, '#FF00FF'));

    // Fill flooded the empty left region but not past the wall, not the blue cell
    expect(getCell(layer, 0, 0)?.color).toBe('#FF00FF');
    expect(getCell(layer, 7, 15)?.color).toBe('#FF00FF');
    expect(getCell(layer, 9, 0)).toBeUndefined();
    expect(getCell(layer, 2, 2)?.color).toBe('#0000FF');
    expect(layer.cells.size).toBeGreaterThan(before);

    stack.undo();
    expect(layer.cells.size).toBe(before);
    expect(getCell(layer, 0, 0)).toBeUndefined();
    expect(getCell(layer, 2, 2)?.color).toBe('#0000FF');
    expect(getCell(layer, 8, 5)?.color).toBe('#FFFFFF');
  });

  it('redo re-applies the fill after undo', () => {
    const grid = makeGrid();
    const layer = grid.layers[0];
    const stack = createCommandStack();

    stack.execute(createFillCommand(grid, layer, 0, 0, '#123456'));
    const filledCount = layer.cells.size;
    expect(filledCount).toBeGreaterThan(0);

    stack.undo();
    expect(layer.cells.size).toBe(0);

    stack.redo();
    expect(layer.cells.size).toBe(filledCount);
    expect(getCell(layer, 0, 0)?.color).toBe('#123456');
  });
});

describe('LayerOpCommand', () => {
  it('toggleVisible flips visibility and undo flips it back', () => {
    const grid = makeGrid();
    const stack = createCommandStack();
    expect(grid.layers[0].visible).toBe(true);

    stack.execute(new LayerOpCommand(grid, 'toggleVisible', 0));
    expect(grid.layers[0].visible).toBe(false);

    stack.undo();
    expect(grid.layers[0].visible).toBe(true);
  });

  it('setOpacity applies the new value and undo restores the old one', () => {
    const grid = makeGrid();
    const stack = createCommandStack();
    grid.layers[0].opacity = 1;

    stack.execute(new LayerOpCommand(grid, 'setOpacity', 0, { opacity: 0.4 }));
    expect(grid.layers[0].opacity).toBe(0.4);

    stack.undo();
    expect(grid.layers[0].opacity).toBe(1);
  });

  it('setLocked applies and undoes the lock state', () => {
    const grid = makeGrid();
    const stack = createCommandStack();
    expect(grid.layers[0].locked).toBe(false);

    stack.execute(new LayerOpCommand(grid, 'setLocked', 0, { locked: true }));
    expect(grid.layers[0].locked).toBe(true);

    stack.undo();
    expect(grid.layers[0].locked).toBe(false);
  });
});

describe('active build plane (A2)', () => {
  const vol = { width: 8, height: 6, depth: 4 };

  it('defaults to the z-plane at index 0', () => {
    const stack = createCommandStack();
    expect(stack.getActivePlane()).toEqual({ axis: 'z', index: 0 });
  });

  it('accepts an initial plane via options', () => {
    const stack = createCommandStack([], { activePlane: createPlane('x', 2) });
    expect(stack.getActivePlane()).toEqual({ axis: 'x', index: 2 });
  });

  it('setActivePlane updates the session plane', () => {
    const stack = createCommandStack();
    const result = stack.setActivePlane(createPlane('y', 3));
    expect(result).toEqual({ axis: 'y', index: 3 });
    expect(stack.getActivePlane()).toEqual({ axis: 'y', index: 3 });
  });

  it('clamps the plane to the volume when one is given', () => {
    const stack = createCommandStack();
    stack.setActivePlane(createPlane('z', 99), vol);
    expect(stack.getActivePlane()).toEqual({ axis: 'z', index: 3 });
  });

  it('slice navigation is not pushed onto the undo history', () => {
    const grid = makeGrid();
    const stack = createCommandStack();
    stack.execute(createPaintCommand(grid, 0, 2, 3, '#ff0000'));
    stack.setActivePlane(createPlane('z', 2));

    expect(stack.canUndo()).toBe(true);
    stack.undo(); // must undo the paint, not the plane move
    expect(getCell(grid.layers[0], 2, 3)).toBeUndefined();
    expect(stack.canUndo()).toBe(false);
  });
});
