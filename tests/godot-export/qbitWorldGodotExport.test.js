import { describe, expect, it } from 'vitest';

import { buildQbitWorldGodotExport } from '../../src/lib/godot-export/qbitWorldGodotExport.js';

describe('buildQbitWorldGodotExport', () => {
  const input = {
    schoolWeights: { VOID: 1 },
    options: { size: 16, maxRadius: 12 },
  };

  it('serializes deterministically', () => {
    expect(buildQbitWorldGodotExport(input)).toBe(buildQbitWorldGodotExport(input));
  });

  it('sets kind, version, and QBIT world metadata', () => {
    const result = JSON.parse(buildQbitWorldGodotExport(input));

    expect(result.kind).toBe('scholomance.qbitworld.godot.v1');
    expect(result.version).toBe(1);
    expect(result.params.dominantSchoolId).toBe('VOID');
    expect(result.pixelBrainAsset.contract).toBe('PB-QBIT-WORLD-ASSET-v1');
    expect(result.wandProposal.proposedFormula.role).toBe('voxel.terrain');
    expect(result.divWandNode.type).toBe('world');
  });

  it('exports polygon faces with harvest resources', () => {
    const result = JSON.parse(buildQbitWorldGodotExport(input));
    const face = result.faces[0];

    expect(face.polygon.length).toBeGreaterThanOrEqual(4);
    expect(face.fill).toMatch(/^#[0-9a-f]{6}$/i);
    expect(face.resource.materialName).toBeTruthy();
    expect(face.resource.position).toEqual(face.voxel);
  });
});
