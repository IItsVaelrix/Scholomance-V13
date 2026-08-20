/**
 * Typed valence on parser atoms.
 *
 * Production change that would make these fail: a scalar vacancy count,
 * or using valence as a ranking bonus instead of a typed hole.
 */
import { describe, expect, it } from 'vitest';

import {
  fillValence,
  mintValence,
  openVacancies,
  seekingByType,
} from '../../../codex/core/constellation/atom-valence.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';

describe('atom valence', () => {
  it('gives DET a rightward nominal complement vacancy, not a number', () => {
    const v = mintValence('DET');
    expect(v.roles.complement).toMatchObject({
      dir: 'right',
      accept: ['N', 'NP'],
      capacity: 1,
      filled: 0,
    });
    expect(openVacancies(v)).toEqual([
      expect.objectContaining({ role: 'complement', dir: 'right' }),
    ]);
  });

  it('fills a vacancy without inventing a new role', () => {
    const v = mintValence('DET');
    expect(fillValence(v, 'complement')).toBe(true);
    expect(v.roles.complement.filled).toBe(1);
    expect(openVacancies(v)).toEqual([]);
    expect(fillValence(v, 'complement')).toBe(false);
  });

  it('exposes seeking direction from the typed table', () => {
    expect(seekingByType.DET).toBe('right');
    expect(seekingByType.N).toBeUndefined();
  });

  it('stamps valence on packed leaves and fills DET after DET+N', () => {
    const chart = composePacked(['the', 'cat'], new Map([
      ['the', ['x']],
      ['cat', ['n']],
    ]));
    const det = chart.atoms.find((a) => a.type === 'DET');
    expect(det.valence.roles.complement.filled).toBe(1);
    const np = chart.molecules.find((m) => m.type === 'NP' && m.from === 0 && m.to === 1);
    expect(np).toBeTruthy();
    expect(np.valence).toBeTruthy();
  });
});
