/**
 * VRI Compiler — Lowers SCDL packet + art genes + shader into a VRI scene.
 *
 * This is the bridge between "what exists" (SCDL) and "how it looks" (VRI).
 * Pure function. Deterministic. No I/O.
 *
 * Fixes applied (QA round 2):
 *   1. Scene-graph input preservation — lowers PB-SCENE-GRAPH-v1 packets
 *      via renderSceneGraph + framebufferToCoordinates, or fails explicitly.
 *   2. True content-addressed checksums — hashes the full canonical scene,
 *      not just structural metadata.
 *   3. Material seed diversity — fnv1aNum returns uint32; hex only for IDs.
 *   4. Object-space texture coherence — coordinateSpace field on textures.
 *   5. Art-gene expressiveness — gene-binding pass translates bindings into
 *      concrete render channels (geometry, contour, lighting, atmosphere, palette).
 *
 * @bytecode PB-VRI-COMPILE-v2
 */

import {
  VRI_VERSION, LAYER_TYPES, BLEND_MODES, TEXTURE_KINDS, LIGHT_KINDS,
  QUANTIZATION_MODES,
  createGeometryLayer, createTextureLayer, createMarkLayer,
  createRasterPatchLayer, createVRIScene, createQuantizationSpec,
} from './vri-schema.js';
import { RENDERER_CAPABILITIES } from './vri-renderer.js';
import { MATERIAL_PALETTES, resolveMaterialId } from '../material-registry.js';

// ─── Material → Texture Kind mapping ─────────────────────────────────────────

// Exported so the material validator can treat this as a declared compartment
// rather than a private table. It is keyed independently of MATERIAL_PALETTES,
// which is how five species (`steel`, `iron`, `oak_bark`, `leather`,
// `moonstone`) came to have textures without existing in the registry.
export const MATERIAL_TO_TEXTURE = Object.freeze({
  obsidian: TEXTURE_KINDS.CRYSTAL,
  darksteel: TEXTURE_KINDS.METAL_GRAIN,
  holy_steel: TEXTURE_KINDS.METAL_GRAIN,
  steel: TEXTURE_KINDS.METAL_GRAIN,
  iron: TEXTURE_KINDS.METAL_GRAIN,
  gold: TEXTURE_KINDS.METAL_GRAIN,
  silver: TEXTURE_KINDS.METAL_GRAIN,
  bronze: TEXTURE_KINDS.METAL_GRAIN,
  void_gold: TEXTURE_KINDS.METAL_GRAIN,
  voidsteel: TEXTURE_KINDS.METAL_GRAIN,
  blacksteel: TEXTURE_KINDS.METAL_GRAIN,
  black_steel: TEXTURE_KINDS.METAL_GRAIN,
  deep_indigo_steel: TEXTURE_KINDS.METAL_GRAIN,
  bark: TEXTURE_KINDS.BARK,
  oak_bark: TEXTURE_KINDS.BARK,
  voidbark: TEXTURE_KINDS.BARK,
  pine_needle: TEXTURE_KINDS.FOLIAGE,
  astralmoss: TEXTURE_KINDS.MOSS,
  void_cloth: TEXTURE_KINDS.FABRIC,
  leather: TEXTURE_KINDS.FABRIC,
  diamond: TEXTURE_KINDS.CRYSTAL,
  sapphire: TEXTURE_KINDS.CRYSTAL,
  ruby: TEXTURE_KINDS.CRYSTAL,
  emerald: TEXTURE_KINDS.CRYSTAL,
  amethyst: TEXTURE_KINDS.CRYSTAL,
  onyx: TEXTURE_KINDS.CRYSTAL,
  moonstone: TEXTURE_KINDS.CRYSTAL,
  crystal: TEXTURE_KINDS.CRYSTAL,
  slime_gel: TEXTURE_KINDS.WATER,
  holy_fire: TEXTURE_KINDS.CLOUD,
  icy_fire: TEXTURE_KINDS.CLOUD,
  shadow_fire: TEXTURE_KINDS.CLOUD,
  void_rune_glow: TEXTURE_KINDS.CRYSTAL,
  cyan_glow: TEXTURE_KINDS.CRYSTAL,
});

// ─── Texture parameters per kind ─────────────────────────────────────────────

const TEXTURE_PARAMS = Object.freeze({
  [TEXTURE_KINDS.METAL_GRAIN]: { frequency: 0.22, crossFrequency: 0.10, amplitude: 0.45, direction: 0, octaves: 3 },
  [TEXTURE_KINDS.BARK]:        { frequency: 0.32, crossFrequency: 0.08, amplitude: 0.85, direction: 0, octaves: 4 },
  [TEXTURE_KINDS.FOLIAGE]:     { frequency: 0.35, crossFrequency: 0.09, amplitude: 0.55, direction: Math.PI / 5, octaves: 3 },
  [TEXTURE_KINDS.MOSS]:        { frequency: 0.22, crossFrequency: 0.09, amplitude: 0.45, direction: Math.PI / 3, octaves: 3 },
  [TEXTURE_KINDS.STONE]:       { frequency: 0.18, crossFrequency: 0.12, amplitude: 0.35, direction: 0, octaves: 4 },
  [TEXTURE_KINDS.FABRIC]:      { frequency: 0.30, crossFrequency: 0.05, amplitude: 0.20, direction: Math.PI / 4, octaves: 2 },
  [TEXTURE_KINDS.CRYSTAL]:     { frequency: 0.15, crossFrequency: 0.08, amplitude: 0.30, direction: Math.PI / 3, octaves: 3 },
  [TEXTURE_KINDS.WATER]:       { frequency: 0.12, crossFrequency: 0.06, amplitude: 0.35, direction: Math.PI / 2, octaves: 3 },
  [TEXTURE_KINDS.CLOUD]:       { frequency: 0.10, crossFrequency: 0.04, amplitude: 0.60, direction: 0, octaves: 4 },
  [TEXTURE_KINDS.DIRT]:        { frequency: 0.28, crossFrequency: 0.14, amplitude: 0.40, direction: 0, octaves: 3 },
  [TEXTURE_KINDS.CORROSION]:   { frequency: 0.25, crossFrequency: 0.15, amplitude: 0.50, direction: 0, octaves: 4 },
  [TEXTURE_KINDS.WOOD_GRAIN]:  { frequency: 0.25, crossFrequency: 0.06, amplitude: 0.50, direction: 0, octaves: 3 },
});

