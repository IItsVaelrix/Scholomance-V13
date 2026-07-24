/**
 * Seed Career Graph client wiring + feature flag.
 *
 * The full Career Graph UI flow is opt-in via a feature flag so the proven
 * lexical ATS flow remains the default for every user. Enable the seed graph:
 *
 *   - URL:   /career?careerGraph=seed   (or =off to force-disable)
 *   - Store: localStorage.setItem('careerGraph', 'seed')
 *
 * When enabled, `createSeedCareerGraphClient()` returns a real
 * `CareerGraphClient` driving the in-memory seed transport — the same client
 * class that will later drive the SQLite-WASM worker, so nothing downstream is
 * special-cased.
 */
import { CareerGraphClient } from './client';
import { InMemoryCareerGraphTransport } from './in-memory-transport';

/** Pure flag reader (testable): URL param wins, then localStorage. */
export function isSeedCareerGraphEnabled(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): boolean {
  const param = new URLSearchParams(search).get('careerGraph');
  if (param === 'seed') return true;
  if (param === 'off') return false;
  try {
    return storage?.getItem('careerGraph') === 'seed';
  } catch {
    return false;
  }
}

/** A real `CareerGraphClient` backed by the in-memory seed transport. */
export function createSeedCareerGraphClient(): CareerGraphClient {
  return new CareerGraphClient(() => new InMemoryCareerGraphTransport());
}
