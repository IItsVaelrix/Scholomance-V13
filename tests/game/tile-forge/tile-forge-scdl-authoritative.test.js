import { describe, expect, it } from 'vitest';
import {
  synthesizeTileForgeTile,
  synthesizeTileForgeProp,
  synthesizeTileForgeAsset,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { compileSCDLV2 } from '../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';

describe('Tile Forge — Authoritative SCDL V2 Construction & AMP Conveyor', () => {
  it('synthesizes flat top diamond tiles authoritatively from SCDL V2', () => {
    const tile = synthesizeTileForgeTile({ type: 'top', biome: 'verdant_glade', seed: 4242 });

    expect(tile.width).toBe(80);
    expect(tile.height).toBe(40);
    expect(tile.scdlSource).toBeDefined();
    expect(tile.scdlSource).toContain('SCDL 2');
    expect(tile.scdlSource).toContain('APPLY_AMP $geo');
    expect(tile.scdlSource).toContain('pixelbrain.iso-tile-geometry');
    expect(tile.scdlSource).toContain('pixelbrain.biome-material');
    expect(tile.scdlSource).toContain('pixelbrain.grass');

    // Verify AMPs conveyor executed
    expect(Array.isArray(tile.ampDescriptors)).toBe(true);
    expect(tile.ampDescriptors.length).toBeGreaterThan(0);
    const kinds = tile.ampDescriptors.map((a) => a.kind);
    expect(kinds).toContain('ISO_TILE_GEOMETRY');
    expect(kinds).toContain('BIOME_MATERIAL');
    expect(kinds).toContain('GRASS');

    // Verify independent compiler execution matches
    const recompiled = compileSCDLV2(tile.scdlSource);
    expect(recompiled.ok).toBe(true);

    // Verify discrete cells & buffer
    expect(tile.data).toBeInstanceOf(Uint8ClampedArray);
    expect(tile.data.length).toBe(80 * 40 * 4);
    expect(tile.activeCellCount).toBeGreaterThan(0);
    expect(typeof tile.toCanvas).toBe('function');
  });

  it('synthesizes extruded cliff skirt tiles authoritatively from SCDL V2 with volume-lift AMP', () => {
    const cliff = synthesizeTileForgeTile({ type: 'cliff', biome: 'void_forest', seed: 1337, elevation: 1 });

    expect(cliff.hasCliff).toBe(true);
    expect(cliff.height).toBe(56);
    expect(cliff.scdlSource).toContain('SCDL 2');
    expect(cliff.scdlSource).toContain('pixelbrain.volume-lift');

    const kinds = cliff.ampDescriptors.map((a) => a.kind);
    expect(kinds).toContain('ISO_TILE_GEOMETRY');
    expect(kinds).toContain('VOLUME_LIFT');

    const recompiled = compileSCDLV2(cliff.scdlSource);
    expect(recompiled.ok).toBe(true);
  });

  it('synthesizes environmental props authoritatively from SCDL V2 with volume and field AMPs', () => {
    const tree = synthesizeTileForgeProp({ propType: 'crystal_tree', biome: 'void_forest', seed: 4242 });

    expect(tree.scdlSource).toBeDefined();
    expect(tree.scdlSource).toContain('SCDL 2');
    expect(tree.scdlSource).toContain('pixelbrain.volume-lift');
    expect(tree.ampDescriptors.length).toBeGreaterThan(0);

    const recompiled = compileSCDLV2(tree.scdlSource);
    expect(recompiled.ok).toBe(true);
    expect(tree.data).toBeInstanceOf(Uint8ClampedArray);
  });

  it('attaches SCDL V2 source and AMP descriptors on polymorphic assets', () => {
    const oak = synthesizeTileForgeAsset({ semanticType: 'grandfather_oak', seed: 4242 });

    expect(oak.scdlSource).toBeDefined();
    expect(oak.scdlSource).toContain('SCDL 2');
    expect(oak.ampDescriptors).toBeDefined();
    expect(Array.isArray(oak.ampDescriptors)).toBe(true);
  });

  it('governs tile shape via FORM64 and style via REALIZATION64 in SCDL', () => {
    const tile = synthesizeTileForgeTile({
      type: 'top',
      biome: 'void_forest',
      seed: 4242,
      socketS: 'socket_open',
      socketW: 'socket_open',
    });

    // Verify formal 128-wire record attached
    expect(tile.scd128Record).toBeDefined();
    expect(tile.scd128Record.scd128Wire).toHaveLength(128);
    expect(tile.scd128Record.form.slots).toHaveLength(8);
    expect(tile.scd128Record.realization.slots).toHaveLength(8);

    // Verify FORM64 shape governance in SCDL
    expect(tile.scdlSource).toContain('FORM64 (Shape & Sockets):');
    expect(tile.scdlSource).toContain('SHAPE $shoulder_nw');
    expect(tile.scdlSource).toContain('SHAPE $crown_plateau');
    expect(tile.scdlSource).toContain('SHAPE $crest_high');
    expect(tile.scdlSource).toContain('SHAPE $tooth_sw1');
    expect(tile.scdlSource).toContain('SHAPE $rim_line_nw');

    // Verify REALIZATION64 style governance in SCDL
    expect(tile.scdlSource).toContain('REALIZATION64 (Style & Material):');
    expect(tile.scdlSource).toContain('SHAPE $dit_se1');
    expect(tile.scdlSource).toContain('SHAPE $clump_0_root');
    expect(tile.scdlSource).toContain('SHAPE $clump_0_cb');
    expect(tile.scdlSource).toContain('SHAPE $clump_0_tip');
    expect(tile.scdlSource).toContain('LAYER ground_shoulder ORDER 15');
    expect(tile.scdlSource).toContain('LAYER ground_crown ORDER 20');
    expect(tile.scdlSource).toContain('LAYER ground_dither ORDER 25');
    expect(tile.scdlSource).toContain('LAYER ground_surface_clusters ORDER 30');

    // Verify cliff skirt shape and strata governance
    const cliff = synthesizeTileForgeTile({
      type: 'cliff',
      biome: 'verdant_glade',
      seed: 9999,
      elevation: 1,
    });

    expect(cliff.scdlSource).toContain('FORM64 (Shape & Lift):');
    expect(cliff.scdlSource).toContain('REALIZATION64 (Style & Strata):');
    expect(cliff.scdlSource).toContain('SHAPE $cliff_left_col1');
    expect(cliff.scdlSource).toContain('SHAPE $cliff_left_col2');
    expect(cliff.scdlSource).toContain('SHAPE $strata_shelf_1');
    expect(cliff.scdlSource).toContain('SHAPE $prow_ridge');
    expect(cliff.scdlSource).toContain('SHAPE $crystal_vein');
    expect(cliff.scdlSource).toContain('SHAPE $sod_rim_1');
  });
});
