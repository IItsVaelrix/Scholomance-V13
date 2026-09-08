import { Command, createCommandStack, createFillCommand } from "./editor-command-stack.js";
import { createStudioAssetSnapshot } from "./studio-facade.js";
import {
  ASEPRITE_IMPORT_LIMITS,
  PIXELBRAIN_GRID_LIMITS,
  applySymmetry,
  clearCell,
  createLayer,
  createTemplateGrid,
  getCell,
  getFlattenedPreviewCells,
  reorderLayers,
  setCell,
  setLayerLocked,
  setLayerOpacity,
  setLayerVisible,
} from "./template-grid-engine.js";
import { decodePngToRgba, parseHexColor, rgbaToCells } from "./studio-png.js";

export const COMMAND_HISTORY_LIMIT = 50;
export const EVENT_HISTORY_LIMIT = 40;
export const STUDIO_PALETTE_LIMIT = 32;

export const DEFAULT_LAYER_VOCABULARY = Object.freeze([
  "00_Reference",
  "Structure",
  "Energy",
  "Focal",
  "Shading",
  "Glow",
  "Final",
]);

export const STUDIO_FAULT_FAMILIES = Object.freeze([
  "PB-STUDIO-EDITOR-INPUT",
  "PB-STUDIO-EDITOR-LIMIT",
  "PB-STUDIO-ASEPRITE-DECODE",
  "PB-STUDIO-ASEPRITE-ENCODE",
  "PB-STUDIO-PNG-DECODE",
  "PB-STUDIO-SCDL-COMPILE",
  "PB-STUDIO-FORGE-GATE",
  "PB-STUDIO-FORGE-CAPABILITY",
  "PB-STUDIO-SHADER-COMPILE",
  "PB-STUDIO-WEBGL-UNAVAILABLE",
  "PB-STUDIO-EXPORT",
  "PB-STUDIO-LOCAL-STORE",
  "PB-STUDIO-STALE-REVISION",
]);

function throwFault(family, message, details = {}) {
  const error = new Error(`${family} · ${message}`);
  error.fault = createStudioFault(family, message, details);
  throw error;
}

export function createStudioFault(family, message, details = {}) {
  if (!STUDIO_FAULT_FAMILIES.includes(family)) {
    throw new Error(`Unknown fault family ${family}`);
  }
  return Object.freeze({
    family,
    message: String(message || ""),
    operation: details.operation ?? null,
    revision: details.revision ?? null,
    details: Object.freeze({ ...details }),
  });
}

export function normalizeHex(color) {
  return parseHexColor(color).hex;
}

function rgbTuple(hex) {
  const parsed = parseHexColor(hex);
  return [parsed.r, parsed.g, parsed.b];
}

function colorDistance(a, b) {
  const left = rgbTuple(a);
  const right = rgbTuple(b);
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2;
}

