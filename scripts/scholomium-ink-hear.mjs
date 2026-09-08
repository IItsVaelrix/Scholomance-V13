#!/usr/bin/env node
/**
 * Scholomium Ink — Lawyer Hearing CLI
 *
 * Usage:
 *   node scripts/scholomium-ink-hear.mjs --family oak [--mode canonical|laboratory]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conductSCD128Hearing } from '../codex/core/pixelbrain/scholomium-ink/scd128/counsel/counsel.js';
import { treeCounselPolicy } from '../codex/core/pixelbrain/scholomium-ink/families/tree/tree-counsel.policy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_ROOT = resolve(__dirname, '..', 'assets', 'ASSETS', 'scholomium-ink', 'trees');

export function runHearingCli(family = 'oak', mode = 'canonical') {
  const familyDir = resolve(ASSETS_ROOT, family);
  const formPath = resolve(familyDir, 'form64.json');
  const realPath = resolve(familyDir, 'realization64.json');

  if (!existsSync(formPath) || !existsSync(realPath)) {
    throw new Error(`Master files for family '${family}' not found. Build corpus first.`);
  }

  const form = JSON.parse(readFileSync(formPath, 'utf8'));
  const realization = JSON.parse(readFileSync(realPath, 'utf8'));

  const result = conductSCD128Hearing({
    form,
    realization,
    policy: treeCounselPolicy,
    mode,
  });

  return result;
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('scholomium-ink-hear.mjs')) {
  const args = process.argv.slice(2);
  const familyIdx = args.indexOf('--family');
  const family = familyIdx !== -1 && args[familyIdx + 1] ? args[familyIdx + 1] : 'oak';
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx !== -1 && args[modeIdx + 1] ? args[modeIdx + 1] : 'canonical';

  console.log(`Convening SCD128 Lawyer hearing for family: '${family}' (mode: ${mode})...`);
  const hearing = runHearingCli(family, mode);
  console.log('Verdict:', hearing.receipt.verdict);
  console.log('Checksum128:', hearing.receipt.checksum128);
  console.log('Satisfied Rules:', hearing.receipt.satisfiedRules);
  console.log('Conflicts:', hearing.receipt.conflicts);
  console.log('Directives:', hearing.receipt.projectionDirectives.length);
}
