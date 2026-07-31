/**
 * Cross-engine comparison tests — Remotion receipt comparison.
 *
 * Remotion is the second consumer whose receipt makes Blender's receipt
 * falsifiable. The comparison is over RENDER SCD64 slots: causes should
 * agree (same packet), effects (PIXEL_RECEIPT) will differ (different engines).
 *
 * CAUSES_AGREE + PIXELS_DIVERGE is the HEALTHY state.
 */
import { describe, it, expect } from 'vitest';
import {
  compareCrossEngine, buildRemotionClaim, expectedCrossEngineAgreement,
  CROSS_ENGINE_VERDICTS, CrossEngineError,
} from '../../../../codex/core/blender-bridge/cross-engine.js';
import { renderSCD64 } from '../../../../codex/core/blender-bridge/render-scd64.js';
import { mintReceipt } from '../../../../codex/core/blender-bridge/receipt.js';
import { toPythonWire } from '../../../../codex/core/blender-bridge/wire.js';
import { readFileSync } from 'node:fs';

const packet = JSON.parse(readFileSync('output/holy_fire_claymore.pbrain', 'utf8'));

function makeReceipt(overrides = {}) {
  const inputs = {
    synthClass: 'RASTER',
    resolutionX: 160,
    resolutionY: 160,
    pixelAspect: 1,
    frameIndex: 0,
    cameraMatrix: '',
    blenderVersion: '5.2.0',
    buildHash: 'fbe6228777e7',
    engine: 'CYCLES',
    device: 'CPU',
    seed: 7,
    samples: 64,
    adaptive: false,
    adaptiveThreshold: 0,
    bounces: 0,
    clamping: 0,
    shutterOpen: 0,
    shutterClose: 0,
    timeSamples: 0,
    denoiser: 'NONE',
    denoiseInputPasses: '',
    denoiseEnabled: false,
    viewTransform: 'Standard',
    look: 'None',
    displayDevice: 'sRGB',
    format: 'OPEN_EXR',
    colorDepth: '32',
    sceneGraph: 'test-packet',
    nodeTreeHashes: '',
    declaredSeeds: '',
    consumedSeals: '6DB23A1A',
    pixelDumpHash: 'AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555FFFF6666AAAA1111BBBB2222',
    ...overrides,
  };
  return { scd64: renderSCD64(inputs), pixelDumpHash: inputs.pixelDumpHash };
}