function luminance(hex) {
  const [r, g, b] = rgbTuple(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function reduceIndexedPalette(colors, limit = STUDIO_PALETTE_LIMIT) {
  const unique = [];
  const seen = new Set();
  for (const color of colors || []) {
    if (!color) continue;
    const hex = normalizeHex(color);
    if (seen.has(hex)) continue;
    seen.add(hex);
    unique.push(hex);
  }
  if (unique.length <= limit) {
    return Object.freeze({
      palette: Object.freeze([...unique]),
      reduced: false,
      before: unique.length,
      after: unique.length,
      map: Object.freeze(Object.fromEntries(unique.map((color) => [color, color]))),
    });
  }
  const sorted = [...unique].sort((a, b) => luminance(a) - luminance(b) || a.localeCompare(b));
  const selected = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (sorted.length - 1)) / Math.max(1, limit - 1));
    const color = sorted[sourceIndex];
    if (!selected.includes(color)) selected.push(color);
  }
  for (const color of sorted) {
    if (selected.length >= limit) break;
    if (!selected.includes(color)) selected.push(color);
  }
  const map = {};
  for (const color of unique) {
    let best = selected[0];
    let bestDistance = Infinity;
    for (const candidate of selected) {
      const distance = colorDistance(color, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    map[color] = best;
  }
  return Object.freeze({
    palette: Object.freeze(selected.slice(0, limit)),
    reduced: true,
    before: unique.length,
    after: Math.min(selected.length, limit),
    map: Object.freeze(map),
  });
}

function layerCells(layer) {
  if (!layer) return [];
  if (layer.cells instanceof Map) return [...layer.cells.values()].map((cell) => ({ ...cell }));
  return Array.isArray(layer.cells) ? layer.cells.map((cell) => ({ ...cell })) : [];
}

function cellsToMap(cells) {
  const map = new Map();
  for (const cell of cells || []) {
    map.set(`${cell.x},${cell.y}`, { ...cell, x: cell.x, y: cell.y, color: cell.color });
  }
  return map;
}

function countLayerCells(layer) {
  if (!layer?.cells) return 0;
  if (layer.cells instanceof Map) return layer.cells.size;
  return Array.isArray(layer.cells) ? layer.cells.length : 0;
}

export function countDocumentCells(snapshot) {
  return (snapshot?.layers || []).reduce((sum, layer) => sum + countLayerCells(layer), 0);
}

function collectColors(grid) {
  const colors = [...(grid.palette || [])];
  for (const layer of grid.layers || []) {
    for (const cell of layerCells(layer)) {
      if (cell?.color) colors.push(cell.color);
    }
  }
  return colors;
}

function freezeSnapshot(grid, extra = {}) {
  const snapshot = createStudioAssetSnapshot(grid, extra.source || "studio-document");
  return Object.freeze({
    ...snapshot,
    revision: extra.revision ?? 0,
    activeLayerIndex: extra.activeLayerIndex ?? grid.currentLayer ?? 1,
    tool: extra.tool ?? "paint",
    zoom: extra.zoom ?? 8,
    fgColor: extra.fgColor ?? "#c9a227",
    bgColor: extra.bgColor ?? "#0c0e0b",
    panX: extra.panX ?? 0,
    panY: extra.panY ?? 0,
    detectedAmps: grid.detectedAmps ? Object.freeze([...grid.detectedAmps]) : Object.freeze([]),
    activeAmpIds: grid.activeAmpIds ? Object.freeze([...grid.activeAmpIds]) : Object.freeze([]),
    primaryDetectedAmp: grid.primaryDetectedAmp || null,
    detectedShaders: grid.detectedShaders ? Object.freeze([...grid.detectedShaders]) : Object.freeze([]),
    activeShaderIds: grid.activeShaderIds ? Object.freeze([...grid.activeShaderIds]) : Object.freeze([]),
    scdlSource: grid.scdlSource || null,
    pipeline: grid.pipeline || null,
  });
}

function createAuthoringGrid(options = {}) {
  const width = options.width ?? 160;
  const height = options.height ?? 144;
  if (width > PIXELBRAIN_GRID_LIMITS.hardMaxWidth || height > PIXELBRAIN_GRID_LIMITS.hardMaxHeight) {
    throwFault("PB-STUDIO-EDITOR-LIMIT", "document exceeds hard dimension limit", {
      width,
      height,
      limit: PIXELBRAIN_GRID_LIMITS.hardMaxWidth,
    });
  }
  const grid = createTemplateGrid({
    width,
    height,
    cellSize: options.cellSize ?? 1,
    gridType: options.gridType ?? "rectangular",
  });
  grid.layers = [];
  grid.frames = [{ duration: 100, layers: [] }];
  for (const name of DEFAULT_LAYER_VOCABULARY) {
    const layer = createLayer(name);
    if (name === "00_Reference") {
      layer.locked = true;
      layer.protected = true;
    }
    grid.layers.push(layer);
    grid.frames[0].layers.push(layer);
  }
  grid.currentLayer = 1;
  grid.palette = [];
  return grid;
}

function createStrokeCommand(grid, layerIndex, changes, previousPalette, nextPalette) {
  const layer = grid.layers[layerIndex];
  return new Command({
    doFn: () => {
      for (const change of changes) {
        if (change.color == null) clearCell(layer, change.x, change.y);
        else setCell(layer, change.x, change.y, change.color);
      }
      if (nextPalette) grid.palette = [...nextPalette];
      return { count: changes.length };
    },
    undoFn: () => {
      for (const change of changes) {
        if (change.previousColor == null) clearCell(layer, change.x, change.y);
        else setCell(layer, change.x, change.y, change.previousColor);
      }
      if (previousPalette) grid.palette = [...previousPalette];
      return { count: changes.length, undone: true };
    },
    description: `Stroke ${changes.length} cells`,
    meta: { type: "stroke", layerIndex, count: changes.length },
  });
}

function createLayerStateCommand(grid, description, mutator, restore) {
  return new Command({
    doFn: () => {
      mutator();
      return true;
    },
    undoFn: () => {
      restore();
      return true;
    },
    description,
    meta: { type: "layer-state" },
  });
}

export function cellsFromOutput(output) {
  if (Array.isArray(output)) return output.map((cell) => ({ ...cell }));
  if (!output || typeof output !== "object") return [];
  if (Array.isArray(output.coordinates)) return output.coordinates.map((cell) => ({ ...cell }));
  if (Array.isArray(output.cells)) return output.cells.map((cell) => ({ ...cell }));
  if (Array.isArray(output.layers)) {
    return output.layers.flatMap((layer) => layerCells(layer));
  }
  if (output.field && output.palette && output.width && output.height) {
    const cells = [];
    const field = output.field;
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        const rank = field[y * output.width + x];
        if (rank == null || rank < 0) continue;
        const color = output.palette[rank];
        if (color) cells.push({ x, y, color });
      }
    }
    return cells;
  }
  return [];
}

