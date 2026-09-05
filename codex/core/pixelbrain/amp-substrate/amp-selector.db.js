/**
 * Node-only persistence companion for the browser-safe AMP selector.
 *
 * Keep this module out of browser import graphs: amp-substrate.db.js depends on
 * better-sqlite3, while amp-selector.js is intentionally pure and is consumed
 * by the isomorphic PixelBrain foundry.
 */

import { appendActivationLog } from './amp-substrate.db.js';
import { selectActiveAmps } from './amp-selector.js';

/** Select AMPs against a live substrate and append the decision audit row. */
export async function selectAndLog(db, pipeline, spec, records) {
  const result = selectActiveAmps(pipeline, spec, records);
  await appendActivationLog(db, {
    specChecksum: result.specChecksum,
    activated: result.activated,
    skipped: result.skipped,
    selectorVersion: result.selectorVersion,
  });
  return result;
}
