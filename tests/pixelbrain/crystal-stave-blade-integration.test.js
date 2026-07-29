import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFormula } from '../../codex/core/pixelbrain/formula-to-coordinates.js';

describe('crystal-stave-blade wand formula integration', () => {
  it('evaluates construction_request formula from JSON asset into valid coordinates', () => {
    const wandPath = path.resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json');
    const wandAsset = JSON.parse(fs.readFileSync(wandPath, 'utf8'));
    
    expect(wandAsset.formulas.length).toBeGreaterThan(0);
    const formulaEntry = wandAsset.formulas[0];
    
    const coords = evaluateFormula(
      formulaEntry.formula,
      wandAsset.canvas,
      0,
      { geometryConstructionEnabled: true },
    );
    expect(coords.length).toBeGreaterThan(0);
    
    // Verify coordinate properties emitted by construction_request
    const firstCoord = coords[0];
    expect(firstCoord.x).toBeDefined();
    expect(firstCoord.y).toBeDefined();
    expect(firstCoord.source).toBe('construction');
    expect(firstCoord.validationPassed).toBe(true);
    expect(firstCoord.partId).toBeDefined();
    expect(firstCoord.primitiveKind).toBeDefined();
  });
});