describe('compareCrossEngine', () => {
  it('reports CAUSES_AGREE when causes match but pixels differ (healthy)', () => {
    const blender = makeReceipt();
    const remotion = makeReceipt({
      blenderVersion: 'remotion-4.0',
      buildHash: 'remotion',
      engine: 'CANVAS_2D',
      pixelDumpHash: 'FFFF1111EEEE2222DDDD3333CCCC4444BBBB5555AAAA6666FFFF1111EEEE2222',
    });
    const result = compareCrossEngine(blender, remotion);
    // ENGINE_LAW will differ (different engine), so causes won't all agree
    expect(result.divergentCauses).toContain('ENGINE_LAW');
    expect(result.pixelsAgree).toBe(false);
  });

  it('reports PIXELS_AGREE when everything matches (extraordinary)', () => {
    const a = makeReceipt();
    const b = makeReceipt();
    const result = compareCrossEngine(a, b);
    expect(result.verdict).toBe('PIXELS_AGREE');
    expect(result.pixelsAgree).toBe(true);
    expect(result.matchingCauses).toBe(7);
  });

  it('reports CAUSES_DIVERGE when causes differ', () => {
    const a = makeReceipt();
    const b = makeReceipt({
      blenderVersion: 'different',
      buildHash: 'different',
      engine: 'DIFFERENT',
      seed: 99,
      samples: 128,
      pixelDumpHash: 'FFFF1111EEEE2222DDDD3333CCCC4444BBBB5555AAAA6666FFFF1111EEEE2222',
    });
    const result = compareCrossEngine(a, b);
    expect(result.verdict).toBe('CAUSES_DIVERGE');
    // healthy was `false` here while it meant "all seven causes match", which
    // no correct pair of engines can satisfy: ENGINE_LAW is declared
    // EXPECTED_DIVERGE. This case diverges only ENGINE_LAW, LIGHT_BUDGET and
    // the pixels -- all permitted -- so under the corrected definition it IS
    // the healthy cross-engine state. verdict stays CAUSES_DIVERGE because that
    // still reports the literal fact that not all seven causes matched.
    expect(result.healthy).toBe(true);
    expect(result.requiredAgreementHeld).toBe(true);
  });

  it('identifies the healthy state: causes agree, pixels diverge', () => {
    // Same causes except ENGINE_LAW (expected to differ cross-engine)
    // and same PIXEL_RECEIPT would be extraordinary
    const a = makeReceipt();
    const b = makeReceipt({
      // Only change engine identity — all other causes identical
      blenderVersion: 'remotion-4.0',
      buildHash: 'remotion',
      engine: 'CANVAS_2D',
      // Different pixels (expected)
      pixelDumpHash: '1111222233334444555566667777888899990000AAAABBBBCCCCDDDDEEEEFFFF',
    });
    const result = compareCrossEngine(a, b);
    // ENGINE_LAW differs, so matchingCauses = 6, not 7
    expect(result.matchingCauses).toBe(6);
    expect(result.divergentCauses).toEqual(['ENGINE_LAW']);
    expect(result.pixelsAgree).toBe(false);
  });

  it('provides same-engine divergence detail', () => {
    const a = makeReceipt();
    const b = makeReceipt({
      blenderVersion: 'remotion-4.0',
      buildHash: 'remotion',
      engine: 'CANVAS_2D',
      pixelDumpHash: '1111222233334444555566667777877799990000AAAABBBBCCCCDDDDEEEEFFFF',
    });
    const result = compareCrossEngine(a, b);
    expect(result.sameEngineVerdict).toBeDefined();
    expect(result.sameEngineRelationship).toBeDefined();
  });

  it('freezes the result', () => {
    const a = makeReceipt();
    const b = makeReceipt();
    const result = compareCrossEngine(a, b);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.causeSlots)).toBe(true);
  });

  it('refuses receipts without scd64', () => {
    expect(() => compareCrossEngine({}, makeReceipt())).toThrow(CrossEngineError);
    expect(() => compareCrossEngine(makeReceipt(), {})).toThrow(CrossEngineError);
  });
});

describe('buildRemotionClaim', () => {
  it('builds a claim shaped like the Blender addon output', () => {
    const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
    const claim = buildRemotionClaim(wire);
    expect(claim.engine).toBe('remotion');
    expect(claim.packetId).toBe(wire.packetId);
    expect(claim.sourceChecksum).toBe('6DB23A1A');
    expect(claim.observed.engine).toBe('CANVAS_2D');
    expect(claim.observed.resolutionX).toBe(64);
    expect(claim.observed.resolutionY).toBe(112);
  });

  it('accepts resolution overrides', () => {
    const wire = toPythonWire(packet, { colorPolicy: 'EXACT' });
    const claim = buildRemotionClaim(wire, { resolutionX: 320, resolutionY: 240 });
    expect(claim.observed.resolutionX).toBe(320);
    expect(claim.observed.resolutionY).toBe(240);
  });
});

describe('expectedCrossEngineAgreement', () => {
  it('marks ENGINE_LAW and PIXEL_RECEIPT as expected to diverge', () => {
    const expected = expectedCrossEngineAgreement();
    expect(expected.ENGINE_LAW).toBe('EXPECTED_DIVERGE');
    expect(expected.PIXEL_RECEIPT).toBe('EXPECTED_DIVERGE');
  });

  it('marks SYNTH_CLASS, FRAME_SYS, COLOR_LAW, SCENE_GRAPH as should agree', () => {
    const expected = expectedCrossEngineAgreement();
    expect(expected.SYNTH_CLASS).toBe('SHOULD_AGREE');
    expect(expected.FRAME_SYS).toBe('SHOULD_AGREE');
    expect(expected.COLOR_LAW).toBe('SHOULD_AGREE');
    expect(expected.SCENE_GRAPH).toBe('SHOULD_AGREE');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(expectedCrossEngineAgreement())).toBe(true);
  });
});

