// NAMESPACE imports, deliberately, not named ones.
//
// This module is Node-only, but it is reachable from the browser graph through
// microprocessor-route -> subtlety-runtime, which executeRoute loads via a
// literal import() (kept literal so vitest's vi.mock can intercept it). Rollup
// follows that, substitutes `__vite-browser-external` for node:fs / node:path,
// and a NAMED import then fails the production build outright:
//   "mkdirSync is not exported by __vite-browser-external:node:fs"
// A namespace import binds without resolving individual exports, so the build
// succeeds. Nothing here runs in a browser: every caller is gated on
// process.versions.node via isSamplingEnabled().
// Named `nodePath`, not `path`: createResonanceStore takes a `path` parameter
// that would shadow the module namespace.
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { sha256Hex } from './sha256.js';
import { canonicalStringify } from './canonical-json.js';

export const SUBTLETY_RESONANCE_SCHEMA = 'SUBTLETY-RESONANCE-RECORD-v1';

function seal(record) {
  const { checksum: _c, ...body } = record;
  return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
}

export function createResonanceStore({ path, now = () => new Date().toISOString() } = {}) {
  if (!path) throw new TypeError('createResonanceStore requires path');
  fs.mkdirSync(nodePath.dirname(path), { recursive: true });

  function append(kind, payload) {
    const record = seal({
      schema: SUBTLETY_RESONANCE_SCHEMA,
      recordedAt: now(),
      kind,
      payload,
    });
    fs.appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  function readAll() {
    if (!fs.existsSync(path)) return [];
    return fs.readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function tail(n = 20) {
    return readAll().slice(-Math.max(0, n));
  }

  return { append, readAll, tail, path };
}