export function createDocumentController(options = {}) {
  const historyLimit = options.historyLimit ?? COMMAND_HISTORY_LIMIT;
  const eventLimit = options.eventLimit ?? EVENT_HISTORY_LIMIT;
  const grid = options.grid ?? createAuthoringGrid(options);
  const stack = createCommandStack([], { maxHistory: historyLimit });
  let revision = 0;
  let tool = "paint";
  let zoom = options.zoom ?? 8;
  let fgColor = "#c9a227";
  let bgColor = "#0c0e0b";
  let panX = 0;
  let panY = 0;
  let snapshot = freezeSnapshot(grid, {
    revision,
    activeLayerIndex: grid.currentLayer,
    tool,
    zoom,
    fgColor,
    bgColor,
    panX,
    panY,
  });
  const events = [];
  const faults = [];
  const receipts = [];

  function currentExtra() {
    return {
      revision,
      activeLayerIndex: grid.currentLayer,
      tool,
      zoom,
      fgColor,
      bgColor,
      panX,
      panY,
    };
  }

  function publish(kind, detail = {}) {
    events.unshift(
      Object.freeze({
        kind,
        revision,
        at: `rev-${revision}`,
        detail: Object.freeze({ ...detail }),
      }),
    );
    if (events.length > eventLimit) events.length = eventLimit;
  }

  function commit(kind, detail = {}) {
    snapshot = freezeSnapshot(grid, currentExtra());
    publish(kind, detail);
    return snapshot;
  }

  function activeLayer() {
    const layer = grid.layers[grid.currentLayer];
    if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "no active layer");
    return layer;
  }

  function assertUnlocked(layerIndex = grid.currentLayer) {
    const layer = grid.layers[layerIndex];
    if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
    if (layer.locked) throwFault("PB-STUDIO-EDITOR-INPUT", `layer ${layer.name} is locked`);
    return layer;
  }

  function absorbColor(color) {
    if (!color) return null;
    const hex = normalizeHex(color);
    const reduction = reduceIndexedPalette([...(grid.palette || []), hex], STUDIO_PALETTE_LIMIT);
    if (!reduction.reduced && !grid.palette.includes(hex)) grid.palette = [...grid.palette, hex];
    else if (reduction.reduced) grid.palette = [...reduction.palette];
    return reduction.map[hex] || hex;
  }

  function expandPoints(cells) {
    const mapped = cells.map((cell) => ({
      ...cell,
      x: Math.round(cell.x),
      y: Math.round(cell.y),
    }));
    return applySymmetry(mapped, grid).map((cell) => ({
      ...cell,
      x: Math.round(cell.x),
      y: Math.round(cell.y),
    }));
  }

  function paintCells(cells, mode = "paint") {
    const layerIndex = grid.currentLayer;
    const layer = assertUnlocked(layerIndex);
    const previousPalette = [...(grid.palette || [])];
    const changes = [];
    for (const cell of expandPoints(cells)) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height) continue;
      const previous = getCell(layer, cell.x, cell.y)?.color ?? null;
      const color = mode === "erase" ? null : absorbColor(cell.color ?? fgColor);
      changes.push({ x: cell.x, y: cell.y, color, previousColor: previous });
    }
    if (!changes.length) {
      grid.palette = previousPalette;
      return snapshot;
    }
    stack.execute(createStrokeCommand(grid, layerIndex, changes, previousPalette, [...grid.palette]));
    revision += 1;
    return commit(mode, { count: changes.length });
  }

  const controller = {
    getGrid: () => grid,
    getSnapshot: () => snapshot,
    getRevision: () => revision,
    getActiveLayerIndex: () => grid.currentLayer,
    getHistory: () => stack.getHistory(),
    getEvents: () => Object.freeze([...events]),
    getFaults: () => Object.freeze([...faults]),
    getReceipts: () => Object.freeze([...receipts]),
    canUndo: () => stack.canUndo(),
    canRedo: () => stack.canRedo(),
    getTool: () => tool,
    getZoom: () => zoom,
    getFgColor: () => fgColor,
    getBgColor: () => bgColor,
    getPan: () => ({ x: panX, y: panY }),
    getDetectedAmps: () => (grid.detectedAmps ? Object.freeze([...grid.detectedAmps]) : Object.freeze([])),
    getActiveAmpIds: () => (grid.activeAmpIds ? Object.freeze([...grid.activeAmpIds]) : Object.freeze([])),
    getPrimaryDetectedAmp: () => grid.primaryDetectedAmp || null,
    getDetectedShaders: () => (grid.detectedShaders ? Object.freeze([...grid.detectedShaders]) : Object.freeze([])),
    getActiveShaderIds: () => (grid.activeShaderIds ? Object.freeze([...grid.activeShaderIds]) : Object.freeze([])),
    getScdlSource: () => grid.scdlSource || null,
    getPipeline: () => grid.pipeline || null,

    setTool(next) {
      tool = next;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setZoom(next) {
      const allowed = [1, 2, 4, 8, 16, 32, 64];
      zoom = allowed.includes(next) ? next : zoom;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setFgColor(color) {
      fgColor = absorbColor(color) || fgColor;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setBgColor(color) {
      bgColor = absorbColor(color) || bgColor;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setPan(x, y) {
      panX = x;
      panY = y;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setActiveLayer(index) {
      if (!grid.layers[index]) throwFault("PB-STUDIO-EDITOR-INPUT", "invalid layer");
      grid.currentLayer = index;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    setGridType(gridType) {
      grid.gridType = gridType;
      revision += 1;
      return commit("grid-type", { gridType });
    },
    toggleSymmetry(axis) {
      const current = new Set(grid.symmetryAxes || []);
      if (current.has(axis)) current.delete(axis);
      else current.add(axis);
      grid.symmetryAxes = [...current];
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },

    paint: (cells) => paintCells(cells, "paint"),
    erase: (cells) => paintCells(cells, "erase"),
    fill(x, y, color = fgColor) {
      const layer = assertUnlocked();
      const previousPalette = [...(grid.palette || [])];
      const mapped = absorbColor(color);
      const nextPalette = [...grid.palette];
      const fillCommand = createFillCommand(grid, layer, x, y, mapped);
      stack.execute(
        new Command({
          doFn: () => {
            const result = fillCommand.execute();
            grid.palette = [...nextPalette];
            return result;
          },
          undoFn: () => {
            const result = fillCommand.undo();
            grid.palette = [...previousPalette];
            return result;
          },
          description: fillCommand.description,
          meta: fillCommand.meta,
        }),
      );
      revision += 1;
      return commit("fill", { x, y, color: mapped });
    },

    undo() {
      if (!stack.canUndo()) return null;
      stack.undo();
      revision = Math.max(0, revision - 1);
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },
    redo() {
      if (!stack.canRedo()) return null;
      stack.redo();
      revision += 1;
      snapshot = freezeSnapshot(grid, currentExtra());
      return snapshot;
    },

    createLayer(name) {
      const layer = createLayer(String(name || `Layer ${grid.layers.length}`));
      const index = grid.layers.length;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Create ${layer.name}`,
          () => {
            grid.layers.push(layer);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.push(layer);
            }
          },
          () => {
            grid.layers.splice(index, 1);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(index, 1);
            }
          },
        ),
      );
      revision += 1;
      return commit("layer-create", { name: layer.name });
    },
    deleteLayer(index) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      if (layer.protected || layer.name === "00_Reference") {
        throwFault("PB-STUDIO-EDITOR-INPUT", "reference layer is protected");
      }
      if (grid.layers.length <= 1) throwFault("PB-STUDIO-EDITOR-INPUT", "cannot delete last layer");
      stack.execute(
        createLayerStateCommand(
          grid,
          `Delete ${layer.name}`,
          () => {
            grid.layers.splice(index, 1);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(index, 1);
            }
            if (grid.currentLayer >= grid.layers.length) grid.currentLayer = grid.layers.length - 1;
          },
          () => {
            grid.layers.splice(index, 0, layer);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(index, 0, layer);
            }
          },
        ),
      );
      revision += 1;
      return commit("layer-delete", { name: layer.name });
    },
    renameLayer(index, name) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      if (layer.protected) throwFault("PB-STUDIO-EDITOR-INPUT", "reference layer is protected");
      const previous = layer.name;
      const nextName = String(name || previous);
      stack.execute(
        createLayerStateCommand(
          grid,
          `Rename ${previous}`,
          () => {
            layer.name = nextName;
          },
          () => {
            layer.name = previous;
          },
        ),
      );
      revision += 1;
      return commit("layer-rename", { name: nextName });
    },
    setLayerVisibility(index, visible) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      const previous = layer.visible !== false;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Visibility ${layer.name}`,
          () => setLayerVisible(grid, index, visible),
          () => setLayerVisible(grid, index, previous),
        ),
      );
      revision += 1;
      return commit("layer-visibility", { index, visible });
    },
    setLayerLocked(index, locked) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      if (layer.protected && locked === false) {
        /* reference may be unlocked explicitly for construction ink */
      }
      const previous = layer.locked === true;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Lock ${layer.name}`,
          () => setLayerLocked(grid, index, locked),
          () => setLayerLocked(grid, index, previous),
        ),
      );
      revision += 1;
      return commit("layer-lock", { index, locked });
    },
    setLayerOpacityValue(index, opacity) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      const previous = layer.opacity;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Opacity ${layer.name}`,
          () => setLayerOpacity(grid, index, opacity),
          () => setLayerOpacity(grid, index, previous),
        ),
      );
      revision += 1;
      return commit("layer-opacity", { index, opacity });
    },
    reorderLayers(from, to) {
      const previous = from;
      stack.execute(
        createLayerStateCommand(
          grid,
          "Reorder layers",
          () => reorderLayers(grid, from, to),
          () => reorderLayers(grid, to, previous),
        ),
      );
      revision += 1;
      return commit("layer-reorder", { from, to });
    },
    duplicateLayer(index) {
      const layer = grid.layers[index];
      if (!layer) throwFault("PB-STUDIO-EDITOR-INPUT", "missing layer");
      const copy = createLayer(`${layer.name} copy`);
      copy.visible = layer.visible !== false;
      copy.locked = false;
      copy.opacity = layer.opacity;
      copy.cells = new Map([...layer.cells.entries()].map(([key, cell]) => [key, { ...cell }]));
      const insertAt = index + 1;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Duplicate ${layer.name}`,
          () => {
            grid.layers.splice(insertAt, 0, copy);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(insertAt, 0, copy);
            }
          },
          () => {
            grid.layers.splice(insertAt, 1);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(insertAt, 1);
            }
          },
        ),
      );
      revision += 1;
      return commit("layer-duplicate", { name: copy.name });
    },
    flatten() {
      const flat = getFlattenedPreviewCells(grid);
      const layer = createLayer("Flattened");
      flat.forEach((cell, key) => layer.cells.set(key, { ...cell }));
      const previous = grid.layers.map((item) => item);
      stack.execute(
        createLayerStateCommand(
          grid,
          "Flatten",
          () => {
            grid.layers = [grid.layers[0], layer];
            grid.frames[0].layers = [...grid.layers];
            grid.currentLayer = 1;
          },
          () => {
            grid.layers = [...previous];
            grid.frames[0].layers = [...previous];
          },
        ),
      );
      revision += 1;
      return commit("flatten");
    },

    importPayload(payload) {
      if (payload?.kind === "png") {
        try {
          decodePngToRgba(payload.bytes);
        } catch (error) {
          throwFault("PB-STUDIO-PNG-DECODE", error.message.replace(/^PB-STUDIO-PNG-DECODE · /, ""));
        }
      }
      throwFault("PB-STUDIO-EDITOR-INPUT", "unsupported import payload");
    },

    /**
     * @param {{
     *   width: number,
     *   height: number,
     *   cells?: Array<{x:number,y:number,color?:string}>,
     *   kind?: string,
     *   layers?: Array<Record<string, unknown>> | null,
     *   palette?: string[],
     * }} raster
     */
    replaceFromRaster({
      width,
      height,
      cells,
      kind = "png",
      layers = null,
      palette = [],
      detectedAmps = null,
      activeAmpIds = null,
      primaryDetectedAmp = null,
      detectedShaders = null,
      activeShaderIds = null,
      scdlSource = null,
      pipeline = null,
    }) {
      const aseprite = kind === "aseprite";
      const maxWidth = aseprite ? ASEPRITE_IMPORT_LIMITS.maxWidth : PIXELBRAIN_GRID_LIMITS.hardMaxWidth;
      const maxHeight = aseprite ? ASEPRITE_IMPORT_LIMITS.maxHeight : PIXELBRAIN_GRID_LIMITS.hardMaxHeight;
      if (width > maxWidth || height > maxHeight) {
        throwFault("PB-STUDIO-EDITOR-LIMIT", "imported raster exceeds limit", {
          width,
          height,
          limit: maxWidth,
          kind,
        });
      }
      if ((cells?.length || 0) > ASEPRITE_IMPORT_LIMITS.maxCells) {
        throwFault("PB-STUDIO-EDITOR-LIMIT", "imported cell count exceeds limit", {
          cells: cells.length,
          limit: ASEPRITE_IMPORT_LIMITS.maxCells,
        });
      }
      const previous = {
        width: grid.width,
        height: grid.height,
        layers: grid.layers,
        frames: grid.frames,
        palette: grid.palette,
        currentLayer: grid.currentLayer,
        detectedAmps: grid.detectedAmps,
        activeAmpIds: grid.activeAmpIds,
        primaryDetectedAmp: grid.primaryDetectedAmp,
        detectedShaders: grid.detectedShaders,
        activeShaderIds: grid.activeShaderIds,
        scdlSource: grid.scdlSource,
        pipeline: grid.pipeline,
      };
      const nextLayers = layers
        ? layers.map((layer) => {
            const created = createLayer(layer.name);
            created.visible = layer.visible !== false;
            created.locked = layer.locked === true || layer.name === "00_Reference";
            created.protected = layer.name === "00_Reference";
            created.opacity =
              typeof layer.opacity === "number" && layer.opacity > 1 ? layer.opacity / 255 : (layer.opacity ?? 1);
            created.cells = cellsToMap(layer.cells || layerCells(layer));
            return created;
          })
        : (() => {
            const imported = createLayer("Imported");
            imported.cells = cellsToMap(cells);
            const reference = createLayer("00_Reference");
            reference.locked = true;
            reference.protected = true;
            return [reference, imported];
          })();
      if (aseprite && nextLayers.length > ASEPRITE_IMPORT_LIMITS.maxLayers) {
        throwFault("PB-STUDIO-EDITOR-LIMIT", "imported layer count exceeds limit", {
          layers: nextLayers.length,
        });
      }
      const reduction = reduceIndexedPalette(
        [...palette, ...nextLayers.flatMap((layer) => layerCells(layer).map((cell) => cell.color))],
        STUDIO_PALETTE_LIMIT,
      );
      if (reduction.reduced) {
        for (const layer of nextLayers) {
          for (const cell of layer.cells.values()) {
            cell.color = reduction.map[normalizeHex(cell.color)] || cell.color;
          }
        }
      }
      stack.execute(
        createLayerStateCommand(
          grid,
          `Import ${kind}`,
          () => {
            grid.width = width;
            grid.height = height;
            grid.cols = width;
            grid.rows = height;
            grid.layers = nextLayers;
            grid.frames = [{ duration: 100, layers: [...nextLayers] }];
            grid.palette = [...reduction.palette];
            grid.currentLayer = Math.min(1, nextLayers.length - 1);
            grid.detectedAmps = detectedAmps || null;
            grid.activeAmpIds = activeAmpIds || null;
            grid.primaryDetectedAmp = primaryDetectedAmp || null;
            grid.detectedShaders = detectedShaders || null;
            grid.activeShaderIds = activeShaderIds || null;
            grid.scdlSource = scdlSource || null;
            grid.pipeline = pipeline || null;
          },
          () => {
            grid.width = previous.width;
            grid.height = previous.height;
            grid.layers = previous.layers;
            grid.frames = previous.frames;
            grid.palette = previous.palette;
            grid.currentLayer = previous.currentLayer;
            grid.detectedAmps = previous.detectedAmps;
            grid.activeAmpIds = previous.activeAmpIds;
            grid.primaryDetectedAmp = previous.primaryDetectedAmp;
            grid.detectedShaders = previous.detectedShaders;
            grid.activeShaderIds = previous.activeShaderIds;
            grid.scdlSource = previous.scdlSource;
            grid.pipeline = previous.pipeline;
          },
        ),
      );
      revision += 1;
      return commit("import", {
        kind,
        reduced: reduction.reduced,
        before: reduction.before,
        after: reduction.after,
      });
    },

    installGeneratedOutput(output, receipt = {}, meta = {}) {
      if (receipt.baseChecksum && receipt.baseChecksum !== snapshot.checksum) {
        throwFault("PB-STUDIO-STALE-REVISION", "proposal base checksum does not match the active document", {
          expected: snapshot.checksum,
          received: receipt.baseChecksum,
          operation: meta.operation || "install",
          revision,
        });
      }
      const cells = cellsFromOutput(output);
      const name = meta.name || `AMP/${receipt.ampId || "generated"}`;
      const layer = createLayer(name);
      layer.generated = true;
      layer.cells = cellsToMap(cells);
      const index = grid.layers.length;
      stack.execute(
        createLayerStateCommand(
          grid,
          `Install ${name}`,
          () => {
            grid.layers.push(layer);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.push(layer);
            }
            grid.currentLayer = index;
          },
          () => {
            grid.layers.splice(index, 1);
            if (grid.frames?.[0]?.layers && grid.frames[0].layers !== grid.layers) {
              grid.frames[0].layers.splice(index, 1);
            }
          },
        ),
      );
      revision += 1;
      if (receipt && Object.keys(receipt).length) {
        receipts.unshift(Object.freeze({ ...receipt }));
        if (receipts.length > 20) receipts.length = 20;
      }
      return commit("generated-layer", { name, ampId: receipt.ampId });
    },

    recordFault(fault) {
      const entry = fault?.family ? fault : createStudioFault("PB-STUDIO-EDITOR-INPUT", String(fault));
      faults.unshift(Object.freeze({ ...entry, revision }));
      if (faults.length > 20) faults.length = 20;
      publish("fault", entry);
      return entry;
    },
    recordReceipt(receipt) {
      receipts.unshift(Object.freeze({ ...receipt }));
      if (receipts.length > 20) receipts.length = 20;
      return receipt;
    },
    newDocument(nextOptions = {}) {
      const fresh = createAuthoringGrid({ ...options, ...nextOptions });
      const previous = {
        width: grid.width,
        height: grid.height,
        layers: grid.layers,
        frames: grid.frames,
        palette: grid.palette,
        currentLayer: grid.currentLayer,
      };
      stack.execute(
        createLayerStateCommand(
          grid,
          "New document",
          () => {
            grid.width = fresh.width;
            grid.height = fresh.height;
            grid.layers = fresh.layers;
            grid.frames = fresh.frames;
            grid.palette = [];
            grid.currentLayer = 1;
            grid.cellSize = fresh.cellSize;
            grid.gridType = fresh.gridType;
          },
          () => {
            grid.width = previous.width;
            grid.height = previous.height;
            grid.layers = previous.layers;
            grid.frames = previous.frames;
            grid.palette = previous.palette;
            grid.currentLayer = previous.currentLayer;
          },
        ),
      );
      revision += 1;
      return commit("new-document");
    },
  };

  return controller;
}
