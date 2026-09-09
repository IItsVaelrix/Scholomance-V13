import { decodeAsepriteBinary, encodeAsepriteBinary } from "./aseprite-binary-codec.js";
import { buildConstructionGuideCells } from "./construction-guides.js";
import { validateRoute } from "./microprocessor-route.core.js";
import { shadeBarkDetail, shadeCylinder, shadeFoliage, shadeMass } from "./pixel-art-shaders.js";
import { compileSCDL } from "./scdl/scdl.compiler.js";
import { emitLattice } from "./scdl/scdl.lattice-emitter.js";
import { framebufferToCoordinates, renderSceneGraph } from "./scene-graph-renderer.js";
import {
  ASEPRITE_IMPORT_LIMITS,
  PIXELBRAIN_GRID_LIMITS,
  getFlattenedPreviewCells,
} from "./template-grid-engine.js";
import {
  COMMAND_HISTORY_LIMIT,
  DEFAULT_LAYER_VOCABULARY,
  EVENT_HISTORY_LIMIT,
  STUDIO_FAULT_FAMILIES,
  STUDIO_PALETTE_LIMIT,
  cellsFromOutput,
  countDocumentCells,
  createDocumentController,
  createStudioFault,
  normalizeHex,
  reduceIndexedPalette,
} from "./studio-document.js";
import { decodePngToRgba, encodeRgbaPng, parseHexColor, rgbaToCells } from "./studio-png.js";
import { getStudioAmpManifest } from "./studio-facade.js";

export {
  COMMAND_HISTORY_LIMIT,
  DEFAULT_LAYER_VOCABULARY,
  EVENT_HISTORY_LIMIT,
  STUDIO_FAULT_FAMILIES,
  STUDIO_PALETTE_LIMIT,
  cellsFromOutput,
  countDocumentCells,
  createDocumentController,
  createStudioFault,
  normalizeHex,
  reduceIndexedPalette,
};

export const FINISH_ALGORITHM_ID = "pb-studio-finish-v1";
export const LIBRARY_V1_KEY = "pixelbrain.sward.library.v1";
export const LIBRARY_V2_KEY = "pixelbrain.studio.library.v2";
export const SCDL_INGEST_CONTRACT = "PB-STUDIO-SCDL-INGEST-v1";

function layerCells(layer) {
  if (!layer) return [];
  if (layer.cells instanceof Map) return [...layer.cells.values()];
  return Array.isArray(layer.cells) ? layer.cells : [];
}

export function flattenDocumentCells(doc) {
  const grid = doc.getGrid();
  const flat = getFlattenedPreviewCells(grid);
  return { cells: [...flat.values()].map((cell) => ({ ...cell })) };
}

export function renameLayer(doc, index, name) {
  return doc.renameLayer(index, name);
}
export function reorderDocumentLayers(doc, from, to) {
  return doc.reorderLayers(from, to);
}
export function setLayerLock(doc, index, locked) {
  return doc.setLayerLocked(index, locked);
}
export function setLayerOpacityValue(doc, index, opacity) {
  return doc.setLayerOpacityValue(index, opacity);
}
export function setLayerVisibility(doc, index, visible) {
  return doc.setLayerVisibility(index, visible);
}

function snapshotLayers(snapshot) {
  return snapshot?.layers || [];
}

export function compositeSnapshotToRgba(snapshot) {
  const width = snapshot.width;
  const height = snapshot.height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (const layer of snapshotLayers(snapshot)) {
    if (layer.visible === false || (layer.opacity ?? 1) <= 0) continue;
    const opacity = typeof layer.opacity === "number" && layer.opacity > 1 ? layer.opacity / 255 : (layer.opacity ?? 1);
    for (const cell of layerCells(layer)) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
      const parsed = parseHexColor(cell.color);
      const dest = (cell.y * width + cell.x) * 4;
      const srcA = Math.max(0, Math.min(1, opacity));
      if (srcA <= 0) continue;
      const dstA = rgba[dest + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      const mix = (src, dst) => Math.round((src * srcA + dst * dstA * (1 - srcA)) / (outA || 1));
      rgba[dest] = mix(parsed.r, rgba[dest]);
      rgba[dest + 1] = mix(parsed.g, rgba[dest + 1]);
      rgba[dest + 2] = mix(parsed.b, rgba[dest + 2]);
      rgba[dest + 3] = Math.round(outA * 255);
    }
  }
  return { width, height, rgba };
}

export function encodePng(snapshot) {
  const { width, height, rgba } = compositeSnapshotToRgba(snapshot);
  return encodeRgbaPng(width, height, rgba);
}

export function decodePng(bytes) {
  const decoded = decodePngToRgba(bytes);
  return {
    width: decoded.width,
    height: decoded.height,
    cells: rgbaToCells(decoded.width, decoded.height, decoded.rgba),
  };
}

export function importPngIntoDocument(doc, bytes) {
  let decoded;
  try {
    decoded = decodePng(bytes);
  } catch (error) {
    const message = error.message.startsWith("PB-STUDIO-PNG-DECODE")
      ? error.message
      : `PB-STUDIO-PNG-DECODE · ${error.message}`;
    throw new Error(message);
  }
  if (decoded.width > PIXELBRAIN_GRID_LIMITS.hardMaxWidth || decoded.height > PIXELBRAIN_GRID_LIMITS.hardMaxHeight) {
    throw new Error("PB-STUDIO-EDITOR-LIMIT · PNG exceeds hard dimension limit");
  }
  return doc.replaceFromRaster({
    width: decoded.width,
    height: decoded.height,
    cells: decoded.cells,
    kind: "png",
  });
}

function normalizeScdlDiagnostics(errors = []) {
  return Object.freeze(
    errors.map((entry) =>
      Object.freeze({
        severity: entry.severity || "ERROR",
        code: entry.label || entry.code || "SCDL",
        message: String(entry.message || "SCDL compilation failed"),
        line: entry.loc?.line ?? entry.span?.start?.line ?? 1,
        col: entry.loc?.col ?? entry.span?.start?.column ?? 1,
        bytecode: entry.bytecodeString || (typeof entry.bytecode === "string" ? entry.bytecode : null),
      }),
    ),
  );
}