// ─── Texture coordinate space defaults per kind ──────────────────────────────
// Fix #4: Object-space texture coherence.
// bark → object (grain follows each tree's local surface)
// foliage → object (clusters attach to branch geometry)
// water → surface (flow-aligned to the water plane)
// fog/grading → screen (canvas-wide, not per-object)
// metal/stone/crystal → object (grain follows the part's local frame)

const TEXTURE_SPACE = Object.freeze({
  [TEXTURE_KINDS.METAL_GRAIN]: 'object',
  [TEXTURE_KINDS.BARK]: 'object',
  [TEXTURE_KINDS.FOLIAGE]: 'object',
  [TEXTURE_KINDS.MOSS]: 'object',
  [TEXTURE_KINDS.STONE]: 'object',
  [TEXTURE_KINDS.FABRIC]: 'object',
  [TEXTURE_KINDS.CRYSTAL]: 'object',
  [TEXTURE_KINDS.WATER]: 'surface',
  [TEXTURE_KINDS.CLOUD]: 'world',
  [TEXTURE_KINDS.DIRT]: 'world',
  [TEXTURE_KINDS.CORROSION]: 'object',
  [TEXTURE_KINDS.WOOD_GRAIN]: 'object',
});

// ─── FNV-1a hash — Fix #3: return numeric uint32, hex-encode only for IDs ───

/**
 * FNV-1a hash returning a numeric uint32.
 * Use this for seeds, bitwise ops, and numeric comparisons.
 */
export function fnv1aNum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * FNV-1a hash returning an 8-char hex string.
 * Use this only for human-readable IDs and checksum display.
 */
export function fnv1aHex(str) {
  return fnv1aNum(str).toString(16).padStart(8, '0');
}

// ─── Scene-graph lowering ────────────────────────────────────────────────────
//
// compileVRI() does not lower scene graphs. Lowering means running
// renderSceneGraph() + framebufferToCoordinates() (see scdl.exporters.js for a
// caller that does exactly that), which is a rasterisation step and not this
// compiler's job. A scene-graph packet must arrive with
// options.loweredCoordinates or the compile refuses — see compileVRI().
//
// A previous version kept an async lazy-import (`ensureSceneGraphRenderer`)
// and a `lowerSceneGraph()` that validated the contract and then always
// returned null. Nothing ever awaited the import and nothing consumed a
// non-null return, so the scaffolding advertised a capability that could not
// engage. It has been removed rather than left implying a lowering path.

// ─── Gene-binding pass ───────────────────────────────────────────────────────
// Fix #5: Art-gene expressiveness.
// Genes can now carry `bindings` that translate aesthetic intent into
// concrete render channel modifications.

const GENE_BINDING_CHANNELS = Object.freeze({
  GEOMETRY: 'geometry',       // elongate, compress, taper, exaggerate
  CONTOUR: 'contour',         // sharpen, soften, breakup, smooth
  LIGHTING: 'lighting',       // increase-rim, decrease-key, add-glow
  ATMOSPHERE: 'atmosphere',   // add-fog, increase-bloom, grade-warm
  PALETTE: 'palette',         // compress, shift-hue, desaturate
  TEXTURE: 'texture',         // increase-grain, add-moss, weather
  DENSITY: 'density',         // increase-mark-density, reduce-detail
});

/**
 * Apply gene bindings to the VRI scene layers and lights.
 * Returns { layers, lights, atmosphere } with modifications applied.
 */
