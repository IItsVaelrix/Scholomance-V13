/* @vitest-environment node */
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSubtletyApmReportStore } from '../../../codex/services/subtlety-apm-report-store.js';

const filename = 'APM-2026-08-03-1000-UTC-0400.md';

describe('Subtlety APM report store', () => {
  let dir;
  let ledgerPath;
  let reportDir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'apm-report-store-'));
    ledgerPath = join(dir, 'ledger.jsonl');
    reportDir = join(dir, 'reports');
    await fs.writeFile(ledgerPath, 'one\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads one byte-stable ledger snapshot', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });

    expect(await store.readLedgerSnapshot()).toBe('one\n');
  });

  it('publishes exclusively and treats identical content as idempotent', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });

    expect(await store.publish({ filename, markdown: 'body\n' })).toMatchObject({
      status: 'published',
    });
    expect(await store.publish({ filename, markdown: 'body\n' })).toMatchObject({
      status: 'identical',
    });
    expect(await fs.readFile(join(reportDir, filename), 'utf8')).toBe('body\n');
    expect(await store.listReportFilenames()).toEqual([filename]);
    expect((await fs.readdir(reportDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('returns a non-overwriting integrity conflict for divergent content', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });
    await store.publish({ filename, markdown: 'body\n' });

    const result = await store.publish({ filename, markdown: 'different\n' });

    expect(result.status).toBe('conflict');
    expect(result.existingChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.incomingChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.existingChecksum).not.toBe(result.incomingChecksum);
    expect(await fs.readFile(join(reportDir, filename), 'utf8')).toBe('body\n');
  });

  it('rejects path traversal before mutating the filesystem', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir });

    await expect(store.publish({ filename: '../escape.md', markdown: 'no' }))
      .rejects.toThrow('invalid APM report filename');
    await expect(fs.readdir(reportDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes the temporary file when exclusive publication is interrupted', async () => {
    const interruptedFs = {
      ...fs,
      link: async () => {
        throw Object.assign(new Error('interrupted'), { code: 'EIO' });
      },
    };
    const store = createSubtletyApmReportStore({
      ledgerPath,
      reportDir,
      fsApi: interruptedFs,
    });

    await expect(store.publish({ filename, markdown: 'body\n' }))
      .rejects.toMatchObject({ code: 'EIO' });
    expect((await fs.readdir(reportDir)).filter((name) => name.endsWith('.md'))).toEqual([]);
    expect((await fs.readdir(reportDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
