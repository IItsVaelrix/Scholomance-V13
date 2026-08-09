import { describe, it, expect } from 'vitest';
import { ACTIVE_CONSTRUCTIONS } from '../../../codex/core/constellation/grimoire/index.js';
import {
  synthesizeByProjection,
  conservesResult,
  projectResult,
  deriveBond,
  isLicensedProjection,
} from '../../../codex/core/constellation/grimoire/projection-laws.js';
import { synthesizeBonds } from '../../../codex/core/constellation/grimoire/bond-synthesizer.js';

describe('Result Conservation Law', () => {
  it('derives DET+N → NP and V+NP → VP and NP+VP → S', () => {
    expect(deriveBond('DET', 'N')).toMatchObject({ result: 'NP', head: 1 });
    expect(deriveBond('V', 'NP')).toMatchObject({ result: 'VP', head: 0 });
    expect(deriveBond('NP', 'VP')).toMatchObject({ result: 'S', head: 1 });
  });

  it('murders fake endocentric results', () => {
    expect(conservesResult({ left: 'V', right: 'NP', result: 'V', head: 0 }).ok).toBe(false);
    expect(conservesResult({ left: 'NP', right: 'VP', result: 'NP', head: 0 }).ok).toBe(false);
    expect(conservesResult({ left: 'ADV', right: 'S', result: 'ADV', head: 0 }).ok).toBe(false);
    expect(conservesResult({ left: 'NP', right: 'PUNCT', result: 'S', head: 0 }).ok).toBe(false);
    expect(conservesResult({ left: 'DET', right: 'N', result: 'N', head: 1 }).ok).toBe(false);
  });

  it('allows licensed preserve and advance', () => {
    expect(conservesResult({ left: 'ADJ', right: 'N', result: 'N', head: 1 }).ok).toBe(true);
    expect(conservesResult({ left: 'S', right: 'PUNCT', result: 'S', head: 0 }).ok).toBe(true);
    expect(conservesResult({ left: 'AUX', right: 'VP', result: 'VP', head: 1 }).ok).toBe(true);
  });

  it('rediscovers a viable fraction of active bonds without free C', () => {
    const projected = synthesizeByProjection();
    const sigs = new Set(projected.map((c) => c.signature));
    let hit = 0;
    for (const g of ACTIVE_CONSTRUCTIONS) {
      if (sigs.has(`${g.left}|${g.right}|${g.result}`)) hit += 1;
    }
    expect(hit).toBeGreaterThanOrEqual(40);
    // Cloud should be tighter than free-C synthesizer
    expect(projected.length).toBeLessThan(120);
  });

  it('kills most free-C extras from the old synthesizer', () => {
    const gold = new Set(
      ACTIVE_CONSTRUCTIONS.map((c) => `${c.left}|${c.right}|${c.result}`),
    );
    const extras = synthesizeBonds({ mode: 'full' }).filter((c) => !gold.has(c.signature));
    const conserved = extras.filter((c) => conservesResult(c).ok);
    // Soft reactor had 44 survivors; conservation should collapse that dramatically
    expect(conserved.length).toBeLessThan(15);
    expect(conserved.length).toBeLessThan(extras.length / 2);
  });

  it('projectResult only lists licensed transitions', () => {
    expect(projectResult('V', 'object-saturate')).toEqual(['VP']);
    expect(projectResult('VP', 'subject-saturate')).toEqual(['S']);
    expect(isLicensedProjection('N', 'determine', 'NP')).toBe(true);
    expect(isLicensedProjection('N', 'determine', 'S')).toBe(false);
  });
});
