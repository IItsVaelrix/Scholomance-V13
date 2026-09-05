/**
 * Synchronous relevance-record loader for hot, synchronous forge paths.
 *
 * `item-foundry.js`'s `forgeItemAsset()` is called synchronously from scripts
 * and the browser Craft Gate adapter — making it async to read the AMP
 * substrate's SQLite store (whose wrapper API is async by repo-wide rule) would
 * be a breaking change to every caller.
 *
 * Browser-safety history: `item-foundry.js` (which calls
 * `loadRelevanceRecordsSync()`) is reachable from the browser bundle via
 * `src/lib/pixelbrain.adapter.js` (`renderBundleVri` -> item-foundry.js). Any
 * module in that reachable graph with a top-level `import ... from 'node:*'`
 * breaks `npx vite build` — Vite externalizes Node builtins for browser
 * targets as an empty stub with no named exports, so the build fails with
 * "dirname is not exported by __vite-browser-external:node:path" (or the
 * equivalent for whichever builtin leaked in). This is the THIRD time this
 * exact bug class has hit this file/area (previously `node:crypto`, then
 * `node:zlib`) — this file used to read `pilot-relevance/*.json` directly
 * with `readdirSync`/`readFileSync`/`node:path`/`node:url`, all of which are
 * now gone from this module.
 *
 * The fix: this file now only statically imports a generated, isomorphic
 * data module (`pilot-relevance.generated.js`, written by
 * `scripts/seed-amp-item-pipeline-records.mjs` from the same `RECORDS` this
 * repo's JSON files are seeded from) — zero `node:*` imports, at any syntax
 * level. The original directory-reading logic still exists, but only in
 * `load-relevance-records-from-dir.js`, a Node-only file that must NEVER be
 * imported by `item-foundry.js` or anything else the browser bundle reaches.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

import { GENERATED_RELEVANCE_RECORDS } from './pilot-relevance.generated.js';

/**
 * All relevance records, in the row shape `selectActiveAmps` consumes.
 *
 * Always returns the same reference: `GENERATED_RELEVANCE_RECORDS` is a
 * statically-imported, `Object.freeze`d module-level constant, so there is no
 * directory to read and no real caching left to do — "the cache" is just
 * module identity now.
 */
export function loadRelevanceRecordsSync() {
  return GENERATED_RELEVANCE_RECORDS;
}

/**
 * Test-only. Kept as a harmless no-op rather than removed, so existing
 * callers (`item-pipeline-differential.test.js`, this file's own tests)
 * don't need to change: there is nothing left to clear — `loadRelevanceRecordsSync()`
 * always returns the same statically-imported, frozen array by construction,
 * whether or not this has ever been called.
 */
export function clearRelevanceRecordsCache() {}
