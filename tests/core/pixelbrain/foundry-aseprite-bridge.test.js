import { describe, expect, it } from 'vitest';
import { forgeItemAsset } from '../../../codex/core/pixelbrain/item-foundry.js';
import {
  decodeFoundryAsepriteBinary,
  exportFoundryToAseprite,
  exportFoundryToAsepriteBinary,
  importAsepriteBinaryToFoundryAsset,
  importAsepriteToFoundryAsset,
} from '../../../codex/core/pixelbrain/foundry-aseprite-bridge.js';
import { validateAsepriteImportPayload } from '../../../codex/core/pixelbrain/template-grid-engine.js';

const MINI_SPEC = Object.freeze({
  contract: 'ITEM-SPEC-v1',
  id: 'aseprite.bridge.mini.v1',
  class: 'weapon',
  archetype: 'dirk',
  canvas: { width: 24, height: 48 },
  seed: 17,
  bytecode: 'VW-VOID-RARE-HARMONIC',
  parts: [
    { id: 'blade', profile: 'blade.straight', params: { cx: 12, span: [0, 23] }, fill: { material: 'silver' } },
    { id: 'grip', profile: 'grip.uniform', params: { cx: 12, half: 1, height: 10 }, attach: { parent: 'blade', at: 'base' }, fill: { material: 'bronze' } },
    { id: 'pommel', profile: 'pommel.round', attach: { parent: 'grip', at: 'tip' }, fill: { material: 'ruby' } },
  ],
});

