import { TileForgeMicroprocessor, stableLayerHash } from '../../../tile-forge/tile-forge.microprocessor.js';
import { generateHeightMap } from './heightmap.microprocessor.js';

export class VolumeMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'volume', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const baseElevation = intent.elevation || 0;
    
    const heightMapResult = generateHeightMap(intent, input, baseElevation);
    
    const output = {
      heightMap: heightMapResult.heightMap,
      thickness: heightMapResult.thickness,
      cliffs: heightMapResult.cliffs,
      cavities: heightMapResult.cavities,
      overhangs: heightMapResult.overhangs
    };
    
    return {
      output,
      diagnostics: {
        warnings: [],
        errors: [],
        metrics: {
            cliffCount: heightMapResult.cliffs.length,
            cavityCount: heightMapResult.cavities.length,
            overhangCount: heightMapResult.overhangs.length
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
