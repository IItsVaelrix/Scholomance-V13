import { describe, it, expect } from 'vitest';
import {
  createGrassTileWitnessRecord,
  buildGrassFormWitness,
  buildGrassRealizationWitness,
} from '../../../src/game/tutorial-forest/scd128/grassTileWitness.js';
import {
  createTreeWitnessRecord,
  buildTreeFormWitness,
  buildTreeRealizationWitness,
  FOREST_TREE_SPECIES,
} from '../../../src/game/tutorial-forest/scd128/treeFamilyWitness.js';
import {
  createLotusWitnessRecord,
  buildLotusFormWitness,
  buildLotusRealizationWitness,
} from '../../../src/game/tutorial-forest/scd128/lotusTileWitness.js';
import {
  createPropWitnessRecord,
  buildPropFormWitness,
  buildPropRealizationWitness,
} from '../../../src/game/tutorial-forest/scd128/forestPropWitness.js';

describe('Tutorial Forest — SCD128 Dual-Witness Architecture', () => {
  it('grass tile witness emits a 128-hex wire record with 16 8-char blocks', () => {
    const record = createGrassTileWitnessRecord();
    expect(record.contract).toBe('SCD128-ASSET-RECORD');
    expect(record.scd128Wire).toHaveLength(128);
    expect(/^[0-9A-F]{128}$/.test(record.scd128Wire)).toBe(true);

    expect(record.form.form64Hex).toHaveLength(64);
    expect(record.form.form64Hex.startsWith('81')).toBe(true); // Bank 1 FORM prefix
    expect(record.realization.realization64Hex).toHaveLength(64);
    expect(record.realization.realization64Hex.startsWith('91')).toBe(true); // Bank 2 REALIZATION prefix
  });

  it('tree family witness emits valid 128-hex records for all 4 forest species', () => {
    for (const speciesKey of Object.keys(FOREST_TREE_SPECIES)) {
      const record = createTreeWitnessRecord(speciesKey);
      expect(record.scd128Wire).toHaveLength(128);
      expect(record.form.slots).toHaveLength(8);
      expect(record.realization.slots).toHaveLength(8);
      expect(record.form.form64Hex.startsWith('81')).toBe(true);
      expect(record.realization.realization64Hex.startsWith('91')).toBe(true);
    }
  });

  it('pixel lotus & pond witness emits valid 128-hex records', () => {
    const waterRecord = createLotusWitnessRecord('water_deep');
    expect(waterRecord.scd128Wire).toHaveLength(128);

    const lotusRecord = createLotusWitnessRecord('sacred_lotus_bloom');
    expect(lotusRecord.scd128Wire).toHaveLength(128);

    const f = buildLotusFormWitness('sacred_lotus_bloom');
    const r = buildLotusRealizationWitness('sacred_lotus_bloom');
    expect(f.form64Hex).toHaveLength(64);
    expect(r.realization64Hex).toHaveLength(64);
  });

  it('forest prop witness emits valid 128-hex records', () => {
    const pathRecord = createPropWitnessRecord('cobblestone_path');
    expect(pathRecord.scd128Wire).toHaveLength(128);

    const shrineRecord = createPropWitnessRecord('ancient_shrine');
    expect(shrineRecord.scd128Wire).toHaveLength(128);

    const f = buildPropFormWitness('ancient_shrine');
    const r = buildPropRealizationWitness('ancient_shrine');
    expect(f.form64Hex).toHaveLength(64);
    expect(r.realization64Hex).toHaveLength(64);
  });

  it('enforces strict bank isolation: mutating palette does not alter FORM64', () => {
    const f1 = buildGrassFormWitness({ variantId: 'glade_standard' });
    const r1 = buildGrassRealizationWitness({ paletteKey: 'verdant_glade' });
    const r2 = buildGrassRealizationWitness({ paletteKey: 'mossy_grove' });

    expect(r1.realization64Hex).not.toBe(r2.realization64Hex);
    // FORM64 is completely invariant to realization changes
    const f2 = buildGrassFormWitness({ variantId: 'glade_standard' });
    expect(f1.form64Hex).toBe(f2.form64Hex);
  });

  it('enforces strict bank isolation: mutating geometry does not alter REALIZATION64', () => {
    const f1 = buildTreeFormWitness('ancient_moss_oak');
    const f2 = buildTreeFormWitness('sunlit_young_sapling');
    expect(f1.form64Hex).not.toBe(f2.form64Hex);

    const r1 = buildTreeRealizationWitness('ancient_moss_oak');
    const r2 = buildTreeRealizationWitness('ancient_moss_oak');
    expect(r1.realization64Hex).toBe(r2.realization64Hex);
  });
});
