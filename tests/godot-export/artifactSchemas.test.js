import { describe, expect, it } from 'vitest';
import {
  createDivWandArtifact,
  createPixelBrainArtifact,
  createQbitWorldArtifact,
  createWandArtifact,
  DIVWAND_GODOT_KIND,
  GODOT_ARTIFACT_VERSION,
  PIXELBRAIN_GODOT_KIND,
  QBIT_WORLD_GODOT_KIND,
  WAND_GODOT_KIND,
} from '../../src/lib/godot-export/artifactSchemas.js';

describe('Godot artifact schemas', () => {
  it('normalizes missing PixelBrain canvas values', () => {
    const artifact = createPixelBrainArtifact({});

    expect(artifact.kind).toBe(PIXELBRAIN_GODOT_KIND);
    expect(artifact.version).toBe(GODOT_ARTIFACT_VERSION);
    expect(artifact.canvas).toEqual({ width: 160, height: 144, gridSize: 1 });
    expect(artifact.palettes).toEqual([]);
    expect(artifact.coordinates).toEqual([]);
    expect(artifact.formula).toBeNull();
    expect(artifact.bytecode).toBe('');
  });

  it('preserves explicit PixelBrain canvas zeroes and arrays', () => {
    const artifact = createPixelBrainArtifact({
      canvas: { width: 0, height: 0, gridSize: 0 },
      palettes: [{ hex: '#000000' }],
      coordinates: [{ x: 0, y: 0, color: '#000000' }],
      bytecode: 123,
    });

    expect(artifact.canvas).toEqual({ width: 0, height: 0, gridSize: 0 });
    expect(artifact.palettes).toEqual([{ hex: '#000000' }]);
    expect(artifact.coordinates).toEqual([{ x: 0, y: 0, color: '#000000' }]);
    expect(artifact.bytecode).toBe('123');
  });

  it('creates Wand artifacts from validation results', () => {
    const artifact = createWandArtifact({
      proposal: { type: 'linear' },
      validation: { ok: true },
    });

    expect(artifact.kind).toBe(WAND_GODOT_KIND);
    expect(artifact.version).toBe(1);
    expect(artifact.valid).toBe(true);
  });

  it('creates DivWand artifacts from validation results', () => {
    const artifact = createDivWandArtifact({
      proposal: { role: 'container' },
      validation: { valid: false },
    });

    expect(artifact.kind).toBe(DIVWAND_GODOT_KIND);
    expect(artifact.version).toBe(1);
    expect(artifact.valid).toBe(false);
  });

  it('creates QBIT world artifacts for Godot import', () => {
    const artifact = createQbitWorldArtifact({
      schoolWeights: { VOID: 1 },
      faces: [{ id: 'face-1' }],
    });

    expect(artifact.kind).toBe(QBIT_WORLD_GODOT_KIND);
    expect(artifact.version).toBe(GODOT_ARTIFACT_VERSION);
    expect(artifact.schoolWeights).toEqual({ VOID: 1 });
    expect(artifact.faces).toEqual([{ id: 'face-1' }]);
  });
});
