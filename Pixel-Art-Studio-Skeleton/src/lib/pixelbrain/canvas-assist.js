import { cellsFromOutput } from "./studio-document.js";

/**
 * @typedef {"overlay" | "stroke-aid" | "transform" | "deeplink"} CanvasAssistKind
 * @typedef {Readonly<{
 *   id: string,
 *   kind: CanvasAssistKind,
 *   priority: number,
 *   reason: string,
 *   baseChecksum: string,
 *   ampId?: string
 * }>} CanvasAssistSuggestion
 * @typedef {Readonly<{
 *   id: string,
 *   kind: CanvasAssistKind,
 *   priority: number,
 *   ampId?: string
 * }>} CanvasAssistRule
 */

/** @type {readonly CanvasAssistRule[]} */
const RULES = Object.freeze([
  { id: "construction-guides", kind: "overlay", priority: 100 },
  { id: "pixel-audit", kind: "overlay", priority: 90 },
  { id: "square-sharpness-contrast", kind: "transform", priority: 80, ampId: "square-sharpness-contrast" },
  { id: "symmetry-assist", kind: "stroke-aid", priority: 70 },
  { id: "palette-quantization-amp", kind: "transform", priority: 60, ampId: "palette-quantization-amp" },
]);

const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

function layerCells(layer) {
  if (!layer) return [];
  if (layer.cells instanceof Map) return [...layer.cells.values()];
  return Array.isArray(layer.cells) ? layer.cells : [];
}

function compositeOccupied(snapshot) {
  const occupied = new Map();
  const width = snapshot?.width ?? 0;
  const height = snapshot?.height ?? 0;
  for (const layer of snapshot?.layers || []) {
    if (layer.visible === false) continue;
    for (const cell of layerCells(layer)) {
      if (!Number.isInteger(cell?.x) || !Number.isInteger(cell?.y)) continue;
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
      occupied.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y });
    }
  }
  return occupied;
}

function isolatedCellsFrom(occupied, width, height) {
  const isolated = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupied.has(`${x},${y}`)) continue;
      const lonely = NEIGHBOR_OFFSETS.every(([dx, dy]) => !occupied.has(`${x + dx},${y + dy}`));
      if (lonely) isolated.push(Object.freeze({ x, y }));
    }
  }
  return isolated;
}

function hasManifestMutation(manifest, ampId) {
  return (manifest || []).some((record) => record?.ampId === ampId && record?.kind === "mutation");
}

function symmetryAxes(snapshot) {
  const top = Array.isArray(snapshot?.symmetryAxes) ? snapshot.symmetryAxes : [];
  if (top.length > 0) return top;
  return Array.isArray(snapshot?.grid?.symmetryAxes) ? snapshot.grid.symmetryAxes : [];
}

function reasonFor(id, { empty }) {
  if (id === "construction-guides") {
    return empty ? "Visible document is empty." : "Mass is off-center.";
  }
  if (id === "pixel-audit") return "Isolated visible pixels have no occupied neighbors.";
  if (id === "square-sharpness-contrast") {
    return "Isolated pixels and the square-sharpness-contrast mutation are available.";
  }
  if (id === "symmetry-assist") return "Occupied pixels exist with no symmetry axis.";
  if (id === "palette-quantization-amp") return "Palette has 28 or more colors.";
  return id;
}

export function auditCanvasPixels(snapshot) {
  const width = snapshot?.width ?? 0;
  const height = snapshot?.height ?? 0;
  const occupied = compositeOccupied(snapshot);
  return Object.freeze({
    isolatedCells: Object.freeze(isolatedCellsFrom(occupied, width, height)),
  });
}

/**
 * @param {{
 *   snapshot?: { checksum?: string, palette?: unknown[], layers?: unknown[], symmetryAxes?: unknown[], grid?: { symmetryAxes?: unknown[] }, width?: number, height?: number },
 *   critique?: { likelyCenterDrift?: boolean },
 *   manifest?: ReadonlyArray<{ ampId?: string, kind?: string }>
 * }} [params]
 * @returns {readonly CanvasAssistSuggestion[]}
 */
export function selectCanvasAssists({ snapshot, critique, manifest } = {}) {
  const occupied = compositeOccupied(snapshot);
  const empty = occupied.size === 0;
  const isolated = auditCanvasPixels(snapshot).isolatedCells.length > 0;
  const hasAxis = symmetryAxes(snapshot).length > 0;
  const palettePressure = (snapshot?.palette || []).length >= 28;
  const candidates = RULES.map((rule) => {
    let relevant = false;
    if (rule.id === "construction-guides") relevant = empty || critique?.likelyCenterDrift === true;
    else if (rule.id === "pixel-audit") relevant = isolated;
    else if (rule.id === "square-sharpness-contrast") {
      relevant = isolated && hasManifestMutation(manifest, rule.ampId);
    } else if (rule.id === "symmetry-assist") relevant = !empty && !hasAxis;
    else if (rule.id === "palette-quantization-amp") {
      relevant = palettePressure && hasManifestMutation(manifest, rule.ampId);
    }
    return {
      ...rule,
      relevant,
      reason: reasonFor(rule.id, { empty }),
      baseChecksum: snapshot?.checksum,
    };
  });

  const detectedSuggestions = [];
  if (Array.isArray(snapshot?.detectedAmps) && snapshot.detectedAmps.length > 0) {
    for (const amp of snapshot.detectedAmps) {
      if (amp.manifestId === "pixelbrain.shadow-amp" || amp.manifestId === "selout-amp" || amp.isPrimary) {
        detectedSuggestions.push({
          id: `source-amp-${amp.manifestId || amp.ampId}`,
          kind: "overlay",
          priority: 95,
          ampId: amp.manifestId || amp.ampId,
          reason: `Declared in source code (${snapshot.pipeline ? `pipeline '${snapshot.pipeline}'` : "SCDL"}). Summon ghost layer for ${amp.name || amp.ampId}.`,
          baseChecksum: snapshot?.checksum,
          relevant: true,
        });
      }
    }
  }

  return Object.freeze(
    [...candidates, ...detectedSuggestions]
      .filter((item) => item.relevant === true)
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map(({ relevant, ...suggestion }) => Object.freeze(suggestion)),
  );
}

export function assistIsStale(suggestion, checksum) {
  return suggestion?.baseChecksum !== checksum;
}

export function assistOutputCells(output) {
  return cellsFromOutput(output);
}
