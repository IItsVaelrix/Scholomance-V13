/**
 * SCDL Frames Tests — SCDL v1.1 frame blocks
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-07-03-scdl-frames-and-cli-out-dir-pdr.md
 * Covers test plan items 1–9: base identity invariant, replace/add/omit,
 * anchor ordering, painter-slot replacement, Frame Index Law (SCDL-013),
 * SCDL-012/014/015, duration defaulting, SCDL-FRAME-LOOP-v1 manifest golden.
 */

import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const BASE = `
asset blob canvas 8x8

palette {
  a = #111111
  b = #222222
  c = #333333
}

part body material voidsteel {
  rect 2 2 4 4 a
}

part core material cyan_glow {
  cell 4 4 b
}

export json
`.trim();

const FRAMED = `
asset blob canvas 8x8

palette {
  a = #111111
  b = #222222
  c = #333333
}

part body material voidsteel {
  rect 2 2 4 4 a
}

part core material cyan_glow {
  cell 4 4 b
}

loop idle duration 200

frame 1 "shift" {
  part core material cyan_glow {
    cell 4 5 b
  }
}

frame 2 "crown" duration 300 {
  part crown after body material gold {
    cell 4 1 c
  }
}

frame 3 "fade" {
  omit core
}

export json
`.trim();

function coordsOf(packet) {
  return packet.geometry.coordinates;
}

function labelsOf(result) {
  return result.errors.map(e => e.label);
}

describe('SCDL v1.1 frames — happy path', () => {
  it('compiles a framed asset ok with one packet per frame', () => {
    const r = compileSCDL(FRAMED);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.framePackets)).toBe(true);
    expect(r.framePackets.length).toBe(4);
    expect(r.framePackets[0]).toBe(r.packet);
  });

  it('base identity invariant: frame blocks never move the frame-0 packet ID', () => {
    const plain = compileSCDL(BASE);
    const framed = compileSCDL(FRAMED);
    expect(plain.ok).toBe(true);
    expect(framed.ok).toBe(true);
    expect(framed.packet.id).toBe(plain.packet.id);
  });

  it('replace override swaps the part geometry in that frame only', () => {
    const r = compileSCDL(FRAMED);
    const f1 = coordsOf(r.framePackets[1]);
    expect(f1.some(cd => cd.x === 4 && cd.y === 5 && cd.color === '#222222')).toBe(true);
    expect(f1.some(cd => cd.x === 4 && cd.y === 4 && cd.color === '#222222')).toBe(false);
    // base frame untouched
    const f0 = coordsOf(r.framePackets[0]);
    expect(f0.some(cd => cd.x === 4 && cd.y === 4 && cd.color === '#222222')).toBe(true);
  });

  it('add override inserts the new part at the after-anchor painter slot', () => {
    const r = compileSCDL(FRAMED);
    const f2 = coordsOf(r.framePackets[2]);
    const lastBody  = f2.map(cd => cd.partId).lastIndexOf('body');
    const firstCrown = f2.findIndex(cd => cd.partId === 'crown');
    const firstCore  = f2.findIndex(cd => cd.partId === 'core');
    expect(firstCrown).toBeGreaterThan(lastBody);
    expect(firstCore).toBeGreaterThan(firstCrown);
    expect(f2.some(cd => cd.x === 4 && cd.y === 1 && cd.color === '#333333')).toBe(true);
  });

  it('omit removes the part from that frame only', () => {
    const r = compileSCDL(FRAMED);
    const f3 = coordsOf(r.framePackets[3]);
    expect(f3.some(cd => cd.partId === 'core')).toBe(false);
    expect(coordsOf(r.framePackets[0]).some(cd => cd.partId === 'core')).toBe(true);
  });

  it('painter-slot replacement: replaced part keeps its slot between neighbors', () => {
    const src = FRAMED.replace(
      `frame 1 "shift" {
  part core material cyan_glow {
    cell 4 5 b
  }
}`,
      `frame 1 "repaint" {
  part body material voidsteel {
    rect 2 2 4 4 c
  }
}`
    );
    const r = compileSCDL(src);
    expect(r.ok).toBe(true);
    const f1 = coordsOf(r.framePackets[1]);
    const lastBody = f1.map(cd => cd.partId).lastIndexOf('body');
    const firstCore = f1.findIndex(cd => cd.partId === 'core');
    expect(firstCore).toBeGreaterThan(lastBody);
    // core still paints over the replaced body at (4,4): last write wins
    const at44 = f1.filter(cd => cd.x === 4 && cd.y === 4);
    expect(at44[at44.length - 1].color).toBe('#222222');
  });
});

