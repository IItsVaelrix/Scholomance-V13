/**
 * Receipt minting and comparison tests.
 * The consumer never hashes. The JS side does all hashing.
 */
import { describe, it, expect } from 'vitest';
import { mintReceipt, compareReceipts, hashPixelBuffer, ReceiptError } from '../../../../codex/core/blender-bridge/receipt.js';

const CLAIM = {
  engine: 'blender',
  packetId: 'WP-CLAYMORE-HOLY',
  sourceChecksum: '6DB23A1A',
  colorPolicy: 'EXACT',
  synthClass: 'RASTER',
  pixelDumpPath: '/tmp/test.f32',
  observed: {
    blenderVersion: '5.2.0',
    buildHash: 'fbe6228777e7',
    engine: 'CYCLES',
    device: 'CPU',
    seed: 7,
    samples: 64,
    adaptive: false,
    denoise: false,
    viewTransform: 'Standard',
    look: 'None',
    resolutionX: 160,
    resolutionY: 160,
    threads: 8,
  },
};

describe('hashPixelBuffer', () => {
  it('produces a 64-char uppercase hex hash', () => {
    const buf = Buffer.from(new Float32Array([1.0, 0.5, 0.25, 1.0]).buffer);
    const h = hashPixelBuffer(buf);
    expect(h).toMatch(/^[0-9A-F]{64}$/);
  });

  it('is deterministic', () => {
    const buf = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    expect(hashPixelBuffer(buf)).toBe(hashPixelBuffer(buf));
  });

  it('differs for different pixel data', () => {
    const a = hashPixelBuffer(Buffer.from(new Float32Array([1.0]).buffer));
    const b = hashPixelBuffer(Buffer.from(new Float32Array([2.0]).buffer));
    expect(a).not.toBe(b);
  });
});

describe('mintReceipt', () => {
  it('produces a frozen receipt with a 64-char SCD64', () => {
    const r = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    expect(Object.isFrozen(r)).toBe(true);
    expect(r.scd64).toMatch(/^[0-9A-F]{64}$/);
    expect(r.receiptVersion).toBe(1);
    expect(r.pixelDumpHash).toBe('AABBCCDD'.repeat(8));
  });

  it('embeds the source checksum as a consumed seal', () => {
    const r = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    expect(r.inputs.consumedSeals).toBe('6DB23A1A');
  });

  it('is deterministic for the same claim and hash', () => {
    const a = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    const b = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    expect(a.scd64).toBe(b.scd64);
  });

  it('rejects a null claim', () => {
    expect(() => mintReceipt(null, 'AABB')).toThrow(ReceiptError);
  });

  it('rejects an empty pixel hash', () => {
    expect(() => mintReceipt(CLAIM, '')).toThrow(ReceiptError);
  });
});

describe('compareReceipts', () => {
  it('REPRODUCED for identical receipts', () => {
    const a = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    const b = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    const r = compareReceipts(a, b);
    expect(r.verdict).toBe('REPRODUCED');
    expect(r.pixelMatch).toBe(true);
  });

  it('NONDETERMINISTIC when only pixels differ', () => {
    const a = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    const b = mintReceipt(CLAIM, 'DEADBEEF'.repeat(8));
    const r = compareReceipts(a, b);
    expect(r.verdict).toBe('NONDETERMINISTIC');
    expect(r.pixelMatch).toBe(false);
  });

  it('RESYNTHESIZED when a cause and pixels differ', () => {
    const a = mintReceipt(CLAIM, 'AABBCCDD'.repeat(8));
    const claim2 = { ...CLAIM, observed: { ...CLAIM.observed, seed: 99 } };
    const b = mintReceipt(claim2, 'DEADBEEF'.repeat(8));
    const r = compareReceipts(a, b);
    expect(r.verdict).toBe('RESYNTHESIZED');
  });

  it('rejects receipts without scd64', () => {
    expect(() => compareReceipts({}, {})).toThrow(ReceiptError);
  });
});
