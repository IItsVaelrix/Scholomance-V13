/**
 * RENDER domain over the preserved eight-slot SCD64 contract.
 *
 * Seven slots are CAUSES, the eighth (PIXEL_RECEIPT) is the EFFECT.
 * The verdict lattice exploits this asymmetry to diagnose divergence.
 */
import { describe, it, expect } from 'vitest';
import {
  renderSCD64,
  parseRenderSCD64,
  classifyDivergence,
  buildRenderCanonicals,
  RENDER_SLOT_NAMES,
  RENDER_SLOT_ALIASES,
  SYNTH_CLASSES,
  VERDICTS,
  RENDER_VERSION,
} from '../../../../codex/core/blender-bridge/render-scd64.js';

const BASE_INPUTS = {
  synthClass: 'RASTER',
  resolutionX: 160,
  resolutionY: 160,
  pixelAspect: 1,
  frameIndex: 1,
  cameraMatrix: 'identity',
  blenderVersion: '5.2.0',
  buildHash: 'fbe6228777e7',
  engine: 'CYCLES',
  device: 'CPU',
  seed: 7,
  samples: 64,
  adaptive: false,
  adaptiveThreshold: 0.01,
  bounces: 12,
  clamping: 10,
  shutterOpen: -0.5,
  shutterClose: 0.5,
  timeSamples: 1,
  denoiser: 'NONE',
  denoiseInputPasses: '',
  denoiseEnabled: false,
  viewTransform: 'Standard',
  look: 'None',
  displayDevice: 'sRGB',
  format: 'OPEN_EXR',
  colorDepth: '32',
  sceneGraph: 'holy_fire_claymore',
  nodeTreeHashes: 'abc123',
  declaredSeeds: 'seed7',
  consumedSeals: '6DB23A1A',
  pixelDumpHash: 'AABBCCDD11223344',
};

describe('renderSCD64', () => {
  it('produces a 64-char uppercase hex string', () => {
    const s = renderSCD64(BASE_INPUTS);
    expect(s).toMatch(/^[0-9A-F]{64}$/);
  });

  it('embeds the version byte in slot 0', () => {
    const s = renderSCD64(BASE_INPUTS);
    const slot0 = s.slice(0, 8);
    expect(slot0.slice(0, 2)).toBe(RENDER_VERSION.toString(16).padStart(2, '0').toUpperCase());
  });

  it('is deterministic — same inputs yield identical checksums', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64(BASE_INPUTS);
    expect(a).toBe(b);
  });

  it('changes when a cause changes', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({ ...BASE_INPUTS, seed: 8 });
    expect(a).not.toBe(b);
  });

  it('changes when the pixel receipt changes', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({ ...BASE_INPUTS, pixelDumpHash: 'DEADBEEF00000000' });
    expect(a).not.toBe(b);
  });
});

describe('buildRenderCanonicals', () => {
  it('produces exactly 8 disjoint canonical strings', () => {
    const cs = buildRenderCanonicals(BASE_INPUTS);
    expect(cs).toHaveLength(8);
    const names = cs.map((c) => c.slot);
    expect(names).toEqual([...RENDER_SLOT_NAMES]);
    // All canonicals are distinct
    const set = new Set(cs.map((c) => c.canonical));
    expect(set.size).toBe(8);
  });
});

describe('parseRenderSCD64', () => {
  it('splits into 8 slots of 8 hex chars', () => {
    const s = renderSCD64(BASE_INPUTS);
    const slots = parseRenderSCD64(s);
    expect(slots).toHaveLength(8);
    slots.forEach((sl) => expect(sl).toMatch(/^[0-9A-F]{8}$/));
  });

  it('rejects malformed input', () => {
    expect(() => parseRenderSCD64('short')).toThrow();
    expect(() => parseRenderSCD64('a'.repeat(64))).toThrow();
  });
});