export const CANONICAL_TO_MANIFEST_MAP = Object.freeze({
  "pixelbrain.shadow": "pixelbrain.shadow-amp",
  shadow: "pixelbrain.shadow-amp",
  "pixelbrain.shadow-amp": "pixelbrain.shadow-amp",
  "pixelbrain.shadow-perception-amp": "pixelbrain.shadow-perception-amp",
  "pixelbrain.selout": "selout-amp",
  selout: "selout-amp",
  "selout-amp": "selout-amp",
  "pixelbrain.pixel-aa": "pixel-aa-amp",
  "pixel-aa": "pixel-aa-amp",
  "pixel-aa-amp": "pixel-aa-amp",
  "pixelbrain.palette-quantization": "palette-quantization-amp",
  "palette-quantization": "palette-quantization-amp",
  "palette-quantization-amp": "palette-quantization-amp",
  "pixelbrain.square-sharpness-contrast": "square-sharpness-contrast",
  "square-sharpness-contrast": "square-sharpness-contrast",
  "pixelbrain.tonation": "pixelbrain.tonation-amp",
  tonation: "pixelbrain.tonation-amp",
  "pixelbrain.tonation-amp": "pixelbrain.tonation-amp",
  "pixelbrain.geometry": "geometry-amp",
  geometry: "geometry-amp",
  "geometry-amp": "geometry-amp",
  "pixelbrain.vector": "pixelbrain.vector-amp",
  vector: "pixelbrain.vector-amp",
  "pixelbrain.vector-amp": "pixelbrain.vector-amp",
  "pixelbrain.volume": "pixelbrain.volume-amp",
  volume: "pixelbrain.volume-amp",
  "pixelbrain.volume-amp": "pixelbrain.volume-amp",
  "pixelbrain.region-fill": "region-fill-amp",
  "region-fill": "region-fill-amp",
  "pixelbrain.flame-tip-amp": "pixelbrain.flame-tip-amp",
  flame: "pixelbrain.flame-tip-amp",
  "chestplate-bevel-amp": "chestplate-bevel-amp",
  bevel: "chestplate-bevel-amp",
  "pixelbrain.fibonacci-seed-field": "pixelbrain.fibonacci-seed-field",
  "fibonacci-seed-field": "pixelbrain.fibonacci-seed-field",
  fibonacci: "pixelbrain.fibonacci-seed-field",
  "pixelbrain.fibonacci-field": "pixelbrain.fibonacci-field",
  "fibonacci-field": "pixelbrain.fibonacci-field",
});

export const AMP_FRIENDLY_NAMES = Object.freeze({
  "pixelbrain.shadow": "Drop Shadow & Depth",
  "pixelbrain.shadow-amp": "Drop Shadow & Depth",
  "pixelbrain.selout": "Selout (Soft Outline)",
  "selout-amp": "Selout (Soft Outline)",
  "pixelbrain.pixel-aa": "Pixel Anti-Aliasing",
  "pixel-aa-amp": "Pixel Anti-Aliasing",
  "pixelbrain.palette-quantization": "Palette Quantization",
  "palette-quantization-amp": "Palette Quantization",
  "pixelbrain.square-sharpness-contrast": "Sharpness & Contrast",
  "square-sharpness-contrast": "Sharpness & Contrast",
  "pixelbrain.tonation": "Tonation & Shading",
  "pixelbrain.tonation-amp": "Tonation & Shading",
  "pixelbrain.geometry": "Geometry Composition",
  "geometry-amp": "Geometry Composition",
  "pixelbrain.vector": "Vector Flow",
  "pixelbrain.vector-amp": "Vector Flow",
  "pixelbrain.volume": "Volume & Mass",
  "pixelbrain.volume-amp": "Volume & Mass",
  "pixelbrain.region-fill": "Region Fill",
  "region-fill-amp": "Region Fill",
  "pixelbrain.flame-tip-amp": "Flame Tip & Embers",
  "chestplate-bevel-amp": "Bevel & Specular",
  "pixelbrain.fibonacci-seed-field": "Fibonacci Seed Field (Phyllotaxis)",
  "pixelbrain.fibonacci-field": "Fibonacci Phyllotaxis Field",
});

export function detectAmpsFromSource(source = "", compiled = null) {
  const text = String(source || "");
  let manifest = [];
  try {
    manifest = getStudioAmpManifest();
  } catch {
    manifest = [];
  }
  const manifestMap = new Map(manifest.map((r) => [r.ampId, r]));

  // 1. Extract pipeline directive if present
  let pipeline = null;
  const pipelineMatch = text.match(/SELECT_AMPS\s+(?:PIPELINE\s+)?([a-zA-Z0-9_-]+)/i);
  if (pipelineMatch && pipelineMatch[1] && !["{", "TRUE", "FALSE"].includes(pipelineMatch[1].toUpperCase())) {
    pipeline = pipelineMatch[1];
  }

  // 2. Extract explicit APPLY_AMP declarations
  const explicitDeclared = [];
  const applyMatches = text.matchAll(/APPLY_AMP\s+([a-zA-Z0-9_.-]+)/gi);
  for (const m of applyMatches) {
    if (m[1]) explicitDeclared.push(m[1]);
  }
  const applyBlockMatches = text.matchAll(/APPLY_AMP\s*\{[^}]*ampId:\s*["']?([a-zA-Z0-9_.-]+)["']?/gi);
  for (const m of applyBlockMatches) {
    if (m[1]) explicitDeclared.push(m[1]);
  }

  // 3. Compile if not provided
  let comp = compiled;
  if (!comp && text.trim().length > 0) {
    try {
      comp = compileSCDL(text);
    } catch {
      comp = null;
    }
  }

  // 4. Gather compiled selected and explicit amps
  const rawAmps = [];
  const seenIds = new Set();

  if (Array.isArray(comp?.analysis?.selectedAmps)) {
    for (const entry of comp.analysis.selectedAmps) {
      const id = entry.ampId || entry.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        rawAmps.push({
          ampId: id,
          stage: entry.stage || "LAYER_POST",
          order: entry.order ?? 50,
          source: "pipeline",
          reason: entry.activationReason || `Selected via pipeline '${pipeline || "default"}'`,
        });
      }
    }
  }

  if (Array.isArray(comp?.analysis?.explicitAmps)) {
    for (const entry of comp.analysis.explicitAmps) {
      const id = entry.ampId || entry.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        rawAmps.push({
          ampId: id,
          stage: entry.stage || "LAYER_POST",
          order: entry.order ?? 50,
          source: "explicit",
          reason: "Explicitly declared in source (APPLY_AMP)",
        });
      }
    }
  }

  for (const id of explicitDeclared) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      rawAmps.push({
        ampId: id,
        stage: "LAYER_POST",
        order: 50,
        source: "explicit",
        reason: "Explicitly declared in source (APPLY_AMP)",
      });
    }
  }

  // 5. Enrich with Studio Manifest records & friendly names
  const detectedAmps = rawAmps.map((raw) => {
    const manifestId =
      CANONICAL_TO_MANIFEST_MAP[raw.ampId] ||
      (manifestMap.has(raw.ampId)
        ? raw.ampId
        : manifestMap.has(`${raw.ampId}-amp`)
          ? `${raw.ampId}-amp`
          : raw.ampId);
    const rec = manifestMap.get(manifestId) || null;
    const name = AMP_FRIENDLY_NAMES[raw.ampId] || AMP_FRIENDLY_NAMES[manifestId] || rec?.summary || raw.ampId;
    const isGhostSupported =
      [
        "pixelbrain.shadow-amp",
        "selout-amp",
        "pixel-aa-amp",
        "pixelbrain.flame-tip-amp",
        "chestplate-bevel-amp",
        "crystal-core-amp",
        "hair-flow-amp",
        "noise-fill",
      ].includes(manifestId) || rec != null;

    return Object.freeze({
      ampId: raw.ampId,
      manifestId,
      name,
      shortName: name.split(" (")[0].split(" &")[0],
      stage: raw.stage,
      order: raw.order,
      source: raw.source,
      reason: raw.reason,
      kind: rec?.kind || "runnable",
      inManifest: Boolean(rec),
      isGhostSupported,
    });
  });

  detectedAmps.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

  let primaryDetectedAmp = null;
  const explicitGhostable = detectedAmps.find((a) => a.source === "explicit" && a.isGhostSupported);
  const shadow = detectedAmps.find((a) => a.manifestId === "pixelbrain.shadow-amp" || a.ampId.includes("shadow"));
  const selout = detectedAmps.find((a) => a.manifestId === "selout-amp" || a.ampId.includes("selout"));
  const pixelAa = detectedAmps.find((a) => a.manifestId === "pixel-aa-amp" || a.ampId.includes("pixel-aa"));
  const explicit = detectedAmps.find((a) => a.source === "explicit");
  const ghostable = detectedAmps.find((a) => a.isGhostSupported);

  primaryDetectedAmp = explicitGhostable || shadow || selout || pixelAa || explicit || ghostable || detectedAmps[0] || null;

  const activeAmpIds = detectedAmps.map((a) => a.manifestId);

  return Object.freeze({
    pipeline,
    detectedAmps: Object.freeze(detectedAmps),
    activeAmpIds: Object.freeze(activeAmpIds),
    primaryDetectedAmp,
  });
}