describe('SCDL v1.1 frames — Frame Index Law (SCDL-013)', () => {
  it('rejects sparse indices: frame 2 without frame 1', () => {
    const src = BASE.replace('export json', `frame 2 "x" {
  omit core
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-013');
  });

  it('rejects out-of-declaration-order indices', () => {
    const src = BASE.replace('export json', `frame 2 "b" {
  omit core
}

frame 1 "a" {
  omit core
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-013');
  });

  it('rejects duplicate indices', () => {
    const src = BASE.replace('export json', `frame 1 "a" {
  omit core
}

frame 1 "b" {
  omit core
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-013');
  });

  it('rejects explicit frame 0', () => {
    const src = BASE.replace('export json', `frame 0 "rest" {
  omit core
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-013');
  });
});

describe('SCDL v1.1 frames — override diagnostics', () => {
  it('SCDL-012: omit of unknown part id', () => {
    const src = BASE.replace('export json', `frame 1 {
  omit ghost
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-012');
  });

  it('SCDL-014: after anchor on a replacement (Replacement Ordering Law)', () => {
    const src = BASE.replace('export json', `frame 1 {
  part core after body material cyan_glow {
    cell 4 5 b
  }
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-014');
  });

  it('SCDL-014: added part with no after anchor', () => {
    const src = BASE.replace('export json', `frame 1 {
  part newbit material gold {
    cell 1 1 c
  }
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-014');
  });

  it('SCDL-014: added part with unknown after anchor', () => {
    const src = BASE.replace('export json', `frame 1 {
  part newbit after ghost material gold {
    cell 1 1 c
  }
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(false);
    expect(labelsOf(r)).toContain('SCDL-014');
  });

  it('SCDL-015: dead frame identical to base warns but compiles', () => {
    const src = BASE.replace('export json', `frame 1 "noop" {
}

export json`);
    const r = compileSCDL(src);
    expect(r.ok).toBe(true);
    expect(labelsOf(r)).toContain('SCDL-015');
    expect(r.framePackets.length).toBe(2);
  });
});

describe('SCDL v1.1 frames — SCDL-FRAME-LOOP-v1 manifest', () => {
  it('emits the manifest with loop name, durations, labels, and packet ids', () => {
    const r = compileSCDL(FRAMED);
    const m = r.frameLoop;
    expect(m.contract).toBe('SCDL-FRAME-LOOP-v1');
    expect(m.asset).toBe('blob');
    expect(m.loop).toBe('idle');
    expect(m.canvas).toEqual({ width: 8, height: 8 });
    expect(m.defaultDurationMs).toBe(200);
    expect(m.sourceChecksum).toBe(r.ast.checksum);
    expect(m.frames.length).toBe(4);
    expect(m.frames[0]).toEqual({
      index: 0, label: 'rest', durationMs: 200, packet: r.framePackets[0].id,
    });
    expect(m.frames[1].label).toBe('shift');
    expect(m.frames[1].durationMs).toBe(200); // defaulted from loop decl
    expect(m.frames[2].durationMs).toBe(300); // per-frame override
    expect(m.frames[3].packet).toBe(r.framePackets[3].id);
  });

  it('manifest is stable across two compiles of the same source', () => {
    const a = compileSCDL(FRAMED);
    const b = compileSCDL(FRAMED);
    expect(a.frameLoop).toEqual(b.frameLoop);
  });

  it('frameless assets get no manifest and a single frame packet', () => {
    const r = compileSCDL(BASE);
    expect(r.frameLoop).toBe(null);
    expect(r.framePackets.length).toBe(1);
    expect(r.framePackets[0]).toBe(r.packet);
  });
});
