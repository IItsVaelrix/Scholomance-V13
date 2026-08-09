#!/usr/bin/env node
/**
 * deny — record a refusal at the moment of refusal.
 *
 *   node scripts/deny.mjs "<idea>" --mechanism "<what dies>" --evidence "<how known>" \
 *                          --grounds measured|architectural|judgement [--scope "<files>"] \
 *                          [--unbinds-if "<condition>"] [--proposer <who>]
 *
 *   node scripts/deny.mjs --check "<a proposal>"    prior denials that may collide
 *   node scripts/deny.mjs --list [--all]            the record
 *   node scripts/deny.mjs --verify                  recompute every checksum
 *   node scripts/deny.mjs --retire DENY-0007 --evidence "..." --mechanism "..."
 *
 * The point is `--mechanism`. An idea recorded by its NAME cannot be matched
 * against a restatement; an idea recorded by WHAT KILLED IT can.
 *
 * `--grounds judgement` is a first-class answer. Most denials are judgement,
 * and marking one MEASURED because it feels obvious lends it authority it did
 * not earn. See LBL-004: a low score was not a denial either.
 */

import {
  appendDenial,
  readDenials,
  verifyDenials,
  check,
  retirements,
  GROUNDS,
  DEFAULT_DENIALS_PATH,
} from '../codex/core/pixelbrain/calibration/denial-store.js';

const argv = process.argv.slice(2);

/** Flags that are booleans; every other `--x` consumes the next token as its value. */
const BOOLEAN_FLAGS = new Set(['all', 'list', 'verify', 'help']);

function flag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`--${name} requires a value`);
  }
  return next;
}

function has(name) {
  return argv.includes(`--${name}`);
}

/** Everything that is neither a flag nor a flag's value. */
function positionals() {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      if (!BOOLEAN_FLAGS.has(tok.slice(2))) i++; // skip this flag's value
      continue;
    }
    out.push(tok);
  }
  return out;
}

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function usage() {
  console.log(`
${BOLD}deny${RESET} — record a refusal so it can be cited, checked and retired.

  ${BOLD}record${RESET}
    node scripts/deny.mjs "<idea>" \\
      --mechanism  "what specifically dies"        ${DIM}(required)${RESET}
      --evidence   "how it was known"              ${DIM}(required)${RESET}
      --grounds    measured|architectural|judgement ${DIM}(required)${RESET}
      --scope      "files/module/commit"            ${DIM}(required unless judgement)${RESET}
      --unbinds-if "what would retire this denial"  ${DIM}(optional, recommended)${RESET}
      --proposer   vaelrix|claude|codex|gemini      ${DIM}(optional)${RESET}

  ${BOLD}read${RESET}
    node scripts/deny.mjs --check "<a proposal>"   prior denials that may collide
    node scripts/deny.mjs --list [--all]
    node scripts/deny.mjs --verify

  ${BOLD}reverse${RESET}
    node scripts/deny.mjs --retire DENY-0007 --mechanism "..." --evidence "..."
      ${DIM}A denial that turns out wrong is retired by a NEW row, never deleted.${RESET}

  ledger: ${DEFAULT_DENIALS_PATH}
`);
}

function printRow(row, { full = false, retired } = {}) {
  const retiredBy = (retired ?? retirements()).get(row.id);
  const mark = retiredBy ? `${DIM}[retired by ${retiredBy.id}]${RESET}` : '';
  console.log(`  ${BOLD}${row.id}${RESET}  ${row.date}  ${DIM}${row.grounds}${RESET} ${mark}`);
  console.log(`    ${row.idea}`);
  console.log(`    ${DIM}dies on:${RESET} ${row.mechanism}`);
  if (full) {
    console.log(`    ${DIM}evidence:${RESET} ${row.evidence}`);
    if (row.scope) console.log(`    ${DIM}scope:${RESET}    ${row.scope}`);
    console.log(`    ${DIM}unbinds:${RESET}  ${row.unbindsIf ?? '— not stated —'}`);
    console.log(`    ${DIM}proposer:${RESET} ${row.proposer}   ${DIM}${row.checksum}${RESET}`);
  }
  console.log('');
}

