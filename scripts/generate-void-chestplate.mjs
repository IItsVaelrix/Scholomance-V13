import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { forgeItemAsset, renderBundlePng } from '../codex/core/pixelbrain/item-foundry.js';
import { exportFoundryToAsepriteBinary } from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';
import { hashItemSpec } from '../codex/core/pixelbrain/item-spec.js';
import { createPixelBrainAssetPacket } from '../codex/core/pixelbrain/pixelbrain-asset-packet.js';
import {
  VAELRIX_VOID_ARMOR_POLISH_PROFILE,
  VOID_CHESTPLATE_MASKS,
  VOID_CHESTPLATE_ANCHORS,
} from '../codex/core/pixelbrain/void-chestplate-profile.js';

import {
  widenPauldrons,
  moveCore,
  postForgeMetadata,
  POSTFORGE_PROVENANCE_KEY,
} from '../codex/core/pixelbrain/edit-compiler.js';

import { formatSpecIntent } from '../codex/core/pixelbrain/spec-intent-report.js';

import {
  buildSquareSharpnessContrastPayload,
  enhanceSquaresForRender,
} from '../codex/core/pixelbrain/square-sharpness-contrast-amp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'output', 'foundry', 'void-chestplate');

export const VOID_CHESTPLATE_EXACT_PALETTE = Object.freeze([
  '#01030A',
  '#07091A',
  '#111633',
  '#20284A',
  '#465178',
  '#000004',
  '#05050D',
  '#0E1020',
  '#191C2D',
  '#A58A2D',
  '#CEB65A',
  '#E8DA91',
  '#000008',
  '#170A3A',
  '#32106D',
  '#6B35B8',
  '#A17AE0',
  '#E5D7FF',
  '#3B116B',
  '#6D28A8',
  '#A66BE0',
  '#160A54',
  '#3920A0',
  '#7463E8',
  '#B8B0FF',
  '#030308',
  '#0B0B14',
  '#16161F',
]);

