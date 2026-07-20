import { describe, it, expect } from 'vitest';
import {
  compileKaraokeProgram,
  evalKaraoke,
  omega,
  KARAOKE_SCHEMA,
} from '../../../src/pages/Visualiser/karaoke/karaokeBytecode';

describe('karaokeBytecode', () => {
  it('compiles a deterministic program from seed+bpm', () => {
    const a = compileKaraokeProgram(0x7f3a9c1d, 90);
    const b = compileKaraokeProgram(0x7f3a9c1d, 90);
    expect(a.schemaVersion).toBe(KARAOKE_SCHEMA);
    expect(a).toEqual(b);
    expect(a.ops.some((o) => o.op === 'LINE_PULSE')).toBe(true);
    expect(a.ops.some((o) => o.op === 'WORD_PULSE')).toBe(true);
    expect(a.ops.some((o) => o.op === 'WORD_GLOW')).toBe(true);
  });

  it('eval is deterministic for the same t', () => {
    const program = compileKaraokeProgram(42, 120);
    expect(evalKaraoke(program, 1.5)).toEqual(evalKaraoke(program, 1.5));
  });

  it('BPM scales angular rate via omega', () => {
    expect(omega(60)).toBeCloseTo(Math.PI * 2, 10);
    expect(omega(120)).toBeCloseTo(Math.PI * 4, 10);
    const program = compileKaraokeProgram(1, 60);
    const line = program.ops.find((o) => o.op === 'LINE_PULSE');
    expect(line && line.op === 'LINE_PULSE').toBe(true);
    if (!line || line.op !== 'LINE_PULSE') return;
    const dSlow = omega(60) * 1 * line.rate;
    const dFast = omega(120) * 1 * line.rate;
    expect(dFast).toBeCloseTo(dSlow * 2, 10);
  });

  it('different seeds produce different programs', () => {
    const a = compileKaraokeProgram(1, 90);
    const b = compileKaraokeProgram(2, 90);
    expect(a.ops).not.toEqual(b.ops);
  });

  it('wordGlow stays in [0, 1]', () => {
    const program = compileKaraokeProgram(99, 95);
    for (let t = 0; t < 8; t += 0.25) {
      const pose = evalKaraoke(program, t);
      expect(pose.wordGlow).toBeGreaterThanOrEqual(0);
      expect(pose.wordGlow).toBeLessThanOrEqual(1);
    }
  });
});
