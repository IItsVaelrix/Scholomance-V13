import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sha256Hex } from '../core/pixelbrain/sha256.js';

const REPORT_NAME = /^APM-\d{4}-\d{2}-\d{2}-\d{4}-UTC[+-]\d{4}\.md$/u;

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

  return {
    readLedgerSnapshot,
    listReportFilenames,
    publish,
    ledgerPath,
    reportDir,
  };
}
