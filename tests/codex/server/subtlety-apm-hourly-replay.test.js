/* @vitest-environment node */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../../codex/core/pixelbrain/canonical-json.js';
import { sha256Hex } from '../../../codex/core/pixelbrain/sha256.js';
import { replayLedger } from '../../../scripts/replay-subtlety-apm-hourly-reports.mjs';

const previousTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

function seal(body) {
  return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
}

function fingerprint(at, unitId) {
  const context = {
    schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1',
    runtime: 'divtube-tui',
    errorType: 'NoActiveAppError',
    message: 'boom',
    topFrame: 'app.js:42',
    thread: 'Thread-1',
  };
  const payload = seal({
    schema: 'SUBTLETY-FINGERPRINT-v1',
    identity: { unitId, runtimeProfile: context.runtime },
    execution: { runtimeProfile: context.runtime, buildId: 'b1' },
    fingerprint: { emits: [`thread.crash.${context.errorType}`] },
  });
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v2',
    recordedAt: at,
    kind: 'fingerprint',
    payload,
    context,
  });
}

const productionReportDir = resolve(process.cwd(), 'divtube_downloader', 'APM-Hourly-Reports');

describe('isolated real-ledger replay', () => {
  let dir;
  let ledgerPath;
  let reportDir;
  let productionBefore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'apm-replay-'));
    ledgerPath = join(dir, 'ledger.jsonl');
    reportDir = join(dir, 'reports');
    productionBefore = await readdir(productionReportDir).catch(() => []);
  });

  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it('replays a fixture ledger twice into the temp dir and never into production', async () => {
    // Same identity across two completed EDT hours: recurrence must grow.
    const rows = [
      fingerprint('2026-07-20T14:15:00.000Z', 'crash.divtube.tui.replay_unit'),
      fingerprint('2026-07-20T14:40:00.000Z', 'crash.divtube.tui.replay_unit'),
      fingerprint('2026-07-20T15:10:00.000Z', 'crash.divtube.tui.replay_unit'),
    ];
    await writeFile(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

    const manifest = await replayLedger({ ledgerPath, reportDir, testCommit: '0123456789abcdef' });

    expect(manifest).toMatchObject({
      schema: 'PB-CONCEPT-CHEM-APM-IMPLEMENTATION-REPLAY-v1',
      state: 'IMPLEMENTED_METASTABLE',
      sourceUnchanged: true,
      secondPassByteIdentical: true,
      recurrenceGrowthObserved: true,
      testCommit: '0123456789abcdef',
    });
    expect(manifest.reports.length).toBeGreaterThan(0);
    expect(manifest.sourceChecksum).toBe(sha256Hex(await (await import('node:fs/promises')).readFile(ledgerPath, 'utf8')));

    // The guard is "the replay wrote nothing into production", NOT "production
    // is empty" — the live reporter legitimately fills this directory, so an
    // emptiness assertion would break precisely when the APM starts working.
    expect(await readdir(productionReportDir).catch(() => [])).toEqual(productionBefore);
  });

  it('reports no recurrence growth for a single-occurrence ledger', async () => {
    const rows = [fingerprint('2026-07-20T14:15:00.000Z', 'crash.divtube.tui.lonely_unit')];
    await writeFile(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

    const manifest = await replayLedger({ ledgerPath, reportDir, testCommit: '0123456789abcdef' });

    expect(manifest.sourceUnchanged).toBe(true);
    expect(manifest.secondPassByteIdentical).toBe(true);
    expect(manifest.recurrenceGrowthObserved).toBe(false);
    expect(manifest.reports).toHaveLength(1);
  });
});
