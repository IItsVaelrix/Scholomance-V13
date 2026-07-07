#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { runForgeCraftGate } from '../codex/core/pixelbrain/forge-craft-gate.js';
import { parseSilhouetteBlueprint } from '../codex/core/pixelbrain/silhouette-blueprint.js';

const specPath = process.argv[2];
if (!specPath || specPath.startsWith('--')) {
  console.error('Usage: node scripts/pixelbrain-forge-gate.mjs <spec.json> [--blueprint <file.silh>]');
  process.exit(1);
}

try {
  const blueprintIndex = process.argv.indexOf('--blueprint');
  const blueprint = blueprintIndex === -1
    ? null
    : parseSilhouetteBlueprint(readFileSync(resolve(process.argv[blueprintIndex + 1]), 'utf8'));
  const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
  const result = runForgeCraftGate(spec, blueprint ? { blueprint } : {});

  if (result.ok) {
    console.log(result.vaccine);
    process.exit(0);
  } else {
    console.error('Unknown gate failure: result.ok is false but no exception was thrown.');
    process.exit(1);
  }
} catch (error) {
  if (error.bytecode && error.bytecode.startsWith('PB-ERR')) {
    console.error(error.bytecode);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
