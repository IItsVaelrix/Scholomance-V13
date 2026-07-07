/**
 * ITEM FOUNDRY — single entry point for declarative item generation.
 *
 *   forgeItemAsset(spec) → {
 *     spec, silhouette, template, fills, shader, assetPacket, godot, phaser, png
 *   }
 *
 * The Foundry composes existing engine stages and never forks them:
 *   - sketch-amp             (chamfer distance transform)
 *   - square-sharpness-amp   (HD edge pass; 'source' material by default)
 *   - asset packet           (existing createPixelBrainAssetPacket)
 *   - shader packet          (PB-SHADER-v1, with custom uniforms banned)
 *   - exporters              (Godot .pbrain, .gdshader, Phaser .js)
 *
 * New stages introduced by the Foundry:
 *   - silhouette-composer   parts → occupancy + partOf map
 *   - motif-engraver         interior-cell motifs (bolt, rune-row)
 *   - region-fill-amp        part + slot + outline → registry colors
 *   - item-effect-shader     motif → PB-SHADER-v1 fragment
 *
 * Determinism: no `Math.random`. Every jitter is derived from
 * `hashString(seed, segment)`. Asset hashes are stable across machines
 * and runs.
 */

// PNG IDAT compression needs zlib, which only exists under Node. Loaded lazily
// behind a runtime guard so this module stays importable in the browser (Vite
// externalises node:zlib, so a static import throws on load). PNG *file* export
// is a Node-only path — the browser previews via canvas and never deflates here.
let deflateSync = null;
if (typeof process !== 'undefined' && process.versions != null && process.versions.node) {
  ({ deflateSync } = await import('node:zlib'));
}

import { sketchToSilhouette, runSketchAMP, applyConstructionLines } from './sketch-amp.js';
import { forgeArmor } from './factory/armor-factory.js';
import { forgeWeapon } from './factory/weapon-factory.js';
import { forgeShield } from './factory/shield-factory.js';
import { forgeJewelry } from './factory/jewelry-factory.js';
import { getClassFactory, registerClassFactory } from './factory-registry.js';

registerClassFactory('armor', 'chestplate', forgeArmor);
registerClassFactory('weapon', '*', forgeWeapon);
registerClassFactory('shield', '*', forgeShield);
registerClassFactory('jewelry', '*', forgeJewelry);
import { executeRoute } from './microprocessor-route.js';
import { computeStructuralEnergy } from './structural-energy.js';
import { liftToVolume, buildPartParams } from './volume-lift-amp.js';
import { serializeItemVoxelPacket } from './item-voxel-packet.js';
import { applyHolyFireMotif } from './holyfire-motif-amp.js';
import { validateMirroredTrimByClass } from './mirrored-trim-validator.js';
import { buildSquareSharpnessContrastPayload } from './square-sharpness-contrast-amp.js';
import { composeSilhouette, computeOutline } from './silhouette-composer.js';
import { applyRegionFills, hashRegionFills } from './region-fill-amp.js';
import { applySelout } from './selout-amp.js';
import { applyPixelAA } from './pixel-aa-amp.js';
import { applyFacets } from './facet-amp.js';
import { buildGeometryAmpPayload } from './geometry-amp.js';
import { applyShieldRimTemplate } from './shield-rim-amp.js';
import { applyShieldVolumeTemplate } from './shield-volume-amp.js';
import { applyHeraldryTemplate, applyHeraldryFills } from './heraldry-amp.js';
import { applyJewelryTemplate } from './jewelry-amp.js';
import { applyChestplateTemplate } from './chestplate-amp.js';
import {
  applyChestplateFidelityFills,
  finalizeChestplateFidelityCoordinates,
  validateChestplateFidelityInput,
} from './chestplate-fidelity-pipeline.js';
import { engraveMotifs, hashMotifs } from './motif-engraver.js';
import { buildItemEffectShader } from './item-effect-shader.js';
import { createPixelBrainAssetPacket } from './pixelbrain-asset-packet.js';
import { createShaderPacket, hashShaderPacket } from './shader-packet.js';
import { MATERIAL_PALETTES, resolveMaterialId, SOURCE_MATERIAL } from './material-registry.js';
import { exportToGodotShader } from '../../../src/lib/exporters/pixelbrainGodotShaderExport.js';
import { exportToPhaserPipeline } from '../../../src/lib/exporters/pixelbrainPhaserShaderExport.js';
import { createPixelBrainArtifact } from '../../../src/lib/godot-export/artifactSchemas.js';
import { serializeStable } from '../../../src/lib/godot-export/stableSerialize.js';
import { normalizeItemSpec, hashItemSpec, validateItemSpec } from './item-spec.js';
import { hashString } from './shared.js';
import { SDFShapeAMP } from './sdf-shape-amp.js';
import { NoiseFillAMP } from './noise-fill-amp.js';

