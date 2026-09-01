/**
 * Aseprite Binary Codec — indexed-mode palette support.
 *
 * Regression coverage for a real contract mismatch found 2026-08-30:
 * foundry-aseprite-bridge.js marks its payload `colorMode: 'indexed'`, but
 * the codec ignored that field entirely and always wrote 32-bit RGBA cels
 * with no palette chunk (0x2019) — so there was no palette in the .aseprite
 * file to edit, regardless of what the payload claimed. "Edit the color
 * palette" could only ever mean "edit SCDL hex literals and recompile."
 */

import { describe, it, expect } from 'vitest';
import {
  encodeAsepriteBinary,
  decodeAsepriteBinary,
  remapAsepriteColors,
} from '../../../../codex/core/pixelbrain/aseprite-binary-codec.js';

function indexedPayload() {
  return {
    width: 4,
    height: 2,
    colorMode: 'indexed',
    palette: { colors: ['#FF0000', '#00FF00', '#0000FF'] },
    frames: [{
      frame: 0,
      duration: 100,
      layers: [{
        name: 'body',
        cells: [
          { x: 0, y: 0, color: '#FF0000' },
          { x: 1, y: 0, color: '#00FF00' },
          { x: 2, y: 1, color: '#0000FF' },
        ],
      }],
    }],
  };
}

describe('Aseprite codec — indexed color mode', () => {
  it('writes a real palette chunk and indexed color depth, not silently RGBA', () => {
    const bytes = encodeAsepriteBinary(indexedPayload());
    // Byte 12-13: color depth (WORD). 8 = indexed, 32 = RGBA.
    expect(bytes.readUInt16LE(12)).toBe(8);
    // Byte 32-33: number of colors (WORD) — includes the reserved
    // transparent slot at index 0, so 3 authored colors -> 4.
    expect(bytes.readUInt16LE(32)).toBe(4);
  });

  it('round-trips colorMode, palette, and cell positions/colors exactly', () => {
    const bytes = encodeAsepriteBinary(indexedPayload());
    const decoded = decodeAsepriteBinary(bytes);

    expect(decoded.colorMode).toBe('indexed');
    expect(decoded.palette.colors).toEqual(['#FF0000', '#00FF00', '#0000FF']);

    const cells = decoded.frames[0].layers[0].cells
      .map(c => ({ x: c.x, y: c.y, color: c.color }))
      .sort((a, b) => a.x - b.x);
    expect(cells).toEqual([
      { x: 0, y: 0, color: '#FF0000' },
      { x: 1, y: 0, color: '#00FF00' },
      { x: 2, y: 1, color: '#0000FF' },
    ]);
  });

  it('a cell below the alpha cutoff is treated as the transparent index, not written as a color', () => {
    const payload = indexedPayload();
    payload.frames[0].layers[0].cells.push({ x: 3, y: 1, color: '#FF0000', alpha: 0.1 });
    const decoded = decodeAsepriteBinary(encodeAsepriteBinary(payload));
    const positions = decoded.frames[0].layers[0].cells.map(c => `${c.x},${c.y}`);
    expect(positions).not.toContain('3,1');
  });

  it('rejects a palette over the 256-color indexed-mode ceiling instead of silently truncating', () => {
    const payload = indexedPayload();
    payload.palette.colors = Array.from({ length: 300 }, (_, i) => `#${(i % 256).toString(16).padStart(2, '0')}0000`);
    expect(() => encodeAsepriteBinary(payload)).toThrow(/256/);
  });

  it('still defaults to RGBA (no colorMode declared) — existing callers see no behavior change', () => {
    const payload = indexedPayload();
    delete payload.colorMode;
    const bytes = encodeAsepriteBinary(payload);
    expect(bytes.readUInt16LE(12)).toBe(32); // RGBA depth, unchanged from before this pass
    const decoded = decodeAsepriteBinary(bytes);
    expect(decoded.colorMode).toBe('rgba');
  });
});

describe('remapAsepriteColors — palette-editor and SCDL doing the same action', () => {
  it('remaps a color at its existing palette index, not by re-deriving a new palette order', () => {
    const bytes = encodeAsepriteBinary(indexedPayload());
    const remapped = remapAsepriteColors(bytes, { '#00FF00': '#FFFF00' });
    const decoded = decodeAsepriteBinary(remapped);

    // Same three slots, same order, only the targeted one changed.
    expect(decoded.palette.colors).toEqual(['#FF0000', '#FFFF00', '#0000FF']);
    expect(decoded.colorMode).toBe('indexed');
  });

  it('rewrites every matching cell, leaves geometry (x/y) and non-matching colors untouched', () => {
    const bytes = encodeAsepriteBinary(indexedPayload());
    const remapped = remapAsepriteColors(bytes, { '#FF0000': '#00FFFF' });
    const cells = decodeAsepriteBinary(remapped).frames[0].layers[0].cells
      .map(c => ({ x: c.x, y: c.y, color: c.color }))
      .sort((a, b) => a.x - b.x);

    expect(cells).toEqual([
      { x: 0, y: 0, color: '#00FFFF' }, // remapped
      { x: 1, y: 0, color: '#00FF00' }, // untouched
      { x: 2, y: 1, color: '#0000FF' }, // untouched
    ]);
  });

  it('is case-insensitive on both the match and the file’s own stored hex casing', () => {
    const bytes = encodeAsepriteBinary(indexedPayload());
    const remapped = remapAsepriteColors(bytes, { '#ff0000': '#123456' });
    const decoded = decodeAsepriteBinary(remapped);
    expect(decoded.palette.colors[0]).toBe('#123456');
  });

  it('also round-trips on an RGBA-mode file (no palette chunk to preserve, but positions/colors still exact)', () => {
    const payload = indexedPayload();
    delete payload.colorMode;
    const bytes = encodeAsepriteBinary(payload);
    const remapped = remapAsepriteColors(bytes, { '#0000FF': '#FF00FF' });
    const decoded = decodeAsepriteBinary(remapped);
    expect(decoded.colorMode).toBe('rgba');
    const cell = decoded.frames[0].layers[0].cells.find(c => c.x === 2 && c.y === 1);
    expect(cell.color).toBe('#FF00FF');
  });
});
