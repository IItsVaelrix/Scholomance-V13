import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { stableJson } from '../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';
import { hashString } from '../../../../../codex/core/pixelbrain/shared.js';

const GRAPH_SRC = `
asset duo canvas 32x32
palette { c = #204060 }
def dot { part p material gold { circle 0 0 radius 2 c } }
group g at 8 8 {
  instance dot at 0 0
  instance dot at 10 4 rotate 45 scale 1.5
}
export json
`;

describe('graph compile — packet contract and identity law', () => {
  it('emits a scene-graph packet with no stored pixels', () => {
    const r = compileSCDL(GRAPH_SRC);
    expect(r.ok).toBe(true);
    expect(r.packet.geometry.mode).toBe('scene-graph');
    expect(r.packet.geometry.sceneGraph.contract).toBe('PB-SCENE-GRAPH-v1');
    expect(r.packet.geometry.coordinates).toHaveLength(0);
  });

  it('packet ID hashes the canonical program (formula bytes)', () => {
    const r = compileSCDL(GRAPH_SRC);
    const expected = `pbasset_${hashString(stableJson(r.packet.geometry.sceneGraph)).toString(16).padStart(8, '0')}`;
    expect(r.packet.id).toBe(expected);
  });

  it('same program → same ID; added instance → different ID; comments → same ID', () => {
    const a = compileSCDL(GRAPH_SRC);
    const b = compileSCDL(GRAPH_SRC + '\n# a trailing comment\n');
    const c = compileSCDL(GRAPH_SRC.replace('instance dot at 0 0', 'instance dot at 0 0\n  instance dot at 5 5'));
    expect(b.packet.id).toBe(a.packet.id);
    expect(c.packet.id).not.toBe(a.packet.id);
  });

  it('flat assets are untouched (mode coordinates, same pipeline)', () => {
    const r = compileSCDL('asset flat canvas 8x8\npart p material gold { cell 1 1 #ffffff }\nexport json');
    expect(r.packet.geometry.mode).toBe('coordinates');
    expect(r.packet.geometry.sceneGraph).toBeUndefined();
  });

  it('graph + frames errors with the PR-3 message', () => {
    const srcWithFrames = GRAPH_SRC.replace('export json', 'loop idle duration 100\nframe 1 "x" { omit g }\nexport json');
    const r = compileSCDL(srcWithFrames);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /do not support frames yet/.test(e.message))).toBe(true);
  });
});
