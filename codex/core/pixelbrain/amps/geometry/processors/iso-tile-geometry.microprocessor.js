import { TileForgeMicroprocessor, stableLayerHash } from '../../../tile-forge/tile-forge.microprocessor.js';

export class IsoTileGeometryMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'isoTile', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const width = intent.tileSize?.width || 80;
    const height = intent.tileSize?.height || 45;

    const topPlane = [];
    const sidePlanes = { north: [], east: [], south: [], west: [] };
    const rimCells = [];
    const edgeMasks = { north: [], east: [], south: [], west: [] };

    const hw = width / 2;
    const hh = height / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Use a full Cartesian square (which becomes a visual diamond in iso projection)
        // Optionally round the very extreme corners just slightly for a softer edge
        const dx = Math.abs(x - hw) / hw;
        const dy = Math.abs(y - hh) / hh;
        
        // A perfect square means dx <= 1 and dy <= 1.
        // We trim the extreme 5% of corners so it isn't an infinitely sharp point
        if (dx + dy <= 1.9) {
          topPlane.push({ x, y, z: 0 });
          
          // Edge detection for rims
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || dx + dy > 1.8) {
            rimCells.push({ x, y, z: 0 });
            
            if (y === 0) {
              sidePlanes.north.push({ x, y, z: 0, facing: 'north' });
              edgeMasks.north.push({ x, y, z: 0 });
            }
            if (x === width - 1) {
              sidePlanes.east.push({ x, y, z: 0, facing: 'east' });
              edgeMasks.east.push({ x, y, z: 0 });
            }
            if (y === height - 1) {
              sidePlanes.south.push({ x, y, z: 0, facing: 'south' });
              edgeMasks.south.push({ x, y, z: 0 });
            }
            if (x === 0) {
              sidePlanes.west.push({ x, y, z: 0, facing: 'west' });
              edgeMasks.west.push({ x, y, z: 0 });
            }
          }
        }
      }
    }

    const output = {
      topPlane,
      sidePlanes,
      rimCells,
      cornerMasks: [],
      edgeMasks,
      walkableCandidates: topPlane,
      localTileCoordinates: [],
      visibleCellGroups: []
    };

    return {
      output,
      diagnostics: { warnings: [], errors: [], metrics: { topPlaneSize: topPlane.length } },
      hash: stableLayerHash(output),
      processor: { id: this.id, version: this.version }
    };
  }
}