/**
 * Detect form and material shaders declared or inferred from SCDL source.
 * Form shaders operate on continuous forms (cylinders, radial masses) and
 * execute at compilation time before topological AMP passes.
 */
export function detectShadersFromSource(source, compiled = null) {
  const text = typeof source === "string" ? source : "";
  const detectedShaders = [];
  const activeShaderIds = [];
  const seenLayers = new Set();

  // 1. Extract color constants for ramp construction
  const colorConstants = new Map();
  const constMatches = text.matchAll(/CONST\s+\$([a-zA-Z0-9_]+)\s+COLOR\s+(#[a-fA-F0-9]{3,8})/gi);
  for (const match of constMatches) {
    colorConstants.set(match[1].toLowerCase(), normalizeHex(match[2]));
  }

  // Pre-build bark ramp if bark constants exist
  let barkRamp = null;
  if (
    colorConstants.has("bark_dark") ||
    colorConstants.has("bark_base") ||
    colorConstants.has("bark_mid") ||
    colorConstants.has("bark_lit")
  ) {
    const dark = colorConstants.get("bark_dark") || "#1C1917";
    const base = colorConstants.get("bark_base") || dark;
    const mid = colorConstants.get("bark_mid") || base;
    const lit = colorConstants.get("bark_lit") || mid;
    barkRamp = Object.freeze({
      void: dark,
      deep: base,
      body: mid,
      frost: lit,
      hi: lit,
    });
  }

  // Pre-build canopy ramp if canopy constants exist
  let canopyRamp = null;
  if (
    colorConstants.has("canopy_dark") ||
    colorConstants.has("canopy_base") ||
    colorConstants.has("canopy_mid") ||
    colorConstants.has("canopy_lit")
  ) {
    const dark = colorConstants.get("canopy_dark") || "#052e16";
    const base = colorConstants.get("canopy_base") || dark;
    const mid = colorConstants.get("canopy_mid") || base;
    const lit = colorConstants.get("canopy_lit") || mid;
    const frost = colorConstants.get("canopy_hi") || lit;
    const hi = colorConstants.get("canopy_spec") || colorConstants.get("canopy_hi") || lit;
    canopyRamp = Object.freeze({
      void: dark,
      deep: base,
      body: mid,
      frost,
      hi,
    });
  }

  // 2. Parse explicit SHADER directives:
  // Syntax A: SHADER <layer> <CYLINDER|MASS|FOLIAGE|BARK_DETAIL> [RAMP <hex>...]
  // Syntax B: APPLY_SHADER <cylinder|mass|foliage|bark_detail> ON <layer>
  const explicitShaderMatches = text.matchAll(
    /SHADER\s+([a-zA-Z0-9_]+)\s+(CYLINDER|MASS|FOLIAGE|BARK_DETAIL)(?:\s+RAMP\s+((?:#[a-fA-F0-9]{3,8}\s*)+))?/gi,
  );
  for (const m of explicitShaderMatches) {
    const layerName = m[1];
    const type = m[2].toLowerCase();
    const rawRamp = m[3] ? m[3].trim().split(/\s+/).map(normalizeHex) : null;
    let ramp = null;
    if (rawRamp && rawRamp.length >= 2) {
      ramp = Object.freeze({
        void: rawRamp[0],
        deep: rawRamp[1] || rawRamp[0],
        body: rawRamp[2] || rawRamp[1] || rawRamp[0],
        frost: rawRamp[3] || rawRamp[2] || rawRamp[0],
        hi: rawRamp[4] || rawRamp[3] || rawRamp[0],
      });
    } else {
      ramp = (type === "cylinder" || type === "bark_detail") ? (barkRamp || canopyRamp) : (canopyRamp || barkRamp);
    }

    if (!seenLayers.has(layerName)) {
      seenLayers.add(layerName);
      const shaderId = `shader.${type}.${layerName}`;
      let name = "Shader";
      let options = {};
      if (type === "cylinder") {
        name = "Cylinder Form Shader";
        options = { specular: true };
      } else if (type === "foliage") {
        name = "Fibonacci Foliage Texture Shader";
        options = { clusterCount: 12, dither: true, lightX: -0.65, lightY: -0.75 };
      } else if (type === "bark_detail") {
        name = "Bark Furrow Texture Shader";
        options = { grainScale: 1.0 };
      } else {
        name = "Radial Mass Shader";
        options = { lightX: -0.7, lightY: -0.7 };
      }

      detectedShaders.push(
        Object.freeze({
          shaderId,
          layerName,
          type,
          name,
          ramp: ramp || Object.freeze({ void: "#0c0e0b", deep: "#292524", body: "#57534E", frost: "#78716C", hi: "#A8A29E" }),
          source: "explicit",
          options,
        }),
      );
      activeShaderIds.push(shaderId);
    }
  }

  const applyShaderMatches = text.matchAll(/APPLY_SHADER\s+(cylinder|mass|foliage|bark_detail)\s+ON\s+([a-zA-Z0-9_]+)/gi);
  for (const m of applyShaderMatches) {
    const type = m[1].toLowerCase();
    const layerName = m[2];
    if (!seenLayers.has(layerName)) {
      seenLayers.add(layerName);
      const ramp = (type === "cylinder" || type === "bark_detail") ? (barkRamp || canopyRamp) : (canopyRamp || barkRamp);
      const shaderId = `shader.${type}.${layerName}`;
      let name = "Shader";
      let options = {};
      if (type === "cylinder") {
        name = "Cylinder Form Shader";
        options = { specular: true };
      } else if (type === "foliage") {
        name = "Fibonacci Foliage Texture Shader";
        options = { clusterCount: 12, dither: true, lightX: -0.65, lightY: -0.75 };
      } else if (type === "bark_detail") {
        name = "Bark Furrow Texture Shader";
        options = { grainScale: 1.0 };
      } else {
        name = "Radial Mass Shader";
        options = { lightX: -0.7, lightY: -0.7 };
      }

      detectedShaders.push(
        Object.freeze({
          shaderId,
          layerName,
          type,
          name,
          ramp: ramp || Object.freeze({ void: "#0c0e0b", deep: "#292524", body: "#57534E", frost: "#78716C", hi: "#A8A29E" }),
          source: "explicit",
          options,
        }),
      );
      activeShaderIds.push(shaderId);
    }
  }

  // 3. Semantic Form Inference for standard anatomical/botanical layers
  const layerMatches = text.matchAll(/LAYER\s+([a-zA-Z0-9_]+)/gi);
  const presentLayers = new Set([...layerMatches].map((m) => m[1]));

  const CYLINDER_PATTERNS = [
    { name: "trunk", specular: true },
    { name: "primary_branches", specular: false },
    { name: "secondary_branches", specular: false },
    { name: "branches", specular: false },
  ];

  for (const { name: layerName, specular } of CYLINDER_PATTERNS) {
    if (presentLayers.has(layerName) && !seenLayers.has(layerName)) {
      seenLayers.add(layerName);
      const ramp = barkRamp || Object.freeze({ void: "#1c1917", deep: "#292524", body: "#57534E", frost: "#78716C", hi: "#A8A29E" });
      const shaderId = `shader.cylinder.${layerName}`;
      detectedShaders.push(
        Object.freeze({
          shaderId,
          layerName,
          type: "cylinder",
          name: "Cylinder Form Shader",
          ramp,
          source: "semantic",
          options: { specular },
        }),
      );
      activeShaderIds.push(shaderId);
    }
  }

  const FOLIAGE_PATTERNS = [
    { name: "canopy_masses", clusterCount: 12, dither: true },
    { name: "canopy", clusterCount: 12, dither: true },
    { name: "foliage_edges", clusterCount: 8, dither: false },
  ];

  for (const { name: layerName, clusterCount, dither } of FOLIAGE_PATTERNS) {
    if (presentLayers.has(layerName) && !seenLayers.has(layerName)) {
      seenLayers.add(layerName);
      const ramp = canopyRamp || Object.freeze({ void: "#052e16", deep: "#14532d", body: "#15803d", frost: "#22c55e", hi: "#a3e635" });
      const shaderId = `shader.foliage.${layerName}`;
      detectedShaders.push(
        Object.freeze({
          shaderId,
          layerName,
          type: "foliage",
          name: "Fibonacci Foliage Texture Shader",
          ramp,
          source: "semantic",
          options: { clusterCount, dither, lightX: -0.65, lightY: -0.75 },
        }),
      );
      activeShaderIds.push(shaderId);
    }
  }

  const BARK_DETAIL_PATTERNS = [
    { name: "surface_detail", grainScale: 1.0 },
    { name: "roots_and_ground", grainScale: 0.8 },
  ];

  for (const { name: layerName, grainScale } of BARK_DETAIL_PATTERNS) {
    if (presentLayers.has(layerName) && !seenLayers.has(layerName)) {
      seenLayers.add(layerName);
      const ramp = barkRamp || Object.freeze({ void: "#1c1917", deep: "#292524", body: "#57534E", frost: "#78716C", hi: "#A8A29E" });
      const shaderId = `shader.bark_detail.${layerName}`;
      detectedShaders.push(
        Object.freeze({
          shaderId,
          layerName,
          type: "bark_detail",
          name: "Bark Furrow Texture Shader",
          ramp,
          source: "semantic",
          options: { grainScale },
        }),
      );
      activeShaderIds.push(shaderId);
    }
  }

  return Object.freeze({
    detectedShaders: Object.freeze(detectedShaders),
    activeShaderIds: Object.freeze(activeShaderIds),
    barkRamp,
    canopyRamp,
  });
}

/**
 * Compile static SCDL source and atomically replace the active document.
 * Failed compilation never mutates the current document.
 */
export function ingestScdlIntoDocument(doc, source, options = {}) {
  const before = doc.getSnapshot();
  const compiled = compileSCDL(String(source || ""));
  const diagnostics = normalizeScdlDiagnostics(compiled.errors || compiled.diagnostics || []);
  if (!compiled.ok || !compiled.packet || !compiled.ast) {
    return Object.freeze({
      ok: false,
      assetId: null,
      snapshot: before,
      diagnostics,
      receipt: null,
    });
  }

  const isV2 = compiled.languageVersion === 2;
  const isAnimated =
    Boolean(compiled.frameLoop) ||
    Boolean(compiled.framePackets && compiled.framePackets.length > 1) ||
    Boolean(compiled.package?.animation) ||
    Boolean(compiled.analysis?.timeline);

  if (isAnimated) {
    const assetId = compiled.analysis?.assetId || compiled.ast?.asset?.id || compiled.ast?.asset || null;
    return Object.freeze({
      ok: false,
      assetId,
      snapshot: before,
      diagnostics: Object.freeze([
        Object.freeze({
          severity: "ERROR",
          code: "PB-STUDIO-SCDL-FRAMES",
          message: "Animated SCDL is not supported by the single-frame Studio document yet.",
          line: 1,
          col: 1,
          bytecode: null,
        }),
        ...diagnostics,
      ]),
      receipt: null,
    });
  }

  let canvas;
  let palette;
  let coordinates;
  let assetId;
  let sourceChecksum;
  let partCount;
  let layers;

  if (isV2) {
    canvas = compiled.packet.canvas || compiled.analysis?.canvas || { width: 16, height: 16 };
    palette = compiled.packet.palette?.sourcePalette?.[0]?.colors || [];
    coordinates = compiled.packet.geometry?.coordinates || compiled.packet.coordinates || [];
    assetId = compiled.analysis?.assetId || compiled.ast?.asset?.id || "scdl_v2";
    sourceChecksum = compiled.bytecode?.programId || compiled.regressionSeed?.checksum || compiled.ast?.checksum || "scdl-v2";

    const layerSurfaces = compiled.package?.layerSurfaces || compiled.packet?.layerSurfaces || [];
    const packageLayers = compiled.package?.layers || [];

    const surfaceMap = new Map();
    for (const surf of layerSurfaces) {
      const lid = surf?.layerId || surf?.id;
      if (lid) {
        surfaceMap.set(lid, surf.cells || surf.coordinates || []);
      }
    }

    const orderedLayers = [];
    if (packageLayers.length > 0) {
      for (const pLayer of packageLayers) {
        const id = pLayer.id;
        const cells = surfaceMap.get(id) || pLayer.cells || pLayer.coordinates || [];
        orderedLayers.push({
          name: id,
          visible: pLayer.visible !== false,
          locked: false,
          opacity: pLayer.opacity !== undefined ? pLayer.opacity : 1,
          blend: pLayer.blend || 'normal',
          cells: cells.map((c) => {
            const cell = { x: c.x, y: c.y, color: c.color };
            if (c.alpha !== undefined) cell.alpha = c.alpha;
            return cell;
          }),
        });
      }
    } else if (layerSurfaces.length > 0) {
      for (const surf of layerSurfaces) {
        orderedLayers.push({
          name: surf.layerId || surf.id || "Layer 1",
          visible: true,
          locked: false,
          opacity: 1,
          blend: 'normal',
          cells: (surf.cells || surf.coordinates || []).map((c) => ({ x: c.x, y: c.y, color: c.color })),
        });
      }
    } else {
      const byPart = new Map();
      for (const coord of coordinates) {
        const pId = coord.partId || "SCDL";
        if (!byPart.has(pId)) byPart.set(pId, []);
        byPart.get(pId).push({ x: coord.x, y: coord.y, color: coord.color });
      }
      for (const [name, cells] of byPart) {
        orderedLayers.push({ name, visible: true, locked: false, opacity: 1, blend: 'normal', cells });
      }
    }

    layers = [
      { name: "00_Reference", visible: true, locked: true, opacity: 1, cells: [] },
      ...orderedLayers,
    ];
    partCount = orderedLayers.length;
  } else {
    const isSceneGraph = compiled.packet.geometry?.mode === "scene-graph";
    const lattice = isSceneGraph
      ? {
          canvas: compiled.packet.canvas,
          geometry: {
            coordinates: framebufferToCoordinates(
              renderSceneGraph(compiled.packet.geometry.sceneGraph, compiled.packet.canvas, { shade: "material" }),
            ),
          },
          palette: compiled.packet.palette?.sourcePalette?.[0]?.colors || [],
        }
      : emitLattice(compiled.packet, compiled.ast);

    canvas = lattice.canvas;
    palette = lattice.palette;
    coordinates = lattice.geometry.coordinates || [];
    assetId = compiled.ast.asset;
    sourceChecksum = compiled.ast.checksum;
    const partIds = (compiled.ast.parts || []).map((part) => part.id);
    partCount = partIds.length;

    const byPart = new Map(partIds.map((id) => [id, []]));
    for (const coordinate of coordinates) {
      const partId = coordinate.partId || (isSceneGraph ? "Scene Graph" : "SCDL");
      if (!byPart.has(partId)) byPart.set(partId, []);
      byPart.get(partId).push({
        x: coordinate.x,
        y: coordinate.y,
        color: coordinate.color,
      });
    }

    layers = [
      { name: "00_Reference", visible: true, locked: true, opacity: 1, cells: [] },
      ...[...byPart].map(([name, cells]) => ({ name, visible: true, locked: false, opacity: 1, cells })),
    ];
  }

  // Detect AMPs and Shaders at compilation time
  const detection = detectAmpsFromSource(source, compiled);
  const shaderDetection = detectShadersFromSource(source, compiled);

  // Apply detected form shaders to layer cells at compilation time
  for (const layer of layers) {
    const shader = shaderDetection.detectedShaders.find((s) => s.layerName === layer.name);
    if (shader && Array.isArray(layer.cells) && layer.cells.length > 0) {
      let shaded = null;
      if (shader.type === "cylinder") {
        shaded = shadeCylinder(layer.cells, shader.ramp, shader.options || {});
      } else if (shader.type === "mass") {
        shaded = shadeMass(layer.cells, shader.ramp, shader.options || {});
      } else if (shader.type === "foliage") {
        shaded = shadeFoliage(layer.cells, shader.ramp, shader.options || {});
      } else if (shader.type === "bark_detail") {
        shaded = shadeBarkDetail(layer.cells, shader.ramp, shader.options || {});
      }
      if (shaded && shaded.length > 0) {
        layer.cells = shaded;
      }
    }
  }

  // STU-04: Preserve artist manual overlay layers across procedural regeneration
  const preserveOverlays = options.preserveOverlays !== false;
  if (preserveOverlays && Array.isArray(before?.layers)) {
    const overlays = before.layers.filter((l) =>
      l.isOverlay === true || l.manual === true ||
      (typeof l.name === 'string' && (l.name.startsWith('overlay_') || l.name.startsWith('manual_') || l.name === '00_Overlay'))
    );
    for (const ov of overlays) {
      layers.push({
        name: ov.name,
        visible: ov.visible !== false,
        locked: Boolean(ov.locked),
        opacity: ov.opacity ?? 1,
        blend: ov.blend || 'normal',
        isOverlay: true,
        manual: true,
        cells: layerCells(ov).map((c) => ({ ...c })),
      });
    }
  }

  // STU-05: Maintain pixel-to-provenance lookup table
  const provenanceTable = new Map();
  for (const coord of coordinates) {
    const key = `${coord.x},${coord.y}`;
    provenanceTable.set(key, {
      x: coord.x,
      y: coord.y,
      layerName: coord.partId || coord.layerId || 'Layer',
      layer: coord.partId || coord.layerId || 'Layer',
      paintId: coord.paintId || null,
      featureKey: coord.featureKey || null,
      ampChain: coord.ampChain || (detection.activeAmpIds || []),
      color: coord.color,
    });
  }

  const snapshot = doc.replaceFromRaster({
    width: canvas.width,
    height: canvas.height,
    kind: "scdl",
    palette,
    layers,
    detectedAmps: detection.detectedAmps,
    activeAmpIds: detection.activeAmpIds,
    primaryDetectedAmp: detection.primaryDetectedAmp,
    detectedShaders: shaderDetection.detectedShaders,
    activeShaderIds: shaderDetection.activeShaderIds,
    scdlSource: source,
    pipeline: detection.pipeline,
  });

  const receipt = Object.freeze({
    contract: SCDL_INGEST_CONTRACT,
    assetId,
    sourceChecksum,
    packetId: compiled.packet.id,
    coordinateCount: coordinates.length,
    partCount,
    warningCount: diagnostics.filter((entry) => entry.severity === "WARN").length,
    detectedAmpCount: detection.detectedAmps.length,
    detectedShaderCount: shaderDetection.detectedShaders.length,
    pipeline: detection.pipeline,
    activeAmpIds: detection.activeAmpIds,
    activeShaderIds: shaderDetection.activeShaderIds,
    provenanceTable,
  });
  if (typeof doc.recordReceipt === "function") {
    doc.recordReceipt(receipt);
  }
  doc._provenanceTable = provenanceTable;

  return Object.freeze({
    ok: true,
    assetId,
    snapshot,
    diagnostics,
    receipt,
    layers,
    provenanceTable,
    detectedAmps: detection.detectedAmps,
    activeAmpIds: detection.activeAmpIds,
    primaryDetectedAmp: detection.primaryDetectedAmp,
    detectedShaders: shaderDetection.detectedShaders,
    activeShaderIds: shaderDetection.activeShaderIds,
    pipeline: detection.pipeline,
  });
}

export function getPixelProvenance(doc, x, y) {
  const table = doc?._provenanceTable;
  if (!table) return null;
  return table.get(`${x},${y}`) || null;
}

export function createEffectPreviewSession(doc, candidateTransformOrSource, options = {}) {
  const beforeSnapshot = doc.getSnapshot();

  let candidateLayers = [];
  let metadataAttached = [];
  let candidateSource = null;

  if (typeof candidateTransformOrSource === 'string') {
    candidateSource = candidateTransformOrSource;
    const compiled = compileSCDL(candidateSource);
    if (compiled.ok && compiled.packet) {
      const coords = compiled.packet.geometry?.coordinates || compiled.packet.coordinates || [];
      const cells = coords.map((c) => ({ x: c.x, y: c.y, color: c.color, alpha: c.alpha }));
      candidateLayers = [{ name: 'Preview_Candidate', visible: true, locked: true, opacity: 1, cells }];
      if (compiled.analysis?.detectedAmps) {
        metadataAttached = compiled.analysis.detectedAmps.map((a) => a.ampId || a);
      }
    }
  } else if (typeof candidateTransformOrSource === 'function') {
    candidateLayers = candidateTransformOrSource(beforeSnapshot) || [];
  } else if (Array.isArray(candidateTransformOrSource?.layers)) {
    candidateLayers = candidateTransformOrSource.layers;
  }

  const beforeCells = new Map();
  for (const l of snapshotLayers(beforeSnapshot)) {
    for (const c of layerCells(l)) {
      beforeCells.set(`${c.x},${c.y}`, c.color);
    }
  }

  const candidateCells = new Map();
  for (const l of candidateLayers) {
    for (const c of layerCells(l)) {
      candidateCells.set(`${c.x},${c.y}`, c.color);
    }
  }

  let pixelsChanged = 0;
  for (const [pos, col] of candidateCells.entries()) {
    if (!beforeCells.has(pos) || beforeCells.get(pos) !== col) {
      pixelsChanged += 1;
    }
  }
  for (const [pos] of beforeCells.entries()) {
    if (!candidateCells.has(pos)) {
      pixelsChanged += 1;
    }
  }

  return {
    pixelsChanged,
    geometryChanged: false,
    metadataAttached,
    virtualLayer: candidateLayers[0] || null,
    previewSnapshot: Object.freeze({
      ...beforeSnapshot,
      virtualPreviewLayers: candidateLayers,
    }),
    applyCandidate() {
      if (candidateSource) {
        return ingestScdlIntoDocument(doc, candidateSource, options);
      }
      return doc.replaceFromRaster({
        ...beforeSnapshot,
        layers: [...snapshotLayers(beforeSnapshot), ...candidateLayers],
      });
    },
    cancel() {
      return { cancelled: true, snapshot: beforeSnapshot };
    },
  };
}

export class StudioCompileScheduler {
  constructor(options = {}) {
    this.maxCacheSize = options.maxCacheSize || 32;
    this.cache = new Map();
    this.lastSequence = 0;
    this.lastSuccessfulPreview = null;
  }

  scheduleCompile(doc, source, options = {}) {
    const seq = ++this.lastSequence;
    const cacheKey = String(source || '');

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return Promise.resolve({ ...cached, isStale: false, sequence: seq });
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        if (seq < this.lastSequence) {
          resolve({
            ok: false,
            cancelled: true,
            isStale: true,
            sequence: seq,
            lastSuccessfulPreview: this.lastSuccessfulPreview,
          });
          return;
        }

        const res = ingestScdlIntoDocument(doc, source, options);
        if (res.ok) {
          this.lastSuccessfulPreview = res.snapshot;
          if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
          }
          this.cache.set(cacheKey, res);
        }
        resolve({ ...res, isStale: false, sequence: seq });
      }, 0);
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

function snapshotToAsepritePayload(snapshot) {
  const palette = reduceIndexedPalette(
    [
      ...(snapshot.palette || []),
      ...snapshotLayers(snapshot).flatMap((layer) => layerCells(layer).map((cell) => cell.color)),
    ],
    256,
  );
  return {
    width: snapshot.width,
    height: snapshot.height,
    colorMode: "indexed",
    palette: { colors: palette.palette },
    frames: [
      {
        frame: 0,
        duration: 100,
        layers: snapshotLayers(snapshot).map((layer) => ({
          name: layer.name,
          visible: layer.visible !== false,
          locked: layer.locked === true,
          opacity: Math.round((typeof layer.opacity === "number" && layer.opacity <= 1 ? layer.opacity : 1) * 255),
          cells: layerCells(layer).map((cell) => ({
            x: cell.x,
            y: cell.y,
            color: String(cell.color || "").toUpperCase(),
          })),
        })),
      },
    ],
  };
}

export function encodeAsepriteFromDocument(snapshot) {
  try {
    return encodeAsepriteBinary(snapshotToAsepritePayload(snapshot));
  } catch (error) {
    throw new Error(`PB-STUDIO-ASEPRITE-ENCODE · ${error.message}`);
  }
}

export function importAsepriteIntoDocument(doc, bytes) {
  let decoded;
  try {
    decoded = decodeAsepriteBinary(bytes);
  } catch (error) {
    throw new Error(`PB-STUDIO-ASEPRITE-DECODE · ${error.message}`);
  }
  if (decoded.frames?.length > ASEPRITE_IMPORT_LIMITS.maxFrames) {
    throw new Error("PB-STUDIO-EDITOR-LIMIT · Aseprite frame count exceeds limit");
  }
  const frame = decoded.frames?.[0] || { layers: [] };
  return doc.replaceFromRaster({
    width: decoded.width,
    height: decoded.height,
    kind: "aseprite",
    palette: decoded.palette?.colors || [],
    layers: frame.layers.map((layer, index) => ({
      name: layer.name || `Layer ${index + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: layer.opacity,
      cells: layer.cells || [],
    })),
  });
}

export function applyConstructionGuides(doc, options = {}) {
  const snapshot = doc.getSnapshot();
  const cells = buildConstructionGuideCells({
    width: snapshot.width,
    height: snapshot.height,
    color: options.color || "#00e5ff",
  });
  const previous = doc.getActiveLayerIndex();
  doc.setActiveLayer(0);
  if (doc.getGrid().layers[0].locked) doc.setLayerLocked(0, false);
  const next = doc.paint(cells);
  doc.setActiveLayer(previous);
  return next;
}

export function previewConstructionGuides(snapshot, options = {}) {
  return Object.freeze(buildConstructionGuideCells({
    width: snapshot.width,
    height: snapshot.height,
    color: options.color || "#00e5ff",
  }).map((cell) => Object.freeze({ ...cell })));
}

export function evaluateForgeGate({ snapshot, observedSampling = false, routeDefinition = null }) {
  if (observedSampling) {
    return Object.freeze({
      verdict: "FAIL",
      family: "PB-STUDIO-FORGE-CAPABILITY",
      findings: Object.freeze([
        Object.freeze({
          pass: false,
          code: "OBSERVED_SAMPLING",
          reason: "Observed sampling requires Node filesystem access and is unavailable in the browser.",
          measure: 0,
        }),
      ]),
    });
  }
  const findings = [];
  const cellCount = countDocumentCells(snapshot);
  const area = Math.max(1, (snapshot.width || 1) * (snapshot.height || 1));
  const compact = cellCount / area;
  if (cellCount === 0) {
    findings.push({
      pass: false,
      code: "EMPTY",
      reason: "structure has no occupied cells",
      measure: cellCount,
    });
  } else if (cellCount < 16) {
    findings.push({
      pass: false,
      code: "SPARSE",
      reason: "occupied cell count is below the readable minimum of 16",
      measure: cellCount,
    });
  }
  if (cellCount >= 16 && compact < 0.01) {
    findings.push({
      pass: false,
      code: "SILHOUETTE",
      reason: "silhouette compactness is below 0.01",
      measure: Number(compact.toFixed(4)),
    });
  }
  const colors = new Set(
    snapshotLayers(snapshot).flatMap((layer) => layerCells(layer).map((cell) => normalizeHex(cell.color))),
  );
  if (colors.size > STUDIO_PALETTE_LIMIT) {
    findings.push({
      pass: false,
      code: "PALETTE",
      reason: "indexed palette exceeds the 32-color ceiling",
      measure: colors.size,
    });
  }
  if (routeDefinition) {
    try {
      validateRoute(routeDefinition, { spec: snapshot });
    } catch (error) {
      findings.push({
        pass: false,
        code: "ROUTE",
        reason: error.message,
        measure: 0,
      });
    }
  }
  const blocking = findings.filter((finding) => finding.pass === false);
  if (blocking.length) {
    return Object.freeze({
      verdict: "FAIL",
      family: "PB-STUDIO-FORGE-GATE",
      findings: Object.freeze(blocking.map((finding) => Object.freeze(finding))),
    });
  }
  return Object.freeze({
    verdict: "PASS",
    family: null,
    findings: Object.freeze([
      Object.freeze({
        pass: true,
        code: "STRUCTURE",
        reason: "structure meets gate measures",
        measure: cellCount,
      }),
    ]),
  });
}

const STYLE_RAMPS = {
  gameboy: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  nes: ["#000000", "#7c7c7c", "#bcbcbc", "#fcfcfc", "#0000fc", "#0058f8", "#3cbcfc", "#a40000"],
  vga: [
    "#000000",
    "#0000aa",
    "#00aa00",
    "#00aaaa",
    "#aa0000",
    "#aa00aa",
    "#aa5500",
    "#aaaaaa",
    "#555555",
    "#5555ff",
    "#55ff55",
    "#55ffff",
    "#ff5555",
    "#ff55ff",
    "#ffff55",
    "#ffffff",
  ],
  VOID: ["#070b0c", "#163034", "#2f6b63", "#7fd4c0", "#e8fff4"],
  SONIC: ["#14081f", "#3b1766", "#7a3cff", "#c9a227", "#f4e4b0"],
  PSYCHIC: ["#041016", "#0b3d4a", "#2ec4d6", "#a6f0ff", "#f4fdff"],
  ALCHEMY: ["#1a0810", "#6b1037", "#d64b8a", "#f2c6a0", "#fff4e8"],
  WILL: ["#160c04", "#7a3b08", "#e07a16", "#f0c070", "#fff3d6"],
};

function rampFor(schoolId, styleId) {
  if (styleId && STYLE_RAMPS[styleId]) return STYLE_RAMPS[styleId];
  return STYLE_RAMPS[schoolId] || STYLE_RAMPS.VOID;
}

function mapToRamp(hex, ramp) {
  const [r, g, b] = [parseHexColor(hex).r, parseHexColor(hex).g, parseHexColor(hex).b];
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const index = Math.min(ramp.length - 1, Math.round(luma * (ramp.length - 1)));
  return ramp[index];
}

function checksumCells(cells, extra) {
  const body = JSON.stringify({
    extra,
    cells: [...cells]
      .map((cell) => `${cell.x},${cell.y},${normalizeHex(cell.color)}`)
      .sort(),
  });
  let hash = 2166136261;
  for (let index = 0; index < body.length; index += 1) {
    hash ^= body.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `studio-finish1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function transmuteStyle(snapshot, { schoolId = "VOID", styleId = "none", algorithmId = FINISH_ALGORITHM_ID } = {}) {
  const ramp = rampFor(schoolId, styleId);
  const cells = [];
  for (const layer of snapshotLayers(snapshot)) {
    if (layer.visible === false) continue;
    for (const cell of layerCells(layer)) {
      cells.push({
        x: cell.x,
        y: cell.y,
        color: mapToRamp(cell.color, ramp),
        sourceLayer: layer.name,
      });
    }
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  return Object.freeze({
    algorithmId,
    schoolId,
    styleId,
    sourceChecksum: snapshot.checksum,
    checksum: checksumCells(cells, { algorithmId, schoolId, styleId, source: snapshot.checksum }),
    palette: Object.freeze([...ramp]),
    cells: Object.freeze(cells.map((cell) => Object.freeze(cell))),
  });
}

export function applyFinishShader(snapshot, { mode = "mass", schoolId = "VOID" } = {}) {
  const rampColors = rampFor(schoolId, "none");
  const ramp = {
    void: rampColors[0],
    deep: rampColors[1] || rampColors[0],
    body: rampColors[2] || rampColors[1] || rampColors[0],
    frost: rampColors[3] || rampColors[2] || rampColors[0],
    hi: rampColors[4] || rampColors[3] || rampColors[0],
  };
  const occupancy = flattenVisible(snapshot);
  const shaded = mode === "cylinder" ? shadeCylinder(occupancy, ramp) : shadeMass(occupancy, ramp);
  return Object.freeze({
    algorithmId: FINISH_ALGORITHM_ID,
    mode,
    schoolId,
    sourceChecksum: snapshot.checksum,
    checksum: checksumCells(shaded, { algorithmId: FINISH_ALGORITHM_ID, mode, schoolId, source: snapshot.checksum }),
    cells: Object.freeze(shaded.map((cell) => Object.freeze(cell))),
  });
}

function flattenVisible(snapshot) {
  const map = new Map();
  for (const layer of snapshotLayers(snapshot)) {
    if (layer.visible === false) continue;
    for (const cell of layerCells(layer)) map.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y, color: cell.color });
  }
  return [...map.values()];
}

export function previewFinishWebGL(gl) {
  if (!gl) {
    throw new Error("PB-STUDIO-WEBGL-UNAVAILABLE · WebGL context is not available");
  }
  return { ok: true };
}

export function critiqueDocument(snapshot) {
  const coords = flattenVisible(snapshot);
  const count = coords.length;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of coords) {
    if (cell.x < minX) minX = cell.x;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const aspect = width / height;
  const compact = count > 0 ? count / (width * height + 1) : 0;
  const centerRef = Number.isFinite(snapshot.width) ? (snapshot.width - 1) / 2 : 32;
  const weakSilhouette = count === 0 || aspect < 0.7 || aspect > 1.45 || compact < 0.08;
  const likelyCenterDrift = count > 0 && Math.abs((minX + maxX) / 2 - centerRef) > 1.5;
  const steps = [];
  if (count === 0) {
    steps.push({
      id: 1,
      title: "SILHOUETTE & READABILITY",
      status: "FAIL",
      note: "No occupied cells. Block in Structure before shading.",
    });
  } else {
    steps.push({
      id: 1,
      title: "SILHOUETTE & READABILITY",
      status: weakSilhouette ? "FAIL" : "PASS",
      note: weakSilhouette
        ? "Silhouette collapses at icon size. Rebuild the outer contour before polish."
        : "Silhouette holds enough mass to read at icon size.",
    });
    steps.push({
      id: 2,
      title: "CENTER FOCAL ELEMENTS",
      status: likelyCenterDrift ? "FAIL" : "PASS",
      note: likelyCenterDrift
        ? "Mass is off-center. Rebuild the construction cross on 00_Reference."
        : "Mass sits near the construction center.",
    });
    steps.push({
      id: 3,
      title: "PRODUCTION CONSTRAINTS",
      status: (snapshot.palette || []).length > STUDIO_PALETTE_LIMIT ? "FAIL" : "PASS",
      note: `Palette ${Math.min((snapshot.palette || []).length, STUDIO_PALETTE_LIMIT)} / ${STUDIO_PALETTE_LIMIT}.`,
    });
  }
  return Object.freeze({
    revision: snapshot.revision ?? 0,
    checksum: snapshot.checksum,
    coordCount: count,
    aspect: Number(aspect.toFixed(2)),
    compact: Number(compact.toFixed(3)),
    weakSilhouette,
    likelyCenterDrift,
    externalService: false,
    steps: Object.freeze(steps.map((step) => Object.freeze(step))),
    nextActions: Object.freeze(
      steps.filter((step) => step.status === "FAIL").map((step) => step.note),
    ),
  });
}

function parseJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return { invalid: true, raw };
  }
}

export function loadStudioLibrary(storage) {
  const faults = [];
  const records = [];
  const v2 = parseJson(storage.getItem(LIBRARY_V2_KEY));
  if (v2.invalid) {
    faults.push(
      createStudioFault("PB-STUDIO-LOCAL-STORE", "v2 library JSON is invalid and was left untouched"),
    );
  } else {
    for (const record of v2) records.push(Object.freeze({ version: 2, ...record }));
  }
  const v1 = parseJson(storage.getItem(LIBRARY_V1_KEY));
  if (v1.invalid) {
    faults.push(
      createStudioFault("PB-STUDIO-LOCAL-STORE", "v1 library JSON is invalid and was left untouched"),
    );
  } else {
    for (const record of v1) {
      records.push(
        Object.freeze({
          version: 1,
          kind: "grass",
          id: record.id,
          name: record.name,
          width: record.width,
        }),
      );
    }
  }
  return { records: Object.freeze(records), faults: Object.freeze(faults) };
}

export function keepLocally(storage, snapshot, { name = "Untitled" } = {}) {
  const loaded = loadStudioLibrary(storage);
  const record = Object.freeze({
    version: 2,
    kind: "document",
    id: `doc-${String(snapshot.checksum).replace(/[^a-z0-9]/gi, "").slice(-16)}`,
    name: String(name),
    width: snapshot.width,
    height: snapshot.height,
    checksum: snapshot.checksum,
    revision: snapshot.revision ?? 0,
    snapshot,
  });
  const next = [record, ...loaded.records.filter((entry) => entry.version === 2 && entry.id !== record.id)].slice(
    0,
    40,
  );
  try {
    storage.setItem(LIBRARY_V2_KEY, JSON.stringify(next));
    return { kept: true, record };
  } catch (error) {
    return {
      kept: false,
      record,
      fault: createStudioFault("PB-STUDIO-LOCAL-STORE", error.message, { operation: "keep" }),
    };
  }
}

export function discardLocal(storage, id) {
  const loaded = loadStudioLibrary(storage);
  const next = loaded.records.filter((record) => record.version === 2 && record.id !== id);
  storage.setItem(LIBRARY_V2_KEY, JSON.stringify(next));
  return { discarded: true, id };
}

export function restoreLocal(doc, record) {
  if (!record?.snapshot?.layers) {
    throw new Error("PB-STUDIO-LOCAL-STORE · record has no restorable snapshot");
  }
  return doc.replaceFromRaster({
    width: record.snapshot.width,
    height: record.snapshot.height,
    kind: "png",
    palette: record.snapshot.palette,
    layers: record.snapshot.layers,
  });
}

export function exportRecipe(snapshot, events = []) {
  return Object.freeze({
    contract: "PB-STUDIO-RECIPE-v1",
    checksum: snapshot.checksum,
    revision: snapshot.revision ?? 0,
    width: snapshot.width,
    height: snapshot.height,
    layers: snapshotLayers(snapshot).map((layer) => layer.name),
    events: events.slice(0, EVENT_HISTORY_LIMIT),
  });
}
