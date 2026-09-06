// Immutable PixelBrain asset packet + SCDL-PACKAGE-v2 construction for a
// successful v2 compile. Palette colors follow first occurrence in the
// already y-major/x-minor raster coordinate list, not lexical order.

import { createPixelBrainAssetPacket } from '../../pixelbrain-asset-packet.js';

export function emitSCDLV2Package({ analysis, bytecode, construction, raster }) {
  const packet = createPixelBrainAssetPacket({
    id: `pbasset_${bytecode.programId.slice('scdlbc_'.length)}`,
    canvas: analysis.canvas,
    coordinates: raster.coordinates,
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
        { op: 'lower', programId: bytecode.programId },
        { op: 'evaluate', instructionCount: bytecode.instructions.length },
        { op: 'rasterize', coordinateCount: raster.coordinates.length },
      ],
    },
    metadata: { tags: ['scdl', 'scdl-v2'], notes: [`Program: ${bytecode.programId}`] },
  });
  const packageValue = Object.freeze({
    contract: 'SCDL-PACKAGE-v2',
    programId: bytecode.programId,
    bytecode,
    verifiedBudget: bytecode.verifiedBudget,
    construction,
    layers: raster.layers,
    framePackets: Object.freeze([packet]),
    animation: null,
    ampPlan: Object.freeze([]),
    exportManifest: Object.freeze({ targets: Object.freeze(['json', 'svg', 'phaser', 'png', 'aseprite']) }),
  });
  return Object.freeze({ packet, package: packageValue });
}
