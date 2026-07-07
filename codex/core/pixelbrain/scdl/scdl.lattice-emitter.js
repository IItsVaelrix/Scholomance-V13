/**
 * SCDL Lattice Emitter
 *
 * Formats a PixelBrainAssetPacket into the pixelbrain.asset.v1 lattice view —
 * a flat, geometry-first JSON that downstream renderers and exporters consume.
 *
 * This is separate from the packet itself so consumers can choose the view
 * that best fits their use case.
 */

import { PIXELBRAIN_ASSET_KIND } from '../pixelbrain-asset-packet.js';

/**
 * @param {object} packet - PixelBrainAssetPacket
 * @param {object} [ast]  - Optional: original SCDL AST for part metadata
 * @returns {object} pixelbrain.asset.v1 lattice view
 */
export function emitLattice(packet, ast) {
  if (!packet || packet.kind !== PIXELBRAIN_ASSET_KIND) {
    throw new Error('emitLattice: expected a valid PixelBrainAssetPacket');
  }

  const coordinates = packet.geometry?.coordinates || [];
  const canvas      = packet.canvas;

  // Build parts index from AST if available
  const partsIndex = {};
  if (ast?.parts) {
    for (const part of ast.parts) {
      partsIndex[part.id] = {
        id:       part.id,
        material: part.material,
        fillColor: part.fillColor || null,
        intentOps: (part.intentOps || []).map(op => ({
          op:     op.op,
          source: op.source,
          intent: true,
        })),
      };
    }
  }

  return Object.freeze({
    kind:   PIXELBRAIN_ASSET_KIND,
    id:     packet.id,
    source: {
      kind:  packet.source?.kind  || 'scdl',
      id:    packet.source?.id    || null,
      label: packet.source?.label || null,
    },
    canvas: {
      width:  canvas.width,
      height: canvas.height,
    },
    geometry: {
      mode:        'coordinates',
      coordinates: Object.freeze(
        coordinates.map(c => Object.freeze({
          x:        c.x,
          y:        c.y,
          color:    c.color,
          partId:   c.partId   || null,
          material: c.material || null,
          role:     c.role     || 'explicit',
        }))
      ),
    },
    palette: packet.palette?.sourcePalette?.[0]?.colors || [],
    _paletteMap: Object.freeze({ ...(ast?.palette || {}) }),
    parts:   Object.freeze(Object.values(partsIndex)),
    provenance: Object.freeze({
      createdBy:  packet.provenance?.createdBy || 'scdl-compiler.v1',
      operations: packet.provenance?.operations || [],
    }),
    scdlSource:     'SCDL-AST-v1',
    regressionSeed: ast?.checksum ? { sourceChecksum: ast.checksum } : null,
  });
}