function applyGeneBindings(genes, layers, lights, atmosphere, W, H) {
  const mods = { layers: [...layers], lights: [...lights], atmosphere: { ...atmosphere } };

  for (const gene of genes) {
    if (!gene?.bindings || !Array.isArray(gene.bindings)) continue;

    for (const binding of gene.bindings) {
      const { channel, operation, amount = 0.5, targets } = binding;
      if (!channel || !operation) continue;

      switch (channel) {
        case GENE_BINDING_CHANNELS.LIGHTING: {
          if (operation === 'increase-rim') {
            const rim = mods.lights.find(l => l.kind === LIGHT_KINDS.RIM);
            if (rim) {
              mods.lights = mods.lights.map(l =>
                l.id === rim.id ? { ...l, intensity: Math.min(1, l.intensity + amount) } : l
              );
            } else {
              mods.lights.push({
                id: `gene-rim-${gene.geneId}`,
                kind: LIGHT_KINDS.RIM,
                position: [W * 0.75, H * 0.2],
                direction: [0.5, -0.3],
                color: '#8AB4F8',
                intensity: amount,
                radius: W,
                angle: 30,
                affects: targets?.materials || [],
              });
            }
          } else if (operation === 'add-glow') {
            mods.lights.push({
              id: `gene-glow-${gene.geneId}`,
              kind: LIGHT_KINDS.POINT,
              position: targets?.position || [W / 2, H / 2],
              direction: [0, 0],
              color: targets?.color || '#FFD700',
              intensity: amount,
              radius: targets?.radius || W * 0.4,
              angle: 360,
              affects: targets?.materials || [],
            });
          }
          break;
        }

        case GENE_BINDING_CHANNELS.ATMOSPHERE: {
          if (operation === 'add-fog') {
            mods.atmosphere.fog = {
              color: targets?.color || '#1A1A2E',
              near: targets?.near ?? H * 0.6,
              far: targets?.far ?? H,
              density: amount,
            };
          } else if (operation === 'increase-bloom') {
            mods.atmosphere.bloom = {
              threshold: targets?.threshold ?? 0.7,
              radius: targets?.radius ?? 3,
              intensity: amount,
            };
          } else if (operation === 'grade-warm') {
            mods.atmosphere.grading = {
              ...mods.atmosphere.grading,
              contrast: (mods.atmosphere.grading?.contrast ?? 1.0) + amount * 0.2,
              saturation: (mods.atmosphere.grading?.saturation ?? 1.0) + amount * 0.15,
            };
          }
          break;
        }

        case GENE_BINDING_CHANNELS.TEXTURE: {
          if (operation === 'increase-grain') {
            const targetMats = targets?.materials || [];
            mods.layers = mods.layers.map(l => {
              if (l.type !== LAYER_TYPES.TEXTURE_FIELD) return l;
              const filter = l.payload.materialFilter;
              if (targetMats.length && filter && !targetMats.some(m => filter.includes(m))) return l;
              return {
                ...l,
                payload: {
                  ...l.payload,
                  amplitude: Math.min(1.5, l.payload.amplitude * (1 + amount)),
                  octaves: Math.min(6, l.payload.octaves + 1),
                },
              };
            });
          }
          break;
        }

        case GENE_BINDING_CHANNELS.CONTOUR: {
          if (operation === 'sharpen' || operation === 'soften') {
            const geoLayer = mods.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
            if (geoLayer) {
              const factor = operation === 'sharpen' ? (1 - amount * 0.5) : (1 + amount * 0.5);
              mods.layers = mods.layers.map(l =>
                l.id === geoLayer.id
                  ? { ...l, payload: { ...l.payload, aaWidth: l.payload.aaWidth * factor } }
                  : l
              );
            }
          }
          break;
        }

        case GENE_BINDING_CHANNELS.GEOMETRY: {
          // Geometry bindings are recorded as metadata for downstream passes.
          // The VRI compiler does not deform geometry directly (that's SCDL's job),
          // but it records the intent so the renderer can apply subtle effects.
          if (!mods._geometryIntents) mods._geometryIntents = [];
          mods._geometryIntents.push({ geneId: gene.geneId, operation, amount, targets });
          break;
        }

        case GENE_BINDING_CHANNELS.PALETTE: {
          // Palette bindings are recorded for the grading pass.
          if (!mods._paletteIntents) mods._paletteIntents = [];
          mods._paletteIntents.push({ geneId: gene.geneId, operation, amount, targets });
          break;
        }

        case GENE_BINDING_CHANNELS.DENSITY: {
          // Density bindings modulate mark pressure/width.
          if (operation === 'increase-mark-density') {
            mods.layers = mods.layers.map(l => {
              if (l.type !== LAYER_TYPES.MARK) return l;
              return {
                ...l,
                payload: {
                  ...l.payload,
                  marks: l.payload.marks.map(m => ({
                    ...m,
                    pressure: Math.min(1, (m.pressure ?? 1) * (1 + amount * 0.3)),
                  })),
                },
              };
            });
          }
          break;
        }

        default:
          // Unknown channel — record but don't fail (forward compat)
          break;
      }
    }
  }

  return mods;
}

// ─── Palette ramp resolution ─────────────────────────────────────────────────
//
// The material registry is the authority on colour. The compiler reads it once
// and bakes the resulting ramps into the scene, so the renderer never imports
// the registry and rendering remains a pure function of the scene it is handed.
//
// Anchor order is the ramp order. `qbit-phosphorylation` already treats it that
// way — it indexes `Object.values(material.anchors)` by SDF depth, rim to core.
// That ordering is a registry convention rather than a validated contract, and
// a handful of materials break it (emissive ramps whose bright anchors are
// deliberately less luminant, plus a couple of genuine `deep`/`body`
// inversions). Nearest-anchor selection is chosen partly because it is immune
// to that: it never assumes position implies brightness, so a mis-ordered ramp
// yields a wrong-index colour rather than an inverted gradient.

/**
 * Resolve the anchor ramp for a material id.
 * Returns null for unknown, passthrough, or anchor-less materials, which are
 * then left unquantized rather than being forced onto someone else's palette.
 */
function resolveRamp(material) {
  if (!material) return null;
  const id = resolveMaterialId(material);
  const definition = MATERIAL_PALETTES[id];
  if (!definition || definition.rules?.passthrough) return null;

  const colors = Object.values(definition.anchors || {})
    .filter(hex => typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex));
  return colors.length > 0 ? colors : null;
}

