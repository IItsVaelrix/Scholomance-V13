/**
 * Open plates. Refuse TEST during design.
 *
 * @module codex/research/parser-failure-atlas/plate
 */

import { PLATES, SEALED_SPLIT } from './atlas-schema.js';

export function refuseTest(row) {
  if (row?.split === SEALED_SPLIT) return Object.freeze({ ok: false, reason: 'test' });
  return Object.freeze({ ok: true });
}

export function plateAtlas(cases) {
  const out = Object.create(null);
  for (const plate of PLATES) out[plate] = [];
  for (const row of cases || []) {
    if (!row?.plate || !out[row.plate]) continue;
    out[row.plate].push(row);
  }
  return Object.freeze(Object.fromEntries(
    PLATES.map((p) => [p, Object.freeze(out[p])]),
  ));
}