describe('classifyDivergence — the verdict lattice', () => {
  it('REPRODUCED when all 8 slots match', () => {
    const s = renderSCD64(BASE_INPUTS);
    const r = classifyDivergence(s, s);
    expect(r.verdict).toBe('REPRODUCED');
    expect(r.matchingBlocks).toBe(8);
    expect(r.differentBlocks).toHaveLength(0);
    expect(r.relationship).toBe('IDENTICAL');
  });

  it('NONDETERMINISTIC when only PIXEL_RECEIPT differs', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({ ...BASE_INPUTS, pixelDumpHash: 'DEADBEEF00000000' });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('NONDETERMINISTIC');
    expect(r.differentBlocks).toEqual(['PIXEL_RECEIPT']);
  });

  it('RESYNTHESIZED when a cause + PIXEL_RECEIPT differ', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({ ...BASE_INPUTS, seed: 99, pixelDumpHash: 'DEADBEEF00000000' });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('RESYNTHESIZED');
    expect(r.differentBlocks).toContain('LIGHT_BUDGET');
    expect(r.differentBlocks).toContain('PIXEL_RECEIPT');
  });

  it('INERT when a cause differs but PIXEL_RECEIPT does not', () => {
    // Same pixel hash, different declared seed — the seed is unwired
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({ ...BASE_INPUTS, seed: 99 });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('INERT');
    expect(r.differentBlocks).toContain('LIGHT_BUDGET');
    expect(r.differentBlocks).not.toContain('PIXEL_RECEIPT');
  });

  it('UNRELATED when too many slots differ', () => {
    const a = renderSCD64(BASE_INPUTS);
    const b = renderSCD64({
      ...BASE_INPUTS,
      synthClass: 'VOLUME',
      resolutionX: 999,
      blenderVersion: '9.9.9',
      seed: 999,
      denoiser: 'OPTIX',
      viewTransform: 'AgX',
      sceneGraph: 'completely_different',
      pixelDumpHash: 'DEADBEEF00000000',
    });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('UNRELATED');
    expect(r.matchingBlocks).toBeLessThan(4);
  });
});

describe('RENDER_SLOT_ALIASES', () => {
  it('maps all 8 physical slot names', () => {
    expect(Object.keys(RENDER_SLOT_ALIASES)).toHaveLength(8);
    for (const slot of RENDER_SLOT_NAMES) {
      expect(Object.values(RENDER_SLOT_ALIASES)).toContain(slot);
    }
  });
});

describe('SYNTH_CLASSES', () => {
  it('contains the four verification-rule classes', () => {
    expect(SYNTH_CLASSES).toEqual(['RASTER', 'SYNTHESIZED', 'VOLUME', 'SIMULATED']);
  });
});

describe('VERDICTS', () => {
  it('contains the five lattice verdicts', () => {
    expect(VERDICTS).toEqual(['REPRODUCED', 'NONDETERMINISTIC', 'RESYNTHESIZED', 'INERT', 'UNRELATED']);
  });
});

describe('COLOR_LAW carries the colour contract, not the file format', () => {
  const base = {
    viewTransform: 'Standard', look: 'None', displayDevice: 'sRGB',
    colorPolicy: 'EXACT', transfer: 'sRGB-IEC-61966-2-1',
  };

  function colorLawOf(inputs) {
    return buildRenderCanonicals(inputs).find((c) => c.slot === 'COLOR_LAW').canonical;
  }
  function engineLawOf(inputs) {
    return buildRenderCanonicals(inputs).find((c) => c.slot === 'ENGINE_LAW').canonical;
  }

  it('is unchanged by the output file format', () => {
    // The whole point. An EXR renderer and an RGBA8 canvas can never share a
    // format, so encoding it here made COLOR_LAW: SHOULD_AGREE unsatisfiable.
    const exr = colorLawOf({ ...base, format: 'OPEN_EXR', colorDepth: '32' });
    const png = colorLawOf({ ...base, format: 'PNG', colorDepth: '8' });
    expect(exr).toBe(png);
  });

  it('changes when the declared policy changes', () => {
    expect(colorLawOf({ ...base, colorPolicy: 'EXACT' }))
      .not.toBe(colorLawOf({ ...base, colorPolicy: 'SYNTHESIZED' }));
  });

  it('changes when the transfer function changes', () => {
    expect(colorLawOf({ ...base, transfer: 'sRGB-IEC-61966-2-1' }))
      .not.toBe(colorLawOf({ ...base, transfer: 'none' }));
  });

  it('changes when the view transform changes', () => {
    expect(colorLawOf({ ...base, viewTransform: 'Standard' }))
      .not.toBe(colorLawOf({ ...base, viewTransform: 'AgX' }));
  });

  it('moves the file format into ENGINE_LAW, where divergence is expected', () => {
    const exr = engineLawOf({ ...base, format: 'OPEN_EXR', colorDepth: '32' });
    const png = engineLawOf({ ...base, format: 'PNG', colorDepth: '8' });
    expect(exr).not.toBe(png);
    expect(exr).toContain('OPEN_EXR');
  });

  it('bumps RENDER_VERSION, because every receipt just changed', () => {
    // Without a version bump, receipts minted before and after this change look
    // comparable and are not.
    expect(RENDER_VERSION).toBe(0x02);
  });
});