/**
 * Build the scene quantization spec for the materials actually present.
 *
 * `options.quantize` accepts:
 *   false | 'off'        → no quantization (default; preserves prior output)
 *   true | 'luminance-band'  → map colour onto the ramp by luminance position
 *   'nearest-anchor'      → snap to the nearest ramp colour, preserving hue
 *   { mode, ramps }      → explicit override, for callers supplying their own
 *                          palette instead of the registry's
 */
function buildQuantization(quantize, materialsInScene) {
  if (!quantize || quantize === QUANTIZATION_MODES.OFF) {
    return createQuantizationSpec(QUANTIZATION_MODES.OFF, {});
  }

  if (typeof quantize === 'object') {
    return createQuantizationSpec(
      quantize.mode || QUANTIZATION_MODES.NEAREST_ANCHOR,
      quantize.ramps || {},
    );
  }

  const mode = quantize === true ? QUANTIZATION_MODES.LUMINANCE_BAND : quantize;
  const ramps = {};
  for (const material of materialsInScene) {
    const ramp = resolveRamp(material);
    if (ramp) ramps[material] = ramp;
  }
  return createQuantizationSpec(mode, ramps);
}

// ─── Palette coverage ────────────────────────────────────────────────────────
//
// Under this engine's semantics the authored hex is a **value sketch**: the
// material name carries colour intent and LUMINANCE_BAND maps value onto ramp
// position. Swapping `material crystal` for `material ruby` recolours a part
// while preserving its form.
//
// An earlier version of this pass measured "palette drift" — RGB distance from
// an authored colour to its material's ramp — and reported `holy_steel` painted
// gold as a defect. Under value-sketch semantics that is not a defect at all:
// gold is luminance 0.70, which lands on holy_steel's upper anchor exactly as
// designed. The metric was measuring hue divergence in a system that discards
// hue on purpose.
//
// What actually matters is whether a part's value range spans enough of its
// ramp for a material swap to express anything. A part painted one flat colour
// reaches one anchor, so every material renders it as a single block. That is
// the real failure mode, and it needs no tuned threshold: one anchor used means
// the ramp is doing no work.
const FLAT_ANCHOR_COUNT = 1;

