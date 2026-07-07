import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/godot-export/wand-linear.wand?raw';

vi.mock('../../src/lib/engine.adapter.js', () => ({
  validateProposal: (proposal) => ({ ok: true, proposal }),
}));

const { buildWandGodotExport } = await import('../../src/lib/godot-export/wandGodotExport.js');

describe('buildWandGodotExport', () => {
  const proposal = { type: 'linear', params: { a: 1, b: 2 } };

  it('serializes deterministically', () => {
    expect(buildWandGodotExport(proposal)).toBe(buildWandGodotExport(proposal));
  });

  it('matches the phase 0 fixture', () => {
    expect(buildWandGodotExport(proposal)).toBe(fixture);
  });

  it('sets kind, version, and validation state', () => {
    const result = JSON.parse(buildWandGodotExport(proposal));

    expect(result.kind).toBe('scholomance.wand.godot.v1');
    expect(result.version).toBe(1);
    expect(result.valid).toBe(true);
  });
});
