import { describe, expect, it } from 'vitest';
import {
  CHLOROPLAST_CYCLOTRON_CONTRACT,
  CHLOROPLAST_CYCLOTRON_SCHEMA_VERSION,
  buildInterChloroplastMesh,
  streamChloroplastToCyclotron,
} from '../../../codex/core/constellation/chloroplast-cyclotron-wire.js';

describe('Constellation Chloroplast-to-Cyclotron Telemetry Wire', () => {
  it('handles empty atom arrays gracefully', () => {
    const mesh = buildInterChloroplastMesh([]);
    expect(mesh.atomCount).toBe(0);
    expect(mesh.totalCells).toBe(0);
    expect(mesh.totalVoltage).toBe(0);
    expect(mesh.meshLinks).toEqual([]);
    expect(mesh.phaseCoherence).toBe(0);

    const stream = streamChloroplastToCyclotron(mesh);
    expect(stream.contract).toBe(CHLOROPLAST_CYCLOTRON_CONTRACT);
    expect(stream.schemaVersion).toBe(CHLOROPLAST_CYCLOTRON_SCHEMA_VERSION);
    expect(stream.checksum).toMatch(/^chloroplast-cyclotron-v1:[a-f0-9]{64}$/);
    expect(stream.cyclotronKinematics.orbitalEnergy).toBeGreaterThan(0);
  });

  it('computes inter-chloroplast communication mesh across active atoms', () => {
    const atoms = [
      {
        from: 0,
        to: 0,
        charge: 1.5,
        nucleus: { aura: 'aura-0' },
        chloroplast: {
          voltage: 1.5,
          irradiance: 3.0,
          cells: [{ from: 0, voltage: 1.5 }],
        },
      },
      {
        from: 1,
        to: 1,
        charge: 2.0,
        nucleus: { aura: 'aura-1' },
        chloroplast: {
          voltage: 2.0,
          irradiance: 4.0,
          cells: [{ from: 1, voltage: 2.0 }],
        },
      },
      {
        from: 2,
        to: 2,
        charge: 1.0,
        nucleus: { aura: 'aura-2' },
        chloroplast: {
          voltage: 1.0,
          irradiance: 2.5,
          cells: [{ from: 2, voltage: 1.0 }],
        },
      },
    ];

    const mesh = buildInterChloroplastMesh(atoms);
    expect(mesh.atomCount).toBe(3);
    expect(mesh.totalCells).toBe(3);
    expect(mesh.totalVoltage).toBe(4.5);
    expect(mesh.totalIrradiance).toBe(9.5);
    expect(mesh.meshLinks.length).toBe(6); // 3 * 2 directed pairs
    expect(mesh.interChloroplastFlux).toBeGreaterThan(0);
    expect(mesh.phaseCoherence).toBeGreaterThan(0);
  });

  it('directly drives Cyclotron particle kinematics from chloroplast telemetry', () => {
    const atomsLowResonance = [
      { from: 0, charge: 0.1, chloroplast: { voltage: 0.1, irradiance: 1.0, cells: [{ voltage: 0.1 }] } },
      { from: 1, charge: 0.1, chloroplast: { voltage: 0.1, irradiance: 1.0, cells: [{ voltage: 0.1 }] } },
    ];
    const atomsHighResonance = [
      { from: 0, charge: 3.0, chloroplast: { voltage: 3.0, irradiance: 10.0, cells: [{ voltage: 3.0 }] } },
      { from: 1, charge: 4.0, chloroplast: { voltage: 4.0, irradiance: 12.0, cells: [{ voltage: 4.0 }] } },
    ];

    const meshLow = buildInterChloroplastMesh(atomsLowResonance);
    const meshHigh = buildInterChloroplastMesh(atomsHighResonance);

    const streamLow = streamChloroplastToCyclotron(meshLow);
    const streamHigh = streamChloroplastToCyclotron(meshHigh);

    // Physical causality: higher chloroplast excitation drives higher Cyclotron resonance frequency & energy
    expect(streamHigh.cyclotronKinematics.resonanceFrequency)
      .toBeGreaterThan(streamLow.cyclotronKinematics.resonanceFrequency);
    expect(streamHigh.cyclotronKinematics.totalRotationalEnergy)
      .toBeGreaterThan(streamLow.cyclotronKinematics.totalRotationalEnergy);
    expect(streamHigh.cyclotronKinematics.rfGain)
      .toBeGreaterThan(streamLow.cyclotronKinematics.rfGain);
  });
});
