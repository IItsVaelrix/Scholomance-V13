/**
 * SIMULATION MODULE 3 — Spec → RAID Triage — Test Suite
 * PB-SIM-RAID-v1
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  specToSymptoms,
  simulateRaidTriage,
} from '../../../../codex/core/pixelbrain/simulate-raid-triage.js';
import { createRaidWithSeeds } from '../../../../codex/core/immunity/clerical-raid.bootstrap.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const RANDOM_SPEC = 'Add a random number generator for combat damage calculation with unseeded Math.random';
const ASYNC_SPEC = 'Refactor the websocket handler to use async/await with proper promise handling';
const RENDER_SPEC = 'Add a new shader pass for pixel-art lighting in the canvas renderer';
const CLEAN_SPEC = 'Update the documentation for the project readme file';
const NETWORK_SPEC = 'Add websocket reconnection logic with exponential backoff for the game server API';

// ─── specToSymptoms ──────────────────────────────────────────────────

describe('specToSymptoms', () => {
  it('extracts symptoms from random-related specs', () => {
    const { symptoms, matchedAreas } = specToSymptoms(RANDOM_SPEC);
    expect(symptoms.length).toBeGreaterThan(0);
    expect(matchedAreas).toContain('random');
    expect(symptoms.some((s) => s.includes('random') || s.includes('nondeterministic'))).toBe(true);
  });

  it('extracts symptoms from async-related specs', () => {
    const { symptoms, matchedAreas } = specToSymptoms(ASYNC_SPEC);
    expect(symptoms.length).toBeGreaterThan(0);
    expect(matchedAreas).toContain('async');
    expect(symptoms.some((s) => s.includes('promise') || s.includes('async'))).toBe(true);
  });

  it('extracts symptoms from render-related specs', () => {
    const { symptoms, matchedAreas } = specToSymptoms(RENDER_SPEC);
    expect(symptoms.length).toBeGreaterThan(0);
    expect(matchedAreas.some((a) => ['render', 'shader', 'pixel', 'canvas'].includes(a))).toBe(true);
  });

  it('returns generic symptom for unrecognized specs', () => {
    const { symptoms, matchedAreas } = specToSymptoms(CLEAN_SPEC);
    expect(symptoms.length).toBeGreaterThan(0);
    expect(matchedAreas).toHaveLength(0);
    expect(symptoms[0]).toContain('unclassified');
  });

  it('extracts file paths when present', () => {
    const { filePaths } = specToSymptoms('Fix the bug in codex/core/pixelbrain/concept-chemistry.js');
    expect(filePaths.length).toBeGreaterThan(0);
    expect(filePaths[0]).toContain('concept-chemistry.js');
  });

  it('deduplicates symptoms', () => {
    const { symptoms } = specToSymptoms('random random random seed seed seed');
    const unique = new Set(symptoms);
    expect(unique.size).toBe(symptoms.length);
  });

  it('handles empty input', () => {
    const { symptoms } = specToSymptoms('');
    expect(symptoms.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = specToSymptoms(RANDOM_SPEC);
    const b = specToSymptoms(RANDOM_SPEC);
    expect(a.symptoms).toEqual(b.symptoms);
    expect(a.matchedAreas).toEqual(b.matchedAreas);
  });
});

// ─── simulateRaidTriage ──────────────────────────────────────────────

describe('simulateRaidTriage', () => {
  it('returns frozen result with correct schema', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(result.schema).toBe(SCHEMA);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('includes extracted symptoms', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(result.symptoms.count).toBeGreaterThan(0);
    expect(result.symptoms.extracted.length).toBeGreaterThan(0);
    expect(result.symptoms.matchedAreas.length).toBeGreaterThan(0);
  });

  it('includes RAID verdict', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(['CONFIRMED', 'DENIED', 'NEEDS_MERLIN', 'NOVEL']).toContain(result.raid.verdict);
    expect(typeof result.raid.confidence).toBe('number');
    expect(typeof result.raid.margin).toBe('number');
    expect(typeof result.raid.escalationRequired).toBe('boolean');
  });

  it('includes risk level', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(['KNOWN_RISK', 'UNCHARTED', 'AMBIGUOUS', 'LIKELY_SAFE']).toContain(result.riskLevel);
  });

  it('includes neighbor patterns', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(Array.isArray(result.raid.neighbors)).toBe(true);
    if (result.raid.neighbors.length > 0) {
      expect(result.raid.neighbors[0]).toHaveProperty('patternId');
      expect(result.raid.neighbors[0]).toHaveProperty('similarity');
    }
  });

  it('produces a SIMULATED label', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(result.label.tier).toBe('SIMULATED');
    expect(['REFUTED', 'NOVEL', 'METASTABLE']).toContain(result.label.outcome);
    expect(result.label.evidence.length).toBeGreaterThan(0);
  });

  it('carries a content-addressed checksum', () => {
    const result = simulateRaidTriage({ spec: RANDOM_SPEC });
    expect(result.checksum).toMatch(/^simraid1:[0-9a-f]{16}$/);
  });

  it('is deterministic (100-iteration replay)', () => {
    const results = Array.from({ length: 100 }, () => simulateRaidTriage({ spec: RANDOM_SPEC }));
    const checksums = new Set(results.map((r) => r.checksum));
    expect(checksums.size).toBe(1);
  });

  it('accepts a pre-built RAID instance', () => {
    const raid = createRaidWithSeeds();
    const result = simulateRaidTriage({ spec: RANDOM_SPEC, raid });
    expect(result.schema).toBe(SCHEMA);
    expect(['CONFIRMED', 'DENIED', 'NEEDS_MERLIN', 'NOVEL']).toContain(result.raid.verdict);
  });

  it('throws on empty spec', () => {
    expect(() => simulateRaidTriage({ spec: '' })).toThrow('spec is required');
    expect(() => simulateRaidTriage({})).toThrow('spec is required');
  });

  it('different specs produce different checksums', () => {
    const r1 = simulateRaidTriage({ spec: RANDOM_SPEC });
    const r2 = simulateRaidTriage({ spec: NETWORK_SPEC });
    expect(r1.checksum).not.toBe(r2.checksum);
  });

  it('truncates long specs', () => {
    const longSpec = 'x'.repeat(500);
    const result = simulateRaidTriage({ spec: longSpec });
    expect(result.spec.length).toBeLessThanOrEqual(200);
  });
});