export function buildVoidChestplateSpec() {
  return {
    contract: 'ITEM-SPEC-v1',
    id: 'void.chestplate.sovereign.v1',
    class: 'armor',
    archetype: 'chestplate',
    rarity: 'legendary',
    theme: ['void', 'will', 'resonance'],
    canvas: { width: 64, height: 80, gridSize: 1 },
    seed: 110731,
    bytecode: 'VW-VOID-WILL-SONIC-TRANSCENDENT',
    bands: 7,
    proportions: {
      profile: 'human_regular',
      shoulderScale: 1.45,           // wider dramatic wings to match image
      pauldronScale: 1.35,           // oversized horned/winged pauldrons like the reference
      waistTaper: 0.68,
      allowOversizedPauldrons: false, // enable for the wing-like extension in the image
    },
    fidelity: {
      qualityTarget: 'pro_game_icon',
      paletteBudget: 64,
      bevelStrength: 1.1,          // stronger bevels for polished metal look
      rimContrast: 1.0,            // crisp gold edges
      centralGlowContainment: 0.95,
      noiseFloor: 'none',          // clean for pro polished appearance
      // The hand-authored palette this asset is designed against. Declaring it
      // on the spec (not just as post-forge editor metadata) lets the palette
      // quantizer report whether a budget cut destroyed an authored color or
      // merely collapsed amp-generated shading.
      exactPalette: VOID_CHESTPLATE_EXACT_PALETTE,
    },
    construction: {
      version: 'construction-v1',
      center: { x: 32, y: 32 },
      rings: [
        { radius: 5, role: 'top-crystal' },
        { radius: 9, role: 'core-orb' },
        { radius: 14, role: 'harness-frame' },
      ],
      radials: { count: 8, offsetDegrees: 22.5 },
      axes: true,
    },
    symmetry: {
      axis: 'vertical',
      mode: 'strict',
    },
    light: {
      angle: Math.PI * 1.25,
      ambient: 0.24,
    },
    parts: [
      {
        id: 'body',
        profile: 'armor.chestplate.void_royal_human',
        params: {
          shoulderWidth: 46,
          chestWidth: 38,
          waistWidth: 26,
          torsoHeight: 58,
          neckWidth: 12,
        },
        fill: { material: 'voidsteel', intensity: 'dark' },
        trim: { material: 'void_gold', anchor: 'body' },
        outline: { material: 'blacksteel', anchor: 'shadow' },
      },
      {
        id: 'mantle',
        profile: 'armor.panel.void_reference_mantle',
        attach: { parent: 'body', at: 'centerChest' },
        fill: { material: 'amethyst_resonance', intensity: 'dark' },
        trim: { material: 'void_gold', anchor: 'body' },
        outline: { material: 'blacksteel', anchor: 'shadow' },
      },
      {
        id: 'collar',
        profile: 'armor.collar.high_void',
        params: { neckWidth: 12 },
        attach: { parent: 'body', at: 'top' },
        fill: { material: 'obsidian', intensity: 'dark' },
        trim: { material: 'void_gold', anchor: 'deep' },
        outline: { material: 'void_gold', anchor: 'body' },  // make outer silhouette border gold to match image
      },
      {
        id: 'left_pauldron',
        profile: 'armor.pauldron.void_reference_human',
        attach: { parent: 'body', at: 'leftShoulder' },
        fill: { material: 'sapphire_enamel', intensity: 'bright' },  // vibrant blue shoulders like the reference
        trim: { material: 'void_gold', anchor: 'body' },
        outline: { material: 'void_gold', anchor: 'body' },  // fully gold outer border for the winged pauldron silhouette in the image
        // Use new SDF + Noise abilities for dramatic winged silhouette (matching the reference image)
        sdf: {
          contract: 'PB-SDF-v1',
          primitives: [
            { type: 'capsule', params: { p1: { x: 8, y: 5 }, p2: { x: 22, y: 18 }, radius: 7 } }, // outer wing
            { type: 'capsule', params: { p1: { x: 12, y: 8 }, p2: { x: 18, y: 22 }, radius: 4 } },
          ],
          operations: [
            { op: 'smoothUnion', k: 2.5, children: [0, 1] }
          ]
        },
        noise: {
          contract: 'PB-NOISE-v1',
          id: 'enamel-variation',
          type: 'fbm',
          seed: 0xA1B2C3,
          octaves: 2,
          frequency: 0.18,
          amplitude: 0.35
        }
      },
      {
        id: 'right_pauldron',
        mirrorOf: 'left_pauldron',
      },
      {
        id: 'center_core',
        profile: 'gem.socket.void_orb',
        params: { r: 5, height: 18 },  // taller vertical crystal to match image
        attach: { parent: 'body', at: 'centerChest' },
        fill: { material: 'void_core', intensity: 'bright' },  // brighter faceted crystal to match image highlights
        trim: { material: 'void_gold', anchor: 'frost' },
        outline: { material: 'void_gold', anchor: 'deep' },
        glow: { material: 'amethyst', radius: 5, containment: 0.9 },
        // New SDF for faceted tall crystal look in the reference
        sdf: {
          contract: 'PB-SDF-v1',
          primitives: [
            { type: 'capsule', params: { p1: { x: 32, y: 18 }, p2: { x: 32, y: 38 }, radius: 4.5 } },
            { type: 'box', params: { center: { x: 32, y: 28 }, size: { x: 2.5, y: 14 } } }
          ],
          operations: [ { op: 'union', children: [0, 1] } ]
        }
      },
      {
        id: 'top_crystal',
        profile: 'gem.socket.void_reference_top',
        params: { r: 3 },
        attach: { parent: 'body', at: 'centerChest' },
        fill: { material: 'void_core', intensity: 'bright' },
        trim: { material: 'amethyst', anchor: 'spectral' },
        outline: { material: 'void_gold', anchor: 'deep' },
      },
      {
        id: 'harness',
        profile: 'armor.panel.void_reference_harness',
        attach: { parent: 'body', at: 'safeZoneUpperLower' },
        fill: { material: 'void_rune_glow', intensity: 'dark' },
        trim: { material: 'amethyst_resonance', anchor: 'frost' },
        outline: { material: 'blacksteel', anchor: 'void' },
      },
      {
        id: 'lower_drop',
        profile: 'gem.socket.void_reference_drop',
        attach: { parent: 'body', at: 'waist' },
        fill: { material: 'void_core', intensity: 'light' },
        trim: { material: 'void_gold', anchor: 'frost' },
        outline: { material: 'void_gold', anchor: 'deep' },
      },
      {
        id: 'emblem',
        profile: 'heraldry.void_eye',
        attach: { parent: 'body', at: 'safeZoneCenter' },
        fill: { material: 'amethyst_resonance', anchor: 'frost' },
      },
      {
        id: 'rune_channels',
        profile: 'motif.harmonic_channels',
        params: { span: 14 },
        attach: { parent: 'body', at: 'safeZoneUpperLower' },
        fill: { material: 'void_rune_glow', anchor: 'body' },
        outline: { material: 'void_rune_glow', anchor: 'deep' },
        motif: {
          kind: 'rune-row',
          count: 3,
          core: { material: 'void_rune_glow', anchor: 'frost' },
        },
      },
    ],
    heraldry: [
      {
        id: 'emblem',
        mark: 'eye',
        target: 'harness',
        placement: { dx: 0, dy: 0 },
        scale: 1,
        required: true,
        symmetry: 'vertical',
        style: {
          effect: 'inlay',
          material: 'amethyst_resonance',
          anchor: 'frost',
        },
      },
    ],
    shader: {
      kind: 'void-armor-breath',
      targetParts: ['center_core', 'emblem', 'rune_channels'],
      resonanceDefault: 0.34,
      pulseSpeed: 0.7,
      amplitude: 0.18,
      sparkleDensity: 0.03,
      flicker: 0,
    },
  };
}

