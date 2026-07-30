/**
 * Energy bindings registry tests.
 * The bridge carries the energy vector; it does not interpret it.
 * Every shader mapping must be declared and graded.
 */
import { describe, it, expect } from 'vitest';
import {
  ENERGY_TYPES,
  ENERGY_BINDINGS,
  getBinding,
  unboundEnergyTypes,
  validateBinding,
} from '../../../../codex/core/blender-bridge/energy-bindings.js';

describe('ENERGY_TYPES', () => {
  it('contains exactly 8 types', () => {
    expect(ENERGY_TYPES).toHaveLength(8);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ENERGY_TYPES)).toBe(true);
  });

  it('includes all canonical types', () => {
    expect(ENERGY_TYPES).toContain('PHOTONIC');
    expect(ENERGY_TYPES).toContain('STRUCTURAL');
    expect(ENERGY_TYPES).toContain('RESONANT');
    expect(ENERGY_TYPES).toContain('RADIANT');
  });
});

describe('ENERGY_BINDINGS', () => {
  it('ships exactly one declared binding in slice 1', () => {
    expect(ENERGY_BINDINGS).toHaveLength(1);
  });

  it('the one binding is PHOTONIC → Emission Strength, graded FA', () => {
    const b = ENERGY_BINDINGS[0];
    expect(b.energyType).toBe('PHOTONIC');
    expect(b.shaderInput).toBe('Emission Strength');
    expect(b.grade).toBe('FA');
    expect(b.evidence).toBeTruthy();
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ENERGY_BINDINGS)).toBe(true);
    ENERGY_BINDINGS.forEach((b) => expect(Object.isFrozen(b)).toBe(true));
  });
});

describe('getBinding', () => {
  it('returns the binding for PHOTONIC', () => {
    const b = getBinding('PHOTONIC');
    expect(b).not.toBeNull();
    expect(b.shaderInput).toBe('Emission Strength');
  });

  it('returns null for unbound types', () => {
    expect(getBinding('STRUCTURAL')).toBeNull();
    expect(getBinding('KINETIC')).toBeNull();
    expect(getBinding('SHIELDING')).toBeNull();
  });
});

describe('unboundEnergyTypes', () => {
  it('returns 7 types (all except PHOTONIC)', () => {
    const unbound = unboundEnergyTypes();
    expect(unbound).toHaveLength(7);
    expect(unbound).not.toContain('PHOTONIC');
    expect(unbound).toContain('STRUCTURAL');
    expect(unbound).toContain('RESONANT');
  });
});

describe('validateBinding', () => {
  it('accepts a valid new binding', () => {
    const r = validateBinding({
      energyType: 'THERMAL',
      shaderInput: 'Blackbody Temperature',
      grade: 'FA',
      transferFunction: 'linear',
      evidence: 'test',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects a duplicate binding', () => {
    const r = validateBinding({
      energyType: 'PHOTONIC',
      shaderInput: 'Something Else',
      grade: 'SC',
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('already declared');
  });

  it('rejects a false-friend binding', () => {
    const r = validateBinding({
      energyType: 'ENTROPIC',
      shaderInput: 'Roughness',
      grade: 'FF',
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('false-friend');
  });

  it('rejects an unknown energy type', () => {
    const r = validateBinding({
      energyType: 'MYSTICAL',
      shaderInput: 'Glow',
      grade: 'FA',
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('unknown energy type');
  });

  it('rejects a null proposal', () => {
    expect(validateBinding(null).valid).toBe(false);
  });
});
