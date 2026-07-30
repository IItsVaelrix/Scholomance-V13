/**
 * Simulation E2E tests — chained receipt protocol for PATH_DEPENDENT renders.
 *
 * Simulation caches (rigid body, cloth, fluid) are PATH_DEPENDENT: cold-starting
 * frame N returns the UN-SIMULATED state. The chained receipt makes frame N
 * unsealable without N−1.
 *
 * These tests use synthetic pixel buffers (not real Blender renders) to prove
 * the chain protocol: build, mint, verify, cold-start refusal, comparison.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildSimChain, mintSimReceipts, runSimE2E, compareSimRuns,
  SimE2EError,
} from '../../../../codex/core/blender-bridge/sim-e2e.js';
import {
  chainedPixelHash, buildChain, verifyChain, checkColdStart,
} from '../../../../codex/core/blender-bridge/chained-receipt.js';

const SEAL = 'A1B2C3D4';

function makeFrameBuffers(n) {
  return Array.from({ length: n }, (_, i) =>
    Buffer.from(`frame-${i}-pixel-data-${Date.now()}-${i}`)
  );
}

function makeDeterministicFrameBuffers(n) {
  return Array.from({ length: n }, (_, i) =>
    Buffer.from(`frame-${i}-deterministic-pixels`)
  );
}

function makeClaims(n, seal) {
  return Array.from({ length: n }, (_, i) => ({
    engine: 'blender',
    packetId: 'test-packet',
    sourceChecksum: seal,
    synthClass: 'SIMULATED',
    frameIndex: i,
    observed: {
      resolutionX: 160,
      resolutionY: 160,
      engine: 'CYCLES',
      device: 'CPU',
      seed: 7,
      samples: 64,
      blenderVersion: '5.2.0',
      buildHash: 'fbe6228777e7',
      frameIndex: i,
    },
  }));
}

describe('buildSimChain', () => {
  it('builds a chain of N digests from a seal and N frame buffers', () => {
    const buffers = makeDeterministicFrameBuffers(5);
    const chain = buildSimChain(SEAL, buffers);
    expect(chain).toHaveLength(5);
    expect(chain[0].frame).toBe(0);
    expect(chain[4].frame).toBe(4);
    // Each digest is a 64-char uppercase hex string
    for (const entry of chain) {
      expect(entry.digest).toMatch(/^[0-9A-F]{64}$/);
    }
  });

  it('each digest depends on the previous (chain property)', () => {
    const buffers = makeDeterministicFrameBuffers(3);
    const chain = buildSimChain(SEAL, buffers);
    // Manually verify: digest[0] = sha256(buffer[0] + SEAL)
    const expected0 = chainedPixelHash(buffers[0], SEAL);
    expect(chain[0].digest).toBe(expected0);
    // digest[1] = sha256(buffer[1] + digest[0])
    const expected1 = chainedPixelHash(buffers[1], chain[0].digest);
    expect(chain[1].digest).toBe(expected1);
  });

  it('is deterministic', () => {
    const buffers = makeDeterministicFrameBuffers(4);
    const a = buildSimChain(SEAL, buffers);
    const b = buildSimChain(SEAL, buffers);
    expect(a.map((e) => e.digest)).toEqual(b.map((e) => e.digest));
  });
});

describe('mintSimReceipts', () => {
  it('mints N chained receipts from N claims and N pixel hashes', () => {
    const claims = makeClaims(3, SEAL);
    const buffers = makeDeterministicFrameBuffers(3);
    const pixelHashes = buffers.map((b) =>
      createHash('sha256').update(b).digest('hex').toUpperCase()
    );

    const receipts = mintSimReceipts(claims, pixelHashes, SEAL);
    expect(receipts).toHaveLength(3);
    for (const r of receipts) {
      expect(r.synthClass).toBe('SIMULATED');
      expect(r.scd64).toMatch(/^[0-9A-F]{64}$/);
    }
  });

  it('throws on count mismatch', () => {
    const claims = makeClaims(3, SEAL);
    const pixelHashes = ['AAA', 'BBB'];
    expect(() => mintSimReceipts(claims, pixelHashes, SEAL)).toThrow(SimE2EError);
  });

  it('throws on empty input', () => {
    expect(() => mintSimReceipts([], [], SEAL)).toThrow(SimE2EError);
  });
});

describe('runSimE2E', () => {
  it('runs the full simulation E2E pipeline', () => {
    const buffers = makeDeterministicFrameBuffers(4);
    const manifest = {
      packetId: 'test-packet',
      sourceChecksum: SEAL,
      synthClass: 'SIMULATED',
      frameStart: 0,
      frameEnd: 3,
      frameCount: 4,
      claims: makeClaims(4, SEAL),
    };

    const result = runSimE2E(manifest, { dumpBuffers: buffers });

    expect(result.seal).toBe(SEAL);
    expect(result.frameCount).toBe(4);
    expect(result.chain).toHaveLength(4);
    expect(result.receipts).toHaveLength(4);
    expect(result.verification.valid).toBe(true);
    expect(result.verification.firstBadFrame).toBe(-1);
    expect(result.anyColdStart).toBe(false);
    expect(result.selfComparison.verdict).toBe('REPRODUCED');
    expect(result.pixelHashes).toHaveLength(4);
  });

  it('rejects non-SIMULATED manifests', () => {
    const manifest = {
      sourceChecksum: SEAL,
      synthClass: 'RASTER',
      claims: makeClaims(1, SEAL),
    };
    expect(() => runSimE2E(manifest, { dumpBuffers: [Buffer.from('x')] }))
      .toThrow(SimE2EError);
  });

  it('rejects missing dumps', () => {
    const manifest = {
      sourceChecksum: SEAL,
      synthClass: 'SIMULATED',
      claims: makeClaims(1, SEAL),
    };
    expect(() => runSimE2E(manifest, {})).toThrow(SimE2EError);
  });
});

describe('cold-start refusal', () => {
  it('detects a cold-started frame > 0 with seal as prevDigest', () => {
    const buffers = makeDeterministicFrameBuffers(3);
    const claims = makeClaims(3, SEAL);
    const pixelHashes = buffers.map((b) =>
      createHash('sha256').update(b).digest('hex').toUpperCase()
    );
    const receipts = mintSimReceipts(claims, pixelHashes, SEAL);

    // Frame 0: prevDigest is the seal — this is correct (frame 0 starts from seal)
    const check0 = checkColdStart(receipts[0], SEAL);
    expect(check0.refused).toBe(false);

    // Frame 1: prevDigest should NOT be the seal (it should be frame 0's digest)
    // Our mintSimReceipts correctly chains, so this should pass
    const check1 = checkColdStart(receipts[1], SEAL);
    expect(check1.refused).toBe(false);

    // Simulate a cold-started receipt: frame 2 with seal as prevDigest
    const coldReceipt = {
      synthClass: 'SIMULATED',
      frameIndex: 2,
      prevDigest: SEAL,
    };
    const coldCheck = checkColdStart(coldReceipt, SEAL);
    expect(coldCheck.refused).toBe(true);
    expect(coldCheck.reason).toContain('cold start');
  });
});

describe('compareSimRuns', () => {
  it('two identical runs yield REPRODUCED', () => {
    const buffers = makeDeterministicFrameBuffers(3);
    const manifest = {
      sourceChecksum: SEAL,
      synthClass: 'SIMULATED',
      frameStart: 0,
      frameEnd: 2,
      frameCount: 3,
      claims: makeClaims(3, SEAL),
    };

    const resultA = runSimE2E(manifest, { dumpBuffers: buffers });
    const resultB = runSimE2E(manifest, { dumpBuffers: buffers });

    const comparison = compareSimRuns(resultA, resultB);
    expect(comparison.verdict).toBe('REPRODUCED');
    expect(comparison.matchingFrames).toBe(3);
  });

  it('different seals yield UNRELATED', () => {
    const buffers = makeDeterministicFrameBuffers(2);
    const manifestA = {
      sourceChecksum: 'SEAL_A',
      synthClass: 'SIMULATED',
      claims: makeClaims(2, 'SEAL_A'),
    };
    const manifestB = {
      sourceChecksum: 'SEAL_B',
      synthClass: 'SIMULATED',
      claims: makeClaims(2, 'SEAL_B'),
    };

    const resultA = runSimE2E(manifestA, { dumpBuffers: buffers });
    const resultB = runSimE2E(manifestB, { dumpBuffers: buffers });

    const comparison = compareSimRuns(resultA, resultB);
    expect(comparison.verdict).toBe('UNRELATED');
  });

  it('divergent frames localize to the first bad frame', () => {
    const buffersA = makeDeterministicFrameBuffers(4);
    const buffersB = makeDeterministicFrameBuffers(4);
    // Corrupt frame 2 in run B
    buffersB[2] = Buffer.from('corrupted-frame-2');

    const manifest = {
      sourceChecksum: SEAL,
      synthClass: 'SIMULATED',
      frameStart: 0,
      frameEnd: 3,
      frameCount: 4,
      claims: makeClaims(4, SEAL),
    };

    const resultA = runSimE2E(manifest, { dumpBuffers: buffersA });
    const resultB = runSimE2E(manifest, { dumpBuffers: buffersB });

    const comparison = compareSimRuns(resultA, resultB);
    expect(comparison.verdict).not.toBe('REPRODUCED');
    expect(comparison.firstDivergentFrame).toBe(2);
    expect(comparison.matchingFrames).toBe(2); // frames 0 and 1 match
  });
});

describe('determinism replay', () => {
  it('100-iteration replay of chain building is identical', () => {
    const buffers = makeDeterministicFrameBuffers(5);
    const digests = [];
    for (let i = 0; i < 100; i++) {
      const chain = buildSimChain(SEAL, buffers);
      digests.push(chain.map((e) => e.digest).join(','));
    }
    expect(new Set(digests).size).toBe(1);
  });
});
