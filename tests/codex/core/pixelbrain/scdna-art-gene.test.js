/**
 * Tests: SCDNA Art-Gene Packet
 * PDR §17.1: Schema, modes, deep freeze, stable checksum
 */

import { describe, it, expect } from 'vitest';
import {
  createArtGenePacket,
  validateProjectionMode,
  deepFreeze,
  stableStringify,
  checksumStableJSON,
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
  ART_GENE_CONTRACT,
  ART_GENE_VERSION,
} from '../../../../codex/core/pixelbrain/scdna-art-gene.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeExplicitGene(overrides = {}) {
  return createArtGenePacket({
    assetId: 'shrine-brazier',
    geneId: 'brazier-rim-light',
    projectionMode: 'explicit',
    priority: 100,
    canvas: { width: 24, height: 20 },
    role: 'rim-highlight',
    materialHint: 'obsidian',
    paletteRoles: ['core', 'rim', 'shadow'],
    coordinates: [
      { x: 5, y: 6, role: 'rim', partId: 'brazier-body' },
      { x: 6, y: 5, role: 'rim', partId: 'brazier-body' },
    ],
    geometryHints: {
      lightDir: 'upper-left',
      valueRamp: ['highlight', 'midtone', 'shadow'],
      contourFollow: false,
    },
    ...overrides,
  });
}

function makeDerivedGene(overrides = {}) {
  return createArtGenePacket({
    assetId: 'shrine-brazier',
    geneId: 'brazier-contour',
    projectionMode: 'derived',
    priority: 50,
    canvas: { width: 24, height: 20 },
    role: 'contour-light',
    materialHint: 'obsidian',
    paletteRoles: ['rim'],
    coordinates: [],
    geometryHints: {
      contourFollow: true,
      contourPartId: 'brazier-body',
      rimWidth: 1,
    },
    ...overrides,
  });
}

function makeHybridGene(overrides = {}) {
  return createArtGenePacket({
    assetId: 'shrine-brazier',
    geneId: 'brazier-hybrid',
    projectionMode: 'hybrid',
    priority: 75,
    canvas: { width: 24, height: 20 },
    role: 'rim-highlight',
    materialHint: 'obsidian',
    paletteRoles: ['rim', 'core'],
    coordinates: [{ x: 10, y: 4, role: 'rim' }],
    geometryHints: {
      contourFollow: true,
      contourPartId: 'brazier-body',
      rimWidth: 1,
      lightDir: 'upper-left',
    },
    ...overrides,
  });
}

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe('createArtGenePacket', () => {
  it('returns a deeply frozen PB-SCDNA-GENE-v1 packet with scd64: checksum', () => {
    const gene = makeExplicitGene();

    expect(gene.contract).toBe(ART_GENE_CONTRACT);
    expect(gene.version).toBe(ART_GENE_VERSION);
    expect(gene.geneType).toBe('art-direction');
    expect(gene.checksum).toMatch(/^scd64:[0-9a-f]{64}$/);
    expect(Object.isFrozen(gene)).toBe(true);
    expect(Object.isFrozen(gene.canvas)).toBe(true);
    expect(Object.isFrozen(gene.coordinates)).toBe(true);
    expect(Object.isFrozen(gene.paletteRoles)).toBe(true);
    expect(Object.isFrozen(gene.geometryHints)).toBe(true);
  });

  it('normalizes paletteRoles to sorted set semantics', () => {
    const gene = makeExplicitGene({ paletteRoles: ['shadow', 'core', 'rim', 'core'] });
    expect(gene.paletteRoles).toEqual(['core', 'rim', 'shadow']);
  });

  it('preserves coordinate ordering (never sorted by role)', () => {
    const gene = makeExplicitGene({
      coordinates: [
        { x: 10, y: 3, role: 'rim' },
        { x: 5, y: 6, role: 'core' },
      ],
    });
    // Sorted by y then x, not by role
    expect(gene.coordinates[0].y).toBeLessThanOrEqual(gene.coordinates[1].y);
  });

  it('computes bounds from coordinates when not provided', () => {
    const gene = makeExplicitGene();
    expect(gene.bounds).toEqual({ x: 5, y: 5, w: 2, h: 2 });
  });

  it('produces deterministic checksum regardless of property insertion order', () => {
    const geneA = makeExplicitGene();
    const geneB = createArtGenePacket({
      geometryHints: { lightDir: 'upper-left', valueRamp: ['highlight', 'midtone', 'shadow'], contourFollow: false },
      paletteRoles: ['core', 'rim', 'shadow'],
      coordinates: [
        { x: 5, y: 6, role: 'rim', partId: 'brazier-body' },
        { x: 6, y: 5, role: 'rim', partId: 'brazier-body' },
      ],
      role: 'rim-highlight',
      materialHint: 'obsidian',
      canvas: { width: 24, height: 20 },
      priority: 100,
      projectionMode: 'explicit',
      geneId: 'brazier-rim-light',
      assetId: 'shrine-brazier',
    });

    expect(geneA.checksum).toBe(geneB.checksum);
  });

  it('accepts composition intent fields balanceMode and intendedFocalCenter', () => {
    const gene = makeExplicitGene({
      balanceMode: 'deliberately-imbalanced',
      intendedFocalCenter: { x: 0.3, y: 0.7 },
      regionWeightPriors: { altar: 1.5 },
    });
    expect(gene.balanceMode).toBe('deliberately-imbalanced');
    expect(gene.intendedFocalCenter).toEqual({ x: 0.3, y: 0.7 });
    expect(gene.regionWeightPriors.altar).toBe(1.5);
  });

  it('rejects invalid balanceMode', () => {
    expect(() => makeExplicitGene({ balanceMode: 'chaotic' })).toThrow(/ART_GENE_INVALID_BALANCE_MODE/);
  });
});