function hexTriplet(hex) {
  if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Per-material ramp coverage of the authored colours.
 *
 * Returns an entry for every material with a resolvable ramp, sorted
 * least-covered first, each carrying `flat: true` when the value sketch reaches
 * a single anchor. Reporting every material rather than only the failures keeps
 * the measurement inspectable — coverage is a spectrum, not a pass/fail.
 */
function collectPaletteCoverage(coords) {
  const perMaterial = new Map();

  for (const cell of coords) {
    const ramp = resolveRamp(cell.material);
    if (!ramp) continue;
    const rgb = hexTriplet(cell.color);
    if (!rgb) continue;

    if (!perMaterial.has(cell.material)) {
      perMaterial.set(cell.material, { anchorCount: ramp.length, indices: new Set(), min: 1, max: 0 });
    }
    const entry = perMaterial.get(cell.material);
    const L = relativeLuminance(rgb);
    const last = entry.anchorCount - 1;
    entry.indices.add(Math.max(0, Math.min(last, Math.round(L * last))));
    if (L < entry.min) entry.min = L;
    if (L > entry.max) entry.max = L;
  }

  return [...perMaterial.entries()]
    .map(([material, e]) => ({
      material,
      anchorCount: e.anchorCount,
      anchorsUsed: e.indices.size,
      coverage: Number((e.indices.size / e.anchorCount).toFixed(3)),
      span: Number((e.max - e.min).toFixed(3)),
      flat: e.indices.size <= FLAT_ANCHOR_COUNT,
      reason: e.indices.size <= FLAT_ANCHOR_COUNT
        ? 'authored colours reach a single ramp anchor; a material swap can only recolour this flat'
        : null,
    }))
    .sort((a, b) => a.anchorsUsed - b.anchorsUsed || a.material.localeCompare(b.material));
}

// ─── Unrendered-declaration diagnostics ──────────────────────────────────────
//
// The VRI schema is deliberately wider than the renderer. Carrying a field the
// renderer never reads is legitimate — forward compatibility, downstream
// consumers — but it must not be indistinguishable from a field that works.
// An author who sets bloom, or a mask, or a hard-light blend, and sees no
// change in the output has no way to tell "wrong value" from "not implemented".
//
// This pass diffs the compiled scene against RENDERER_CAPABILITIES and records
// what will not survive to pixels. It is a report, never a refusal: compilation
// succeeds and the scene is unchanged.

/** Gene binding operations that applyGeneBindings() actually acts on. */
const IMPLEMENTED_GENE_OPERATIONS = Object.freeze({
  [GENE_BINDING_CHANNELS.LIGHTING]: ['increase-rim', 'add-glow'],
  [GENE_BINDING_CHANNELS.ATMOSPHERE]: ['add-fog', 'increase-bloom', 'grade-warm'],
  [GENE_BINDING_CHANNELS.TEXTURE]: ['increase-grain'],
  [GENE_BINDING_CHANNELS.CONTOUR]: ['sharpen', 'soften'],
  [GENE_BINDING_CHANNELS.DENSITY]: ['increase-mark-density'],
  // Recorded into provenance for downstream interpretation; the compiler does
  // not deform geometry or recolour the scene.
  [GENE_BINDING_CHANNELS.GEOMETRY]: [],
  [GENE_BINDING_CHANNELS.PALETTE]: [],
});

const RECORDED_ONLY_CHANNELS = new Set([
  GENE_BINDING_CHANNELS.GEOMETRY,
  GENE_BINDING_CHANNELS.PALETTE,
]);

function collectUnrenderedDeclarations(layers, lights, atmosphere, genes, quantization, unresolvedMaterials = []) {
  const found = [];
  const seen = new Set();
  const report = (field, value, reason) => {
    const key = `${field}␟${String(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ field, value, reason });
  };

  const blendModes = new Set(RENDERER_CAPABILITIES.blendModes);
  const layerTypes = new Set(RENDERER_CAPABILITIES.layerTypes);
  const lightKinds = new Set(RENDERER_CAPABILITIES.lightKinds);
  const textureSpaces = new Set(RENDERER_CAPABILITIES.textureSpaces);

  for (const l of layers) {
    if (!layerTypes.has(l.type)) {
      report('layer.type', l.type, 'no renderer pass handles this layer type');
    }
    if (!blendModes.has(l.blendMode)) {
      report('layer.blendMode', l.blendMode, 'applyBlend() has no branch for this mode; it falls back to normal');
    }
    if (l.maskRef) {
      report('layer.maskRef', l.maskRef, 'the renderer executes no clipping pass; the mask is ignored');
    }

    const p = l.payload || {};
    if (l.type === LAYER_TYPES.GEOMETRY && p.aaWidth !== undefined && p.aaWidth !== 1.0) {
      report('geometry.aaWidth', p.aaWidth, 'edge softness is derived from output scale; authored aaWidth is not read');
    }
    if (l.type === LAYER_TYPES.TEXTURE_FIELD) {
      if (p.partFilter) {
        report('texture.partFilter', p.partFilter, 'only materialFilter is honoured when selecting cells');
      }
      if (p.coordinateSpace && !textureSpaces.has(p.coordinateSpace)) {
        report('texture.coordinateSpace', p.coordinateSpace, 'unknown space; evaluation falls back to canvas coordinates');
      }
    }
    if (l.type === LAYER_TYPES.MARK) {
      if (p.ditherMatrix) {
        report('mark.ditherMatrix', p.ditherMatrix, 'the renderer executes no dither pass');
      }
      if (Array.isArray(p.marks) && p.marks.some(m => m?.width !== undefined && m.width !== 1.0)) {
        report('mark.width', 'non-default', 'marks fill one whole cell; per-mark width is not read');
      }
    }
  }

  // depthBand is declared as z-order but layers are drawn in array order and
  // never sorted, so distinct bands are decoration unless they already agree
  // with array order.
  const bands = layers.map(l => l.depthBand ?? 0);
  const sorted = [...bands].sort((a, b) => a - b);
  if (bands.some((b, i) => b !== sorted[i])) {
    report('layer.depthBand', bands.join(','), 'layers render in array order; depthBand does not reorder them');
  }

  for (const light of lights) {
    if (!lightKinds.has(light.kind)) {
      report('light.kind', light.kind, 'this kind contributes no illumination and is skipped by the lighting pass');
    }
  }

  const atmoPasses = new Set(RENDERER_CAPABILITIES.atmosphere);
  for (const key of ['fog', 'bloom', 'grading']) {
    if (atmosphere?.[key] && !atmoPasses.has(key)) {
      report(`atmosphere.${key}`, true, `the renderer executes no ${key} pass; the data is carried but never applied`);
    }
  }

  const quantModes = new Set(RENDERER_CAPABILITIES.quantizationModes);
  if (quantization && !quantModes.has(quantization.mode)) {
    report('quantization.mode', quantization.mode, 'no renderer pass implements this quantization mode; colour is left as computed');
  }
  if (quantization?.mode === QUANTIZATION_MODES.LUMINANCE_BAND
      || quantization?.mode === QUANTIZATION_MODES.NEAREST_ANCHOR) {
    if (Object.keys(quantization.ramps || {}).length === 0) {
      report('quantization.ramps', 'empty', 'quantization is enabled but no material in this scene resolved to a ramp; nothing will be snapped');
    }
    // A material can carry a texture layer without existing in the registry —
    // MATERIAL_TO_TEXTURE is keyed independently of MATERIAL_PALETTES, and
    // several of its keys (`steel`, `iron`, `oak_bark`, `leather`, `moonstone`)
    // have no registry entry. Those resolve to `source`, which is passthrough,
    // so they render textured but unquantized. Naming them beats leaving an
    // author to wonder why half the sprite kept its procedural colour.
    for (const material of unresolvedMaterials) {
      report('quantization.material', material, 'material has no registry ramp (unknown or passthrough); its pixels are left as computed');
    }
  }

  for (const gene of genes) {
    for (const binding of (gene?.bindings || [])) {
      const { channel, operation } = binding || {};
      if (!channel || !operation) continue;
      const implemented = IMPLEMENTED_GENE_OPERATIONS[channel];
      if (implemented === undefined) {
        report('gene.binding.channel', channel, 'unknown binding channel; ignored for forward compatibility');
      } else if (RECORDED_ONLY_CHANNELS.has(channel)) {
        report('gene.binding.recordedOnly', channel, 'recorded into provenance as intent; it does not alter the scene');
      } else if (!implemented.includes(operation)) {
        report('gene.binding.operation', `${channel}:${operation}`, 'no compiler branch implements this operation');
      }
    }
  }

  return found;
}

// ─── Main Compiler ───────────────────────────────────────────────────────────

/**
 * Compile a VRI scene from SCDL packet + optional art genes + shader packet.
 *
 * @param {object} packet - PixelBrainAssetPacket from SCDL compiler
 * @param {object} [options]
 * @param {object[]} [options.artGenes] - PB-SCDNA-GENE-v1 packets
 * @param {object} [options.shaderPacket] - PB-SHADER-v1 packet
 * @param {object} [options.lighting] - Scene lighting override
 * @param {object} [options.atmosphere] - Atmospheric effects override
 * @param {object[]} [options.rasterPatches] - Authored pixel patches
 * @param {object[]} [options.loweredCoordinates] - Pre-lowered coords for scene-graph packets
 * @returns {object} VRI scene (frozen)
 */
export function compileVRI(packet, options = {}) {
  const {
    artGenes = [], shaderPacket = null, lighting = null,
    atmosphere = null, rasterPatches = [], loweredCoordinates = null,
    quantize = false,
    // How far texture grain may move a pixel, as a fraction of one ramp step.
    // Below 1.0 the grain textures a band; at or above it, the grain
    // reassigns bands and reads as specular gloss rather than material.
    textureGrainSteps = 0.5,
  } = options;

  const canvas = packet.canvas || { width: 16, height: 24 };
  const W = canvas.width;
  const H = canvas.height;

  // ── Fix #1: Scene-graph input preservation ──────────────────────────────
  let coords;
  const geoMode = packet.geometry?.mode;

  if (geoMode === 'scene-graph') {
    // Scene-graph packets carry no flat coordinates by design.
    // Validate the contract first, regardless of lowering path.
    const sg = packet.geometry?.sceneGraph;
    if (!sg) {
      throw new Error(
        'VRI-COMPILE: packet.geometry.mode is "scene-graph" but ' +
        'packet.geometry.sceneGraph is missing. Cannot lower to VRI.'
      );
    }
    if (sg.contract !== 'PB-SCENE-GRAPH-v1') {
      throw new Error(
        `VRI-COMPILE: unsupported scene-graph contract "${sg.contract}". ` +
        'Expected "PB-SCENE-GRAPH-v1".'
      );
    }

    // The caller must provide pre-lowered coordinates (from renderSceneGraph
    // + framebufferToCoordinates) or we fail explicitly.
    if (loweredCoordinates && Array.isArray(loweredCoordinates) && loweredCoordinates.length > 0) {
      coords = loweredCoordinates;
    } else {
      throw new Error(
        'VRI-COMPILE: scene-graph packet requires lowered coordinates. ' +
        'Call renderSceneGraph(packet.geometry.sceneGraph, canvas) then ' +
        'framebufferToCoordinates(fb) and pass the result as ' +
        'options.loweredCoordinates. The compiler will not silently ' +
        'produce empty geometry from a scene-graph packet.'
      );
    }
  } else {
    coords = packet.geometry?.coordinates || [];
  }

  const layers = [];
  const lights = [];

  // ── Layer 0: Geometry (the SDF-backed forms from SCDL) ──────────────────
  layers.push(createGeometryLayer('geo-base', coords, {
    coverageMode: 'sdf',
    aaWidth: 1.0,
    depthBand: 0,
  }));

  // ── Layer 1+: Texture fields (one per distinct material with a texture) ──
  // One texture layer per distinct textured material. `materialsInScene` is
  // already a Set, so the previous `kind + ':' + mat` seen-guard could never
  // fire — every iteration produced a unique key by construction.
  const materialsInScene = new Set(coords.map(c => c.material).filter(Boolean));
  let textureLayerCount = 0;

  for (const mat of materialsInScene) {
    const kind = MATERIAL_TO_TEXTURE[mat];
    if (!kind) continue;
    textureLayerCount++;

    const params = TEXTURE_PARAMS[kind] || TEXTURE_PARAMS[TEXTURE_KINDS.STONE];
    const coordSpace = TEXTURE_SPACE[kind] || 'object';

    // When quantizing, cap grain to a fraction of this material's ramp step.
    const matRamp = resolveRamp(mat);
    const rampSteps = matRamp && matRamp.length > 1 ? matRamp.length - 1 : null;
    const maxLuminanceDelta = (quantize && rampSteps)
      ? (textureGrainSteps / rampSteps)
      : null;

    layers.push(createTextureLayer(`tex-${mat}`, kind, {
      ...params,
      maxLuminanceDelta,
      // Fix #3: fnv1aNum returns uint32 — bitwise ops work correctly
      seed: fnv1aNum(mat) & 0xFFFF,
      materialFilter: [mat],
      // Fix #4: coordinate space for texture coherence
      coordinateSpace: coordSpace,
      blendMode: BLEND_MODES.OVERLAY,
      opacity: 0.55,
      depthBand: 1,
    }));
  }

  // ── Layer N: Mark-making from art genes ─────────────────────────────────
  for (const gene of artGenes) {
    if (!gene || !gene.geneId) continue;
    const hints = gene.geometryHints || {};
    const cells = hints.cells || [];
    if (cells.length > 0) {
      const marks = cells.map(c => ({
        x: c.x,
        y: c.y,
        pressure: c.pressure ?? 1.0,
        width: c.width ?? 1.0,
      }));

      layers.push(createMarkLayer(`mark-${gene.geneId}`, 'stamp', marks, {
        color: hints.color || '#FFFFFF',
        pressure: 1.0,
        strokeWidth: 1.0,
        blendMode: BLEND_MODES.NORMAL,
        opacity: 1.0,
        depthBand: 2,
      }));
    }

    // PB-SCDNA-GENE-v1 explicit coordinates → raster patch layer.
    // These carry per-pixel color data (unlike stamp marks which are monochrome).
    const geneCoords = gene.coordinates || [];
    if (geneCoords.length > 0) {
      const pixels = geneCoords.map(c => ({
        x: c.x,
        y: c.y,
        color: c.color || '#FFFFFF',
        alpha: c.alpha ?? 1.0,
        role: c.role || 'gene-cell',
        partId: c.partId || null,
      }));
      layers.push(createRasterPatchLayer(`gene-patch-${gene.geneId}`, pixels, {
        blendMode: BLEND_MODES.NORMAL,
        opacity: 1.0,
        depthBand: 3,
        source: `gene:${gene.geneId}`,
      }));
    }
  }

  // ── Layer N+1: Raster escape hatches ────────────────────────────────────
  for (const patch of rasterPatches) {
    if (!patch || !patch.pixels) continue;
    layers.push(createRasterPatchLayer(
      patch.id || `raster-${fnv1aHex(JSON.stringify(patch.pixels).slice(0, 64))}`,
      patch.pixels,
      {
        blendMode: patch.blendMode || BLEND_MODES.NORMAL,
        opacity: patch.opacity ?? 1.0,
        depthBand: 3,
        // Carried, not honoured — the renderer has no clipping pass. Forwarding
        // it (rather than dropping it here) is what lets the unrendered-
        // declaration pass tell the author it will have no effect.
        maskRef: patch.maskRef || null,
        source: patch.source || 'authored',
      }
    ));
  }

  // ── Lights ──────────────────────────────────────────────────────────────
  if (lighting) {
    if (lighting.key) {
      lights.push({
        id: 'key-light',
        kind: LIGHT_KINDS.DIRECTIONAL,
        position: lighting.key.position || [W * 0.25, H * 0.15],
        direction: lighting.key.direction || [-0.447, -0.537],
        color: lighting.key.color || '#FFFFFF',
        intensity: lighting.key.intensity ?? 0.8,
        radius: lighting.key.radius ?? W * 2,
        angle: lighting.key.angle ?? 45,
        affects: lighting.key.affects || [],
      });
    }
    if (lighting.rim) {
      lights.push({
        id: 'rim-light',
        kind: LIGHT_KINDS.RIM,
        position: lighting.rim.position || [W * 0.75, H * 0.2],
        direction: lighting.rim.direction || [0.5, -0.3],
        color: lighting.rim.color || '#8AB4F8',
        intensity: lighting.rim.intensity ?? 0.4,
        radius: lighting.rim.radius ?? W,
        angle: lighting.rim.angle ?? 30,
        affects: lighting.rim.affects || [],
      });
    }
    if (lighting.ambient) {
      lights.push({
        id: 'ambient',
        kind: LIGHT_KINDS.AMBIENT,
        position: [W / 2, H / 2],
        direction: [0, 0],
        color: lighting.ambient.color || '#1A1A2E',
        intensity: lighting.ambient.intensity ?? 0.2,
        radius: W * 3,
        angle: 360,
        affects: [],
      });
    }
    if (lighting.points) {
      for (const pt of lighting.points) {
        lights.push({
          id: pt.id || `point-${fnv1aHex(JSON.stringify(pt))}`,
          kind: LIGHT_KINDS.POINT,
          position: pt.position || [W / 2, H / 2],
          direction: [0, 0],
          color: pt.color || '#FFD700',
          intensity: pt.intensity ?? 0.6,
          radius: pt.radius ?? W * 0.5,
          angle: 360,
          affects: pt.affects || [],
        });
      }
    }
  } else {
    // Default: upper-left key + a fill that sets the shadow floor.
    //
    // The renderer modulates the albedo rather than adding to it, so ambient is
    // no longer a faint tint on top of a bright surface — it is how much of the
    // authored colour survives where the key light does not reach. The previous
    // near-black ambient (#0A0A14 at 0.15) was almost a no-op under additive
    // lighting; under a multiplying renderer it would crush every shadowed pixel
    // to black. A cool blue-grey fill at 0.3 keeps shadows readable and retains
    // the cold cast the original dark-blue ambient was reaching for.
    lights.push({
      id: 'default-key',
      kind: LIGHT_KINDS.DIRECTIONAL,
      position: [W * 0.25, H * 0.1],
      direction: [-0.447, -0.537],
      color: '#FFFFFF',
      intensity: 0.7,
      radius: W * 2,
      angle: 45,
      affects: [],
    });
    lights.push({
      id: 'default-ambient',
      kind: LIGHT_KINDS.AMBIENT,
      position: [W / 2, H / 2],
      direction: [0, 0],
      color: '#8890B0',
      intensity: 0.3,
      radius: W * 3,
      angle: 360,
      affects: [],
    });
  }

  // ── Atmosphere ──────────────────────────────────────────────────────────
  let atmo = atmosphere || { fog: null, bloom: null, grading: null };

  // ── Shader packet integration ───────────────────────────────────────────
  if (shaderPacket && shaderPacket.lights) {
    for (const sl of shaderPacket.lights) {
      lights.push({
        id: sl.id || `shader-${fnv1aHex(JSON.stringify(sl))}`,
        kind: sl.kind || LIGHT_KINDS.POINT,
        position: sl.position || [W / 2, H / 2],
        direction: sl.direction || [0, -1],
        color: sl.color || '#FFFFFF',
        intensity: sl.intensity ?? 0.5,
        radius: sl.radius ?? W,
        angle: sl.angle ?? 360,
        affects: sl.affects || [],
      });
    }
  }

  // ── Fix #5: Gene-binding pass ───────────────────────────────────────────
  const bound = applyGeneBindings(artGenes, layers, lights, atmo, W, H);
  const finalLayers = bound.layers;
  const finalLights = bound.lights;
  const finalAtmo = bound.atmosphere;

  // ── Palette quantization spec ───────────────────────────────────────────
  const quantization = buildQuantization(quantize, materialsInScene);

  // ── Assemble scene ──────────────────────────────────────────────────────
  const geometryIntents = bound._geometryIntents || [];
  const paletteIntents = bound._paletteIntents || [];

  const provenance = {
    compiler: 'PB-VRI-COMPILE-v2',
    packetId: packet.id || null,
    geometryMode: geoMode || 'coordinates',
    geneCount: artGenes.length,
    geneBindingCount: artGenes.reduce((n, g) => n + (g?.bindings?.length || 0), 0),
    shaderId: shaderPacket?.id || null,
    materialCount: materialsInScene.size,
    textureLayerCount,
    markLayerCount: artGenes.filter(g => g?.geometryHints?.cells?.length > 0).length,
    rasterPatchCount: rasterPatches.length,
    geometryIntents,
    paletteIntents,
    // What this scene declares that the renderer will not execute. Empty means
    // every declared feature reaches pixels. Never a refusal — see
    // collectUnrenderedDeclarations().
    rendererVersion: RENDERER_CAPABILITIES.version,
    quantizationMode: quantization.mode,
    quantizedMaterialCount: Object.keys(quantization.ramps).length,
    // How much of each material's ramp the authored value sketch actually
    // reaches. Entries flagged `flat` cannot express a material swap.
    // See collectPaletteCoverage().
    paletteCoverage: collectPaletteCoverage(coords),
    unrenderedDeclarations: collectUnrenderedDeclarations(
      finalLayers, finalLights, finalAtmo, artGenes, quantization,
      [...materialsInScene].filter(m => !quantization.ramps[m]).sort(),
    ),
  };

  const scene = createVRIScene(W, H, finalLayers, finalLights, finalAtmo, provenance, quantization);

  // ── Fix #2: True content-addressed checksum ─────────────────────────────
  // Hash the FULL canonical scene content, not just structural metadata.
  // Any visible parameter change (color, intensity, amplitude, density,
  // normal, tangent, curvature, snapped position, ...) must alter the checksum.
  const checksumInput = canonicalSceneJSON(scene, { geometryIntents, paletteIntents });
  const checksum = fnv1aHex(checksumInput);

  return Object.freeze({
    ...scene,
    id: `vri-${fnv1aHex(packet.id || 'unknown')}-${checksum}`,
    checksum,
  });
}

// ─── Canonical scene serialization for checksums ─────────────────────────────

/**
 * Deterministic JSON with recursively sorted object keys.
 *
 * Plain JSON.stringify preserves key insertion order, so two scenes that are
 * visually identical but were assembled with their keys in a different order
 * hashed differently. Sorting makes the digest a function of content alone.
 * Array order is significant (painter order) and is preserved.
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  const body = keys
    .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * Produce a canonical string of the full visual content.
 *
 * Every layer payload is serialized whole. An earlier version hand-projected
 * the geometry layer down to {x, y, color, material, signedDistance}, which
 * dropped `normal`, `tangent`, `curvature`, `t`, `arcLength`,
 * `strokeHalfWidth` and `snappedX/Y` — all of which the renderer reads. Two
 * scenes differing only in those fields produced identical checksums and
 * different pixels; `snappedX` alone relocates the sprite. Serializing the
 * payload verbatim means a field added to a coordinate is covered by the
 * digest the day it is added, rather than the day someone remembers to extend
 * this projection.
 *
 * Two scenes that differ in ANY visible way produce different strings.
 */
function canonicalSceneJSON(scene, intents) {
  return stableStringify({
    v: VRI_VERSION,
    w: scene.width,
    h: scene.height,
    layers: scene.layers.map(l => ({
      id: l.id,
      type: l.type,
      blend: l.blendMode,
      opacity: l.opacity,
      depth: l.depthBand,
      maskRef: l.maskRef ?? null,
      payload: l.payload,
    })),
    lights: scene.lights.map(l => ({
      id: l.id,
      kind: l.kind,
      pos: l.position,
      dir: l.direction,
      color: l.color,
      intensity: l.intensity,
      radius: l.radius,
      angle: l.angle,
      affects: l.affects,
    })),
    atmo: scene.atmosphere,
    // Quantization changes output bytes, so it is scene content, not metadata.
    quant: scene.quantization,
    // Recorded-only intents are content for downstream consumers even though
    // this renderer does not act on them.
    intents,
  });
}
