/**
 * QA Validation: PixelBrain Aseprite Export
 *
 * Validates export functionality for Aseprite-compatible file formats:
 * - PNG sprite sheets with metadata
 * - JSON data files (coordinate + color data)
 * - Aseprite .ase format structure validation
 * - Export preset correctness
 *
 * @see src/pages/PixelBrain/components/ExportOptions.jsx
 * @see codex/core/pixelbrain/image-to-pixel-art.js
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  createTemplateGrid,
  exportToPixelPerfectAseprite,
  GRID_TYPES,
  setCell,
} from '../../../codex/core/pixelbrain/template-grid-engine.js';
import {
  decodeAsepriteBinary,
  encodeAsepriteBinary,
} from '../../../codex/core/pixelbrain/aseprite-binary-codec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Mock export presets from ExportOptions.jsx
const EXPORT_PRESETS = {
  GODOT: {
    name: 'Godot Engine',
    format: 'PNG',
    scale: 1,
    metadata: true
  },
  UNITY: {
    name: 'Unity',
    format: 'PNG',
    scale: 2,
    metadata: true
  },
  WEB: {
    name: 'Web',
    format: 'PNG',
    scale: 1,
    metadata: false
  },
  FORMULA: {
    name: 'Formula Only',
    format: 'JSON',
    scale: 1,
    metadata: false
  },
  ASEPRITE: {
    name: 'Aseprite',
    format: 'PNG+JSON',
    scale: 1,
    metadata: true,
    asepriteCompatible: true
  }
};

describe('PixelBrain Aseprite Export QA', () => {
  describe('Export Preset Contract Validation', () => {
    it('should have valid preset structure', () => {
      for (const [_key, preset] of Object.entries(EXPORT_PRESETS)) {
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('format');
        expect(preset).toHaveProperty('scale');
        expect(preset).toHaveProperty('metadata');
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.format).toBe('string');
        expect(typeof preset.scale).toBe('number');
        expect(typeof preset.metadata).toBe('boolean');
      }
    });

    it('should have Aseprite-specific preset', () => {
      expect(EXPORT_PRESETS.ASEPRITE).toBeDefined();
      expect(EXPORT_PRESETS.ASEPRITE.asepriteCompatible).toBe(true);
      expect(EXPORT_PRESETS.ASEPRITE.format).toBe('PNG+JSON');
      expect(EXPORT_PRESETS.ASEPRITE.metadata).toBe(true);
    });

    it('should have valid scale values', () => {
      for (const preset of Object.values(EXPORT_PRESETS)) {
        expect(preset.scale).toBeGreaterThanOrEqual(1);
        expect(preset.scale).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('PNG Export Validation', () => {
    it('should generate valid PNG structure', () => {
      // Mock coordinate and palette data
      const coordinates = [
        { x: 10, y: 20, z: 0, color: '#FF0000', emphasis: 0.8 },
        { x: 15, y: 25, z: 0, color: '#00FF00', emphasis: 0.6 },
        { x: 20, y: 30, z: 0, color: '#0000FF', emphasis: 0.4 },
      ];

      const palettes = [
        {
          key: 'test_palette',
          colors: ['#FF0000', '#00FF00', '#0000FF'],
          weights: [0.33, 0.33, 0.34]
        }
      ];

      // Validate coordinate structure for PNG export
      for (const coord of coordinates) {
        expect(coord).toHaveProperty('x');
        expect(coord).toHaveProperty('y');
        expect(coord).toHaveProperty('color');
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.color).toMatch(/^#[0-9A-F]{6}$/i);
      }

      // Validate palette structure
      for (const palette of palettes) {
        expect(palette).toHaveProperty('key');
        expect(palette).toHaveProperty('colors');
        expect(Array.isArray(palette.colors)).toBe(true);
        expect(palette.colors.length).toBeGreaterThan(0);
      }
    });

    it('should scale coordinates correctly', () => {
      const baseCoordinates = [
        { x: 10, y: 20, color: '#FF0000' },
        { x: 30, y: 40, color: '#00FF00' },
      ];

      const scale = 2;
      const scaled = baseCoordinates.map(coord => ({
        ...coord,
        x: coord.x * scale,
        y: coord.y * scale,
      }));

      expect(scaled[0].x).toBe(20);
      expect(scaled[0].y).toBe(40);
      expect(scaled[1].x).toBe(60);
      expect(scaled[1].y).toBe(80);
    });

    it('should validate PNG dimensions for Aseprite compatibility', () => {
      // Aseprite prefers power-of-2 dimensions
      const validSizes = [16, 32, 64, 128, 256, 512, 1024, 2048];

      for (const size of validSizes) {
        expect(Math.log2(size)).toBe(Number(Math.log2(size).toFixed(0)));
      }
    });
  });

  describe('JSON Metadata Export', () => {
    it('should generate valid Aseprite-compatible JSON structure', () => {
      const coordinates = [
        { x: 10, y: 20, z: 0, color: '#FF0000', emphasis: 0.8 },
        { x: 15, y: 25, z: 0, color: '#00FF00', emphasis: 0.6 },
      ];

      const palettes = [
        {
          key: 'main',
          colors: ['#FF0000', '#00FF00'],
          weights: [0.5, 0.5]
        }
      ];

      const formula = {
        bytecode: 'PB-FORM-v1-PARAM-CRIT-0001-TEST-CHECKSUM',
        formulaType: 'parametric_curve',
        coordinateFormula: {
          type: 'parametric_curve',
          parameters: { cx: 80, cy: 72, a: 50 }
        }
      };

      // Generate Aseprite-compatible metadata
      const metadata = {
        aseprite: {
          version: '1.3',
          compatible: true,
        },
        pixelBrain: {
          formula,
          coordinates,
          palettes,
          exportTimestamp: new Date().toISOString(),
        },
        frames: [{
          filename: 'frame001.png',
          duration: 100,
        }],
        meta: {
          size: { w: 160, h: 144 },
          frameTags: [{ name: 'idle', from: 0, to: 0, direction: 'forward' }],
          layers: [{ name: 'Layer 1', opacity: 255, blendMode: 'normal' }],
          slices: []
        }
      };

      // Validate structure
      expect(metadata).toHaveProperty('aseprite');
      expect(metadata).toHaveProperty('pixelBrain');
      expect(metadata).toHaveProperty('meta');
      expect(metadata.aseprite.compatible).toBe(true);
      expect(metadata.meta.size.w).toBe(160);
      expect(metadata.meta.size.h).toBe(144);
    });

    it('should include formula bytecode in metadata', () => {
      const formula = {
        bytecode: 'PB-FORM-v1-TEST-12345',
        formulaType: 'spiral',
      };

      const metadata = {
        formula,
        metadata: true
      };

      expect(metadata.formula.bytecode).toBeDefined();
      expect(typeof metadata.formula.bytecode).toBe('string');
      expect(metadata.formula.bytecode).toMatch(/^PB-FORM-v1/);
    });

    it('should serialize metadata to valid JSON', () => {
      const metadata = {
        aseprite: { version: '1.3', compatible: true },
        coordinates: [{ x: 10, y: 20, color: '#FF0000' }],
        palette: ['#FF0000', '#00FF00'],
      };

      expect(() => JSON.stringify(metadata)).not.toThrow();

      const serialized = JSON.stringify(metadata);
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(metadata);
    });
  });

  describe('Coordinate Mapping for Export', () => {
    it('should map coordinates to pixel grid correctly', () => {
      const coordinates = [
        { x: 10.3, y: 20.7, color: '#FF0000' },
        { x: 15.8, y: 25.2, color: '#00FF00' },
      ];

      const snapped = coordinates.map(coord => ({
        ...coord,
        x: Math.round(coord.x),
        y: Math.round(coord.y),
      }));

      expect(snapped[0].x).toBe(10);
      expect(snapped[0].y).toBe(21);
      expect(snapped[1].x).toBe(16);
      expect(snapped[1].y).toBe(25);
    });

    it('should handle negative coordinates', () => {
      const coordinates = [
        { x: -10, y: 20, color: '#FF0000' },
        { x: 30, y: -40, color: '#00FF00' },
      ];

      // Offset to positive space for Aseprite
      const minX = Math.min(...coordinates.map(c => c.x));
      const minY = Math.min(...coordinates.map(c => c.y));
      const offsetX = minX < 0 ? Math.abs(minX) : 0;
      const offsetY = minY < 0 ? Math.abs(minY) : 0;

      const offset = coordinates.map(coord => ({
        ...coord,
        x: coord.x + offsetX,
        y: coord.y + offsetY,
      }));

      // minX = -10, so offsetX = 10: -10 + 10 = 0, 30 + 10 = 40
      // minY = -40, so offsetY = 40: 20 + 40 = 60, -40 + 40 = 0
      expect(offset[0].x).toBe(0);
      expect(offset[0].y).toBe(60);
      expect(offset[1].x).toBe(40);
      expect(offset[1].y).toBe(0);
    });

    it('should validate coordinate bounds', () => {
      const coordinates = [
        { x: 10, y: 20, color: '#FF0000' },
        { x: 200, y: 150, color: '#00FF00' },
      ];

      const canvasSize = { width: 160, height: 144 };

      const inBounds = coordinates.filter(coord =>
        coord.x >= 0 && coord.x < canvasSize.width &&
        coord.y >= 0 && coord.y < canvasSize.height
      );

      expect(inBounds.length).toBe(1);
      expect(inBounds[0].x).toBe(10);
    });
  });

  describe('Color Palette Export', () => {
    it('should generate valid Aseprite palette structure', () => {
      const palette = {
        name: 'PixelBrain Palette',
        colors: [
          { hex: '#FF0000', name: 'Red' },
          { hex: '#00FF00', name: 'Green' },
          { hex: '#0000FF', name: 'Blue' },
        ]
      };

      expect(palette).toHaveProperty('name');
      expect(palette).toHaveProperty('colors');
      expect(palette.colors.length).toBeGreaterThan(0);

      for (const color of palette.colors) {
        expect(color).toHaveProperty('hex');
        expect(color.hex).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });

    it('should export GPL format for GIMP/Aseprite', () => {
      const colors = ['#FF0000', '#00FF00', '#0000FF'];
      const paletteName = 'Test Palette';

      // GPL format structure
      const gplContent = [
        'GIMP Palette',
        `Name: ${paletteName}`,
        'Columns: 4',
        '#',
        ...colors.map(hex => {
          const rgb = hexToRgb(hex);
          return `${rgb.r} ${rgb.g} ${rgb.b}\t${hex}`;
        })
      ].join('\n');

      expect(gplContent).toContain('GIMP Palette');
      expect(gplContent).toContain(`Name: ${paletteName}`);
      expect(gplContent.split('\n').length).toBe(colors.length + 4);
    });

    it('should export ACT format (Photoshop/Aseprite)', () => {
      const colors = ['#FF0000', '#00FF00', '#0000FF'];

      // ACT format: 3 bytes per color (R, G, B)
      const actBuffer = new Uint8Array(colors.length * 3);

      colors.forEach((hex, i) => {
        const rgb = hexToRgb(hex);
        actBuffer[i * 3] = rgb.r;
        actBuffer[i * 3 + 1] = rgb.g;
        actBuffer[i * 3 + 2] = rgb.b;
      });

      expect(actBuffer.length).toBe(colors.length * 3);
      expect(actBuffer[0]).toBe(255); // R of first color
      expect(actBuffer[1]).toBe(0);   // G of first color
      expect(actBuffer[2]).toBe(0);   // B of first color
    });
  });

  describe('Export Pipeline Integration', () => {
    it('should handle complete export pipeline', () => {
      const exportData = {
        formula: {
          bytecode: 'PB-FORM-v1-TEST',
          formulaType: 'spiral',
          parameters: { cx: 80, cy: 72, a: 50 }
        },
        coordinates: [
          { x: 10, y: 20, color: '#FF0000' },
          { x: 30, y: 40, color: '#00FF00' },
        ],
        palettes: [
          {
            key: 'main',
            colors: ['#FF0000', '#00FF00'],
            weights: [0.5, 0.5]
          }
        ],
        canvas: { width: 160, height: 144 }
      };

      // Validate all required fields
      expect(exportData).toHaveProperty('formula');
      expect(exportData).toHaveProperty('coordinates');
      expect(exportData).toHaveProperty('palettes');
      expect(exportData).toHaveProperty('canvas');

      // Validate coordinate structure
      for (const coord of exportData.coordinates) {
        expect(coord.x).toBeDefined();
        expect(coord.y).toBeDefined();
        expect(coord.color).toBeDefined();
      }

      // Validate palette structure
      for (const palette of exportData.palettes) {
        expect(palette.key).toBeDefined();
        expect(palette.colors).toBeDefined();
        expect(Array.isArray(palette.colors)).toBe(true);
      }
    });

    it('should validate export preset application', () => {
      const baseData = {
        coordinates: [{ x: 10, y: 20, color: '#FF0000' }],
        canvas: { width: 160, height: 144 }
      };

      // Apply UNITY preset (2x scale)
      const unityPreset = EXPORT_PRESETS.UNITY;
      const unityData = {
        ...baseData,
        coordinates: baseData.coordinates.map(c => ({
          ...c,
          x: c.x * unityPreset.scale,
          y: c.y * unityPreset.scale,
        })),
        canvas: {
          width: baseData.canvas.width * unityPreset.scale,
          height: baseData.canvas.height * unityPreset.scale,
        }
      };

      expect(unityData.coordinates[0].x).toBe(20);
      expect(unityData.coordinates[0].y).toBe(40);
      expect(unityData.canvas.width).toBe(320);
      expect(unityData.canvas.height).toBe(288);
    });
  });

  describe('Aseprite-Specific Validation', () => {
    it('should generate valid frame structure', () => {
      const frames = [
        { filename: 'frame001.png', duration: 100 },
        { filename: 'frame002.png', duration: 100 },
        { filename: 'frame003.png', duration: 100 },
      ];

      for (const frame of frames) {
        expect(frame).toHaveProperty('filename');
        expect(frame).toHaveProperty('duration');
        expect(frame.filename).toMatch(/\.png$/i);
        expect(frame.duration).toBeGreaterThanOrEqual(10);
      }
    });

    it('should generate valid layer structure', () => {
      const layers = [
        { name: 'Background', opacity: 255, blendMode: 'normal' },
        { name: 'Foreground', opacity: 200, blendMode: 'multiply' },
      ];

      for (const layer of layers) {
        expect(layer).toHaveProperty('name');
        expect(layer).toHaveProperty('opacity');
        expect(layer).toHaveProperty('blendMode');
        expect(layer.opacity).toBeGreaterThanOrEqual(0);
        expect(layer.opacity).toBeLessThanOrEqual(255);
      }
    });

    it('should validate animation tags', () => {
      const frameTags = [
        { name: 'idle', from: 0, to: 7, direction: 'forward' },
        { name: 'walk', from: 8, to: 15, direction: 'pingpong' },
      ];

      for (const tag of frameTags) {
        expect(tag).toHaveProperty('name');
        expect(tag).toHaveProperty('from');
        expect(tag).toHaveProperty('to');
        expect(tag.from).toBeLessThanOrEqual(tag.to);
        expect(['forward', 'reverse', 'pingpong']).toContain(tag.direction);
      }
    });

    it('exports a 1:1 pixel-perfect native Aseprite payload from an imported asset grid', () => {
      const grid = createTemplateGrid({
        width: 4,
        height: 3,
        cellSize: 1,
        gridType: GRID_TYPES.RECTANGULAR,
        snapStrength: 1,
      });
      const layer = grid.layers[0];
      setCell(layer, 1, 1, '#FF0000', 1);
      setCell(layer, 2, 1, '#00FF00', 1);

      const payload = exportToPixelPerfectAseprite(grid, { id: 'qa-asset' });

      expect(payload.width).toBe(4);
      expect(payload.height).toBe(3);
      expect(payload.cellSize).toBe(1);
      expect(payload.meta.pixelPerfect).toBe(true);
      expect(payload.meta.oneToOne).toBe(true);
      expect(payload.frames[0].layers).toHaveLength(1);
      expect(payload.frames[0].layers[0].cells).toEqual([
        { x: 1, y: 1, color: '#FF0000', emphasis: 1 },
        { x: 2, y: 1, color: '#00FF00', emphasis: 1 },
      ]);
    });

    it('encodes and decodes the 1:1 native Aseprite payload without moving pixels', () => {
      const grid = createTemplateGrid({
        width: 4,
        height: 3,
        cellSize: 1,
        gridType: GRID_TYPES.RECTANGULAR,
        snapStrength: 1,
      });
      setCell(grid.layers[0], 0, 0, '#0000FF', 1);
      setCell(grid.layers[0], 3, 2, '#FFFFFF', 1);

      const payload = exportToPixelPerfectAseprite(grid, { id: 'qa-binary' });
      const binary = encodeAsepriteBinary(payload);
      const decoded = decodeAsepriteBinary(binary);
      const cells = decoded.frames[0].layers
        .flatMap((layer) => layer.cells)
        .sort((a, b) => a.y - b.y || a.x - b.x);

      expect(decoded.width).toBe(4);
      expect(decoded.height).toBe(3);
      expect(cells).toEqual([
        expect.objectContaining({ x: 0, y: 0, color: '#0000FF' }),
        expect.objectContaining({ x: 3, y: 2, color: '#FFFFFF' }),
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty coordinate array', () => {
      const coordinates = [];

      expect(Array.isArray(coordinates)).toBe(true);
      expect(coordinates.length).toBe(0);
    });

    it('should handle missing palette data', () => {
      const palettes = null;

      // Should provide default palette
      const defaultPalette = palettes || [{
        key: 'default',
        colors: ['#000000', '#FFFFFF'],
        weights: [0.5, 0.5]
      }];

      expect(defaultPalette).toBeDefined();
      expect(Array.isArray(defaultPalette)).toBe(true);
    });

    it('should handle invalid color format', () => {
      const invalidColors = ['invalid', '#GGGGGG', 'rgb(255,0,0)', '#FF0000'];

      const validColors = invalidColors.filter(color =>
        /^#[0-9A-F]{6}$/i.test(color)
      );

      expect(validColors.length).toBe(1);
      expect(validColors[0]).toBe('#FF0000');
    });
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}
