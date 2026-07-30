// Namespace import, not named: this module is reachable from the browser graph
// (microprocessor-route's literal import() for vi.mock), where Rollup swaps in
// `__vite-browser-external` and a named import fails the production build.
// Named `nodePath` because a local `const path` exists below.
import * as nodePath from 'node:path';
import { createSubtletyApm } from './subtlety-fingerprint-apm.js';
import { normalizeCrashEvent } from './subtlety-crash-ingest.js';
import { createResonanceStore } from './subtlety-resonance-store.js';

const DEFAULT_DEDUP_WINDOW_MS = 60_000;

let singleton = null;

export function createSubtletyRuntime({
  store,
  apm = createSubtletyApm(),
  alertFn = () => {},
  raidFn = async () => null,
  dedupWindowMs = DEFAULT_DEDUP_WINDOW_MS,
  now = () => Date.now(), // EXEMPT — injectable wall-clock for crash dedup; deterministic in tests via override
} = {}) {
  if (!store) throw new TypeError('createSubtletyRuntime requires store');

  const dedup = new Map();

  function pruneDedup(current) {
    for (const [key, entry] of dedup) {
      if (current - entry.at > dedupWindowMs) dedup.delete(key);
    }
  }

  function touchDedup(dedupKey, current) {
    pruneDedup(current);
    let entry = dedup.get(dedupKey);
    if (!entry) {
      entry = { at: current, occurrenceCount: 0, lastAlert: null };
      dedup.set(dedupKey, entry);
    }
    entry.occurrenceCount += 1;
    entry.at = current;
    return entry;
  }

  function proposeOnly(proposal) {
    const next = { ...proposal, allowed: false };
    if (!next.action) next.action = 'propose-only';
    return next;
  }

  async function ingestCrash(rawEvent) {
    try {
      const normalized = normalizeCrashEvent(rawEvent);
      const { identity, output, seam, dedupKey } = normalized;
      const unitId = identity.unitId;

      const packet = apm.recordObserved(identity, output, { seam, mode: 'observed' });
      store.append('fingerprint', packet);

      const assessment = apm.assess(unitId, {
        current: { identity, buildId: identity.buildId },
      });
      store.append('assessment', assessment);

      const current = now();
      const entry = touchDedup(dedupKey, current);
      const deduped = entry.occurrenceCount > 1;

      let alert = null;
      if (!deduped) {
        const symptoms = assessment.recovery?.symptoms || [];
        const proposals = assessment.recovery?.proposals || [];
        for (let i = 0; i < proposals.length; i += 1) {
          const proposal = proposeOnly(proposals[i]);
          const symptom = symptoms[i] ?? symptoms[0] ?? null;

          let raid = null;
          try {
            raid = await Promise.resolve(raidFn({ symptom, proposal, packet, assessment })).catch(() => null);
          } catch {
            // best-effort
          }

          const payload = { symptom, proposal, packet, assessment, raid };
          await Promise.resolve(alertFn(payload)).catch(() => {});
          if (!alert) alert = payload;
          entry.lastAlert = current;
        }
      }

      return {
        packet,
        assessment,
        alert,
        deduped,
        occurrenceCount: entry.occurrenceCount,
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  function getStatus() {
    return {
      storePath: store.path,
      recent: store.tail(20),
      dedupSize: dedup.size,
    };
  }

  function recordObserved(identity, output, opts = {}) {
    const packet = apm.recordObserved(identity, output, { ...opts, mode: 'observed' });
    store.append('fingerprint', packet);
    return packet;
  }

  return { ingestCrash, getStatus, recordObserved };
}

export function getSubtletyRuntime(opts = {}) {
  if (!singleton) {
    const path = process.env.SUBTLETY_RESONANCE_PATH
      || nodePath.join(process.cwd(), 'codex/server/data/subtlety-resonance.jsonl');
    const store = opts.store || createResonanceStore({ path, now: opts.now });
    singleton = createSubtletyRuntime({ ...opts, store });
  }
  return singleton;
}
