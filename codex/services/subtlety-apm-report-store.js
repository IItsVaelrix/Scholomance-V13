import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sha256Hex } from '../core/pixelbrain/sha256.js';

const HOURLY_NAME = /^APM-\d{4}-\d{2}-\d{2}-\d{4}-UTC[+-]\d{4}\.md$/u;
const DIGEST_NAME = /^APM-BACKLOG-\d{4}-\d{2}-\d{2}-\d{4}-to-\d{4}-\d{2}-\d{2}-\d{4}-UTC[+-]\d{4}\.md$/u;
const REPORT_NAME = new RegExp(`(?:${HOURLY_NAME.source})|(?:${DIGEST_NAME.source})`, 'u');

export function createSubtletyApmReportStore({
  ledgerPath,
  reportDir,
  fsApi = fs,
} = {}) {
  if (!ledgerPath) {
    throw new TypeError('createSubtletyApmReportStore requires ledgerPath');
  }
  if (!reportDir) {
    throw new TypeError('createSubtletyApmReportStore requires reportDir');
  }

  async function readLedgerSnapshot() {
    return fsApi.readFile(ledgerPath, 'utf8');
  }

  async function listReportFilenames() {
    try {
      return (await fsApi.readdir(reportDir))
        .filter((name) => REPORT_NAME.test(name))
        .sort();
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function publish({ filename, markdown }) {
    if (!REPORT_NAME.test(filename)) {
      throw new TypeError('invalid APM report filename');
    }
    await fsApi.mkdir(reportDir, { recursive: true });
    const target = join(reportDir, filename);
    const temporary = join(
      reportDir,
      `.${filename}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await fsApi.open(temporary, 'wx', 0o600);
      await handle.writeFile(markdown, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      try {
        await fsApi.link(temporary, target);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const existing = await fsApi.readFile(target, 'utf8');
        if (existing === markdown) {
          return { status: 'identical', path: target };
        }
        return {
          status: 'conflict',
          path: target,
          existingChecksum: sha256Hex(existing),
          incomingChecksum: sha256Hex(markdown),
        };
      }
      return { status: 'published', path: target };
    } finally {
      await handle?.close().catch(() => {});
      await fsApi.unlink(temporary).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }

  /**
   * COVERAGE WATERMARK — the last window end already accounted for.
   *
   * The reporter was designed stateless: "report existence plus ledger history
   * is the only authority". That holds only where reports persist. In
   * production the ledger lives on the Fly volume while reportDir defaulted to
   * an ephemeral container path, so every boot saw zero reports, replayed every
   * elapsed hour, and OOM-killed the machine.
   *
   * The watermark restores the missing half: it sits BESIDE THE LEDGER, so it
   * shares the ledger's durability by construction and cannot drift onto
   * different storage the way reportDir did.
   */
  const watermarkPath = `${ledgerPath}.apm-watermark`;

  async function readWatermarkMs() {
    try {
      const raw = await fsApi.readFile(watermarkPath, 'utf8');
      const value = Number.parseInt(String(raw).trim(), 10);
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function writeWatermarkMs(endMs) {
    if (!Number.isFinite(endMs)) throw new TypeError('watermark must be a finite epoch ms');
    // Write-then-rename: a torn watermark would silently re-replay or skip hours.
    const temporary = `${watermarkPath}.${process.pid}.${randomUUID()}.tmp`;
    await fsApi.writeFile(temporary, `${endMs}\n`, 'utf8');
    try {
      await fsApi.rename(temporary, watermarkPath);
    } catch (error) {
      await fsApi.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  return {
    readLedgerSnapshot,
    listReportFilenames,
    publish,
    readWatermarkMs,
    writeWatermarkMs,
    ledgerPath,
    reportDir,
    watermarkPath,
  };
}
