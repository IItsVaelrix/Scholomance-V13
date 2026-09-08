/**
 * EDITOR COMMAND STACK
 *
 * Provides undo/redo for all PixelBrain editor operations (system 7 in the PDR).
 * Every mutation (paint, erase, fill, layer op) must be wrapped as a Command
 * for reversibility and provenance.
 *
 * Commands are deterministic.
 * Stack supports serialization for packet provenance / session restore.
 *
 * Usage in UI (via adapter):
 *   const stack = createCommandStack();
 *   stack.execute(createPaintCommand(grid, layerIndex, x, y, color));
 *   stack.undo();
 */

import { setCell, getCell, clearCell, floodFill } from './template-grid-engine.js';
import { phosphorylate } from './qbit-phosphorylation.js';
import { createPlane, clampPlane } from './build-plane.js';

export class Command {
  constructor({ doFn, undoFn, description = 'Unnamed operation', meta = {} }) {
    if (typeof doFn !== 'function' || typeof undoFn !== 'function') {
      throw new Error('Command requires doFn and undoFn');
    }
    this.doFn = doFn;
    this.undoFn = undoFn;
    this.description = description;
    this.meta = { ...meta, timestamp: Date.now() }; // EXEMPT — provenance metadata, not gameplay logic
    this.executed = false;
  }

  execute() {
    if (this.executed) return;
    const result = this.doFn();
    this.executed = true;
    return result;
  }

  undo() {
    if (!this.executed) return;
    const result = this.undoFn();
    this.executed = false;
    return result;
  }

  // For provenance in asset packets
  serialize() {
    return {
      description: this.description,
      meta: this.meta,
      // Note: full state (e.g. before/after cells) can be captured in meta by caller
    };
  }
}

export function createCommandStack(initialCommands = [], options = {}) {
  const maxHistory = Number.isInteger(options.maxHistory) && options.maxHistory > 0
    ? options.maxHistory
    : 20;
  const history = [...initialCommands].slice(-maxHistory);
  let pointer = history.length - 1;

  function enforceHistoryLimit() {
    if (history.length <= maxHistory) return;
    const overflow = history.length - maxHistory;
    history.splice(0, overflow);
    pointer = Math.max(-1, pointer - overflow);
  }

  // Active build plane (A2): the depth slice authoring targets. This is editor
  // session state, not document state — slice navigation stays out of the undo
  // history (matching VoxEdit, where moving the build slice is not an undo step).
  let activePlane = options.activePlane ?? createPlane();

  function truncateRedo() {
    if (pointer < history.length - 1) {
      history.length = pointer + 1;
    }
  }

  return {
    execute(cmd) {
      if (!(cmd instanceof Command)) {
        throw new Error('Must execute a Command instance');
      }
      truncateRedo();
      const result = cmd.execute();
      // PhosphorylationCommand signals rejection via result.committed === false
      // Rejected commands leave no undo footprint
      if (cmd instanceof PhosphorylationCommand && result && result.committed === false) {
        cmd.executed = false; // reset: command was not committed, undo must not fire
        return { result, description: cmd.description, meta: cmd.meta, rejected: true };
      }
      history.push(cmd);
      pointer = history.length - 1;
      enforceHistoryLimit();
      pointer = history.length - 1;
      return { result, description: cmd.description, meta: cmd.meta };
    },

    undo() {
      if (pointer < 0) return null;
      const cmd = history[pointer];
      const result = cmd.undo();
      pointer--;
      return { result, description: cmd.description, undone: true };
    },

    redo() {
      if (pointer >= history.length - 1) return null;
      pointer++;
      const cmd = history[pointer];
      const result = cmd.execute();
      return { result, description: cmd.description, redone: true };
    },

    // ── Active build plane (A2) ──────────────────────────────────────────
    getActivePlane() {
      return { ...activePlane };
    },

    // Set the active build plane. When `vol` is provided the plane index is
    // clamped to the volume's extent along its axis. Returns the resulting
    // plane. Not pushed onto the undo history (view/session state).
    setActivePlane(plane, vol) {
      activePlane = vol ? clampPlane(plane, vol) : { axis: plane.axis, index: plane.index };
      return { ...activePlane };
    },

    canUndo() {
      return pointer >= 0;
    },

    canRedo() {
      return pointer < history.length - 1;
    },

    getHistory() {
      return history.map((cmd, i) => ({
        description: cmd.description,
        meta: cmd.meta,
        isCurrent: i === pointer,
      }));
    },

    // For packet provenance: serialize the applied commands
    serializeForProvenance() {
      return history.slice(0, pointer + 1).map(cmd => cmd.serialize());
    },

    clear() {
      history.length = 0;
      pointer = -1;
    },

    // Load from serialized (for session restore)
    loadFromSerialized(serializedCommands, rehydrateFn) {
      this.clear();
      for (const s of serializedCommands) {
        const cmd = rehydrateFn(s); // caller provides rehydration logic (e.g. recreate PaintCommand)
        if (cmd) history.push(cmd);
      }
      enforceHistoryLimit();
      pointer = history.length - 1;
    }
  };
}

