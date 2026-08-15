/**
 * Element phase — silicone (flexible rule) vs carbon (axiom).
 *
 * Production change that would make these fail: calling ADJ+N→N carbon, or
 * calling a molecule that smuggled a grammar+constructive atom a transmutation.
 */
import { describe, it, expect } from 'vitest';
import { CONSTRUCTIONS } from '../../../codex/core/constellation/grimoire/index.js';
import {
  ELEMENT_PHASE,
  PHRASE_TYPES,
  classifyConstruction,
  axiomAssay,
  transmutationVerdict,
  constructionToAtom,
} from '../../../codex/core/constellation/element-phase.js';

describe('classifyConstruction', () => {
  it('calls NP+VP→S carbon — grammar, constructive, phrase result', () => {
    const c = CONSTRUCTIONS.find((row) => row.id === 'subject-predicate');
    expect(c).toBeTruthy();
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.CARBON);
  });

  it('calls ADJ+N→N silicone — category-preserving even if it is grammar', () => {
    const c = CONSTRUCTIONS.find((row) => row.left === 'ADJ' && row.right === 'N' && row.result === 'N');
    expect(c).toBeTruthy();
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.SILICONE);
  });

  it('calls a scaffold constructive bond silicone — new type, not an axiom', () => {
    const c = CONSTRUCTIONS.find((row) => row.left === 'CONJ' && row.right === 'NP' && row.result === 'CONJNP');
    expect(c).toBeTruthy();
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.SILICONE);
  });

  it('calls deprecated inert', () => {
    const c = CONSTRUCTIONS.find((row) => row.status === 'deprecated');
    expect(c).toBeTruthy();
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.INERT);
  });

  it('keeps approximation-status phrase builders in silicone — axiom geometry is not authorship', () => {
    const c = CONSTRUCTIONS.find((row) => row.left === 'V' && row.right === 'NP' && row.result === 'VP');
    expect(c.status).toBe('approximation');
    expect(classifyConstruction(c)).toBe(ELEMENT_PHASE.SILICONE);
  });

  it('every construction receives exactly one phase', () => {
    for (const c of CONSTRUCTIONS) {
      expect(Object.values(ELEMENT_PHASE)).toContain(classifyConstruction(c));
    }
  });
});

describe('axiomAssay', () => {
  it('accepts a lone carbon construction as a lattice of one', () => {
    const c = CONSTRUCTIONS.find((row) => row.id === 'subject-predicate');
    const assay = axiomAssay([c]);
    expect(assay.ok).toBe(true);
    expect(assay.phraseResults).toContain('S');
  });

  it('rejects an all-preservative silicone set — no phrase is created', () => {
    const silicone = CONSTRUCTIONS.filter((row) => classifyConstruction(row) === ELEMENT_PHASE.SILICONE)
      .filter((row) => row.result === row.left || row.result === row.right)
      .slice(0, 3);
    expect(silicone.length).toBeGreaterThan(0);
    expect(axiomAssay(silicone).ok).toBe(false);
  });
});

describe('transmutationVerdict', () => {
  it('refuses to call a carbon-contaminated molecule a transmutation', () => {
    const silicone = CONSTRUCTIONS.find((row) => classifyConstruction(row) === ELEMENT_PHASE.SILICONE);
    const carbon = CONSTRUCTIONS.find((row) => classifyConstruction(row) === ELEMENT_PHASE.CARBON);
    const verdict = transmutationVerdict([silicone, carbon]);
    expect(verdict.transmuted).toBe(false);
    expect(verdict.reason).toBe('carbon-contaminated');
  });

  it('does not transmute an all-silicone preservative pair', () => {
    const preservative = CONSTRUCTIONS.filter((row) => (
      classifyConstruction(row) === ELEMENT_PHASE.SILICONE
      && (row.result === row.left || row.result === row.right)
    )).slice(0, 2);
    const verdict = transmutationVerdict(preservative);
    expect(verdict.transmuted).toBe(false);
  });
});

describe('constructionToAtom', () => {
  it('does not offer the result type as a port — that would smuggle carbon', () => {
    const c = CONSTRUCTIONS.find((row) => row.id === 'subject-predicate');
    const atom = constructionToAtom(c);
    expect(atom.offers).not.toContain('cat-s');
    expect(atom.offers).toContain('cat-np');
    expect(atom.seeks).toContain('cat-vp');
  });

  it('phrase types used by the assay are the declared set', () => {
    expect([...PHRASE_TYPES].sort()).toEqual(['INF', 'NP', 'PP', 'S', 'SBAR', 'VP']);
  });
});
