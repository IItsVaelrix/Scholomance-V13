// Immutable PixelBrain asset packet + SCDL-PACKAGE-v2 construction for a
// successful v2 compile. Palette colors follow first occurrence in the
// already y-major/x-minor raster coordinate list, not lexical order.

import { createPixelBrainAssetPacket } from '../../pixelbrain-asset-packet.js';
import { sha256Hex } from '../../sha256.js';

export function emitSCDLV2Package({ analysis, bytecode, construction, raster, ampPlan = [], ampDescriptors = [] }) {
  const programDigest = bytecode.programDigest || `scdl2_prog:${sha256Hex(`program\n${bytecode.text}`)}`;
  const rasterCoordStr = (raster.coordinates || []).map((cell) => `${cell.x},${cell.y}:${cell.color}`).join('\n');
  const rasterDigest = `scdl2_rast:${sha256Hex(`raster\n${rasterCoordStr}`)}`;
  const buildDigest = `scdl2_build:${sha256Hex(`build\n${programDigest}\n${rasterDigest}\n${JSON.stringify(ampPlan)}\n${JSON.stringify(ampDescriptors)}`)}`;

  const digests = Object.freeze({ programDigest, rasterDigest, buildDigest });

  const packet = createPixelBrainAssetPacket({
    id: `pbasset_${bytecode.programId.slice('scdlbc_'.length)}`,
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
        { op: 'rasterize', coordinateCount: raster.coordinates.length, rasterDigest },
      ],
    },
    metadata: {
      tags: ['scdl', 'scdl-v2'],
      notes: [`Program: ${bytecode.programId}`],
      digests,
    },
  });

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
    framePackets: Object.freeze([packet]),
    animation: null,
    ampPlan: Object.freeze([...(ampPlan || analysis?.ampPlan || [])]),
    ampDescriptors: Object.freeze([...(ampDescriptors || [])]),
    exportManifest: Object.freeze({ targets: Object.freeze(['json', 'svg', 'phaser', 'png', 'aseprite']) }),
  });
  return Object.freeze({ packet, package: packageValue });
}
