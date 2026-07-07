/**
 * SCDL Aseprite Export Tests — SCDL v1.1 `aseprite` target
 *
 * PDR test plan item 10: payload has N frames, per-frame `layers` arrays are
 * distinct object graphs (aseprite codec Encoder Law), durations match the
 * SCDL-FRAME-LOOP-v1 manifest.
 *
 * Per the animation-encoding white paper, the decoder has a known
 * cell-accumulation bug — verification of the encoded binary is limited to
 * frame count and canvas dimensions.
 */

import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { buildAsepritePayload, exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import { encodeAsepriteBinary } from '../../../../../codex/core/pixelbrain/aseprite-binary-codec.js';

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

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

describe('SCDL v1.1 aseprite export', () => {
  it('builds a payload with one frame per packet and manifest durations', () => {
    const r = compileSCDL(FRAMED);
    expect(r.ok).toBe(true);
    const payload = buildAsepritePayload(r.framePackets, r.frameLoop);
    expect(payload.width).toBe(8);
    expect(payload.height).toBe(8);
    expect(payload.frames.length).toBe(4);
    expect(payload.frames.map(f => f.duration)).toEqual([200, 200, 300, 200]);
  });

  it('gives every frame its own deep-copied layers (Encoder Law)', () => {
    const r = compileSCDL(FRAMED);
    const payload = buildAsepritePayload(r.framePackets, r.frameLoop);
    const [f0, f1] = payload.frames;
    expect(f0.layers).not.toBe(f1.layers);
    for (let i = 0; i < f0.layers.length; i++) {
      expect(f0.layers[i]).not.toBe(f1.layers[i]);
      expect(f0.layers[i].cells).not.toBe(f1.layers[i].cells);
    }
  });

  it('uses a fixed layer table: union of part ids, same names in every frame', () => {
    const r = compileSCDL(FRAMED);
    const payload = buildAsepritePayload(r.framePackets, r.frameLoop);
    const names0 = payload.frames[0].layers.map(l => l.name);
    // crown only exists in frame 2 but must be in the fixed table, after its anchor
    expect(names0).toEqual(['body', 'crown', 'core']);
    for (const frame of payload.frames) {
      expect(frame.layers.map(l => l.name)).toEqual(names0);
    }
    // absent parts are present-but-empty
    expect(payload.frames[0].layers[1].cells.length).toBe(0);
    expect(payload.frames[2].layers[1].cells.length).toBeGreaterThan(0);
    // omitted core in frame 3 is empty
    expect(payload.frames[3].layers[2].cells.length).toBe(0);
  });

  it('encodes a binary whose header frame count matches', () => {
    const r = compileSCDL(FRAMED);
    const payload = buildAsepritePayload(r.framePackets, r.frameLoop);
    const bytes = encodeAsepriteBinary(payload);
    expect(readU16LE(bytes, 6)).toBe(4);   // frame count
    expect(readU16LE(bytes, 8)).toBe(8);   // width
    expect(readU16LE(bytes, 10)).toBe(8);  // height
  });

  it('exportSCDL exposes aseprite as a target for single packets too', () => {
    const r = compileSCDL(FRAMED);
    const out = exportSCDL(r.packet, ['aseprite'], r.ast);
    expect(out.aseprite.ok).toBe(true);
    expect(ArrayBuffer.isView(out.aseprite.output)).toBe(true);
    expect(readU16LE(out.aseprite.output, 6)).toBe(1);
  });
});
