import { describe, it, expect } from 'vitest';
import { executeRoute } from '../../codex/core/pixelbrain/microprocessor-route.js';
import { isCellOccupied, getCellMaterialId } from '../../codex/core/pixelbrain/voxel-volume.js';
import {
  createVolumeLiftStep,
  buildPartParams,
} from '../../codex/core/pixelbrain/volume-lift-amp.js';

// A tiny stub step that owns fills.coordinates so the seam contract is satisfied.
function fillsEmitterStep(coordinates) {
  return {
    name: 'stub-fills',
    seam: { id: 'stub.fills', processor: 'stub-fills', consumes: [], emits: ['fills.coordinates'] },
    execute(results) {
      results.fills = { coordinates };
    },
  };
}

describe('createVolumeLiftStep — VolumeLiftAMP as a microprocessor-route seam', () => {
  const coordinates = [];
  for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
    coordinates.push({ x, y, partId: 'blade', materialId: 2 });
  }

  it('consumes fills.coordinates and emits a voxel volume through executeRoute', () => {
    const route = {
      name: 'volume-lift-test',
      steps: [
        fillsEmitterStep(coordinates),
        createVolumeLiftStep({
          dims: { width: 2, height: 2 },
          partParams: { blade: { profile: 'flat', maxDepth: 1 } },
        }),
      ],
    };

    const results = executeRoute(route, { spec: { parts: [{ id: 'blade' }] } });

    expect(results.diagnostics.ok).toBe(true);
    expect(results.voxel).toBeTruthy();
    expect(results.voxel.volume).toBeTruthy();
    const volume = results.voxel.volume;
    expect(volume.depth).toBe(3);
    // flat maxDepth 1 → every cell is a 3-voxel column
    expect(isCellOccupied(volume, 0, 0, 0)).toBe(true);
    // materialId is derived from colour (all #000000 → id 1), not from input materialId
    expect(getCellMaterialId(volume, 0, 0, 1)).toBe(1);
    expect(volume.diagnostics.voxelCount).toBe(coordinates.length * 3);
  });

  it('fails the seam when fills.coordinates is not emitted upstream', () => {
    const route = {
      name: 'volume-lift-orphan',
      steps: [createVolumeLiftStep({ dims: { width: 2, height: 2 } })],
    };
    const results = executeRoute(route, {});
    expect(results.diagnostics.ok).toBe(false);
    expect(results.diagnostics.failures[0].code).toBe('PB_ROUTE_SEAM_VIOLATION');
  });
});

describe('buildPartParams — reads the per-part volume table from the spec', () => {
  it('lifts profile/maxDepth/steps off part.volume with flat defaults', () => {
    const spec = {
      parts: [
        { id: 'haft', volume: { profile: 'round', maxDepth: 1 } },
        { id: 'plain' },
      ],
    };
    const params = buildPartParams(spec);
    expect(params.haft).toEqual({ profile: 'round', maxDepth: 1, steps: undefined });
    expect(params.plain.profile).toBe('flat');
  });
});
