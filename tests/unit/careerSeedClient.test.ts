import { describe, expect, it } from 'vitest';
import {
  isSeedCareerGraphEnabled,
  createSeedCareerGraphClient,
  careerGraphMode,
  createCareerGraphClientForMode,
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

describe('careerGraphMode', () => {
  it('reads seed/live/off from the URL param', () => {
    expect(careerGraphMode('?careerGraph=seed', undefined)).toBe('seed');
    expect(careerGraphMode('?careerGraph=live', undefined)).toBe('live');
    expect(careerGraphMode('?careerGraph=off', { getItem: () => 'live' })).toBe('off');
  });

  it('falls back to localStorage, accepting only seed/live', () => {
    expect(careerGraphMode('', { getItem: () => 'live' })).toBe('live');
    expect(careerGraphMode('', { getItem: () => 'seed' })).toBe('seed');
    expect(careerGraphMode('', { getItem: () => 'garbage' })).toBe('off');
  });

  it('defaults to off with no signals', () => {
    expect(careerGraphMode('', undefined)).toBe('off');
  });
});

describe('createSeedCareerGraphClient', () => {
  it('returns a client with an analyze method (satisfies CareerGraphPort)', () => {
    const client = createSeedCareerGraphClient();
    expect(typeof client.analyze).toBe('function');
    client.dispose();
  });

  it('createCareerGraphClientForMode returns undefined when off, a client for seed', () => {
    expect(createCareerGraphClientForMode('off')).toBeUndefined();
    const seed = createCareerGraphClientForMode('seed');
    expect(seed && typeof seed.analyze).toBe('function');
    seed?.dispose();
  });
});
