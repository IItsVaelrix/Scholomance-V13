import { describe, it, expect } from 'vitest';
import { BONDS } from '../../../codex/core/constellation/compose.js';
import {
  BOND_ANATOMY,
  validateAnatomyAgainstBonds,
  summarizeAnatomy,
  gradePath,
  bondKey,
  anatomyBySignature,
} from '../../../codex/core/constellation/bond-anatomy.js';

describe('bond anatomy catalogue', () => {
  it('every active bond has anatomy; constitution may keep deprecated rows', () => {
    expect(() => validateAnatomyAgainstBonds(BONDS)).not.toThrow();
    expect(BOND_ANATOMY.length).toBeGreaterThanOrEqual(BONDS.length);
  });

  it('headship is mostly green after head-declaring bonds', () => {
    const s = summarizeAnatomy();
    expect(s.headshipGreenRate).toBeGreaterThanOrEqual(0.9);
    expect(s.tallies.H.R).toBe(0);
  });

  it('keeps COP+VP anatomy as deprecated historical law', () => {
    const row = BOND_ANATOMY.find(
      (a) => a.left === 'COP' && a.right === 'VP' && a.result === 'VP',
    );
    expect(row).toBeDefined();
    expect(row.status).toBe('deprecated');
    expect(row.H).toBe('G');
    expect(row.flags).toContain('cop-vs-aux');
  });

  it('gradePath marks theory-clean only for all-G paths', () => {
    const by = anatomyBySignature();
    const clean = gradePath(['DET+N->NP', 'NP+VP->S'], by);
    expect(clean.theoryClean).toBe(true);
    expect(clean.headshipClean).toBe(true);

    const dirty = gradePath(['REL+VP->RELC', 'NP+VP->S'], by);
    expect(dirty.theoryClean).toBe(false);
    expect(dirty.headshipClean).toBe(true);
  });

  it('bondKey matches catalogue keys', () => {
    expect(bondKey('DET', 'N', 'NP')).toBe('DET+N->NP');
    expect(anatomyBySignature().has('MODAL+VP->VP')).toBe(true);
  });
});