export class PaintCommand extends Command {
  constructor(grid, layerIndex, x, y, color, previousColor = null) {
    // Support both full grid and a bare layer (rehydration may pass null grid)
    const layer = grid?.layers ? grid.layers[layerIndex] : grid;
    const prev = previousColor ?? (layer ? (getCell(layer, x, y)?.color ?? null) : null);

    super({
      doFn: () => {
        if (!layer) return null;
        setCell(layer, x, y, color);
        return { x, y, color };
      },
      undoFn: () => {
        if (!layer) return null;
        if (prev === null) {
          clearCell(layer, x, y);
        } else {
          setCell(layer, x, y, prev);
        }
        return { x, y, color: prev };
      },
      description: `Paint ${color} at (${x},${y})`,
      meta: { type: 'paint', x, y, color, previousColor: prev, layerIndex }
    });
  }
}

export class LayerOpCommand extends Command {
  constructor(grid, opType, layerIndex, data = {}) {
    const layer = grid?.layers?.[layerIndex];
    if (!layer) {
      throw new Error(`LayerOpCommand: no layer at index ${layerIndex}`);
    }

    let prev = null;

    super({
      doFn: () => {
        if (opType === 'toggleVisible') {
          prev = layer.visible;
          layer.visible = !layer.visible;
        } else if (opType === 'setOpacity') {
          prev = layer.opacity;
          layer.opacity = Number(data.opacity);
        } else if (opType === 'setLocked') {
          prev = layer.locked;
          layer.locked = !!data.locked;
        } else {
          throw new Error(`LayerOpCommand: unsupported op "${opType}"`);
        }
        return { opType, layerIndex, data };
      },
      undoFn: () => {
        if (opType === 'toggleVisible') {
          layer.visible = prev;
        } else if (opType === 'setOpacity') {
          layer.opacity = prev;
        } else if (opType === 'setLocked') {
          layer.locked = prev;
        }
        return { opType, layerIndex, data, undone: true };
      },
      description: `Layer ${opType} on layer ${layerIndex}`,
      meta: { type: 'layer', opType, layerIndex, data }
    });
  }
}

export function createPaintCommand(grid, layerIndex, x, y, color, prevColor) {
  return new PaintCommand(grid, layerIndex, x, y, color, prevColor);
}

/**
 * Undoable flood fill. Snapshots the layer's cells before filling so undo
 * restores the exact prior state (fill previously bypassed the stack, which
 * made Ctrl+Z after a fill undo the wrong operation).
 */
export function createFillCommand(grid, layer, x, y, color) {
  let before = null;

  return new Command({
    doFn: () => {
      before = new Map(layer.cells);
      floodFill(grid, layer, x, y, color);
      return { x, y, color, cellCount: layer.cells.size };
    },
    undoFn: () => {
      if (!before) return null;
      layer.cells.clear();
      before.forEach((cell, key) => layer.cells.set(key, cell));
      before = null; // redo re-runs doFn, which re-snapshots
      return { x, y, color, undone: true };
    },
    description: `Fill ${color} from (${x},${y})`,
    meta: { type: 'fill', x, y, color },
  });
}

// Rehydrator example for loadFromSerialized (used in adapter/UI)
export function rehydrateEditorCommand(serialized) {
  if (!serialized || !serialized.meta) return null;
  const { type } = serialized.meta;
  if (type === 'paint') {
    // In real use, grid would be passed or resolved
    return new PaintCommand(null, serialized.meta.layerIndex, serialized.meta.x, serialized.meta.y, serialized.meta.color, serialized.meta.previousColor);
  }
  // Extend for other types
  return null;
}

export class PhosphorylationCommand extends Command {
  constructor(layer, x, y, kinase, previousColor = null) {
    let resolvedColor = null;

    super({
      doFn: () => {
        if (resolvedColor !== null) {
          // redo: replay stored color, never re-run kinase
          setCell(layer, x, y, resolvedColor);
          return { committed: true, color: resolvedColor };
        }
        const result = phosphorylate(layer, x, y, kinase);
        if (result.committed) resolvedColor = result.color;
        return result;
      },
      undoFn: () => {
        if (previousColor === null) {
          clearCell(layer, x, y);
        } else {
          setCell(layer, x, y, previousColor);
        }
        return { x, y, color: previousColor };
      },
      description: `Phosphorylate (${x},${y})`,
      meta: { type: 'phosphorylation', x, y },
    });
  }
}

export function createPhosphorylationCommand(layer, x, y, kinase, previousColor = null) {
  return new PhosphorylationCommand(layer, x, y, kinase, previousColor);
}
