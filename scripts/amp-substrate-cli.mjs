#!/usr/bin/env node
/**
 * AMP Activation Substrate CLI
 *
 *   npm run amps -- register <record.json>   # register a PB-AMP-RELEVANCE-v1 record
 *   npm run amps -- register-pilots          # register every record in pilot-relevance/
 *   npm run amps -- list                     # what is registered
 *   npm run amps -- select <spec.json>       # which AMPs this spec activates (and why not, for the rest)
 *   npm run amps -- stats                    # counts + most-activated amp
 *   npm run amps -- log [--limit N]          # recent activation decisions
 *
 * The CLI is the only sanctioned write path into the substrate — which is what
 * keeps the table inspectable and diffable rather than something a forge quietly
 * mutates mid-run.
 *
 * Database path: $AMP_SUBSTRATE_DB, else codex/core/pixelbrain/amp-substrate/amp-substrate.sqlite
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  openAmpSubstrate,
  registerAmpRelevance,
  listAmpRelevance,
  readActivationLog,
  substrateStats,
} from '../codex/core/pixelbrain/amp-substrate/amp-substrate.db.js';
import { selectAndLog } from '../codex/core/pixelbrain/amp-substrate/amp-selector.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBSTRATE_DIR = resolve(HERE, '../codex/core/pixelbrain/amp-substrate');
const DEFAULT_DB = join(SUBSTRATE_DIR, 'amp-substrate.sqlite');
const PILOT_DIR = join(SUBSTRATE_DIR, 'pilot-relevance');

function dbPath() {
  return process.env.AMP_SUBSTRATE_DB || DEFAULT_DB;
}

function printUsage() {
  console.log(`
AMP Activation Substrate CLI

Usage:
  npm run amps -- register <record.json>   Register one PB-AMP-RELEVANCE-v1 record
  npm run amps -- register-pilots          Register every record in pilot-relevance/
  npm run amps -- list                     List registered relevance records
  npm run amps -- select <spec.json>       Show which AMPs a spec activates
  npm run amps -- stats                    Registered/activation counts
  npm run amps -- log [--limit N]          Recent activation decisions
  npm run amps -- help

Database: ${dbPath()}
Override with AMP_SUBSTRATE_DB=<path>.
`);
}

function readJson(path) {
  const resolved = resolve(process.cwd(), path);
  if (!existsSync(resolved)) {
    console.error(`[AMP] file not found: ${resolved}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err) {
    console.error(`[AMP] ${basename(resolved)} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

/** A refusal from the substrate is data, not a stack trace — print it as such. */
function reportRegistrationFailure(label, err) {
  console.error(`[AMP] refused ${label}`);
  const detail = typeof err?.toJSON === 'function' ? err.toJSON() : null;
  const errors = detail?.context?.errors ?? err?.context?.errors ?? null;
  if (Array.isArray(errors)) for (const line of errors) console.error(`       - ${line}`);
  else console.error(`       ${err?.message || String(err)}`);
  if (err?.bytecode) console.error(`       bytecode: ${err.bytecode}`);
}

async function cmdRegister(db, file) {
  if (!file) { console.error('[AMP] register: missing <record.json>'); process.exit(1); }
  const record = readJson(file);
  try {
    const { ampId, checksum } = await registerAmpRelevance(db, record);
    console.log(`[AMP] registered ${ampId}  ${checksum.slice(0, 12)}…`);
  } catch (err) {
    reportRegistrationFailure(basename(file), err);
    process.exit(1);
  }
}