describe('Foundry Aseprite bridge', () => {
  it('exports a Foundry bundle into editable Aseprite-compatible layers', () => {
    const bundle = forgeItemAsset(MINI_SPEC, { includePng: false, includeShader: false });
    const aseprite = exportFoundryToAseprite(bundle);
    const validation = validateAsepriteImportPayload(aseprite);

    expect(validation.ok).toBe(true);
    expect(aseprite).toMatchObject({
      width: MINI_SPEC.canvas.width,
      height: MINI_SPEC.canvas.height,
      colorMode: 'indexed',
      gridType: 'rectangular',
      palette: {
        mode: 'indexed',
        locked: true,
      },
      meta: {
        bridge: 'foundry-aseprite',
        id: MINI_SPEC.id,
        editable: true,
        pixelPerfect: true,
      },
    });
    expect(aseprite.frames).toHaveLength(1);
    expect(aseprite.frames[0].layers.length).toBeGreaterThan(1);
    expect(aseprite.frames[0].layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(['blade', 'grip', 'pommel'])
    );
    expect(aseprite.frames[0].layers[0].cells[0]).toHaveProperty('metadata');
    expect(aseprite.palette.colors.length).toBeGreaterThan(0);
  });

  it('exports shield-like assets with canonical artist layers and skips locked preview layers on import', () => {
    const shieldPacket = {
      kind: 'pixelbrain.asset.v1',
      source: {
        id: 'voidshield.hd.v1',
        label: 'void_targe voidshield.hd.v1',
      },
      canvas: { width: 16, height: 16, cellSize: 1 },
      geometry: {
        coordinates: [
          { x: 1, y: 1, color: '#111111', partId: 'face' },
          { x: 2, y: 1, color: '#2244FF', partId: 'ring1' },
          { x: 3, y: 1, color: '#FFFFFF', partId: 'core' },
          { x: 4, y: 1, color: '#02070A', partId: 'face', shading: 'shadow' },
        ],
      },
    };

    const aseprite = exportFoundryToAseprite({ assetPacket: shieldPacket });
    expect(aseprite.meta.layerConvention).toBe('shield-energy-v1');
    expect(aseprite.frames[0].layers.map((layer) => layer.name)).toEqual([
      '00_Reference',
      '10_Structure',
      '20_Energy',
      '30_Focal',
      '40_Shading',
      '50_Glow_Effects',
      '99_Final',
    ]);
    expect(aseprite.frames[0].layers[0]).toMatchObject({
      editable: false,
      locked: true,
      role: 'reference',
    });
    expect(aseprite.frames[0].layers.at(-1)).toMatchObject({
      visible: false,
      editable: false,
      role: 'final-preview',
    });

    const result = importAsepriteToFoundryAsset(aseprite, { assetId: 'voidshield-edit' });
    expect(result.ok).toBe(true);
    expect(result.coordinates).toHaveLength(shieldPacket.geometry.coordinates.length);
    expect(result.coordinates.map((coord) => coord.partId)).toEqual(
      expect.arrayContaining(['face', 'ring1', 'core'])
    );
  });

  it('uses real construction guides (cyan, role=construction) in 00_Reference when provided via foundry bundle', () => {
    // Minimal shield-like packet (inspired by the previous test's voidshield example)
    const miniShieldPacket = {
      kind: 'pixelbrain.asset.v1',
      source: { id: 'construction-shield.test', label: 'test' },
      canvas: { width: 16, height: 16, cellSize: 1 },
      geometry: {
        coordinates: [
          { x: 7, y: 7, color: '#111111', partId: 'face' },
          { x: 8, y: 8, color: '#2244FF', partId: 'ring' },
        ],
      },
    };
    // Simulate a bundle that already went through SketchAMP + construction MP
    const constructionGuides = [
      { x: 7, y: 7, color: '#00E5FF', emphasis: 0.22, partId: 'reference', role: 'construction', ringRole: 'core' },
      { x: 8, y: 7, color: '#00E5FF', emphasis: 0.22, partId: 'reference', role: 'construction' },
    ];
    const shieldWithConstruction = {
      assetPacket: miniShieldPacket,
      construction: { referenceCells: constructionGuides },
    };

    const aseprite = exportFoundryToAseprite(shieldWithConstruction, { layerBy: 'shield' });
    const ref = aseprite.frames[0].layers.find(l => l.name === '00_Reference');

    expect(ref).toMatchObject({ locked: true, editable: false, role: 'reference' });
    const hasCyanConstruction = ref.cells.some(c =>
      c.color === '#00E5FF' && c.metadata?.role === 'construction' && c.metadata?.ringRole === 'core'
    );
    expect(hasCyanConstruction).toBe(true);
  });

  it('imports manual Aseprite edits back into a PixelBrain asset packet', () => {
    const bundle = forgeItemAsset(MINI_SPEC, { includePng: false, includeShader: false });
    const aseprite = exportFoundryToAseprite(bundle);
    const blade = aseprite.frames[0].layers.find((layer) => layer.name === 'blade');
    const editedCell = blade.cells[0];
    editedCell.color = '#FF00FF';
    editedCell.emphasis = 0.77;

    const result = importAsepriteToFoundryAsset(aseprite, {
      assetId: 'manual-edit-test',
      bytecode: MINI_SPEC.bytecode,
    });

    expect(result.ok).toBe(true);
    expect(result.assetPacket.kind).toBe('pixelbrain.asset.v1');
    expect(result.assetPacket.source.kind).toBe('aseprite-manual-edit');
    expect(result.coordinates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        x: editedCell.x,
        y: editedCell.y,
        color: '#FF00FF',
        emphasis: 0.77,
        partId: 'blade',
        source: 'aseprite_manual_edit',
      }),
    ]));
    expect(result.assetPacket.palette.sourcePalette[0].colors).toContain('#FF00FF');
  });

  it('exports native Aseprite binary and decodes it back to bridge JSON', () => {
    const bundle = forgeItemAsset(MINI_SPEC, { includePng: false, includeShader: false });
    const binary = exportFoundryToAsepriteBinary(bundle);

    expect(Buffer.isBuffer(binary)).toBe(true);
    expect(binary.readUInt16LE(4)).toBe(0xA5E0);
    expect(binary.readUInt16LE(8)).toBe(MINI_SPEC.canvas.width);
    expect(binary.readUInt16LE(10)).toBe(MINI_SPEC.canvas.height);

    // Header layout, asserted against upstream docs/ase-file-specs.md rather than
    // against this codec's own decoder — a round-trip test can pass while the
    // file is unreadable by the program named in its own format. Field order is
    // DWORD size · WORD magic · WORD frames · WORD width · WORD height ·
    // WORD depth · DWORD flags..., with grid fields at 0x24..0x2A and
    // "number of colors" at 0x20.
    //
    // Depth used to be asserted as 32 (RGBA) here, which was red on arrival: the
    // bridge declares `colorMode: 'indexed'` unconditionally (the sibling test at
    // the top of this file asserts the same), so the codec writes 8. 8 is the
    // correct value for an indexed file; the assertion was the stale side.
    expect(binary.readUInt16LE(6)).toBe(1);                  // frames
    expect(binary.readUInt16LE(12)).toBe(8);                 // 8 bpp = indexed
    expect(binary.readUInt16LE(32)).toBeGreaterThan(1);      // palette entries
    expect(binary.readUInt16LE(36)).toBe(0);                 // grid x
    expect(binary.readUInt16LE(38)).toBe(0);                 // grid y
    expect(binary.readUInt16LE(40)).toBe(0);                 // grid width (0 = no grid)
    // The canvas size must not be duplicated into the grid fields.
    expect(binary.readUInt16LE(38)).not.toBe(MINI_SPEC.canvas.width);
    expect(binary.readUInt16LE(40)).not.toBe(MINI_SPEC.canvas.height);

    const decoded = decodeFoundryAsepriteBinary(binary);
    expect(decoded.width).toBe(MINI_SPEC.canvas.width);
    expect(decoded.height).toBe(MINI_SPEC.canvas.height);
    expect(decoded.frames[0].layers.map((layer) => layer.name)).toEqual(
      expect.arrayContaining(['blade', 'grip', 'pommel'])
    );
    expect(decoded.frames[0].layers.some((layer) => layer.cells.length > 0)).toBe(true);
  });

  it('imports native Aseprite binary into a PixelBrain asset packet', () => {
    const bundle = forgeItemAsset(MINI_SPEC, { includePng: false, includeShader: false });
    const binary = exportFoundryToAsepriteBinary(bundle);
    const result = importAsepriteBinaryToFoundryAsset(binary, {
      assetId: 'native-aseprite-edit',
      bytecode: MINI_SPEC.bytecode,
    });

    expect(result.ok).toBe(true);
    expect(result.assetPacket.kind).toBe('pixelbrain.asset.v1');
    expect(result.assetPacket.source.kind).toBe('aseprite-manual-edit');
    expect(result.coordinates.length).toBeGreaterThan(0);
  });

  it('returns validation failures without throwing', () => {
    const result = importAsepriteToFoundryAsset({
      width: 99999,
      height: 1,
      cellSize: 1,
      gridType: 'rectangular',
      frames: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
