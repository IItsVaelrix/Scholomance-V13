#!/usr/bin/env node
/**
 * CLERI GATE — adjudicate a Cleri probe report through the Semantic Calculus.
 *
 *   npm run cleri:probe -- investigate "..." --format json --output /tmp/r.json
 *   npx tsx scripts/cleri-gate.mjs /tmp/r.json
 *
 *   ...or straight through a pipe:
 *   npm run cleri:probe -- investigate "..." --format json | npx tsx scripts/cleri-gate.mjs
 *
 * WHY THIS IS A SEPARATE TOOL, NOT A FLAG ON THE PROBE
 *
 * The calculus lives in TypeScript, so importing it forces the whole CLI onto
 * tsx: measured 295ms → 1320ms, a 4.5x startup tax on an interactive
 * investigation workbench. Paying that to import three functions would be a bad
 * trade.
 *
 * It is also the more honest separation. The calculus adjudicates RESULTS; it
 * takes no part in producing them. The probe gathers evidence and says what it
 * verified. This says what that warrants — and, more importantly, what it does
 * not.
 *
 * THE THING THIS EXISTS TO CATCH
 *
 * render-human.js prints a bare "NO VERIFIED FINDINGS" header whenever coverage
 * is complete. Read quickly, that is a clean bill of health. It is not: the
 * probe is trustworthy but narrow, so silence means "these verifier families
 * proved nothing over the retrieved candidates" and never "there is nothing
 * here". This gate types that as a Theory — nothing bound, method absent, no
 * warrants present — so the absence claim cannot be mistaken for a finding.
 */
import { readFileSync } from 'node:fs';
import {
  adjudicateCleri,
  formatCleriGate,
} from '../codex/core/pixelbrain/calibration/cleri-gate.js';

const path = process.argv.slice(2).find((a) => !a.startsWith('--'));

function readInput() {
  if (path) return readFileSync(path, 'utf8');
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const raw = readInput().trim();
if (!raw) {
  console.error(
    'usage: npx tsx scripts/cleri-gate.mjs <report.json>\n' +
      '   or: npm run cleri:probe -- investigate "..." --format json | npx tsx scripts/cleri-gate.mjs',
  );
  process.exit(2);
}

let report;
try {
  report = JSON.parse(raw);
} catch (err) {
  console.error(`cleri-gate: input is not JSON (${err.message})`);
  console.error('Did you forget --format json?');
  process.exit(2);
}

const coverage = report.coverage ?? {};
const adjudication = adjudicateCleri({
  findings: report.findings ?? [],
  verifierFamilies: (report.plan?.selectedVerifiers ?? []).length,
  candidatesConsidered: (coverage.analyzedPaths ?? []).length,
  retrievalLimit: report.plan?.retrievalLimit ?? null,
  coverageComplete: coverage.complete === true,
  planSupported: report.plan?.supported ?? null,
  reasonCode: report.plan?.reasonCode ?? null,
});

console.log('\n═══ CLERI GATE — what this report warrants ═══\n');
if (report.status) console.log(`  probe status: ${report.status}`);
if (coverage.complete !== undefined) console.log(`  coverage complete: ${coverage.complete}`);
console.log('');
console.log(formatCleriGate(adjudication));
console.log('');

// A Theory verdict is not a failure of the run; it is the run declining to
// claim absence. Exit 0. Exit non-zero only when findings exist and lack the
// receipts that would make them actionable.
const unwarranted = adjudication.findings > 0 && adjudication.withReceipts < adjudication.findings;
process.exit(unwarranted ? 1 : 0);
