import { describe, expect, it } from 'vitest';
import { compositeSCDLV2Layers } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { importFromPixelBrainAssetPacket } from '../../../../../codex/core/pixelbrain/template-grid-engine.js';
import { createPixelBrainAssetPacket } from '../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

describe('SCDL v2 layerSurfaces IR and Studio non-destructive ingestion', () => {
  it('retains un-occluded layer planes in compositeSCDLV2Layers when layers overlap', () => {
    // Base layer: 4 black pixels at (0,0), (0,1), (1,0), (1,1)
    // Top layer: 1 white pixel at (0,0) occluding base (0,0)
    const result = compositeSCDLV2Layers({ width: 4, height: 4 }, [
      {
        id: 'blade_base',
        order: 10,
        sourceIndex: 0,
        visible: true,
        opacity: 1,
        blend: 'OVER',
        paints: [
          { shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#000000', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 0, y: 1 } }, fill: '#000000', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 1, y: 0 } }, fill: '#000000', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 1, y: 1 } }, fill: '#000000', raster: 'CENTER' },
        ],
      },
      {
        id: 'blade_bevel',
        order: 20,
        sourceIndex: 1,
        visible: true,
        opacity: 1,
        blend: 'OVER',
        paints: [
          { shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#ffffff', raster: 'CENTER' },
        ],
      },
    ]);

    expect(result.ok).toBe(true);

    // Flattened coordinates for render consumers: exactly 4 pixels, (0,0) is white from top
    expect(result.coordinates.length).toBe(4);
    const topCell = result.coordinates.find((c) => c.x === 0 && c.y === 0);
    expect(topCell.color).toBe('#ffffff');
    expect(topCell.partId).toBe('blade_bevel');

    // layerSurfaces IR: BOTH layer planes are completely preserved
    expect(result.layerSurfaces).toBeDefined();
    expect(result.layerSurfaces.length).toBe(2);

    const baseSurface = result.layerSurfaces.find((s) => s.id === 'blade_base');
    const bevelSurface = result.layerSurfaces.find((s) => s.id === 'blade_bevel');

    expect(baseSurface).toBeDefined();
    expect(bevelSurface).toBeDefined();

    // The occluded (0,0) cell is NOT lost on blade_base! All 4 authored cells survive!
    expect(baseSurface.coordinates.length).toBe(4);
    const baseCell00 = baseSurface.coordinates.find((c) => c.x === 0 && c.y === 0);
    expect(baseCell00.color).toBe('#000000');
    expect(baseCell00.partId).toBe('blade_base');

    // blade_bevel surface has its 1 white cell
    expect(bevelSurface.coordinates.length).toBe(1);
    expect(bevelSurface.coordinates[0].color).toBe('#ffffff');
    expect(bevelSurface.coordinates[0].partId).toBe('blade_bevel');
  });

  it('compiles SCDL v2 source and emits layerSurfaces on both packet and package', () => {
    const source = `SCDL 2
ASSET blade_test
CANVAS WIDTH 8 HEIGHT 8
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 10 RASTER_CELLS 100

SHAPE $p00 (PIXEL AT (VEC2 (PX 0) (PX 0)))
SHAPE $p01 (PIXEL AT (VEC2 (PX 0) (PX 1)))

LAYER blade_base ORDER 10 {
  PAINT $p00 FILL #111111 RASTER CENTER
  PAINT $p01 FILL #111111 RASTER CENTER
}

LAYER blade_bevel ORDER 20 {
  PAINT $p00 FILL #eeeeee RASTER CENTER
}
`;

    const compiled = compileSCDLV2(source);
    expect(compiled.ok).toBe(true);
    expect(compiled.packet.layerSurfaces).toBeDefined();
    expect(compiled.packet.layerSurfaces.length).toBe(2);

    expect(compiled.package.layerSurfaces).toBeDefined();
    expect(compiled.package.layerSurfaces.length).toBe(2);

    const baseSurface = compiled.packet.layerSurfaces[0];
    const bevelSurface = compiled.packet.layerSurfaces[1];

    expect(baseSurface.id).toBe('blade_base');
    expect(baseSurface.order).toBe(10);
    expect(baseSurface.coordinates.length).toBe(2);

    expect(bevelSurface.id).toBe('blade_bevel');
    expect(bevelSurface.order).toBe(20);
    expect(bevelSurface.coordinates.length).toBe(1);

    // Flattened coordinates: 2 cells, (0,0) taken by blade_bevel
    expect(compiled.packet.geometry.coordinates.length).toBe(2);
  });

  it('imports layerSurfaces into Studio grid natively with non-destructive layer isolation', () => {
    const source = `SCDL 2
ASSET blade_grid_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 10 RASTER_CELLS 100

SHAPE $p22 (PIXEL AT (VEC2 (PX 2) (PX 2)))
SHAPE $p23 (PIXEL AT (VEC2 (PX 2) (PX 3)))
SHAPE $p32 (PIXEL AT (VEC2 (PX 3) (PX 2)))
SHAPE $p33 (PIXEL AT (VEC2 (PX 3) (PX 3)))

LAYER blade_base ORDER 10 {
  PAINT $p22 FILL #222222 RASTER CENTER
  PAINT $p23 FILL #222222 RASTER CENTER
  PAINT $p32 FILL #222222 RASTER CENTER
  PAINT $p33 FILL #222222 RASTER CENTER
}

LAYER blade_bevel ORDER 20 {
  PAINT $p22 FILL #ffffff RASTER CENTER
  PAINT $p32 FILL #ffffff RASTER CENTER
}
`;

    const compiled = compileSCDLV2(source);
    expect(compiled.ok).toBe(true);

    const grid = importFromPixelBrainAssetPacket(compiled.packet);
    expect(grid.ok).toBe(true);
    expect(grid.layers.length).toBe(2);

    // Ordered by layer.order
    expect(grid.layers[0].name).toBe('blade_base');
    expect(grid.layers[1].name).toBe('blade_bevel');

    // Studio layer for blade_base contains all 4 authored cells!
    expect(grid.layers[0].cells.size).toBe(4);
    expect(grid.layers[0].cells.get('2,2').color).toBe('#222222');
    expect(grid.layers[0].cells.get('2,3').color).toBe('#222222');
    expect(grid.layers[0].cells.get('3,2').color).toBe('#222222');
    expect(grid.layers[0].cells.get('3,3').color).toBe('#222222');

    // Studio layer for blade_bevel contains its 2 cells
    expect(grid.layers[1].cells.size).toBe(2);
    expect(grid.layers[1].cells.get('2,2').color).toBe('#FFFFFF');
    expect(grid.layers[1].cells.get('3,2').color).toBe('#FFFFFF');

    // If Studio hides blade_bevel, blade_base remains 100% intact
    grid.layers[1].visible = false;
    expect(grid.layers[0].cells.size).toBe(4);
  });

  it('falls back to partId bucketing when importing legacy packets without layerSurfaces', () => {
    const legacyPacket = createPixelBrainAssetPacket({
      canvas: { width: 8, height: 8 },
      coordinates: [
        { x: 1, y: 1, color: '#ff0000', partId: 'legacy_part_a' },
        { x: 2, y: 2, color: '#00ff00', partId: 'legacy_part_b' },
      ],
    });

    expect(legacyPacket.layerSurfaces).toEqual([]);

    const grid = importFromPixelBrainAssetPacket(legacyPacket);
    expect(grid.ok).toBe(true);
    expect(grid.layers.length).toBe(2);
    const names = grid.layers.map((l) => l.name).sort();
    expect(names).toEqual(['legacy_part_a', 'legacy_part_b']);
  });
});
