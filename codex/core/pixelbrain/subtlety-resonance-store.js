import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sha256Hex } from './sha256.js';
import { canonicalStringify } from './canonical-json.js';

export const SUBTLETY_RESONANCE_SCHEMA = 'SUBTLETY-RESONANCE-RECORD-v1';

function seal(record) {
  const { checksum: _c, ...body } = record;
  return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
}

export function createResonanceStore({ path, now = () => new Date().toISOString() } = {}) {
  if (!path) throw new TypeError('createResonanceStore requires path');
  mkdirSync(dirname(path), { recursive: true });

  function append(kind, payload) {
    const record = seal({
      schema: SUBTLETY_RESONANCE_SCHEMA,
      recordedAt: now(),
      kind,
      payload,
    });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  function readAll() {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function tail(n = 20) {
    return readAll().slice(-Math.max(0, n));
  }

  return { append, readAll, tail, path };
}
