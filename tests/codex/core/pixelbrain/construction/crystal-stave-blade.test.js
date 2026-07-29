import { describe, it, expect } from 'vitest';
import {
  createConstruction,
  solve,
} from '../../../../../codex/core/pixelbrain/construction/index.js';

export const crystalStaveBladeSpec = {
  id: 'crystal-stave-blade',
  canvas: { width: 32, height: 64 },
  anchors: {
    axis: [16, 0],
    bladeTip: [16, 4],
    bladeRightEdge: [24, 28],
    bladeRightShoulder: [21, 42],
    bladeBase: [16, 42],
    bladeLeftShoulder: [11, 42],
    bladeLeftEdge: [8, 28],
    bladeSpineStart: [16, 8],
    guardCenter: [16, 46],
    gripEnd: [16, 56],
    pommelTop: [16, 56],
    pommelRight: [19, 58.5],
    pommelBottom: [16, 61],
    pommelLeft: [13, 58.5],
  },
  parts: [
    {
      id: 'blade_outer',
      primitive: {
        kind: 'rounded-polygon',
        points: [
          { anchor: 'bladeTip' },
          { anchor: 'bladeRightEdge' },
          { anchor: 'bladeRightShoulder' },
          { anchor: 'bladeBase' },
          { anchor: 'bladeLeftShoulder' },
          { anchor: 'bladeLeftEdge' },
        ],
        cornerRadius: 0.5,
      },
    },
    {
      id: 'blade_spine',
      primitive: {
        kind: 'tapered-ribbon',
        start: { anchor: 'bladeSpineStart' },
        end: { anchor: 'bladeBase' },
        startWidth: 0.8,
        endWidth: 2.0,
      },
    },
    {
      id: 'guard_cluster',
      primitive: {
        kind: 'radial-shard-cluster',
        center: { anchor: 'guardCenter' },
        count: 6,
        innerRadius: 2.5,
        outerRadius: 7.5,
      },
    },
    {
      id: 'grip',
      primitive: {
        kind: 'tapered-ribbon',
        start: { anchor: 'guardCenter' },
        end: { anchor: 'gripEnd' },
        startWidth: 2.2,
        endWidth: 1.8,
      },
    },
    {
      id: 'pommel',
      primitive: {
        kind: 'rounded-polygon',
        points: [
          { anchor: 'pommelTop' },
          { anchor: 'pommelRight' },
          { anchor: 'pommelBottom' },
          { anchor: 'pommelLeft' },
        ],
        cornerRadius: 0.4,
      },
    },
  ],
  constraints: [
    { kind: 'coaxial', parts: ['blade_outer', 'blade_spine', 'guard_cluster', 'grip', 'pommel'] },
    { kind: 'mirror-symmetry', axis: { anchor: 'axis' } },
  ],
  validation: {
    closedParts: ['blade_outer', 'pommel'],
    forbidSelfIntersections: true,
    consistentWinding: 'counterclockwise',
    minimumCurvatureRadius: 0.2,
    requireConnectedAssembly: false,
  },
};

describe('crystal-stave-blade construction', () => {
  it('creates a frozen PB-GEOMETRY-CONSTRUCTION-v1 packet with checksum', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    expect(packet.contract).toBe('PB-GEOMETRY-CONSTRUCTION-v1');
    expect(packet.checksum).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
    expect(Object.isFrozen(packet)).toBe(true);
  });

  it('solves successfully with validationReport.passed === true', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    const result = solve(packet);
    expect(result.validationReport.passed).toBe(true);
    expect(result.parts.blade_outer).toBeDefined();
    expect(result.parts.guard_cluster).toBeDefined();
    expect(result.parts.grip).toBeDefined();
    expect(result.parts.pommel).toBeDefined();
  });

  it('passes 100-iteration determinism replay test', () => {
    const packet = createConstruction(crystalStaveBladeSpec);
    const firstSolve = JSON.stringify(solve(packet));
    for (let i = 0; i < 99; i++) {
      const currentSolve = JSON.stringify(solve(packet));
      expect(currentSolve).toBe(firstSolve);
    }
  });
});