function err(reason, context) {
  const e = new Error(`item-foundry: ${reason}`);
  e.cause = context;
  return e;
}

function defaultMaterialResolver(materialRegistry) {
  return (target) => {
    if (!target || !target.material) return null;
    const id = resolveMaterialId(target.material);
    const def = MATERIAL_PALETTES[id];
    if (!def) return null;
    const anchorKey = target.anchor && def.anchors?.[target.anchor]
      ? target.anchor
      : 'body';
    return def.anchors[anchorKey] || def.anchors.body || null;
  };
}

/**
 * Resolve a host part's wrap color for grip-wrap rows. Returns null if
 * the part has no wrap field or the material/anchor cannot be resolved.
 */
function resolveWrapColor(part) {
  if (!part.wrap?.material) return null;
  const id = resolveMaterialId(part.wrap.material);
  const def = MATERIAL_PALETTES[id];
  if (!def) return null;
  const anchor = part.wrap.anchor && def.anchors?.[part.wrap.anchor]
    ? part.wrap.anchor
    : 'deep';
  return def.anchors[anchor] || def.anchors.deep || null;
}

/**
 * Apply a simple per-part rule for non-motif, non-outline cells that
 * need a different color than the ramp (e.g. grip wrap rows). The rule
 * is keyed by the part id; default = no override.
 */
function applyPartRules(fills, spec) {
  const ruleFns = {
    grip: (cell, part, ctx) => {
      if (cell.isRim || cell.isMotif) return cell.color;
      const wrapColor = resolveWrapColor(part);
      if (!wrapColor) return cell.color;
      const wrapPeriod = Math.max(1, Math.round(part.wrap?.period || 3));
      const spanStart = Math.round(part.attach ? 0 : 0);
      const relativeY = cell.y - ctx.partYStart[part.id];
      if (relativeY >= 0 && relativeY % wrapPeriod === 0) return wrapColor;
      return cell.color;
    },
  };
  const partYStart = Object.create(null);
  for (const part of spec.parts) {
    if (part.attach?.parent) {
      // Approximate: the part's Y range starts just after the parent's
      // last cell. This is a coarse heuristic; motif cells take priority
      // and the cell color is already correct for them.
    }
  }
  const updated = fills.coordinates.map((cell) => {
    const part = spec.parts.find((p) => p.id === cell.partId);
    if (!part) return cell;
    const fn = ruleFns[part.profile] || ruleFns[part.id];
    if (!fn) return cell;
    const next = fn(cell, part, { partYStart });
    return next === cell.color ? cell : { ...cell, color: next };
  });
  return Object.freeze({ ...fills, coordinates: Object.freeze(updated) });
}

/**
 * Render PNG (zero-dep, 8-bit RGBA, scale ≥ 1).
 */
