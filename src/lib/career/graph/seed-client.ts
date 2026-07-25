/**
 * Career Graph client wiring + feature flag.
 *
 * The full Career Graph UI flow is opt-in so the proven lexical ATS flow stays
 * the default for every user. The flag has three modes:
 *
 *   - `seed` — in-memory seed demo dataset (no network, no WASM).
 *   - `live` — the real O*NET/ESCO corpus via the SQLite-WASM worker + shards.
 *   - `off`  — force the lexical flow.
 *
 * Selection:
 *   - URL:   /career?careerGraph=seed | live | off
 *   - Store: localStorage.setItem('careerGraph', 'seed' | 'live')
 *
 * Every mode returns the same `CareerGraphClient` class, so nothing downstream
 * is special-cased — only the transport differs (seed transport vs real Worker).
 */
import { CareerGraphClient, type CareerGraphTransport } from './client';
import { InMemoryCareerGraphTransport } from './in-memory-transport';

export type CareerGraphMode = 'seed' | 'live' | 'off';

/** Pure flag reader (testable): URL param wins, then localStorage. */
export function careerGraphMode(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): CareerGraphMode {
  const param = new URLSearchParams(search).get('careerGraph');
  if (param === 'seed' || param === 'live') return param;
  if (param === 'off') return 'off';
  try {
    const stored = storage?.getItem('careerGraph');
    if (stored === 'seed' || stored === 'live') return stored;
  } catch {
    /* storage unavailable */
  }
  return 'off';
}

/** Back-compat: true when either graph mode (seed or live) is enabled. */
export function isSeedCareerGraphEnabled(
  search?: string,
  storage?: Pick<Storage, 'getItem'>
): boolean {
  return careerGraphMode(search, storage) !== 'off';
}

/** A real `CareerGraphClient` backed by the in-memory seed transport. */
export function createSeedCareerGraphClient(): CareerGraphClient {
  return new CareerGraphClient(() => new InMemoryCareerGraphTransport());
}

/**
 * A real `CareerGraphClient` driving the SQLite-WASM worker over the corpus
 * shards. The native `Worker` satisfies `CareerGraphTransport` directly.
 */
export function createLiveCareerGraphClient(): CareerGraphClient {
  return new CareerGraphClient(() => {
    const worker = new Worker(
      new URL('../../../workers/career-graph.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return worker as unknown as CareerGraphTransport;
  });
}

/** Build the client for the active mode, or `undefined` when disabled. */
export function createCareerGraphClientForMode(
  mode: CareerGraphMode = careerGraphMode()
): CareerGraphClient | undefined {
  if (mode === 'seed') return createSeedCareerGraphClient();
  if (mode === 'live') return createLiveCareerGraphClient();
  return undefined;
}
