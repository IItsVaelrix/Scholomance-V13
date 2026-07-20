import { describe, it, expect } from 'vitest';
import { runDictPrimeAuthority } from '../../../codex/core/microprocessors/dict/primeAuthority.js';
import { PhonemeEngine } from '../../../codex/core/phonology/phoneme.engine.js';

describe('dict.primeAuthority', () => {
  it('primes PhonemeEngine via self-sqlite in Node (not fetch)', async () => {
    PhonemeEngine.authorityFailure = null;
    const result = await runDictPrimeAuthority({ words: ['bold', 'told', 'scar'] });
    expect(result.source).toBe('self-sqlite');
    expect(result.primed).toBe(3);
    expect(result.authorityUnavailable).toBe(false);
    expect(result.ok).toBe(true);
    expect(PhonemeEngine.authorityFailure).toBeNull();
  });
});
