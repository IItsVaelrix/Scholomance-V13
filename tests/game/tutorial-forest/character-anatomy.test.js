import { describe, it, expect } from 'vitest';
import { compileCharacterModel } from '../../../src/game/tutorial-forest/scdl/scdlCharacterCompiler.js';
import { verifyBankPacket } from '../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.packet.js';

describe('Adult Lotus Wanderer production asset', () => {
  it('uses adult proportions and a named joint skeleton', () => {
    const pkg = compileCharacterModel();
    expect(pkg.canvas).toEqual({ width: 64, height: 112 });
    expect(pkg.anatomy.headsTall).toBeGreaterThanOrEqual(7);
    expect(pkg.anatomy.headsTall).toBeLessThanOrEqual(8);
    for (const name of ['head.center', 'torso.shoulderL', 'arms.elbowL', 'arms.wristR', 'torso.hipR', 'legs.kneeL', 'legs.ankleR']) expect(pkg.joints[name]).toBeDefined();
  });
  it('renders every pose through SCDL V2 and the Wand bridge with integer bounded pixels', () => {
    const pkg = compileCharacterModel();
    expect(pkg.handoff.contract).toBe('PB-WAND-CHARACTER-v1');
    expect(pkg.handoff.source).toContain('pixelbrain.wand-stroke');
    expect(pkg.handoff.programId).toBeTruthy();
    for (const frame of Object.values(pkg.frames)) {
      expect(frame.length).toBeGreaterThan(800);
      expect(new Set(frame.map(c => c.color)).size).toBeLessThanOrEqual(32);
      for (const c of frame) { expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true); expect(c.x >= 0 && c.x < 64 && c.y >= 0 && c.y < 112).toBe(true); }
    }
    expect(pkg.frames.back_0).not.toEqual(pkg.frames.idle_0);
    expect(pkg.frames.walk_0).not.toEqual(pkg.frames.walk_2);
  });
  it('carries independently verifiable SCD128 form and realization banks', () => {
    const record = compileCharacterModel().scd128Record;
    expect(record.scd128Wire).toMatch(/^81[0-9A-F]{62}91[0-9A-F]{62}$/);
    expect(verifyBankPacket(record.form).ok).toBe(true);
    expect(verifyBankPacket(record.realization).ok).toBe(true);
  });
}, 30000);
