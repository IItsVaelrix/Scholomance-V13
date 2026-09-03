import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { normalizePB_SDF_v1 } from '../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

describe('emitPacketPass sdfDescriptors', () => {
  it('a part built from one circle op produces exactly one real descriptor', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(1);
    const d = result.packet.sdfDescriptors[0];
    expect(d.contract).toBe('PB-SDF-v1');
    expect(d.id).toBe('sdf-body');
    expect(d.primitives).toEqual([{ type: 'circle', params: { center: { x: 8, y: 8 }, radius: 4 } }]);
  });

  it('a part built entirely from unsupported op types produces no descriptor at all', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { cell 4 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(0);
  });

  it('a real emitted descriptor survives normalizePB_SDF_v1 without being silently emptied', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    const normalized = normalizePB_SDF_v1(result.packet.sdfDescriptors[0]);
    expect(normalized.id).not.toBe('empty');
    expect(normalized.primitives).toHaveLength(1);
    expect(normalized.primitives[0].type).toBe('circle');
  });

  it('a two-part asset (circle + rect) produces two independent descriptors', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\npart base material stone { rect 2 2 4 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(2);
    expect(result.packet.sdfDescriptors.map((d) => d.id).sort()).toEqual(['sdf-base', 'sdf-body']);
  });
});
