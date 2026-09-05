/**
 * Node-only directory reader for AMP relevance records.
 *
 * This is the original directory-reading implementation that used to live in
 * `load-relevance-records-sync.js`, before that file was split for browser
 * safety (see its header for the full history — this is the third time this
 * bug class has hit this file/area). `item-foundry.js`'s synchronous,
 * browser-reachable forge path no longer touches this file at all: it reads
 * statically-generated data instead, via `loadRelevanceRecordsSync()` in
 * `./load-relevance-records-sync.js`.
 *
 * This file exists for tests only — validating the generated data module
 * against arbitrary/fixture directories, and exercising validation/error
 * paths (bad records, bad directories). It would also exist for a CLI, but
 * `scripts/amp-substrate-cli.mjs` has its own `readJson`/`registerAmpRelevance`
 * flow and does not use this loader.
 *
 * MUST NEVER be imported by `item-foundry.js`, `src/lib/pixelbrain.adapter.js`,
 * or anything else the browser bundle reaches — it statically imports
 * `node:fs`, `node:path`, which Vite cannot bundle for a browser target.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateAmpRelevance } from './amp-relevance.schema.js';
import {
  BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES,
} from '../bytecode-error.js';

/**
 * All relevance records in `dir`, in the row shape `selectActiveAmps`
 * consumes. `dir` is required — there is no default directory here; the
 * real default-directory read path is `loadRelevanceRecordsSync()`.
 */
export function loadRelevanceRecordsFromDir(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    const record = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const { ok, errors } = validateAmpRelevance(record);
    if (!ok) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MODULE_IDS.AMP_SUBSTRATE, ERROR_CODES.INVALID_VALUE,
        { file, errors },
      );
    }
    return {
      pipeline: record.pipeline,
      ampId: record.ampId,
      order: record.order,
      appliesToJson: JSON.stringify(record.appliesTo ?? []),
      requiresJson: JSON.stringify(record.requires ?? []),
    };
  });
}
