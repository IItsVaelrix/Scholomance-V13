/**
 * Graduation feed — silicone stamped grammar, then used as a bond table.
 *
 * Production change that would make these fail: letting ADJ+N→N become carbon
 * by a status rewrite, or letting a feed table skip validateBonds.
 */
import { describe, it, expect } from 'vitest';
import { CONSTRUCTIONS, BONDS } from '../../../codex/core/constellation/grimoire/index.js';
import { validateBonds } from '../../../codex/core/constellation/compose.js';
import { mayClaimLinguisticFact } from '../../../codex/core/constellation/grimoire/schemas.js';
import {
  ELEMENT_PHASE,
  classifyConstruction,
  asCarbonAxiom,
  becomesCarbonAxiom,
  graduationQueue,
  feedBondTables,
} from '../../../codex/core/constellation/element-phase.js';

describe('asCarbonAxiom / graduation queue', () => {
  it('promotes V+NP→VP from silicone to carbon by a status stamp', () => {
    const c = CONSTRUCTIONS.find((row) => row.left === 'V' && row.right === 'NP' && row.result === 'VP');
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.SILICONE);
    expect(becomesCarbonAxiom(c)).toBe(true);
    expect(classifyConstruction(asCarbonAxiom(c))).toBe(ELEMENT_PHASE.CARBON);
  });

  it('refuses to let ADJ+N→N become carbon — preservation is not an axiom', () => {
    const c = CONSTRUCTIONS.find((row) => row.left === 'ADJ' && row.right === 'N' && row.result === 'N');
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.SILICONE);
    expect(becomesCarbonAxiom(c)).toBe(false);
    expect(classifyConstruction(asCarbonAxiom(c))).toBe(ELEMENT_PHASE.SILICONE);
  });

  it('the queue is exactly the silicone that a status stamp turns into carbon', () => {
    const queue = graduationQueue(CONSTRUCTIONS);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every(becomesCarbonAxiom)).toBe(true);
    expect(queue.every((c) => classifyConstruction(c) === ELEMENT_PHASE.SILICONE)).toBe(true);
  });
});

describe('feedBondTables', () => {
  it('builds four validated tables and GRADUATED is a proper subset of FULL', () => {
    const tables = feedBondTables(CONSTRUCTIONS);
    expect(Object.keys(tables).sort()).toEqual(['CARBON_ONLY', 'FULL', 'GRADUATED', 'OVERFEED']);
    for (const [name, bonds] of Object.entries(tables)) {
      expect(() => validateBonds(bonds), name).not.toThrow();
    }
    expect(tables.CARBON_ONLY.length).toBeLessThan(tables.GRADUATED.length);
    expect(tables.GRADUATED.length).toBeLessThanOrEqual(tables.FULL.length);
    expect(tables.FULL.length).toBe(BONDS.length);
  });

  it('status promotion alone does not change FULL — BONDS ignore ontology', () => {
    const tables = feedBondTables(CONSTRUCTIONS);
    const promoted = CONSTRUCTIONS.map(asCarbonAxiom);
    const again = feedBondTables(promoted);
    expect(again.FULL).toEqual(tables.FULL);
  });

  it('ONTOLOGY claims rise when the queue is stamped grammar', () => {
    const before = CONSTRUCTIONS.filter(mayClaimLinguisticFact).length;
    const after = CONSTRUCTIONS.map((c) => (
      becomesCarbonAxiom(c) ? asCarbonAxiom(c) : c
    )).filter(mayClaimLinguisticFact).length;
    expect(after).toBeGreaterThan(before);
  });
});
