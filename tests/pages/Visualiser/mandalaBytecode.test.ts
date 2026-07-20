import { describe, it, expect } from 'vitest';
import {
  compileMandalaProgram,
  evalMandala,
  omega,
  MANDALA_SCHEMA,
} from '../../../src/pages/Visualiser/mandala/mandalaBytecode';

describe('mandalaBytecode', () => {
  it('compiles a deterministic program from seed+bpm', () => {
    const a = compileMandalaProgram(0x7f3a9c1d, 90);
    const b = compileMandalaProgram(0x7f3a9c1d, 90);
    expect(a.schemaVersion).toBe(MANDALA_SCHEMA);
    expect(a).toEqual(b);
    expect(a.ops.some((o) => o.op === 'RING')).toBe(true);
    expect(a.ops.some((o) => o.op === 'POLY')).toBe(true);
    expect(a.ops.some((o) => o.op === 'CORE')).toBe(true);
  });

  it('eval is deterministic for the same t', () => {
    const program = compileMandalaProgram(42, 120);
    const p0 = evalMandala(program, 1.5);
    const p1 = evalMandala(program, 1.5);
    expect(p0).toEqual(p1);
  });

  it('BPM scales angular rate via omega', () => {
    expect(omega(60)).toBeCloseTo(Math.PI * 2, 10);
    expect(omega(120)).toBeCloseTo(Math.PI * 4, 10);
    const program = compileMandalaProgram(1, 60);
    const ring = program.ops.find((o) => o.op === 'RING');
    expect(ring && ring.op === 'RING').toBe(true);
    if (!ring || ring.op !== 'RING') return;
    // Δθ ∝ ω ∝ bpm for fixed rate and Δt
    const dSlow = omega(60) * 1 * ring.rate;
    const dFast = omega(120) * 1 * ring.rate;
    expect(dFast).toBeCloseTo(dSlow * 2, 10);
  });

  it('different seeds produce different programs', () => {
    const a = compileMandalaProgram(1, 90);
    const b = compileMandalaProgram(2, 90);
    expect(a.ops).not.toEqual(b.ops);
  });
});
