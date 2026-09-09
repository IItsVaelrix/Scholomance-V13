// Immutable PixelBrain asset packet + SCDL-PACKAGE-v2 construction for a
// successful v2 compile. Palette colors follow first occurrence in the
// already y-major/x-minor raster coordinate list, not lexical order.
//
// When a program declares a TIMELINE, `frames` carries one raster per sampled
// frame and `animation` carries the manifest. The package then exposes one
// packet per frame in `framePackets` plus a `frameLoop` for exporters; a static
// program keeps the single-packet shape it has always had.

import { createPixelBrainAssetPacket } from '../../pixelbrain-asset-packet.js';
import { sha256Hex } from '../../sha256.js';

function buildFramePacket({ raster, bytecode, analysis, programDigest, frameIndex, frameCount, digests }) {
  const suffix = frameCount > 1 ? `_f${String(frameIndex).padStart(4, '0')}` : '';
  return createPixelBrainAssetPacket({
    id: `pbasset_${bytecode.programId.slice('scdlbc_'.length)}${suffix}`,
    canvas: analysis.canvas,
    coordinates: raster.coordinates,
    layerSurfaces: raster.layerSurfaces,
    palette: {
      sourcePalette: [{ key: 'scdl-v2-source', colors: [...new Set(raster.coordinates.map((cell) => cell.color))], source: 'scdl-v2', weights: [] }],
      authority: 'scdl-v2.emit.v1',
    },
    bytecode: { raw: bytecode.text, authority: 'SCDL-BC-v2', materialStage: 'source' },
    source: { kind: 'scdl-v2', id: analysis.assetId, label: `SCDL2:${analysis.assetId}` },
    material: { id: 'source' },
    provenance: {
      createdBy: 'scdl-compiler.v2',
      operations: [
        { op: 'lower', programId: bytecode.programId, programDigest },
        { op: 'evaluate', instructionCount: bytecode.instructions.length },
        { op: 'rasterize', coordinateCount: raster.coordinates.length, ...(frameCount > 1 ? { frameIndex, frameCount } : {}) },
      ],
    },
    metadata: {
      tags: frameCount > 1 ? ['scdl', 'scdl-v2', 'animation', `frame:${frameIndex}`] : ['scdl', 'scdl-v2'],
      notes: frameCount > 1
        ? [`Program: ${bytecode.programId}`, `Frame ${frameIndex} of ${frameCount}`]
        : [`Program: ${bytecode.programId}`],
      digests,
      ...(frameCount > 1 ? { frameIndex, frameCount } : {}),
    },
  });
}

export function emitSCDLV2Package({
  analysis,
  bytecode,
  construction,
  raster,
  ampPlan = [],
  ampDescriptors = [],
  animation = null,
  frames = null,
}) {
  const programDigest = bytecode.programDigest || `scdl2_prog:${sha256Hex(`program\n${bytecode.text}`)}`;
  const rasterCoordStr = (raster.coordinates || []).map((cell) => `${cell.x},${cell.y}:${cell.color}`).join('\n');
  const rasterDigest = `scdl2_rast:${sha256Hex(`raster\n${rasterCoordStr}`)}`;

  // Animated programs fold every frame's raster into the build digest, so two
  // programs differing only in motion never share an identity.
  const frameDigests = Array.isArray(frames) && frames.length > 1
    ? frames.map((frame) => {
      const coords = (frame.raster?.coordinates || []).map((cell) => `${cell.x},${cell.y}:${cell.color}`).join('\n');
      return `scdl2_frame:${frame.index}:${sha256Hex(coords)}`;
    })
    : [];
  const animationDigest = frameDigests.length > 0
    ? `scdl2_anim:${sha256Hex(frameDigests.join('\n'))}`
    : null;

  const buildDigest = `scdl2_build:${sha256Hex(`build\n${programDigest}\n${rasterDigest}\n${JSON.stringify(ampPlan)}\n${JSON.stringify(ampDescriptors)}\n${animationDigest || ''}`)}`;

  const digests = Object.freeze({ programDigest, rasterDigest, buildDigest, ...(animationDigest ? { animationDigest } : {}) });

  const isAnimated = Array.isArray(frames) && frames.length > 1;

  const packet = buildFramePacket({
    raster, bytecode, analysis, programDigest, frameIndex: 0, frameCount: 1, digests,
  });

  const framePackets = isAnimated
    ? Object.freeze(frames.map((frame) => buildFramePacket({
      raster: frame.raster,
      bytecode,
      analysis,
      programDigest,
      frameIndex: frame.index,
      frameCount: frames.length,
      digests,
    })))
    : Object.freeze([packet]);

  // Exporters (Aseprite tags, Phaser anim config, spritesheets) consume this and
  // never re-derive timing from raster data.
  const frameLoop = isAnimated && animation
    ? Object.freeze({
      contract: 'SCDL-FRAMELOOP-v2',
      frameCount: frames.length,
      fps: animation.timelines[0]?.fps ?? null,
      frameDurationMs: Math.round(1000 / (animation.timelines[0]?.fps ?? 12)),
      loop: animation.timelines[0]?.loop ?? 'ONCE',
      tags: Object.freeze(animation.timelines.flatMap((timeline) => [
        { name: timeline.id, from: 0, to: timeline.frameCount - 1, direction: timeline.loop === 'MIRROR' ? 'pingpong' : 'forward' },
        ...timeline.variants.map((variant) => ({
          name: variant.name,
          from: variant.fromTick,
          to: Math.min(variant.toTick, timeline.frameCount - 1),
          direction: 'forward',
        })),
      ])),
    })
    : null;

  const packageValue = Object.freeze({
    contract: 'SCDL-PACKAGE-v2',
    programId: bytecode.programId,
    programDigest,
    rasterDigest,
    buildDigest,
    digests,
    bytecode,
    verifiedBudget: bytecode.verifiedBudget,
    construction,
    layers: raster.layers,
    layerSurfaces: raster.layerSurfaces,
    framePackets,
    animation,
    frameLoop,
    ampPlan: Object.freeze([...(ampPlan || analysis?.ampPlan || [])]),
    ampDescriptors: Object.freeze([...(ampDescriptors || [])]),
    exportManifest: Object.freeze({ targets: Object.freeze(['json', 'svg', 'phaser', 'png', 'aseprite']) }),
  });
  return Object.freeze({ packet, package: packageValue, framePackets });
}