try {
  // ── --check ───────────────────────────────────────────────────────────
  const probe = flag('check');
  if (probe !== undefined) {
    const { searched, candidates } = check(probe);
    console.log(`\n═══ PRIOR DENIALS THAT MAY COLLIDE ═══\n`);
    if (searched === 0) {
      console.log('  The ledger is empty. Nothing has been recorded yet — this is not');
      console.log('  evidence that the idea is new.\n');
      process.exit(0);
    }
    if (candidates.length === 0) {
      console.log(`  No lexical match across ${searched} denials.\n`);
    } else {
      for (const c of candidates.slice(0, 5)) {
        console.log(`  ${DIM}overlap ${c.overlap.toFixed(3)} · shared: ${c.shared.slice(0, 8).join(', ')}${RESET}`);
        printRow(c.row, { full: true });
      }
    }
    console.log(`  ${BOLD}This is retrieval, not a verdict.${RESET}`);
    console.log('  Lexical overlap cannot detect a restatement that shares no vocabulary —');
    console.log('  that is exactly how `melanin` survived an hour after the idea it restated');
    console.log('  was denied. Read the mechanisms above and decide whether one is yours.\n');
    process.exit(0);
  }

  // ── --verify ──────────────────────────────────────────────────────────
  if (has('verify')) {
    const { total, tampered } = verifyDenials();
    console.log(`\n═══ VERIFY ═══\n`);
    console.log(`  ${total} rows`);
    if (tampered.length === 0) {
      console.log(`  every checksum matches its content\n`);
    } else {
      console.log(`  ${BOLD}${tampered.length} ROW(S) EDITED AFTER WRITING${RESET}\n`);
      for (const t of tampered) {
        console.log(`    ${t.id}  recorded ${t.recorded}  recomputed ${t.recomputed}`);
      }
      console.log('');
      process.exit(1);
    }
    process.exit(0);
  }

  // ── --list ────────────────────────────────────────────────────────────
  if (has('list') || argv.length === 0) {
    if (argv.length === 0) {
      usage();
      process.exit(0);
    }
    const rows = readDenials();
    const retired = retirements();
    console.log(`\n═══ DENIAL LEDGER ═══\n`);
    if (rows.length === 0) {
      console.log('  empty — no denials recorded yet\n');
      process.exit(0);
    }
    const live = rows.filter((r) => !r.retires && !retired.has(r.id));
    const byGrounds = Object.fromEntries(
      GROUNDS.map((g) => [g, rows.filter((r) => r.grounds === g && !r.retires).length]),
    );
    console.log(`  ${rows.length} rows · ${live.length} live · ${retired.size} retired`);
    console.log(
      `  ${GROUNDS.map((g) => `${g.toLowerCase()} ${byGrounds[g]}`).join(' · ')}\n`,
    );
    for (const row of rows) {
      if (row.retires && !has('all')) continue;
      printRow(row, { full: has('all'), retired });
    }
    process.exit(0);
  }

  // ── --retire ──────────────────────────────────────────────────────────
  const retireTarget = flag('retire');
  if (retireTarget !== undefined) {
    const row = appendDenial({
      idea: `RETIRES ${retireTarget}`,
      mechanism: flag('mechanism'),
      evidence: flag('evidence'),
      grounds: flag('grounds') ?? 'JUDGEMENT',
      scope: flag('scope'),
      proposer: flag('proposer'),
      retires: retireTarget,
    });
    console.log(`\n  ${BOLD}${row.id}${RESET} retires ${retireTarget}  ${DIM}${row.checksum}${RESET}`);
    console.log(`  The original row stays in the ledger. The reversal is now part of it.\n`);
    process.exit(0);
  }

  // ── record a denial ───────────────────────────────────────────────────
  const [idea] = positionals();
  if (idea === undefined) {
    throw new Error('the idea being denied must be the first positional argument (quote it)');
  }
  const row = appendDenial({
    idea,
    mechanism: flag('mechanism'),
    evidence: flag('evidence'),
    grounds: flag('grounds'),
    scope: flag('scope'),
    unbindsIf: flag('unbinds-if'),
    proposer: flag('proposer'),
  });

  console.log(`\n  ${BOLD}${row.id}${RESET} recorded  ${DIM}${row.checksum}${RESET}\n`);
  printRow(row, { full: true });
  if (!row.unbindsIf) {
    console.log(`  ${DIM}No --unbinds-if given. This denial has no stated expiry, so a later`);
    console.log(`  reader cannot tell whether it still binds. Consider adding one.${RESET}\n`);
  }
} catch (err) {
  console.error(`\n  ${BOLD}refused:${RESET} ${err.message}\n`);
  process.exit(1);
}