// ─── Mode Validation Tests (§8.3) ───────────────────────────────────────────

describe('projection mode validation', () => {
  it('accepts explicit mode with coordinates', () => {
    expect(() => makeExplicitGene()).not.toThrow();
  });

  it('refuses explicit mode without coordinates', () => {
    expect(() => makeExplicitGene({ coordinates: [] }))
      .toThrow('ART_GENE_EXPLICIT_REQUIRES_COORDINATES');
  });

  it('accepts derived mode with contour hints and no coordinates', () => {
    expect(() => makeDerivedGene()).not.toThrow();
  });

  it('refuses derived mode with coordinates', () => {
    expect(() => makeDerivedGene({
      coordinates: [{ x: 1, y: 1, role: 'rim' }],
    })).toThrow('ART_GENE_DERIVED_REJECTS_COORDINATES');
  });

  it('refuses derived mode without contour hints', () => {
    expect(() => makeDerivedGene({
      geometryHints: { lightDir: 'top' },
    })).toThrow('ART_GENE_DERIVED_REQUIRES_CONTOUR');
  });

  it('accepts hybrid mode with coordinates and contour hints', () => {
    expect(() => makeHybridGene()).not.toThrow();
  });

  it('refuses hybrid mode without coordinates', () => {
    expect(() => makeHybridGene({ coordinates: [] }))
      .toThrow('ART_GENE_HYBRID_REQUIRES_COORDINATES');
  });

  it('refuses hybrid mode without contour hints', () => {
    expect(() => makeHybridGene({
      geometryHints: { lightDir: 'top' },
    })).toThrow('ART_GENE_HYBRID_REQUIRES_CONTOUR');
  });

  it('refuses unknown projection mode', () => {
    expect(() => createArtGenePacket({
      assetId: 'test',
      geneId: 'test',
      projectionMode: 'magical',
      canvas: { width: 8, height: 8 },
      coordinates: [{ x: 0, y: 0, role: 'x' }],
    })).toThrow('ART_GENE_UNKNOWN_MODE');
  });
});

// ─── Geometry Hints Validation ───────────────────────────────────────────────

describe('geometry hints validation', () => {
  it('refuses unknown operational hints', () => {
    expect(() => makeExplicitGene({
      geometryHints: { sparkleAmount: 5 },
    })).toThrow('ART_GENE_UNKNOWN_HINT');
  });

  it('allows extensions as non-operational metadata', () => {
    expect(() => makeExplicitGene({
      geometryHints: { extensions: { 'custom:sparkle': 5 } },
    })).not.toThrow();
  });

  it('refuses invalid lightDir', () => {
    expect(() => makeExplicitGene({
      geometryHints: { lightDir: 'sideways' },
    })).toThrow('ART_GENE_INVALID_LIGHT_DIR');
  });

  it('refuses invalid occlusionPolicy', () => {
    expect(() => makeExplicitGene({
      geometryHints: { occlusionPolicy: 'maybe' },
    })).toThrow('ART_GENE_INVALID_OCCLUSION_POLICY');
  });

  it('refuses invalid cornerPolicy', () => {
    expect(() => makeExplicitGene({
      geometryHints: { cornerPolicy: 'chamfer' },
    })).toThrow('ART_GENE_INVALID_CORNER_POLICY');
  });
});

// ─── Deep Freeze ─────────────────────────────────────────────────────────────

describe('deepFreeze', () => {
  it('freezes nested objects recursively', () => {
    const obj = { a: { b: { c: [1, 2, 3] } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.a)).toBe(true);
    expect(Object.isFrozen(obj.a.b)).toBe(true);
    expect(Object.isFrozen(obj.a.b.c)).toBe(true);
  });
});

// ─── Stable Checksum ─────────────────────────────────────────────────────────

describe('stableStringify / checksumStableJSON', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = { z: 1, a: 2, m: { y: 3, b: 4 } };
    const b = { a: 2, m: { b: 4, y: 3 }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(checksumStableJSON(a)).toBe(checksumStableJSON(b));
  });

  it('produces scd64: prefixed 64-char hex checksum', () => {
    const cs = checksumStableJSON({ test: true });
    expect(cs).toMatch(/^scd64:[0-9a-f]{64}$/);
  });
});

// ─── Version Constants ───────────────────────────────────────────────────────

describe('version constants', () => {
  it('exports monotonic integer epochs', () => {
    expect(PROJECTION_ALGO_VERSION).toBe(1);
    expect(CONFLICT_POLICY_VERSION).toBe(1);
  });
});
