import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/godot-export/divwand-container.divwand?raw';

vi.mock('../../src/lib/engine.adapter.js', () => ({
  validateDivProposal: (proposal) => ({ ok: true, proposal }),
}));

const { buildDivWandGodotExport } = await import('../../src/lib/godot-export/divwandGodotExport.js');

describe('buildDivWandGodotExport', () => {
  const proposal = { role: 'container', children: [] };

  it('serializes deterministically', () => {
    expect(buildDivWandGodotExport(proposal)).toBe(buildDivWandGodotExport(proposal));
  });

  it('matches the phase 0 fixture', () => {
    expect(buildDivWandGodotExport(proposal)).toBe(fixture);
  });

  it('sets kind, version, and validation state', () => {
    const result = JSON.parse(buildDivWandGodotExport(proposal));

    expect(result.kind).toBe('scholomance.divwand.godot.v1');
    expect(result.version).toBe(1);
    expect(result.valid).toBe(true);
  });
});
