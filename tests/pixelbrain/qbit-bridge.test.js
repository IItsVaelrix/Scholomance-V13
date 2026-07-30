import { describe, it, expect } from 'vitest';
import { propagate, ATTENUATION_MODELS } from '../../codex/core/pixelbrain/qbit-field.js';
import {
  buildQbitFieldRetinaInput,
  routeQbitFieldToPhotonicBridge,
  QBIT_BRIDGE_DEFAULTS,
} from '../../codex/core/pixelbrain/qbit-bridge.js';
// Register the photonic bridge (import individual modules to avoid JSX parse errors).
import { registerPhotonicBridge } from '../../codex/core/pixelbrain/photonic-bridge-registry.js';
import { routeRetinaPacketToPhotonicBridge } from '../../src/lib/photonic-retina/retina-bridge.js';
registerPhotonicBridge({ routeRetinaPacketToPhotonicBridge });

function makeField(size = 8) {
  const seeds = [
    { x: Math.floor(size / 2), y: Math.floor(size / 2), z: Math.floor(size / 2), energy: 1.0, energyType: 0 },
  ];
  return propagate(seeds, size, size, size, {
    attenuationModel: ATTENUATION_MODELS.INVERSE_SQUARE,
    maxRadius: size,
    iterations: 1,
  });
}

describe('qbit-bridge', () => {
  describe('buildQbitFieldRetinaInput', () => {
    it('returns a retinaInput with sourceKind = qbit-field', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      expect(input.sourceKind).toBe('qbit-field');
    });

    it('carries 3D dimensions (width, height, depth)', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      expect(input.dimensions.width).toBe(8);
      expect(input.dimensions.height).toBe(8);
      expect(input.dimensions.depth).toBe(8);
    });

    it('payload contains a Float32Array energyField of length width*height*depth', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      expect(input.payload.energyField).toBeInstanceOf(Float32Array);
      expect(input.payload.energyField.length).toBe(8 * 8 * 8);
    });

    it('includes gradientField by default', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      expect(input.payload.gradientField).toBeInstanceOf(Float32Array);
      expect(input.payload.gradientField.length).toBe(8 * 8 * 8 * 3);
    });

    it('omits gradientField when includeGradient = false', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field, { includeGradient: false });
      expect(input.payload.gradientField).toBeUndefined();
    });

    it('attaches default metadata.attenuationModel = inverse_square', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      expect(input.metadata.attenuationModel).toBe('inverse_square');
    });

    it('preserves caller-provided metadata fields', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field, {
        metadata: { seedCount: 7, formulaType: 'fibonacci' },
      });
      expect(input.metadata.seedCount).toBe(7);
      expect(input.metadata.formulaType).toBe('fibonacci');
    });

    it('center cell energy is the highest in the materialised energyField', () => {
      const field = makeField(8);
      const input = buildQbitFieldRetinaInput(field);
      const centerIdx = 4 * 8 * 8 + 4 * 8 + 4;
      const centerEnergy = input.payload.energyField[centerIdx];
      let maxEnergy = 0;
      for (let i = 0; i < input.payload.energyField.length; i++) {
        if (input.payload.energyField[i] > maxEnergy) maxEnergy = input.payload.energyField[i];
      }
      expect(centerEnergy).toBe(maxEnergy);
    });
  });

  describe('routeQbitFieldToPhotonicBridge', () => {
    it('rejects calls without a valid field', () => {
      expect(() => routeQbitFieldToPhotonicBridge(null)).toThrow();
      expect(() => routeQbitFieldToPhotonicBridge({})).toThrow();
    });

    it('returns a frozen report with grade and score fields', () => {
      const field = makeField(8);
      const report = routeQbitFieldToPhotonicBridge(field);
      expect(Object.isFrozen(report)).toBe(true);
      expect(typeof report.grade).toBe('string');
      expect(typeof report.score).toBe('number');
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(1);
    });

    it('grades QBIT field propagation at A or S (per spec §4 Level 4 prediction)', () => {
      const field = makeField(8);
      const report = routeQbitFieldToPhotonicBridge(field, {
        retinaOptions: {
          targetDimension: 64,
          bitWidth: 4,
          rotationKind: 'signed-hash-rotation',
          quantizationKind: 'scalar',
        },
      });
      expect(['A', 'S']).toContain(report.grade);
    });

    it('operationGraph includes a PROPAGATE op marked photonic-friendly', () => {
      const field = makeField(8);
      const report = routeQbitFieldToPhotonicBridge(field);
      const propagateOp = report.bridgeReport.operationGraph.operations
        .find((op) => op.kind === 'PROPAGATE');
      expect(propagateOp).toBeDefined();
      expect(propagateOp.executionClass).toBe('photonic-friendly');
    });

    it('includes RLE telemetry by default', () => {
      const field = makeField(8);
      const report = routeQbitFieldToPhotonicBridge(field);
      expect(report.rle).toBeDefined();
      expect(report.rle.runCount).toBeGreaterThan(0);
      expect(report.rle.compressedBytes).toBeGreaterThan(0);
      expect(report.rle.compressionRatio).toBeGreaterThan(0);
    });

    it('omits RLE telemetry when includeRle = false', () => {
      const field = makeField(8);
      const report = routeQbitFieldToPhotonicBridge(field, { includeRle: false });
      expect(report.rle).toBeNull();
    });

    it('two routes of the same field produce the same packetId (deterministic)', () => {
      const field = makeField(8);
      const a = routeQbitFieldToPhotonicBridge(field);
      const b = routeQbitFieldToPhotonicBridge(field);
      expect(a.packet.packetId).toBe(b.packet.packetId);
      expect(a.bridgeReport.reportHash).toBe(b.bridgeReport.reportHash);
    });

    it('QBIT_BRIDGE_DEFAULTS exposes targetDimension and bitWidth', () => {
      expect(QBIT_BRIDGE_DEFAULTS.targetDimension).toBe(256);
      expect(QBIT_BRIDGE_DEFAULTS.bitWidth).toBe(4);
    });
  });
});