describe('determinism replay', () => {
  it('100-iteration replay produces identical cross-engine results', () => {
    const a = makeReceipt();
    const b = makeReceipt({
      blenderVersion: 'remotion-4.0',
      buildHash: 'remotion',
      engine: 'CANVAS_2D',
      pixelDumpHash: '1111222233334444555566667777888899990000AAAABBBBCCCCDDDDEEEEFFFF',
    });
    const results = [];
    for (let i = 0; i < 100; i++) {
      const r = compareCrossEngine(a, b);
      results.push(JSON.stringify({ v: r.verdict, m: r.matchingCauses, d: r.divergentCauses }));
    }
    expect(new Set(results).size).toBe(1);
  });
});

describe('the alarming outcome is not filed under the benign one', () => {
  it('distinguishes causes-diverge-but-pixels-agree from pixels-agree', () => {
    // Two engines that consumed DIFFERENT inputs and produced IDENTICAL pixels
    // is the most alarming result available. It was reported as PIXELS_AGREE,
    // the same label as the benign case where causes also agreed.
    const a = { scd64: 'A'.repeat(64) };
    const b = { scd64: `${'B'.repeat(56)}${'A'.repeat(8)}` };
    const result = compareCrossEngine(a, b);
    expect(result.pixelsAgree).toBe(true);
    expect(result.verdict).toBe('CAUSES_DIVERGE_PIXELS_AGREE');
    expect(result.healthy).toBe(false);
  });

  it('still reports PIXELS_AGREE when the causes agree too', () => {
    const same = { scd64: 'C'.repeat(64) };
    expect(compareCrossEngine(same, { ...same }).verdict).toBe('PIXELS_AGREE');
  });

  it('lists the new verdict', () => {
    expect(CROSS_ENGINE_VERDICTS).toContain('CAUSES_DIVERGE_PIXELS_AGREE');
  });
});

describe('the Remotion claim carries the colour contract', () => {
  it('declares the policy and transfer so COLOR_LAW can agree', () => {
    const wire = {
      packetId: 'P', sourceChecksum: 'S', colorPolicy: 'EXACT',
      canvas: { width: 4, height: 4 },
      colorLaw: { transfer: 'sRGB-IEC-61966-2-1' },
    };
    const claim = buildRemotionClaim(wire);
    expect(claim.colorPolicy).toBe('EXACT');
    expect(claim.observed.transfer).toBe('sRGB-IEC-61966-2-1');
  });
});

describe('healthy respects the declared agreement table', () => {
  it('is not defined as all seven causes matching', () => {
    // ENGINE_LAW is declared EXPECTED_DIVERGE: a Blender build hash and a JS
    // canvas can never share it. Defining healthy as all-7 made it unreachable
    // for any correct pair of engines -- a check that cannot PASS, which is the
    // mirror of the ones this bridge keeps finding.
    const agreement = expectedCrossEngineAgreement();
    expect(agreement.ENGINE_LAW).toBe('EXPECTED_DIVERGE');
  });

  it('is healthy when every SHOULD_AGREE slot agrees and pixels diverge', () => {
    // Slots 0..6 are causes; index 2 is ENGINE_LAW (EXPECTED_DIVERGE) and 3 is
    // LIGHT_BUDGET (MAY_DIVERGE). Diverge exactly those, plus the pixels.
    const a = 'AAAAAAAA'.repeat(8);
    const b = [
      'AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC',
      'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'DDDDDDDD',
    ].join('');
    const r = compareCrossEngine({ scd64: a }, { scd64: b });
    expect(r.requiredAgreementHeld).toBe(true);
    expect(r.pixelsAgree).toBe(false);
    expect(r.healthy).toBe(true);
  });

  it('is NOT healthy when a SHOULD_AGREE slot diverges', () => {
    // Slot 5 is COLOR_LAW, declared SHOULD_AGREE. This is exactly the state the
    // bridge was in before the slot carried the contract instead of the format.
    const a = 'AAAAAAAA'.repeat(8);
    const b = [
      'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA',
      'AAAAAAAA', 'BBBBBBBB', 'AAAAAAAA', 'DDDDDDDD',
    ].join('');
    const r = compareCrossEngine({ scd64: a }, { scd64: b });
    expect(r.requiredAgreementHeld).toBe(false);
    expect(r.healthy).toBe(false);
    expect(r.divergentRequired).toContain('COLOR_LAW');
  });
});
