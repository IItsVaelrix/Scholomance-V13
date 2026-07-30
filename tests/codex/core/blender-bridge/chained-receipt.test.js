/**
 * Chained receipt tests — per-frame digest chain for PATH_DEPENDENT renders.
 *
 * The chain makes frame N unsealable without N−1:
 *   PIXEL_RECEIPT(N) = sha256(pixel_dump_N ‖ digest_{N−1})
 *   digest_0         = the sealed packet's own seal
 *
 * A cold-started worker has nothing to fold and must REFUSE.
 */
import { describe, it, expect } from 'vitest';
import {
  chainedPixelHash, buildChain, verifyChain,
  mintChainedReceipt, compareChains, checkColdStart, ChainError,
} from '../../../../codex/core/blender-bridge/chained-receipt.js';
import { renderSCD64, parseRenderSCD64 } from '../../../../codex/core/blender-bridge/render-scd64.js';

const SEAL = '6DB23A1A';
const frame0 = Buffer.from('frame-zero-pixels');
const frame1 = Buffer.from('frame-one-pixels');
const frame2 = Buffer.from('frame-two-pixels');

describe('chainedPixelHash', () => {
  it('produces a 64-char uppercase hex digest', () => {
    const h = chainedPixelHash(frame0, SEAL);
    expect(h).toMatch(/^[0-9A-F]{64}$/);
  });

  it('is deterministic — same inputs yield same hash', () => {
    const a = chainedPixelHash(frame0, SEAL);
    const b = chainedPixelHash(frame0, SEAL);
    expect(a).toBe(b);
  });

  it('changes when the pixel dump changes', () => {
    const a = chainedPixelHash(frame0, SEAL);
    const b = chainedPixelHash(frame1, SEAL);
    expect(a).not.toBe(b);
  });

  it('changes when the prevDigest changes (chain dependency)', () => {
    const a = chainedPixelHash(frame0, SEAL);
    const b = chainedPixelHash(frame0, 'DIFFERENT_SEAL');
    expect(a).not.toBe(b);
  });

  it('refuses non-Buffer pixel data', () => {
    expect(() => chainedPixelHash('not-a-buffer', SEAL)).toThrow(ChainError);
  });

  it('refuses empty prevDigest', () => {
    expect(() => chainedPixelHash(frame0, '')).toThrow(ChainError);
  });
});

describe('buildChain', () => {
  it('builds a chain of frozen {frame, digest} entries', () => {
    const chain = buildChain(SEAL, [frame0, frame1, frame2]);
    expect(chain).toHaveLength(3);
    expect(chain[0].frame).toBe(0);
    expect(chain[1].frame).toBe(1);
    expect(chain[2].frame).toBe(2);
    expect(Object.isFrozen(chain)).toBe(true);
    expect(Object.isFrozen(chain[0])).toBe(true);
  });

  it('each digest depends on the previous (chain property)', () => {
    const chain = buildChain(SEAL, [frame0, frame1, frame2]);
    // Manually verify the chain
    const d0 = chainedPixelHash(frame0, SEAL);
    const d1 = chainedPixelHash(frame1, d0);
    const d2 = chainedPixelHash(frame2, d1);
    expect(chain[0].digest).toBe(d0);
    expect(chain[1].digest).toBe(d1);
    expect(chain[2].digest).toBe(d2);
  });

  it('refuses empty seal', () => {
    expect(() => buildChain('', [frame0])).toThrow(ChainError);
  });

  it('refuses empty frame array', () => {
    expect(() => buildChain(SEAL, [])).toThrow(ChainError);
  });

  it('is deterministic across repeated calls', () => {
    const a = buildChain(SEAL, [frame0, frame1]);
    const b = buildChain(SEAL, [frame0, frame1]);
    expect(a).toEqual(b);
  });
});

describe('verifyChain', () => {
  it('validates a correct chain', () => {
    const chain = buildChain(SEAL, [frame0, frame1, frame2]);
    const result = verifyChain(SEAL, [frame0, frame1, frame2], chain);
    expect(result.valid).toBe(true);
    expect(result.firstBadFrame).toBe(-1);
    expect(result.checkedFrames).toBe(3);
  });

  it('detects divergence at the first bad frame', () => {
    const chain = buildChain(SEAL, [frame0, frame1, frame2]);
    // Tamper with frame 1's pixels
    const tampered = [frame0, Buffer.from('TAMPERED'), frame2];
    const result = verifyChain(SEAL, tampered, chain);
    expect(result.valid).toBe(false);
    expect(result.firstBadFrame).toBe(1);
    expect(result.checkedFrames).toBe(1);
  });

  it('detects divergence at frame 0', () => {
    const chain = buildChain(SEAL, [frame0, frame1]);
    const result = verifyChain(SEAL, [Buffer.from('WRONG'), frame1], chain);
    expect(result.valid).toBe(false);
    expect(result.firstBadFrame).toBe(0);
  });

  it('refuses length mismatch', () => {
    const chain = buildChain(SEAL, [frame0, frame1]);
    expect(() => verifyChain(SEAL, [frame0], chain)).toThrow(ChainError);
  });
});

