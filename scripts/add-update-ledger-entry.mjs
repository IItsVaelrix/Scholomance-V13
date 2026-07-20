#!/usr/bin/env node
/**
 * Interactive CLI: prepend a curated entry to src/data/update-ledger.json.
 * Atomic write via .tmp + rename. Fail closed on corrupt JSON (no overwrite).
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createLedgerEntry,
  prependLedgerEntry,
  serializeLedger,
  parseExistingLedger,
} from './lib/update-ledger-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(__dirname, '../src/data/update-ledger.json');

/**
 * @param {string[]} argv
 * @returns {string | null}
 */
function parseDateFlag(argv) {
  const idx = argv.indexOf('--date');
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value || value.startsWith('--')) {
    console.error('Usage: --date YYYY-MM-DD');
    process.exit(1);
  }
  return value;
}

/**
 * Local calendar date as YYYY-MM-DD.
 * @returns {string}
 */
function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {import('node:readline/promises').Interface} rl
 * @param {string} question
 * @returns {Promise<string>}
 */
async function prompt(rl, question) {
  const answer = await rl.question(question);
  return answer ?? '';
}

async function main() {
  const dateFromFlag = parseDateFlag(process.argv.slice(2));
  const rl = createInterface({ input, output });

  try {
    const title = await prompt(rl, 'Title: ');
    const summary = await prompt(rl, 'Summary: ');
    let date = dateFromFlag;
    if (!date) {
      const defaultDate = todayLocalIsoDate();
      const answered = await prompt(rl, `Date [${defaultDate}]: `);
      date = answered.trim() || defaultDate;
    }

    const created = createLedgerEntry({ title, summary, date });
    if (!created.ok) {
      console.error(created.error);
      process.exit(1);
    }

    let source;
    try {
      source = await readFile(LEDGER_PATH, 'utf8');
    } catch (err) {
      console.error(`Failed to read ${LEDGER_PATH}: ${err.message}`);
      process.exit(1);
    }

    const parsed = parseExistingLedger(source);
    if (!parsed.ok) {
      console.error(`Corrupt ledger — refusing to write: ${parsed.error}`);
      process.exit(1);
    }

    const prepended = prependLedgerEntry({
      existingEntries: parsed.entries,
      entry: created.entry,
    });
    if (!prepended.ok) {
      console.error(prepended.error);
      process.exit(1);
    }

    const payload = serializeLedger(prepended.entries);
    const tmpPath = `${LEDGER_PATH}.tmp`;

    try {
      await writeFile(tmpPath, payload, 'utf8');
      await rename(tmpPath, LEDGER_PATH);
    } catch (err) {
      try {
        await unlink(tmpPath);
      } catch {
        // ignore cleanup failures
      }
      console.error(`Failed to write ledger: ${err.message}`);
      process.exit(1);
    }

    console.log(`Prepended ${created.entry.id}`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
