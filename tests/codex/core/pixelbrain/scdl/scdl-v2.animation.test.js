import { describe, it, expect } from 'vitest';
import {
  EASING_FUNCTIONS,
  EASING_CURVES,
  EASING_VERSION,
  applyEasing,
  lerpResolvedValue,
  buildTimeBindings,
  sampleTrackValue,
  sampleTimeline,
  buildAnimationManifest,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.animation.js';
import { makeRational, rationalToNumber } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';
import { createAngle } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('SCDL v2 Step 4 — Mathematical Animation Engine', () => {
  describe('Deterministic Versioned Easing Curves', () => {
    it('declares EASING_VERSION as 1.0.0 and lists all canonical curves', () => {
      expect(EASING_VERSION).toBe('1.0.0');
      expect(EASING_CURVES).toContain('LINEAR');
      expect(EASING_CURVES).toContain('SINE_IN_OUT');
      expect(EASING_CURVES).toContain('QUAD_IN_OUT');
      expect(EASING_CURVES).toContain('CUBIC_IN_OUT');
      expect(EASING_CURVES).toContain('SMOOTHSTEP');
      expect(EASING_CURVES).toContain('STEP');
    });

    it('evaluates curves with mathematical precision at t=0, t=0.5, and t=1', () => {
      const r0 = makeRational(0);
      const rHalf = makeRational(1, 2);
      const r1 = makeRational(1);

      // LINEAR
      expect(rationalToNumber(applyEasing('LINEAR', r0))).toBe(0);
      expect(rationalToNumber(applyEasing('LINEAR', rHalf))).toBe(0.5);
      expect(rationalToNumber(applyEasing('LINEAR', r1))).toBe(1);

      // STEP
      expect(rationalToNumber(applyEasing('STEP', r0))).toBe(0);
      expect(rationalToNumber(applyEasing('STEP', rHalf))).toBe(0);
      expect(rationalToNumber(applyEasing('STEP', r1))).toBe(1);

      // SINE_IN_OUT
      expect(rationalToNumber(applyEasing('SINE_IN_OUT', r0))).toBe(0);
      expect(Math.abs(rationalToNumber(applyEasing('SINE_IN_OUT', rHalf)) - 0.5)).toBeLessThan(1e-6);
      expect(rationalToNumber(applyEasing('SINE_IN_OUT', r1))).toBe(1);

      // QUAD_IN & QUAD_OUT
      expect(rationalToNumber(applyEasing('QUAD_IN', rHalf))).toBe(0.25);
      expect(rationalToNumber(applyEasing('QUAD_OUT', rHalf))).toBe(0.75);

      // SMOOTHSTEP: 3*(0.5)^2 - 2*(0.5)^3 = 3*0.25 - 2*0.125 = 0.75 - 0.25 = 0.5
      expect(rationalToNumber(applyEasing('SMOOTHSTEP', rHalf))).toBe(0.5);
    });

    it('clamps t strictly to [0, 1] and defaults unknown curves to LINEAR', () => {
      const rNeg = makeRational(-1);
      const rOver = makeRational(2);
      expect(rationalToNumber(applyEasing('LINEAR', rNeg))).toBe(0);
      expect(rationalToNumber(applyEasing('LINEAR', rOver))).toBe(1);
      expect(rationalToNumber(applyEasing('UNKNOWN_CURVE_XYZ', makeRational(3, 4)))).toBe(0.75);
    });
  });

  describe('Value Interpolation (lerpResolvedValue)', () => {
    it('interpolates numeric rational values in exact rational space', () => {
      const a = { type: 'PX', value: makeRational(10) };
      const b = { type: 'PX', value: makeRational(20) };
      const t = makeRational(1, 4);
      const result = lerpResolvedValue(a, b, t);
      expect(result.type).toBe('PX');
      expect(rationalToNumber(result.value)).toBe(12.5);
    });

    it('interpolates integer I32 values with round-half-up semantics', () => {
      const a = { type: 'I32', value: 0 };
      const b = { type: 'I32', value: 10 };
      expect(lerpResolvedValue(a, b, makeRational(3, 10)).value).toBe(3);
      expect(lerpResolvedValue(a, b, makeRational(1, 2)).value).toBe(5);
    });

    it('steps boolean values without blending', () => {
      const a = { type: 'BOOL', value: false };
      const b = { type: 'BOOL', value: true };
      expect(lerpResolvedValue(a, b, makeRational(49, 100)).value).toBe(false);
      expect(lerpResolvedValue(a, b, makeRational(50, 100)).value).toBe(true);
      expect(lerpResolvedValue(a, b, makeRational(90, 100)).value).toBe(true);
    });

    it('interpolates colors per channel in hex format', () => {
      const black = { type: 'COLOR', value: '#000000' };
      const white = { type: 'COLOR', value: '#ffffff' };
      const mid = lerpResolvedValue(black, white, makeRational(1, 2));
      expect(mid.type).toBe('COLOR');
      expect(mid.value).toBe('#808080');
    });

    it('interpolates angle turn values correctly', () => {
      const a0 = { type: 'ANGLE', value: createAngle(makeRational(0), 'TURNS') };
      const a1 = { type: 'ANGLE', value: createAngle(makeRational(1, 2), 'TURNS') };
      const mid = lerpResolvedValue(a0, a1, makeRational(1, 2));
      expect(mid.type).toBe('ANGLE');
      expect(rationalToNumber(mid.value.turns)).toBe(0.25);
    });
  });

  describe('Time Bindings and Formula Evaluation', () => {
    it('constructs correct $frame, $time, and $time_normalized rationals', () => {
      const bindings = buildTimeBindings(3, 13, 12);
      expect(bindings.$frame.value).toBe(3);
      expect(rationalToNumber(bindings.$time.value)).toBe(3 / 12);
      expect(rationalToNumber(bindings.$time_normalized.value)).toBe(3 / 12); // frameIndex 3 / span 12
    });

    it('evaluates timeline formulas with time symbols in compiled SCDL programs', () => {
      const testSource = `
SCDL 2
ASSET test_oscillation
CANVAS WIDTH 16 HEIGHT 16
LAYER orb ORDER 1 {
  PAINT (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 2)) FILL #55ccff RASTER CENTER
}
TIMELINE idle DURATION (MS 800) SAMPLE_RATE (FPS 12) LOOP REPEAT {
  TRACK TARGET orb PROPERTY TRANSFORM_Y {
    FORMULA (MUL (PX 4) (SIN (MUL TAU $time_normalized)))
  }
}
      `.trim();

      const result = compileSCDLV2(testSource);
      expect(result.ok).toBe(true);
      expect(result.framePackets.length).toBe(10);

      // Frame 0 ($t=0): TRANSFORM_Y is 0
      const cells0 = result.framePackets[0].geometry.coordinates;
      const minY0 = Math.min(...cells0.map((c) => c.y));

      // Frame 2 ($t=0.22): TRANSFORM_Y is positive -> orb moves downward (larger y)
      const cells2 = result.framePackets[2].geometry.coordinates;
      const minY2 = Math.min(...cells2.map((c) => c.y));
      expect(minY2).toBeGreaterThan(minY0);
    });
  });

  describe('Golden Fixture: kinetic-orb.scdl', () => {
    it('compiles kinetic-orb and produces multi-frame animation packets with loop metadata', () => {
      const fixturePath = resolve(__dirname, '../../../../../codex/core/pixelbrain/scdl/fixtures/v2/kinetic-orb.scdl');
      const source = readFileSync(fixturePath, 'utf8');

      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);

      // Verify bytecode lowering of animation
      expect(result.bytecode).toBeDefined();
      expect(result.bytecode.capabilities).toContain('ANIMATION.TIMELINE@1.0');
      expect(result.bytecode.text).toContain('BC.TIMELINE.NEW');

      // Verify animation manifest
      const manifest = result.package.animation;
      expect(manifest).not.toBeNull();
      expect(manifest.contract).toBe('SCDL-ANIMATION-v2');
      expect(manifest.timelines.length).toBe(1);
      expect(manifest.timelines[0].id).toBe('idle');
      expect(manifest.timelines[0].fps).toBe(12);
      expect(manifest.timelines[0].durationTicks).toBe(10); // 800ms at 12fps

      // Verify frameLoop
      const frameLoop = result.package.frameLoop;
      expect(frameLoop).not.toBeNull();
      expect(frameLoop.contract).toBe('SCDL-FRAMELOOP-v2');
      expect(frameLoop.frameCount).toBe(10);
      expect(frameLoop.fps).toBe(12);
      expect(frameLoop.loop).toBe('REPEAT');

      // Verify frame packets
      expect(result.framePackets).toBeDefined();
      expect(result.framePackets.length).toBe(10);

      // Check that orb layer moves vertically across frames
      const orbCellsFrame0 = result.framePackets[0].geometry.coordinates.filter((c) => c.color === '#55ccff');
      const orbCellsFrame2 = result.framePackets[2].geometry.coordinates.filter((c) => c.color === '#55ccff');
      expect(orbCellsFrame0.length).toBeGreaterThan(0);
      expect(orbCellsFrame2.length).toBeGreaterThan(0);

      const minY0 = Math.min(...orbCellsFrame0.map((c) => c.y));
      const minY2 = Math.min(...orbCellsFrame2.map((c) => c.y));
      // In frame 2 ($t ~ 0.22), TRANSFORM_Y is positive, so orb shifts downward
      expect(minY2).not.toBe(minY0);
    });
  });

  describe('Golden Fixture: swaying-forest-sentinel.scdl (Limb & Foliage Motion Proof)', () => {
    it('compiles swaying sentinel proving trunk base invariance while branches and canopy sway', () => {
      const fixturePath = resolve(__dirname, '../../../../../codex/core/pixelbrain/scdl/fixtures/v2/swaying-forest-sentinel.scdl');
      const source = readFileSync(fixturePath, 'utf8');

      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);

      const framePackets = result.framePackets;
      expect(framePackets.length).toBe(10);

      // 1. Trunk Base Invariance Proof:
      // The trunk base (y >= 26) is rooted in the ground, unaffected by higher-layer branch rotation,
      // and has no tracks modifying it, so its coordinates MUST be identical across every single frame.
      const trunkColor = '#5c3a21';
      const trunkBaseFrame0 = framePackets[0].geometry.coordinates
        .filter((c) => c.color === trunkColor && c.y >= 26)
        .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

      expect(trunkBaseFrame0.length).toBeGreaterThan(0);

      for (let f = 1; f < framePackets.length; f++) {
        const trunkBaseFrameF = framePackets[f].geometry.coordinates
          .filter((c) => c.color === trunkColor && c.y >= 26)
          .sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

        expect(trunkBaseFrameF).toEqual(trunkBaseFrame0);
      }

      // 2. Canopy Sway Proof:
      // The canopy has TRANSFORM_X formula oscillation and opacity variation.
      // Its horizontal centroid MUST change between frame 0 ($t=0) and frame 2/3 (peak sway).
      const canopyFrame0 = framePackets[0].geometry.coordinates.filter((c) => c.partId === 'canopy' || c.color.startsWith('#2d5a27'));
      const canopyFrame2 = framePackets[2].geometry.coordinates.filter((c) => c.partId === 'canopy' || c.color.startsWith('#2d5a27'));
      expect(canopyFrame0.length).toBeGreaterThan(0);
      expect(canopyFrame2.length).toBeGreaterThan(0);

      const avgX0 = canopyFrame0.reduce((acc, c) => acc + c.x, 0) / canopyFrame0.length;
      const avgX2 = canopyFrame2.reduce((acc, c) => acc + c.x, 0) / canopyFrame2.length;
      expect(avgX2).not.toBe(avgX0);

      // 3. Branch Rotation Proof:
      // Branch limbs (#3d2616) rotate over time.
      const branchFrame0 = framePackets[0].geometry.coordinates.filter((c) => c.color === '#3d2616');
      const branchFrame5 = framePackets[5].geometry.coordinates.filter((c) => c.color === '#3d2616');
      expect(branchFrame0).not.toEqual(branchFrame5);
    });
  });

  describe('Budget & Safety Caps (Fail Closed)', () => {
    it('enforces budget limits on excessive animation frames', () => {
      const excessiveSource = `
SCDL 2
ASSET excessive_anim
CANVAS WIDTH 16 HEIGHT 16
LAYER dot ORDER 1 {
  PAINT (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 2)) FILL #ffffff RASTER CENTER
}
TIMELINE long_run DURATION (MS 100000) SAMPLE_RATE (FPS 60) {
  TRACK TARGET dot PROPERTY OPACITY {
    KEYFRAME AT (MS 0) VALUE (RATIO 1 1)
  }
}
      `.trim();

      const result = compileSCDLV2(excessiveSource);
      expect(result.ok).toBe(false);
      const limitDiagnostic = result.diagnostics.find((d) => d.code === 'SCDL-ANIM-013' || d.code === 'SCDL-BUDGET-002');
      expect(limitDiagnostic).toBeDefined();
    });
  });
});
