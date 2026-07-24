import { describe, expect, it } from 'vitest';
import {
  isSeedCareerGraphEnabled,
  createSeedCareerGraphClient,
} from '../../src/lib/career/graph/seed-client';

describe('isSeedCareerGraphEnabled', () => {
  it('enables via URL param', () => {
    expect(isSeedCareerGraphEnabled('?careerGraph=seed', undefined)).toBe(true);
  });

  it('forces off via URL param even if storage says seed', () => {
    const storage = { getItem: () => 'seed' };
    expect(isSeedCareerGraphEnabled('?careerGraph=off', storage)).toBe(false);
  });

  it('falls back to localStorage when no URL param', () => {
    expect(isSeedCareerGraphEnabled('', { getItem: () => 'seed' })).toBe(true);
    expect(isSeedCareerGraphEnabled('', { getItem: () => null })).toBe(false);
  });

  it('defaults to disabled (lexical flow) with no signals', () => {
    expect(isSeedCareerGraphEnabled('', undefined)).toBe(false);
  });

  it('survives a throwing storage', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(isSeedCareerGraphEnabled('', storage)).toBe(false);
  });
});

describe('createSeedCareerGraphClient', () => {
  it('returns a client with an analyze method (satisfies CareerGraphPort)', () => {
    const client = createSeedCareerGraphClient();
    expect(typeof client.analyze).toBe('function');
    client.dispose();
  });
});
