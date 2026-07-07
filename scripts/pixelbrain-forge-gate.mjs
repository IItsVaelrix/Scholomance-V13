#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { runForgeCraftGate } from '../codex/core/pixelbrain/forge-craft-gate.js';
import { parseSilhouetteBlueprint } from '../codex/core/pixelbrain/silhouette-blueprint.js';

function usage() {
  return [
    'Usage: node scripts/pixelbrain-forge-gate.mjs <spec.json> [--strict] [--json] [--finish] [--blueprint <file.silh>]',
    '',
    'Options:',
    '  --strict              Run blocking craft audits (default).',
    '  --json                Print PixelBrainCraftGateReport JSON.',
    '  --finish              Apply the default directional finish light when the spec has no light.',
    '  --blueprint <path>    Audit against a sealed PB-SILH-BLUEPRINT-v1 .silh file.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  const opts = {
    strict: true,
    json: args.includes('--json'),
    finish: args.includes('--finish'),
    blueprintPath: null,
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--strict' || arg === '--json' || arg === '--finish') continue;
    if (arg === '--blueprint') {
      opts.blueprintPath = args[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  return { specPath: positional[0] || null, opts };
}

function reportForJson(report) {
  const { bundle, errors, ok, vaccine, ...safe } = report;
  return safe;
}

try {
  const { specPath, opts } = parseArgs(process.argv.slice(2));
  if (!specPath) {
    console.error(usage());
    process.exit(1);
  }
  if (opts.blueprintPath == null && process.argv.includes('--blueprint')) {
    console.error('Missing value for --blueprint');
    process.exit(1);
  }

  const blueprint = opts.blueprintPath
    ? parseSilhouetteBlueprint(readFileSync(resolve(opts.blueprintPath), 'utf8'))
    : null;
  const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
  const report = runForgeCraftGate(spec, {
    strict: opts.strict,
    finish: opts.finish,
    blueprint,
    sourcePath: specPath,
    throwOnFail: false,
  });

  if (opts.json) {
    console.log(JSON.stringify(reportForJson(report), null, 2));
  } else if (report.ok) {
    console.log(report.vaccine);
  } else {
    for (const bytecode of report.bytecodeErrors) console.error(bytecode);
  }

  process.exit(report.ok ? 0 : 1);
} catch (error) {
  if (error.bytecode && error.bytecode.startsWith('PB-ERR')) {
    console.error(error.bytecode);
    process.exit(1);
  }
  console.error(error.message || error);
  process.exit(1);
}
