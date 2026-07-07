import { TileForgeMicroprocessor, stableLayerHash } from '../../../tile-forge/tile-forge.microprocessor.js';

export class TileSocketMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'tileSockets', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const edgeMasks = input.isoTile?.edgeMasks || { north: [], east: [], south: [], west: [] };
    const edges = { north: [], east: [], south: [], west: [] };

    // Produce QBIT edge cells with snapProfile
    for (const direction of ['north', 'east', 'south', 'west']) {
      for (const cell of edgeMasks[direction]) {
        edges[direction].push({
          x: cell.x,
          y: cell.y,
          z: cell.z,
          snapProfile: {
            biomeId: intent.biomeId,
            elevation: intent.elevation,
            socketType: intent.chunkType === "floating_island" ? "floating_edge" : "standard",
            elevationClass: "surface",
            walkable: true
          }
        });
      }
    }

    const output = {
      edges,
      sockets: { north: {}, east: {}, south: {}, west: {} },
      elevationMatchingData: {},
      biomeCompatibilityData: {},
      transitionTypeMetadata: {},
      walkabilityContinuityMarkers: []
    };

    return {
      output,
      diagnostics: { warnings: [], errors: [], metrics: { edgeCellCount: Object.values(edges).flat().length } },
      hash: stableLayerHash(output),
      processor: { id: this.id, version: this.version }
    };
  }
}