async function cmdRegisterPilots(db) {
  if (!existsSync(PILOT_DIR)) {
    console.error(`[AMP] no pilot directory at ${PILOT_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) { console.error('[AMP] pilot-relevance/ has no .json records'); process.exit(1); }

  let failed = 0;
  for (const file of files) {
    const record = readJson(join(PILOT_DIR, file));
    try {
      const { ampId, checksum } = await registerAmpRelevance(db, record);
      console.log(`[AMP] registered ${ampId.padEnd(24)} ${checksum.slice(0, 12)}…`);
    } catch (err) {
      reportRegistrationFailure(file, err);
      failed += 1;
    }
  }
  console.log(`[AMP] ${files.length - failed}/${files.length} pilot records registered`);
  if (failed > 0) process.exit(1);
}

async function cmdList(db) {
  const rows = await listAmpRelevance(db);
  if (rows.length === 0) { console.log('[AMP] no relevance records registered'); return; }
  console.log(`[AMP] ${rows.length} registered record(s):\n`);
  for (const row of rows) {
    const clauses = JSON.parse(row.appliesToJson);
    const requires = JSON.parse(row.requiresJson);
    const gate = clauses.length === 0 ? 'always relevant' : clauses.map(describeClause).join(' AND ');
    console.log(`  ${row.ampId.padEnd(26)} v${row.version.padEnd(8)} ${row.checksum.slice(0, 8)}…`);
    console.log(`    when: ${gate}`);
    if (requires.length > 0) console.log(`    requires: ${requires.join(', ')}`);
  }
}

function describeClause(clause) {
  if (Array.isArray(clause?.anyOf)) return `(${clause.anyOf.map(describeClause).join(' OR ')})`;
  const value = Array.isArray(clause.value) ? `[${clause.value.join('|')}]` : clause.value;
  return `${clause.field} ${clause.op} ${value}`;
}

async function cmdSelect(db, file) {
  if (!file) { console.error('[AMP] select: missing <spec.json>'); process.exit(1); }
  const spec = readJson(file);
  const records = await listAmpRelevance(db);
  if (records.length === 0) {
    console.log('[AMP] no relevance records registered — nothing can activate. Run `register-pilots` first.');
    return;
  }

  const result = await selectAndLog(db, spec, records);
  console.log(`[AMP] spec ${basename(file)}  (${result.specChecksum.slice(0, 12)}…)`);
  console.log(`\n  ACTIVATED (${result.activated.length}):`);
  if (result.activated.length === 0) console.log('    (none)');
  for (const ampId of result.activated) console.log(`    ✦ ${ampId}`);
  console.log(`\n  DORMANT (${result.skipped.length}):`);
  for (const { ampId, reason } of result.skipped) console.log(`    · ${ampId.padEnd(26)} ${reason}`);
}

async function cmdStats(db) {
  const stats = await substrateStats(db);
  console.log(`[AMP] registered records : ${stats.registered}`);
  console.log(`[AMP] activation entries : ${stats.activations}`);
  console.log(`[AMP] most activated     : ${stats.mostActivated
    ? `${stats.mostActivated.ampId} (${stats.mostActivated.count}×)`
    : '(none yet)'}`);
}

async function cmdLog(db, args) {
  const flagIndex = args.indexOf('--limit');
  const limit = flagIndex !== -1 ? Number(args[flagIndex + 1]) || 20 : 20;
  const rows = await readActivationLog(db, limit);
  if (rows.length === 0) { console.log('[AMP] activation log is empty'); return; }
  for (const row of rows) {
    const activated = JSON.parse(row.activatedJson);
    console.log(`  #${String(row.id).padEnd(5)} ${row.createdAt}  spec ${row.specChecksum.slice(0, 12)}…  →  ${activated.length ? activated.join(', ') : '(none)'}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') { printUsage(); return; }

  const known = ['register', 'register-pilots', 'list', 'select', 'stats', 'log'];
  if (!known.includes(cmd)) {
    console.error(`[AMP] unknown command '${cmd}'`);
    printUsage();
    process.exit(1);
  }

  const db = await openAmpSubstrate(dbPath());
  try {
    if (cmd === 'register') await cmdRegister(db, args[1]);
    else if (cmd === 'register-pilots') await cmdRegisterPilots(db);
    else if (cmd === 'list') await cmdList(db);
    else if (cmd === 'select') await cmdSelect(db, args[1]);
    else if (cmd === 'stats') await cmdStats(db);
    else if (cmd === 'log') await cmdLog(db, args);
  } finally {
    await db.close();
  }
}

main();
