/**
 * PB-CARRIER-v1. One producer decides what ships; the consumer selects which
 * frame to READ and never influences what is SENT.
 *
 * Integrity verification is JS-side and recomputes. The consumer's check is
 * string equality against an independently delivered root, and therefore
 * verifies IDENTITY, not INTEGRITY — see the carrier.js docstring.
 */
import { describe, it, expect } from 'vitest';
import {
  CARRIER_CONTRACT,
  CARRIER_FRAME_KINDS,
  frameChecksum,
  sealCarrier,
  verifyCarrier,
  selectFrame,
  CarrierError,
} from '../../../../codex/core/blender-bridge/carrier.js';

function renderPacket(id = 'r1') {
  return { packetId: id, coordinateCount: 2, positions: { x: [1, 2], y: [3, 4] } };
}
function temporalPacket(frame = 1) {
  return { contract: 'PB-TEMPORAL-FRAME-v1', frame, vertexCount: 1, positions: { x: [5], y: [6] } };
}
function twoFrames() {
  return [
    { kind: 'render', frameId: 'render-0', packet: renderPacket() },
    { kind: 'temporal', frameId: 'temporal-0', packet: temporalPacket() },
  ];
}

describe('sealCarrier', () => {
  it('names its contract and lists every frame in the manifest', () => {
    const c = sealCarrier(twoFrames());
    expect(c.contract).toBe(CARRIER_CONTRACT);
    expect(c.manifest.map((m) => m.frameId)).toEqual(['render-0', 'temporal-0']);
    expect(Object.keys(c.frames).sort()).toEqual(['render-0', 'temporal-0']);
  });

  it('is deterministic — the same frames seal to the same root', () => {
    expect(sealCarrier(twoFrames()).root).toBe(sealCarrier(twoFrames()).root);
  });

  it('refuses a frame kind no consumer reads', () => {
    // construction/gene/amp are deferred, not silently accepted. A carrier that
    // accepts a kind nothing reads reproduces the declared-but-unimplemented
    // pathology at carrier scale.
    expect(() => sealCarrier([{ kind: 'construction', frameId: 'c0', packet: {} }]))
      .toThrow(CarrierError);
    expect(CARRIER_FRAME_KINDS).toEqual(['render', 'temporal']);
  });

  it('refuses duplicate frame ids', () => {
    expect(() => sealCarrier([
      { kind: 'render', frameId: 'dup', packet: renderPacket('a') },
      { kind: 'render', frameId: 'dup', packet: renderPacket('b') },
    ])).toThrow(CarrierError);
  });

  it('refuses an empty carrier', () => {
    expect(() => sealCarrier([])).toThrow(CarrierError);
  });
});

describe('falsifier 8: frames are independent', () => {
  it('corrupting frame A does not change frame B checksum', () => {
    const c = sealCarrier(twoFrames());
    const before = c.manifest.find((m) => m.frameId === 'temporal-0').checksum;

    const tampered = structuredClone(c);
    tampered.frames['render-0'].coordinateCount = 999;
    const after = frameChecksum(tampered.frames['temporal-0']);

    expect(after).toBe(before);
  });
});

describe('falsifier 9: the manifest binds the frames', () => {
  it('swapping two frames contents changes the root', () => {
    const a = sealCarrier(twoFrames());
    const swapped = sealCarrier([
      { kind: 'render', frameId: 'render-0', packet: temporalPacket() },
      { kind: 'temporal', frameId: 'temporal-0', packet: renderPacket() },
    ]);
    expect(swapped.root).not.toBe(a.root);
  });

  it('reordering the manifest changes the root', () => {
    const forward = sealCarrier(twoFrames());
    const reversed = sealCarrier([...twoFrames()].reverse());
    expect(reversed.root).not.toBe(forward.root);
  });
});

describe('falsifier 10: tampering is refused, observably', () => {
  it('accepts an untampered carrier', () => {
    const r = verifyCarrier(sealCarrier(twoFrames()));
    expect(r.valid).toBe(true);
    expect(r.badFrames).toEqual([]);
  });

  it('names the tampered frame rather than failing vaguely', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    c.frames['render-0'].coordinateCount = 999;
    const r = verifyCarrier(c);
    expect(r.valid).toBe(false);
    expect(r.badFrames).toEqual(['render-0']);
    expect(r.reason).toContain('render-0');
  });

  it('detects an edited root even when every frame is intact', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    c.root = 'F'.repeat(64);
    const r = verifyCarrier(c);
    expect(r.valid).toBe(false);
    expect(r.rootMatches).toBe(false);
  });

  it('detects a frame deleted from frames but left in the manifest', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    delete c.frames['temporal-0'];
    expect(verifyCarrier(c).valid).toBe(false);
  });

  it('detects a frame present in frames but absent from the manifest', () => {
    // Law 4: the carrier ships whole and the manifest describes ALL of it. An
    // unlisted frame is cargo nobody declared.
    const c = structuredClone(sealCarrier(twoFrames()));
    c.frames.stowaway = renderPacket('x');
    expect(verifyCarrier(c).valid).toBe(false);
  });

  it('refuses a packet that is not a carrier at all', () => {
    expect(verifyCarrier({ contract: 'pixelbrain.render.v1' }).valid).toBe(false);
    expect(verifyCarrier(null).valid).toBe(false);
  });
});

describe('law 1: selecting does not influence what was sent', () => {
  it('returns the requested frame', () => {
    const c = sealCarrier(twoFrames());
    expect(selectFrame(c, 'temporal-0').contract).toBe('PB-TEMPORAL-FRAME-v1');
  });

  it('leaves the carrier byte-identical after selection', () => {
    const c = sealCarrier(twoFrames());
    const before = JSON.stringify(c);
    selectFrame(c, 'render-0');
    selectFrame(c, 'temporal-0');
    expect(JSON.stringify(c)).toBe(before);
  });

  it('refuses a frame id that is not on the carrier', () => {
    expect(() => selectFrame(sealCarrier(twoFrames()), 'nope')).toThrow(CarrierError);
  });
});
