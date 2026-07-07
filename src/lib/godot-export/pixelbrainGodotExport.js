import { formulaToBytecode } from '../pixelbrain.adapter.js';
import { createPixelBrainArtifact } from './artifactSchemas.js';
import { serializeStable } from './stableSerialize.js';

export function buildPixelBrainGodotExport({ canvas, palettes, coordinates, formula } = {}) {
  const bytecode = formula ? formulaToBytecode(formula) : '';
  const artifact = createPixelBrainArtifact({ canvas, palettes, coordinates, formula, bytecode });

  return `${serializeStable(artifact)}\n`;
}
