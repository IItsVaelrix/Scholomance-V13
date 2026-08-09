import { describe, it, expect } from 'vitest';
import { BONDS as composeBonds, validateBonds } from '../../../codex/core/constellation/compose.js';
import {
  CONSTRUCTIONS,
  BONDS,
  BOND_ANATOMY,
  familyInventory,
  constructionByBond,
  mayClaimLinguisticFact,
  isScaffold,
  CONSTRUCTION_STATUS,
  validateConstructions,
} from '../../../codex/core/constellation/grimoire/index.js';
import {
  validateAnatomyAgainstBonds,
  summarizeAnatomy,
  gradePath,
  bondKey,
} from '../../../codex/core/constellation/bond-anatomy.js';

describe('Construction Registry (Grimoire)', () => {
  it('projects active bonds from the full constitution (deprecated excluded)', () => {
    expect(CONSTRUCTIONS.length).toBeGreaterThanOrEqual(68);
    expect(BONDS.length).toBeLessThan(CONSTRUCTIONS.length);
    expect(composeBonds).toEqual(BONDS);
    expect(() => validateBonds(BONDS)).not.toThrow();
    expect(() => validateConstructions(CONSTRUCTIONS)).not.toThrow();
    // COP+VP deprecated — not in chart chemistry
    expect(BONDS.some((b) => b[0] === 'COP' && b[1] === 'VP' && b[2] === 'VP')).toBe(false);
    expect(BONDS.some((b) => b[0] === 'AUX' && b[1] === 'VP' && b[2] === 'VP')).toBe(true);
    // Closure: NP absorbs terminal punct
    expect(BONDS.some((b) => b[0] === 'NP' && b[1] === 'PUNCT' && b[2] === 'NP')).toBe(true);
  });

  it('anatomy is a pure projection of constructions (no drift)', () => {
    expect(() => validateAnatomyAgainstBonds(BONDS)).not.toThrow();
    expect(BOND_ANATOMY.length).toBe(CONSTRUCTIONS.length);
    const det = constructionByBond('DET', 'N', 'NP');
    expect(det.status).toBe(CONSTRUCTION_STATUS.GRAMMAR);
    expect(mayClaimLinguisticFact(det)).toBe(true);
  });

  it('marks coordination bridges as scaffolds — not linguistic claims', () => {
    const bridge = constructionByBond('CONJ', 'NP', 'CONJNP');
    expect(bridge.status).toBe(CONSTRUCTION_STATUS.SCAFFOLD);
    expect(isScaffold(bridge)).toBe(true);
    expect(mayClaimLinguisticFact(bridge)).toBe(false);
  });

  it('marks relative-subject-gap as approximation with a limitation', () => {
    const rel = constructionByBond('REL', 'VP', 'RELC');
    expect(rel.status).toBe(CONSTRUCTION_STATUS.APPROXIMATION);
    expect(rel.limitation).toMatch(/subject-gap/i);
    expect(mayClaimLinguisticFact(rel)).toBe(false);
  });

  it('keeps COP+VP in the Grimoire as deprecated (not projected)', () => {
    const row = constructionByBond('COP', 'VP', 'VP');
    expect(row.status).toBe(CONSTRUCTION_STATUS.DEPRECATED);
    expect(row.flags).toContain('cop-vs-aux');
    expect(row.head).toBe(1);
    expect(mayClaimLinguisticFact(row)).toBe(false);
  });

  it('headship remains mostly green via anatomy projection', () => {
    const s = summarizeAnatomy();
    expect(s.headshipGreenRate).toBeGreaterThanOrEqual(0.9);
    expect(s.byStatus.scaffold).toBeGreaterThan(0);
    expect(s.byStatus.grammar).toBeGreaterThan(0);
    expect(s.byStatus.approximation).toBeGreaterThan(0);
  });

  it('family inventory answers what Scholomance understands', () => {
    const inv = familyInventory();
    expect(inv.some((f) => f.family === 'coordination')).toBe(true);
    expect(inv.some((f) => f.family === 'copular')).toBe(true);
    const coord = inv.find((f) => f.family === 'coordination');
    expect(coord.scaffold).toBeGreaterThan(0);
    expect(coord.grammar).toBeGreaterThan(0);
  });

  it('gradePath still works for theory-clean vs critical paths', () => {
    const clean = gradePath(['DET+N->NP', 'NP+VP->S']);
    expect(clean.theoryClean).toBe(true);
    const dirty = gradePath([bondKey('COP', 'VP', 'VP'), 'NP+VP->S']);
    expect(dirty.theoryClean).toBe(false);
    expect(dirty.criticalHit).toBe(true);
    expect(dirty.headshipClean).toBe(true);
  });
});