export function forgeVoidChestplate() {
  const bundle = forgeItemAsset(buildVoidChestplateSpec(), {
    includeShader: true,
    includePng: true,
    pngScale: 6,
  });
  let editorAssetPacket = {
    ...bundle.assetPacket,
    metadata: {
      ...(bundle.assetPacket.metadata || {}),
      editorPalette: {
        id: 'void-chestplate-exact',
        label: 'VOID Chestplate Exact Palette',
        colors: VOID_CHESTPLATE_EXACT_PALETTE,
      },
      // Edit Compiler integration
      polishProfile: VAELRIX_VOID_ARMOR_POLISH_PROFILE,
      masks: VOID_CHESTPLATE_MASKS,
      anchors: VOID_CHESTPLATE_ANCHORS,
    },
    // Attach masks directly for UI addressability (packet.masks.*)
    masks: VOID_CHESTPLATE_MASKS,
  };

  // Deterministic post-polish using the new Edit Compiler pure verbs
  // to replicate the dramatic wide wings and prominent crystal from the reference image.
  let postForgeFailure = null;
  try {
    let polished = widenPauldrons(editorAssetPacket, 5);
    polished = moveCore(polished, -1);

    // Extra crisp polish and detail pass using sharpness AMP to bring out the facets, borders, and small crosses like the reference
    const sharpened = enhanceSquaresForRender(polished.geometry.coordinates, { intensity: 0.95 });
    polished = createPixelBrainAssetPacket({
      ...polished,
      coordinates: sharpened,
      metadata: postForgeMetadata(polished, {
        kind: 'square-sharpness-contrast',
        intensity: 0.95,
        cells: sharpened.length,
      }),
    });

    editorAssetPacket = createPixelBrainAssetPacket({
      ...polished,
      metadata: {
        ...polished.metadata,
        replicatedFromImage: true,
        replicationMethod: 'PixelBrain-Edit-Compiler + SDF/Noise + style-profile + widen/move verbs + sharpness polish',
      },
      masks: polished.masks || VOID_CHESTPLATE_MASKS,
    });

    // Add the small purple cross details on the side void panels exactly as in the reference image
    // (deterministic positions relative to anchors for perfect replication)
    //
    // HONESTY NOTE (audit 2026-09-03, MAJOR #2): these five-pixel crosses are the
    // part of the flagship asset that ITEM-SPEC-v1 does not describe. They are
    // literal coordinates tuned by eye against a reference image, so this asset is
    // "declarative spec + 2 hand-placed motifs", not "declarative spec". Rather
    // than delete them (the shipped art regresses) or pretend (the old behaviour,
    // where `metadata.compatibility.spec.hash` implied a pure spec derivation), the
    // placement is now recorded on the packet itself via `postForgeMetadata`, so a
    // consumer can tell provenance from the asset instead of from this file.
    const crossColor = '#6B35B8'; // vibrant purple from exact palette
    const crossOffsets = [
      {x: 0, y: 0}, {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}
    ];
    const leftCrossCenter = { x: 20, y: 30 }; // left void panel, tuned to image
    const rightCrossCenter = { x: 44, y: 30 }; // mirrored
    let finalCoords = [...editorAssetPacket.geometry.coordinates];
    const placedCrossCells = [];
    [leftCrossCenter, rightCrossCenter].forEach(center => {
      crossOffsets.forEach(off => {
        const cx = center.x + off.x;
        const cy = center.y + off.y;
        // avoid overwriting important cells
        if (!finalCoords.some(c => c.x === cx && c.y === cy)) {
          finalCoords.push({ x: cx, y: cy, color: crossColor, partId: 'small_cross', emphasis: 1 });
          placedCrossCells.push({ x: cx, y: cy, color: crossColor, partId: 'small_cross' });
        }
      });
    });
    editorAssetPacket = createPixelBrainAssetPacket({
      ...editorAssetPacket,
      coordinates: finalCoords,
      metadata: postForgeMetadata(editorAssetPacket, {
        kind: 'hand-placed-cross-motifs',
        centers: [leftCrossCenter, rightCrossCenter],
        cellsPlaced: placedCrossCells.length,
        cells: placedCrossCells,
      }),
    });
  } catch (e) {
    // The whole post-forge block used to be reported as "skipped (non-fatal)" on
    // stderr and then forgotten, so a rejected edit left no trace on the asset.
    // With the geometry precedence fixed (pixelbrain-asset-packet.js:172) these
    // verbs really apply, and a real one now fails: widenPauldrons(5) pushes the
    // pauldrons to x=-1 and x=64 on a 64-wide canvas, which its own
    // preventOutOfBounds constraint rejects. That is a genuine authoring defect
    // that the dropped-edit bug had been masking since the verbs were written.
    // It is recorded here rather than silently swallowed; widening the intent
    // (smaller amount, or a wider canvas) is an art decision, not a drive-by.
    postForgeFailure = { stage: 'post-forge-polish', error: String(e?.message || e) };
    console.warn('Edit Compiler polish step REJECTED (asset ships without it):', e.message);
  }
  if (editorAssetPacket) {
    editorAssetPacket = createPixelBrainAssetPacket({
      ...editorAssetPacket,
      metadata: {
        ...editorAssetPacket.metadata,
        compatibility: {
          ...(editorAssetPacket.metadata?.compatibility || {}),
          postForgeFailures: Object.freeze([
            ...(editorAssetPacket.metadata?.compatibility?.postForgeFailures || []),
            ...(postForgeFailure ? [Object.freeze(postForgeFailure)] : []),
          ]),
        },
      },
    });
  }
  const materialSlotManifest = buildMaterialSlotManifest(bundle.spec.parts);
  return {
    bundle,
    editorAssetPacket,
    diagnostics: {
      code: 'VOID_CHESTPLATE_EXPORT_READY',
      item: bundle.spec.id,
      spec: {
        id: bundle.spec.id,
        hash: hashItemSpec(bundle.spec),
        // `hash` identifies the declarative INPUT only. This asset then gets
        // imperative post-forge edits, so the hash does not identify the shipped
        // pixels — `contentDigest` and `postForgeEdits` do. (Audit 2026-09-03,
        // MAJOR #2.)
        identifiesShippedPixels: false,
      },
      postForgeEdits: editorAssetPacket.metadata?.compatibility?.[POSTFORGE_PROVENANCE_KEY] || [],
      postForgeFailures: editorAssetPacket.metadata?.compatibility?.postForgeFailures || [],
      contentDigest: editorAssetPacket.contentDigest || null,
      cells: editorAssetPacket.geometry.coordinates.length,
      cellsFromSpecAlone: bundle.assetPacket.geometry.coordinates.length,
      materialSlotManifest,
      editorPalette: {
        id: 'void-chestplate-exact',
        colors: VOID_CHESTPLATE_EXACT_PALETTE,
      },
      shader: bundle.shader?.packet
        ? {
            id: bundle.shader.packet.id,
            hash: bundle.shader.hash,
            contract: 'PB-SHADER-v1',
          }
        : null,
      heraldry: bundle.fills.heraldry ?? null,
      fills: bundle.fills.diagnostics,
      chestplate: bundle.template.chestplateDiagnostics ?? null,
    },
  };
}

