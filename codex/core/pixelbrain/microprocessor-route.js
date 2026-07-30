import { runRoute, validateRoute } from './microprocessor-route.core.js';

/**
 * Observed-mode fingerprint sampling for executeRoute.
 *
 * NODE-REACHABLE MODULE. The lazy `import()` below pulls `subtlety-runtime.js`,
 * which reaches `node:fs` through the fs-backed resonance store. Rollup resolves
 * literal dynamic imports, so this module cannot be in the browser graph — the
 * production build fails on the `__vite-browser-external:node:fs` stub.
 *
 * Browser-reachable callers must import `./microprocessor-route.core.js`
 * instead, which carries the contract engine and `validateRoute` with no
 * Node-only reachability. `character-factory.js` does exactly that.
 *
 * The runtime is warmed with ONE eager dynamic import (Node + flag only) and
 * samples queue until it resolves: the live callers are short-lived forge
 * CLIs, and a per-sample dynamic import loses the race against process exit —
 * the pending import keeps the event loop alive, then the queue flushes
 * synchronously (appendFileSync) so samples land before the CLI exits.
 *
 * The sampling flag is checked LIVE (not frozen at module load) so that
 * tests can toggle it per-case. A lazy regular import() fallback ensures
 * vitest's vi.mock can intercept the runtime module in test environments,
 * while the eager Function-based import preserves the opaque-to-Vite
 * guarantee for any bundler that does reach this file.
 */
function isSamplingEnabled() {
  return typeof process !== 'undefined'
    && process.env?.SUBTLETY_SAMPLE_ROUTES === '1'
    && typeof process.versions?.node === 'string';
}

let subtletyRuntimeModule = null;
let subtletyRuntimeLoading = false;
const pendingRouteSamples = [];

function recordRouteSample({ routeDefinition, results }) {
  try {
    subtletyRuntimeModule.getSubtletyRuntime().recordObserved?.(
      { unitId: `route.${routeDefinition.name}` },
      results,
      { mode: 'observed', seam: { id: routeDefinition.name } },
    );
  } catch {
    // sampling must never disturb route execution
  }
}

function flushPendingSamples() {
  while (pendingRouteSamples.length) recordRouteSample(pendingRouteSamples.shift());
}

// Eager load for CLI use (flag set at process start, before module init).
// Opaque to Vite/Rollup — a literal import() here still enters the browser
// graph and pulls node:fs via subtlety-resonance-store. Forge CLIs only.
if (isSamplingEnabled()) {
  subtletyRuntimeLoading = true;
  const loadSubtletyRuntime = (specifier) => Function('s', 'return import(s)')(specifier);
  void loadSubtletyRuntime('./subtlety-runtime.js')
    .then((mod) => {
      subtletyRuntimeModule = mod;
      flushPendingSamples();
    })
    .catch(() => {
      pendingRouteSamples.length = 0;
    });
}

/**
 * Lazy-load the runtime via a regular import() — interceptable by vitest's
 * vi.mock in test environments. Guarded so only one load is in flight.
 */
function ensureRuntimeLoaded() {
  if (subtletyRuntimeModule || subtletyRuntimeLoading) return;
  subtletyRuntimeLoading = true;
  import('./subtlety-runtime.js')
    .then((mod) => {
      subtletyRuntimeModule = mod;
      flushPendingSamples();
    })
    .catch(() => {
      pendingRouteSamples.length = 0;
    });
}

function maybeSampleObservedRoute(routeDefinition, results) {
  if (!isSamplingEnabled()) return;
  if (subtletyRuntimeModule) {
    recordRouteSample({ routeDefinition, results });
  } else {
    pendingRouteSamples.push({ routeDefinition, results });
    ensureRuntimeLoaded();
  }
}

/**
 * Validate a route's contract and execute its real steps.
 * Use this only when a step's `execute` body is required (e.g. `createVolumeLiftStep`).
 */
export function executeRoute(routeDefinition, context) {
  return runRoute(routeDefinition, context, {
    execute: true,
    onSampled: maybeSampleObservedRoute,
  });
}

// Re-exported so existing importers keep working. Browser-reachable code must
// import it from ./microprocessor-route.core.js instead — see the note above.
export { validateRoute };
