/**
 * Semantic particle contract — Phase 0.
 *
 * Production change that would make these fail: minting ADMIT_BOND,
 * treating missing confidence as 0.5, hashing without canonical key order,
 * or letting NaN/Infinity through as a score.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_PERMISSIONS,
  PARTICLE_PERMISSIONS,
  PARTICLE_POLARITIES,
  PARTICLE_SCOPES,
  SEMANTIC_PARTICLE_CONTRACT,
  SEMANTIC_PARTICLE_SCHEMA_VERSION,
  canonicalSerialize,
  internParticle,
  mintParticle,
  particleSchemaChecksum,
  quantizeScore,
  validateParticle,
} from '../../../../codex/core/constellation/semantic-particles/schema.js';

const require = createRequire(import.meta.url);
const schemaSource = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/semantic-particles/schema.js'),
  'utf8',
);

function validDraft(over = {}) {
  return {
    scope: 'LEXICAL',
    kind: 'entity.animacy',
    value: 'animate',
    polarity: 'OBSERVE',
    confidence: null,
    evidence: [{ source: 'authored-seed', ref: 'man' }],
    provenance: [],
    permissions: ['OBSERVE'],
    createdBy: 'authoredRule',
    corpusHash: null,
    ...over,
  };
}

describe('semantic particle schema — Phase 0 contract', () => {
  it('publishes a frozen contract version and checksum', () => {
    expect(SEMANTIC_PARTICLE_CONTRACT).toBe('PB-SEMANTIC-PARTICLE-v1');
    expect(SEMANTIC_PARTICLE_SCHEMA_VERSION).toBe('1.0.0');
    const a = particleSchemaChecksum();
    const b = particleSchemaChecksum();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it('enumerates jurisdictions and never offers ADMIT_BOND', () => {
    expect(PARTICLE_SCOPES).toEqual(['LEXICAL', 'NODE', 'DERIVATION', 'ROOT', 'MOLECULE']);
    expect(PARTICLE_POLARITIES).toEqual(['SUPPORT', 'INHIBIT', 'BIND', 'IDENTIFY', 'OBSERVE']);
    expect(PARTICLE_PERMISSIONS).toEqual([
      'OBSERVE',
      'SCORE_TOKEN',
      'SCORE_DERIVATION',
      'PROPAGATE_SUPPORT',
      'CARRY_CAPABILITY',
      'PROPOSE_EXPERIMENT',
    ]);
    expect(FORBIDDEN_PERMISSIONS).toContain('ADMIT_BOND');
    expect(PARTICLE_PERMISSIONS).not.toContain('ADMIT_BOND');
    expect(schemaSource).not.toMatch(/ADMIT_BOND\s*[:=]/);
  });

  it('treats null confidence as abstention, not a pseudo-neutral 0.5', () => {
    const p = mintParticle(validDraft({ confidence: null }));
    expect(p.confidence).toBeNull();
    expect(p.confidence).not.toBe(0.5);
  });

  it('rejects unknown kinds, permissions, non-finite scores, and missing versions', () => {
    expect(() => mintParticle(validDraft({ scope: 'SENTENCE' }))).toThrow(/scope/);
    expect(() => mintParticle(validDraft({ polarity: 'DELETE' }))).toThrow(/polarity/);
    expect(() => mintParticle(validDraft({ permissions: ['ADMIT_BOND'] }))).toThrow(/ADMIT_BOND|permission/);
    expect(() => mintParticle(validDraft({ confidence: Number.NaN }))).toThrow(/finite|confidence/);
    expect(() => mintParticle(validDraft({ confidence: Infinity }))).toThrow(/finite|confidence/);
    expect(() => mintParticle(validDraft({ kind: '' }))).toThrow(/kind/);
  });

  it('rejects corpus-backed confidence without a corpus hash', () => {
    expect(() => mintParticle(validDraft({
      confidence: 0.8,
      createdBy: 'frozenIndex',
      corpusHash: null,
    }))).toThrow(/corpusHash/);
  });

  it('canonical serialization is key-order independent and sorts arrays', () => {
    const a = canonicalSerialize({
      b: 1,
      a: [{ z: 2, y: 1 }, { y: 0, z: 3 }],
    });
    const b = canonicalSerialize({
      a: [{ y: 1, z: 2 }, { z: 3, y: 0 }],
      b: 1,
    });
    expect(a).toBe(b);
  });

  it('interns equivalent particles by deterministic key', () => {
    const first = internParticle(validDraft({
      evidence: [{ ref: 'man', source: 'authored-seed' }],
    }));
    const second = internParticle(validDraft({
      evidence: [{ source: 'authored-seed', ref: 'man' }],
    }));
    expect(first).toBe(second);
    expect(first.id).toBe(second.id);
    expect(first.schemaVersion).toBe(SEMANTIC_PARTICLE_SCHEMA_VERSION);
  });

  it('does not mutate a minted particle', () => {
    const p = mintParticle(validDraft());
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.evidence)).toBe(true);
    expect(Object.isFrozen(p.permissions)).toBe(true);
    expect(() => {
      p.confidence = 0.5;
    }).toThrow();
  });

  it('validateParticle returns the same object the mint sealed', () => {
    const p = mintParticle(validDraft({ confidence: 0.25, createdBy: 'authoredRule' }));
    expect(validateParticle(p)).toBe(p);
    expect(quantizeScore(0.123456789)).toBe(0.123457);
    expect(() => quantizeScore(Number.NaN)).toThrow(/finite/);
  });
});