function resolvePartMaterial(partsById, part, field, seen = new Set()) {
  if (!part) return null;
  if (part[field]?.material) return part[field].material;
  if (!part.mirrorOf || seen.has(part.id)) return null;
  seen.add(part.id);
  return resolvePartMaterial(partsById, partsById.get(part.mirrorOf), field, seen);
}

function buildMaterialSlotManifest(parts) {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return Object.fromEntries(
    parts.map((part) => [
      part.id,
      {
        fill: resolvePartMaterial(partsById, part, 'fill'),
        trim: resolvePartMaterial(partsById, part, 'trim'),
        outline: resolvePartMaterial(partsById, part, 'outline'),
      },
    ]),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { bundle, editorAssetPacket, diagnostics } = forgeVoidChestplate();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'void-chestplate.json'), JSON.stringify(editorAssetPacket, null, 2), 'utf8');
  if (bundle.godotArtifact) {
    writeFileSync(resolve(OUT_DIR, 'void-chestplate.pbrain'), bundle.godotArtifact, 'utf8');
  }
  writeFileSync(resolve(OUT_DIR, 'void-chestplate.aseprite'), exportFoundryToAsepriteBinary(bundle));
  writeFileSync(resolve(OUT_DIR, 'void-chestplate.png'), bundle.png);
  writeFileSync(resolve(OUT_DIR, 'void-chestplate.1x.png'), renderBundlePng(bundle, 1));
  if (bundle.godotShader) {
    writeFileSync(resolve(OUT_DIR, 'void-chestplate.gdshader'), bundle.godotShader, 'utf8');
  }
  if (bundle.phaserPipeline) {
    writeFileSync(resolve(OUT_DIR, 'void-chestplate.phaser.js'), bundle.phaserPipeline, 'utf8');
  }
  writeFileSync(
    resolve(OUT_DIR, 'void-chestplate.forge.diagnostics.json'),
    JSON.stringify(diagnostics, null, 2),
    'utf8',
  );
  // Report what actually shipped, not what the spec alone produced: the two
  // differ by the post-forge edits above. (Audit 2026-09-03, MAJOR #2.)
  const edits = diagnostics.postForgeEdits.length;
  const failed = diagnostics.postForgeFailures.length;
  console.log(
    `forged void-chestplate ${diagnostics.contentDigest} ` +
    `${diagnostics.cells} cells (spec alone: ${diagnostics.cellsFromSpecAlone}; ` +
    `${edits} post-forge edit${edits === 1 ? '' : 's'}` +
    `${failed ? `, ${failed} REJECTED` : ''}; ` +
    `spec hash ${hashItemSpec(bundle.spec)} identifies input only)`,
  );

  // Authored-intent divergence (audit 2026-09-03, MAJOR #6): knobs the foundry
  // silently coerced, and declared outlines that could not reach the silhouette.
  const intent = bundle.fidelity?.intent;
  if (intent && !intent.clean) {
    console.log(`\nintent vs output — ${intent.attentionCount} to look at:`);
    console.log(formatSpecIntent(intent));
  }
}
