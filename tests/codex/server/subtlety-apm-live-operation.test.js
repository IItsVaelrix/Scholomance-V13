/* @vitest-environment node */
import { existsSync } from 'node:fs';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../../codex/core/pixelbrain/canonical-json.js';
import { sha256Hex } from '../../../codex/core/pixelbrain/sha256.js';
import { replayLedger } from '../../../scripts/replay-subtlety-apm-hourly-reports.mjs';
import { captureState, verifyLive } from '../../../scripts/verify-subtlety-apm-live-operation.mjs';

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

describe('Subtlety APM live restart proof (two-phase)', () => {
  let dir;
  let ledgerPath;
  let reportDir;
  let statePath;
  let evidencePath;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'apm-live-proof-'));
    ledgerPath = join(dir, 'ledger.jsonl');
    reportDir = join(dir, 'reports');
    statePath = join(dir, 'before-restart.json');
    evidencePath = join(dir, 'live-operation.json');
    const rows = [
      fingerprint('2026-07-20T14:15:00.000Z', 'crash.divtube.tui.live_unit'),
      fingerprint('2026-07-20T14:40:00.000Z', 'crash.divtube.tui.live_unit'),
    ];
    await writeFile(ledgerPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    // Compile the fixture ledger into one real report (recurrence within a
    // single completed EDT hour).
    await replayLedger({ ledgerPath, reportDir, testCommit: 'fixture' });
  });

  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it('captures before, verifies after a simulated restart, and writes STABLE_OPERATIONAL evidence', async () => {
    await captureState({ ledgerPath, reportDir, statePath });
    expect(existsSync(statePath)).toBe(true);

    const evidence = await verifyLive({ ledgerPath, reportDir, statePath, evidencePath });

    expect(evidence).toMatchObject({
      schema: 'PB-CONCEPT-CHEM-APM-LIVE-OPERATION-v1',
      state: 'STABLE_OPERATIONAL',
      byteIdenticalAfterRestart: true,
      duplicateCount: 1,
    });
    expect(evidence.reportFilename).toMatch(/^APM-.*\.md$/);
    expect(evidence.reportChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.ledgerChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(evidencePath)).toBe(true);
  });

  it('refuses to write evidence when the report is altered between capture and verify', async () => {
    await captureState({ ledgerPath, reportDir, statePath });

    const reportName = JSON.parse(await (await import('node:fs/promises')).readFile(statePath, 'utf8')).reportFilename;
    await appendFile(join(reportDir, reportName), 'tampered\n');

    await expect(verifyLive({ ledgerPath, reportDir, statePath, evidencePath }))
      .rejects.toThrow(/changed between capture and verify/);
    expect(existsSync(evidencePath)).toBe(false);
  });
});
