import { MaterialResolver } from './material-resolver.js';
import { stableLayerHash } from '../../tile-forge/tile-forge.microprocessor.js';

export class BiomeMaterialMicroprocessor {
  constructor({ id = "biomeMaterial", version = "1.0.0" } = {}) {
    this.id = id;
    this.version = version;
    this.resolver = new MaterialResolver();
  }

  run({ intent, input, context }) {
    const biomeId = intent.biomeId || "unknown";
    
    // Resolve materials based on the biome requested in intent
    const materialConfig = this.resolver.resolveBiomeMaterials(biomeId);
    
    const assignments = {
      topPlane: materialConfig.topPlane,
      sidePlane: materialConfig.sidePlane,
      rim: materialConfig.rim,
      cracks: materialConfig.cracks,
      underside: materialConfig.underside
    };
    
    const palette = materialConfig.palette;
    const materialCells = [];
    
    const topPlane = input?.isoTile?.topPlane || [];
    const sidePlanesByEdge = input?.isoTile?.sidePlanes || {};
    const sidePlaneCells = Object.values(sidePlanesByEdge).flat();
    const rimCells = input?.isoTile?.rimCells || [];
    const underside = input?.volume?.thickness || [];
    const cracks = input?.volume?.cavities || [];
    
    // Check noise masks to create variation (e.g., frost on top plane)
    const noiseMasks = input?.maskedNoise?.masks || {};
    const noiseSet = new Set(Object.values(noiseMasks).flat().map(c => `${c.x},${c.y}`));

    const mapCells = (cells, matId) => {
      for (const cell of cells) {
        let finalMatId = matId;
        // If it's a topPlane cell and affected by noise, give it the variation (cracks/frost) material
        if (matId === assignments.topPlane && noiseSet.has(`${cell.x},${cell.y}`)) {
          finalMatId = assignments.cracks || matId;
        }
        materialCells.push({
          ...cell,
          materialId: finalMatId,
          biomeId: biomeId
        });
      }
    };

    mapCells(topPlane, assignments.topPlane);
    mapCells(sidePlaneCells, assignments.sidePlane);
    mapCells(rimCells, assignments.rim);
    mapCells(underside, assignments.underside);
    mapCells(cracks, assignments.cracks);

    const output = {
      assignments,
      palette,
      materialCells
    };

    return {
      output,
      diagnostics: {
        warnings: [],
        errors: [],
        metrics: {
          assignedCells: materialCells.length
        }
      },
      hash: stableLayerHash(output),
      processor: {
        id: this.id,
        version: this.version
      }
    };
  }
}