function renderPng(coordinates, width, height, scale = 4) {
  const outW = width * scale;
  const outH = height * scale;
  const pixels = Buffer.alloc(outW * outH * 4);
  const bg = { r: 10, g: 10, b: 18 };
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bg.r; pixels[i + 1] = bg.g; pixels[i + 2] = bg.b; pixels[i + 3] = 255;
  }
  for (const c of coordinates) {
    const x = Math.round(c.snappedX ?? c.x);
    const y = Math.round(c.snappedY ?? c.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const hex = String(c.color || '').trim();
    const m = hex.replace('#', '');
    if (m.length !== 6) continue;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const off = ((y * scale + dy) * outW + (x * scale + dx)) * 4;
        pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = 255;
      }
    }
  }
  return encodePng(outW, outH, pixels);
}

export { renderPng };

function encodePng(outW, outH, rgba) {
  // Minimal zero-dep PNG encoder (signature + IHDR + IDAT + IEND).
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(outW, 0);
  IHDR.writeUInt32BE(outH, 4);
  IHDR[8] = 8; IHDR[9] = 6; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;
  const stride = outW * 4;
  const filtered = Buffer.alloc((stride + 1) * outH);
  for (let y = 0; y < outH; y += 1) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  // `require` does not exist in ESM scope — only the leaked CJS-eval global
  // made this appear to work. Use the module-level zlib import.
  const idat = deflateSync(filtered);
  return Buffer.concat([SIG, chunk('IHDR', IHDR), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let c;
  const table = (crc32._t ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Forge a complete item asset bundle from an ITEM-SPEC-v1 spec.
 *
 * @param {Object} rawSpec
 * @param {Object} [opts]
 * @param {Function} [opts.materialResolver] — (target) → hex color. Defaults
 *   to a registry-anchored resolver.
 * @param {boolean} [opts.includeShader=true]
 * @param {boolean} [opts.includePng=true]
 * @param {number}  [opts.pngScale=4]
 * @param {string}  [opts.hdMaterial] — material id for the SQUARE SHARPNESS
 *   CONTRAST pass. Default 'source' (preserves authored colors).
 * @returns {{
 *   spec, silhouette, template, fills, motifs, shader,
 *   assetPacket, godotArtifact, godotShader, phaserPipeline, png
 * }}
 */
/**
 * VolumeLiftAMP bridge: map painted 2D fills into structural-lift input cells.
 * Distinct quantized colours become small material ids so the serialized item
 * packet keeps the painted palette (sibling of PB-VOXEL-CHAR's material table).
 * STRUCTURAL energy is recomputed per-part downstream; any glow energy rides through.
 */
function fillsToVolumeCells(coordinates) {
  const colorToId = new Map();
  const materials = {};
  const cells = coordinates.map((c) => {
    const color = String(c.color || '#000000').toUpperCase();
    let materialId = colorToId.get(color);
    if (materialId == null) {
      materialId = colorToId.size + 1; // 1-based; 0 = empty
      colorToId.set(color, materialId);
      materials[materialId] = { id: `mat${materialId}`, colorHint: color };
    }
    return {
      x: c.snappedX ?? c.x,
      y: c.snappedY ?? c.y,
      partId: c.partId,
      materialId,
      energies: Array.isArray(c.energies) ? c.energies : [],
    };
  });
  return { cells, materials };
}

export function forgeItemAsset(rawSpec, opts = {}) {
  const spec = normalizeItemSpec(rawSpec);
  validateItemSpec(spec);

  const materialResolver = opts.materialResolver || defaultMaterialResolver();
  const includeShader = opts.includeShader !== false;
  const includePng = opts.includePng !== false;
  const pngScale = Math.max(1, Math.round(opts.pngScale || 4));
  const hdMaterial = opts.hdMaterial || SOURCE_MATERIAL;

  // 1. Silhouette composition
  // Pass constructionHints early if present for harmonic (sketch + sym + fib) reconciliation.
  let constructionHintsForComposer = null;
  const constructionInputEarly = rawSpec?.construction || spec?.construction;
  if (constructionInputEarly) {
    // Lightweight peek (full run happens later for hints)
    constructionHintsForComposer = { harmonic: !!constructionInputEarly.harmonic || !!constructionInputEarly.goldenSpacing, center: constructionInputEarly.center };
  }
  let silhouette = composeSilhouette(spec, constructionHintsForComposer);
  const chestplateProportions = validateChestplateFidelityInput({ spec, silhouette });

  // 1a. Holy Fire Motif AMP — deterministic flame emission for holy-paladin
  //     weapons. Must run BEFORE template construction so motif cells become
  //     part of the silhouette and get the regular fill pass.
  if (spec.class === 'weapon'
      && spec.archetype === 'sword'
      && spec.parts.some((p) => p.profile === 'weapon.sword.holyfire_motif'
        || p.id === 'holyFire' || p.id === 'holy_fire')) {
    const holyFireResult = applyHolyFireMotif(silhouette, spec);
    silhouette = Object.freeze({
      ...silhouette,
      cells: holyFireResult.cells,
      partOf: holyFireResult.partOf,
    });
  }

  // 1b. SketchAMP / Construction Line Microprocessor (for radial shields, orbs, energy, focal assets)
  // Per 2026-06-12 PDR: produces authoritative referenceCells + hints for 00_Reference + downstream locking.
  let constructionResult = null;
  const constructionInput = spec.construction || rawSpec?.construction;
  if (constructionInput) {
    constructionResult = applyConstructionLines(silhouette.cells || [], constructionInput, { mergeBase: false });
  } else {
    // Allow runSketchAMP to discover if embedded
    const sketchRun = runSketchAMP(spec);
    if (sketchRun && sketchRun.isConstruction) constructionResult = sketchRun;
  }

  const constructionHints = constructionResult ? constructionResult.constructionHints : null;
  const referenceCells = constructionResult ? constructionResult.referenceCells : null;
  const constructionSkeleton = constructionResult ? constructionResult.constructionSkeleton || constructionResult.skeleton : null;

  // SDF and Coherent Noise integration (full per 2026-06-12-pixelbrain-sdf-and-coherent-noise-integration-pdr.md)
  // SDFShapeAMP for parts declaring 'sdf' (uses construction for bounds, emits integer cells)
  const sdfSpecParts = spec.parts.filter(p => p.sdf);
  if (sdfSpecParts.length > 0) {
    for (const part of sdfSpecParts) {
      const sdfResult = SDFShapeAMP({ construction: constructionResult, silhouette, spec }, { sdf: part.sdf, partId: part.id, minCells: part.minCells || 1 });
      if (sdfResult.partCells && sdfResult.partCells.length > 0) {
        const added = sdfResult.partCells;
        silhouette = {
          ...silhouette,
          cells: [...silhouette.cells, ...added],
          partOf: new Map(silhouette.partOf),
        };
        added.forEach(c => silhouette.partOf.set(`${c.x},${c.y}`, part.id));
      }
    }
  }

  // NoiseFill for parts declaring 'noise' (modulates after fills)


  // 2. Distance transform shading slots
  let template = sketchToSilhouette(
    silhouette.cells,
    { width: spec.canvas.width, height: spec.canvas.height },
    { bands: spec.bands, symmetry: 'none', light: spec.light },
  );

  // PRE-PROCESSORS (mutate template slots / normals before region fill)
  template = applyShieldRimTemplate(template, silhouette, spec);
  template = applyShieldVolumeTemplate(template, silhouette, spec);
  template = applyHeraldryTemplate(template, silhouette, spec);
  template = applyJewelryTemplate(template, silhouette, spec);
  template = applyChestplateTemplate(template, silhouette, spec, constructionHintsForComposer || (constructionResult ? constructionResult.constructionHints : null));

  const geometry = buildGeometryAmpPayload({ spec, silhouette, construction: constructionResult });

  const outline = computeOutline(silhouette);

  // 3. Motif engraving
  const motifRaw = engraveMotifs({ spec, silhouette, outline, colorResolvers: { resolver: materialResolver } });
  // Build the motifCells map the fill-amp consumes, resolving colors
  // for each motif role from the registry.
  const motifCells = new Map();
  for (const [key, entry] of motifRaw.cells.entries()) {
    const part = spec.parts.find((p) => p.id === entry.partId);
    const target = entry.role === 'core' ? part.motif?.core : part.motif?.glow;
    const color = target ? materialResolver(target) : null;
    if (color) {
      motifCells.set(key, { role: entry.role, color });
    }
  }
  const motifHash = hashMotifs(motifRaw);

  // 4. Region fills (colors are registry-anchored)
  let fills = applyRegionFills({ silhouette, template, spec, motifCells });
  // Per-part rules (e.g. grip wrap rows). Adds wrap colors to grip rows.
  fills = applyPartRules(fills, spec);
  fills = applyChestplateFidelityFills({ fills, spec, silhouette });

  // NoiseFillAMP (after fills, for parts with 'noise' per PDR)
  const noiseSpecParts = spec.parts.filter(p => p.noise);
  if (noiseSpecParts.length > 0) {
    for (const part of noiseSpecParts) {
      const noiseResult = NoiseFillAMP(fills, part.noise, { partId: part.id });
      if (noiseResult.fills && noiseResult.fills.length > 0) {
        fills = { ...fills, coordinates: noiseResult.fills };
      }
    }
  }
  
  // Finish passes
  fills = applySelout(fills, spec, materialResolver, spec.light);
  fills = applyPixelAA(fills, spec);
  fills = applyFacets(fills, spec, materialResolver, spec.light);
  // Heraldry fill stage runs last so emblem inlay/emit/outline colors and
  // the contrast guarantee survive the other finish passes.
  fills = applyHeraldryFills(fills, spec, silhouette);

  const fillHash = hashRegionFills(fills);

  // 5. Square Sharpness Contrast (HD edge pass)
  const sharpness = buildSquareSharpnessContrastPayload({
    coordinates: fills.coordinates,
    material: hdMaterial,
    canvas: spec.canvas,
    options: { enabled: true },
    intent: 'enhance_square_render_readability',
  });
  const quantization = finalizeChestplateFidelityCoordinates({
    coordinates: sharpness.outputCoordinates,
    spec,
  });
  const polished = quantization.coordinates;

  // 6. Effect shader
  let shader = null;
  if (includeShader && spec.shader) {
    try {
      shader = buildItemEffectShader({
        spec,
        geometry,
        materialColor: (target) => materialResolver(target),
        engravingDensity: motifRaw.cells.size / Math.max(1, silhouette.cells.length),
      });
    } catch (e) {
      shader = { error: e.message };
    }
  }

  // 7. Asset packet
  const fillSpec = spec.parts.find((p) => p.motif)
    ? {
        bytecode: spec.bytecode,
        school: spec.archetype?.toUpperCase?.() || 'VOID',
        rarity: 'INEXPLICABLE',
        effect: 'TRANSCENDENT',
        source: 'foundry',
      }
    : {
        bytecode: spec.bytecode,
        school: spec.archetype?.toUpperCase?.() || 'VOID',
        rarity: 'INEXPLICABLE',
        effect: 'TRANSCENDENT',
        source: 'foundry',
      };
  const assetPacket = createPixelBrainAssetPacket({
    source: { kind: 'procedural', id: spec.id, label: `${spec.archetype} ${spec.id}` },
    canvas: spec.canvas,
    coordinates: polished,
    palettes: [],
    formula: null,
    bytecode: spec.bytecode,
    template: {
      gridType: 'sketch-template',
      fillState: fillSpec,
    },
    material: SOURCE_MATERIAL,
    chromatic: { transformId: SOURCE_MATERIAL },
    metadata: {
      tags: ['foundry', spec.archetype, spec.class, spec.id],
      compatibility: {
        pdr: 'pixelbrain-item-foundry-v1',
        spec: { id: spec.id, hash: hashItemSpec(spec) },
        shader: shader?.packet ? { id: shader.packet.id, hash: shader.hash, contract: 'PB-SHADER-v1' } : null,
        geometry: { id: geometry.amp, hash: geometry.hash },
        fidelity: {
          pdr: 'pixelbrain-deterministic-pro-chestplate-v1',
          proportions: chestplateProportions.diagnostics || null,
          palette: quantization.diagnostics || null,
        },
        ...(constructionHints ? {
          construction: {
            version: 'construction-v1',
            contract: constructionSkeleton?.contract || null,
            hash: constructionSkeleton?.hash || null,
            center: constructionHints.center,
            ringRadii: constructionHints.ringRadii,
          },
        } : {}),
      },
      ...(constructionHints ? { constructionHints } : {}),
    },
  });

  // Validate route / loud failures
  let routeDiagnostics = { ok: true, failures: [] };
  let expansion = null;
  let routeVolume = null;

  const factoryFn = getClassFactory(spec.class, spec.archetype);
  if (factoryFn) {
    const routeBundle = factoryFn(spec, constructionResult);
    expansion = routeBundle.expansion;

    const context = {
      spec,
      silhouette: { cells: silhouette.cells, parts: silhouette.parts },
      fills: { coordinates: polished },
      geometry,
      construction: constructionResult,
    };

    const results = executeRoute(routeBundle.routeDefinition, context);
    routeDiagnostics = results.diagnostics;
    routeVolume = results?.voxel?.volume || null;

    // ── Mirrored trim pair validation (three-level symmetry) ──────────
    // Run AFTER the seam-based route to add structural symmetry checks
    // that the existing required-output validator does not cover.
    if (expansion?.grammarId) {
      const trimResult = validateMirroredTrimByClass(polished, expansion.grammarId);
      if (!trimResult.ok) {
        routeDiagnostics.ok = false;
        routeDiagnostics.failures.push(...trimResult.failures);
      }
    }
  }

  // Remove EXPORT_READY if failures exist
  if (!routeDiagnostics.ok) {
     if (template.chestplateDiagnostics && template.chestplateDiagnostics.diagnostics) {
         template.chestplateDiagnostics.diagnostics = template.chestplateDiagnostics.diagnostics.filter(d => !d.code.includes('EXPORT_READY'));
     }
  }

  // 7b. VolumeLiftAMP — the route step emits voxel.volume (PDR STRUCT-ENERGY-LIFT).
  //     If the route did not emit it (older routes), lift inline as fallback.
  let volume = null;
  let voxelPacket = null;
  if (opts.includeVolume !== false) {
    try {
      if (routeVolume) {
        volume = routeVolume;
      } else {
        const dims = { width: spec.canvas.width, height: spec.canvas.height };
        const partParams = buildPartParams(spec);
        const { cells: liftCells } = fillsToVolumeCells(polished);
        const energized = computeStructuralEnergy(liftCells, dims);
        volume = liftToVolume(energized, { dims, partParams });
      }
      // Build materials table for voxel packet serialization.
      // Route-emitted volumes carry a _colorToMaterialId map; fallback to fillsToVolumeCells.
      let voxelMaterials;
      if (volume._colorToMaterialId) {
        voxelMaterials = {};
        for (const [color, id] of volume._colorToMaterialId) {
          voxelMaterials[id] = { id: `mat${id}`, colorHint: color };
        }
      } else {
        const result = fillsToVolumeCells(polished);
        voxelMaterials = result.materials;
      }
      voxelPacket = serializeItemVoxelPacket(volume, {
        id: spec.id,
        bytecode: spec.bytecode,
        materials: voxelMaterials,
      });
    } catch (e) {
      volume = null;
      voxelPacket = null;
      routeDiagnostics = { ...routeDiagnostics, volumeLift: { ok: false, error: e.message } };
    }
  }

  // 8. Godot artifact + shader exports
  const godotArtifact = serializeStable(createPixelBrainArtifact({
    canvas: spec.canvas,
    palettes: [],
    coordinates: polished,
    formula: null,
    bytecode: spec.bytecode,
  })) + '\n';

  let godotShader = null;
  let phaserPipeline = null;
  if (shader?.packet) {
    godotShader = exportToGodotShader(shader.packet);
    phaserPipeline = exportToPhaserPipeline(shader.packet);
  }

  // 9. PNG (optional)
  let png = null;
  if (includePng) {
    try {
      png = renderPng(polished, spec.canvas.width, spec.canvas.height, pngScale);
    } catch (e) {
      png = null;
    }
  }

  return Object.freeze({
    spec,
    silhouette: Object.freeze({
      cells: silhouette.cells,
      partOf: silhouette.partOf,
      anchors: silhouette.anchors,
      parts: silhouette.parts,
    }),
    template: Object.freeze({ ...template }),
    // SketchAMP construction output (00_Reference guides + hints for downstream + Aseprite bridge)
    construction: constructionResult ? Object.freeze({
      referenceCells: constructionResult.referenceCells,
      skeleton: constructionSkeleton,
      hints: constructionHints,
      spec: spec.construction || null,
      diagnostics: constructionResult.diagnostics,
    }) : null,
    fills: Object.freeze({
      coordinates: fills.coordinates,
      diagnostics: fills.diagnostics,
      ...(fills.chestplateBevel ? { chestplateBevel: fills.chestplateBevel } : {}),
      ...(fills.crystalCore ? { crystalCore: fills.crystalCore } : {}),
      ...(fills.chestplateFidelity ? { chestplateFidelity: fills.chestplateFidelity } : {}),
      // Heraldry readability diagnostics (coverage/contrast/warnings).
      ...(fills.heraldry ? { heraldry: fills.heraldry } : {}),
      hash: fillHash,
    }),
    motifs: Object.freeze({
      cells: motifRaw.cells,
      partIds: motifRaw.partIds,
      hash: motifHash,
    }),
    geometry,
    shader: shader ? Object.freeze({
      packet: shader.packet,
      hash: shader.hash,
      fragmentSource: shader.fragmentSource,
      engravings: shader.engravings,
    }) : null,
    assetPacket: Object.freeze(assetPacket),
    sharpness: Object.freeze(sharpness),
    fidelity: Object.freeze({
      proportions: chestplateProportions,
      palette: quantization.diagnostics,
    }),
    routeDiagnostics: Object.freeze(routeDiagnostics),
    expansion: expansion ? Object.freeze(expansion) : null,
    godotArtifact,
    godotShader,
    phaserPipeline,
    png,
    volume,
    voxelPacket,
  });
}

/**
 * Render PNG bytes from a Foundry bundle. Exposed as a separate function
 * so callers can render on demand without paying the cost during forge.
 */
export function renderBundlePng(bundle, scale = 4) {
  if (!bundle || !bundle.assetPacket) throw err('bundle is required');
  const canvas = bundle.assetPacket.canvas;
  return renderPngWithZlib(bundle.assetPacket.geometry.coordinates, canvas.width, canvas.height, scale);
}

function renderPngWithZlib(coordinates, width, height, scale) {
  const outW = width * scale;
  const outH = height * scale;
  const pixels = Buffer.alloc(outW * outH * 4);
  const bg = { r: 10, g: 10, b: 18 };
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bg.r; pixels[i + 1] = bg.g; pixels[i + 2] = bg.b; pixels[i + 3] = 255;
  }
  for (const c of coordinates) {
    const x = Math.round(c.snappedX ?? c.x);
    const y = Math.round(c.snappedY ?? c.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const hex = String(c.color || '').trim();
    const m = hex.replace('#', '');
    if (m.length !== 6) continue;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const off = ((y * scale + dy) * outW + (x * scale + dx)) * 4;
        pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = outW * 4;
  const filtered = Buffer.alloc((stride + 1) * outH);
  for (let y = 0; y < outH; y += 1) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(filtered);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