describe('mintChainedReceipt', () => {
  const claim = {
    engine: 'blender',
    packetId: 'test-packet',
    sourceChecksum: SEAL,
    synthClass: 'SIMULATED',
    frameIndex: 0,
    observed: {
      resolutionX: 160,
      resolutionY: 160,
      engine: 'CYCLES',
      device: 'CPU',
      seed: 7,
      samples: 64,
    },
  };

  it('mints a frozen receipt with SIMULATED synth class', () => {
    const digest = chainedPixelHash(frame0, SEAL);
    const receipt = mintChainedReceipt(claim, digest, 0, SEAL);
    expect(receipt.synthClass).toBe('SIMULATED');
    expect(receipt.frameIndex).toBe(0);
    expect(receipt.scd64).toMatch(/^[0-9A-F]{64}$/);
    expect(receipt.prevDigest).toBe(SEAL);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('SYNTH_CLASS slot encodes SIMULATED', () => {
    const digest = chainedPixelHash(frame0, SEAL);
    const receipt = mintChainedReceipt(claim, digest, 0, SEAL);
    const slots = parseRenderSCD64(receipt.scd64);
    // Slot 0 should differ from a RASTER receipt
    const rasterInputs = { ...receipt.inputs, synthClass: 'RASTER' };
    const rasterScd = renderSCD64(rasterInputs);
    const rasterSlots = parseRenderSCD64(rasterScd);
    expect(slots[0]).not.toBe(rasterSlots[0]);
  });

  it('refuses null claim', () => {
    expect(() => mintChainedReceipt(null, 'abc', 0, SEAL)).toThrow(ChainError);
  });

  it('refuses negative frame index', () => {
    expect(() => mintChainedReceipt(claim, 'abc', -1, SEAL)).toThrow(ChainError);
  });
});

describe('compareChains', () => {
  it('reports REPRODUCED for identical chains', () => {
    const chainA = buildChain(SEAL, [frame0, frame1]);
    const chainB = buildChain(SEAL, [frame0, frame1]);
    // Build receipts for comparison
    const receiptsA = chainA.map((c, i) => ({
      scd64: renderSCD64({ synthClass: 'SIMULATED', frameIndex: i, pixelDumpHash: c.digest }),
    }));
    const receiptsB = chainB.map((c, i) => ({
      scd64: renderSCD64({ synthClass: 'SIMULATED', frameIndex: i, pixelDumpHash: c.digest }),
    }));
    const result = compareChains(receiptsA, receiptsB);
    expect(result.verdict).toBe('REPRODUCED');
    expect(result.matchingFrames).toBe(2);
    expect(result.firstDivergentFrame).toBe(-1);
  });

  it('localizes divergence to the first bad frame', () => {
    const receiptsA = [0, 1, 2].map((i) => ({
      scd64: renderSCD64({ synthClass: 'SIMULATED', frameIndex: i, pixelDumpHash: `hash-${i}` }),
    }));
    const receiptsB = [0, 1, 2].map((i) => ({
      scd64: renderSCD64({ synthClass: 'SIMULATED', frameIndex: i, pixelDumpHash: i === 1 ? 'TAMPERED' : `hash-${i}` }),
    }));
    const result = compareChains(receiptsA, receiptsB);
    expect(result.verdict).toBe('RESYNTHESIZED');
    expect(result.firstDivergentFrame).toBe(1);
    expect(result.matchingFrames).toBe(2);
  });

  it('reports UNRELATED for length mismatch', () => {
    const result = compareChains(
      [{ scd64: renderSCD64({ pixelDumpHash: 'a' }) }],
      [{ scd64: renderSCD64({ pixelDumpHash: 'a' }) }, { scd64: renderSCD64({ pixelDumpHash: 'b' }) }],
    );
    expect(result.verdict).toBe('UNRELATED');
  });
});

describe('checkColdStart', () => {
  it('refuses a SIMULATED frame > 0 with seal as prevDigest', () => {
    const receipt = { synthClass: 'SIMULATED', frameIndex: 5, prevDigest: SEAL };
    const result = checkColdStart(receipt, SEAL);
    expect(result.refused).toBe(true);
    expect(result.reason).toContain('cold start');
  });

  it('allows frame 0 with seal as prevDigest (that is correct)', () => {
    const receipt = { synthClass: 'SIMULATED', frameIndex: 0, prevDigest: SEAL };
    const result = checkColdStart(receipt, SEAL);
    expect(result.refused).toBe(false);
  });

  it('allows a SIMULATED frame with a proper chain digest', () => {
    const receipt = { synthClass: 'SIMULATED', frameIndex: 5, prevDigest: 'SOME_CHAIN_DIGEST' };
    const result = checkColdStart(receipt, SEAL);
    expect(result.refused).toBe(false);
  });

  it('ignores non-SIMULATED receipts', () => {
    const receipt = { synthClass: 'RASTER', frameIndex: 5, prevDigest: SEAL };
    const result = checkColdStart(receipt, SEAL);
    expect(result.refused).toBe(false);
    expect(result.reason).toContain('not a SIMULATED');
  });
});

describe('determinism replay', () => {
  it('100-iteration replay produces identical chains', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      const chain = buildChain(SEAL, [frame0, frame1, frame2]);
      results.push(chain.map((c) => c.digest).join(':'));
    }
    expect(new Set(results).size).toBe(1);
  });
});
