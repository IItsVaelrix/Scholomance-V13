/**
 * Synchronous relevance-record loader for hot, synchronous forge paths.
 *
 * `item-foundry.js`'s `forgeItemAsset()` is called synchronously from scripts
 * and the browser Craft Gate adapter — making it async to read the AMP
 * substrate's SQLite store (whose wrapper API is async by repo-wide rule) would
 * be a breaking change to every caller. The substrate's real source of truth is
 * these tracked JSON files anyway (the DB is a queryable materialization of
 * them, built by `npm run amps -- register-pilots`), so a synchronous reader
 * over the same files gives identical records without touching the DB.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAmpRelevance } from './amp-relevance.schema.js';
import {
  BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES,
} from '../bytecode-error.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(HERE, 'pilot-relevance');

let cache = null;

/** All relevance records, in the row shape `selectActiveAmps` consumes. */
export function loadRelevanceRecordsSync(dir = DEFAULT_DIR) {
  if (dir === DEFAULT_DIR && cache) return cache;

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const records = files.map((file) => {
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

  if (dir === DEFAULT_DIR) cache = records;
  return records;
}

/** Test-only: force the next default-directory load to re-read from disk. */
export function clearRelevanceRecordsCache() {
  cache = null;
}
