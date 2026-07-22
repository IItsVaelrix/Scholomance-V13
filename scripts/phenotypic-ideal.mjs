#!/usr/bin/env node
/**
 * Phenotypic Idealism compose CLI
 *
 * npm run phenotypic:ideal -- "<query>" [--scope repo|divtube] [--json out.json] [--hits-json path]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePhenotypicIdeal } from './lib/phenotypic-ideal-compose.mjs';

const __filename = fileURLToPath(import.meta.url);

function usage(code = 1) {
  console.error(`Usage: node scripts/phenotypic-ideal.mjs "<query>" [--scope repo|divtube] [--json out.json] [--hits-json file] [--allow-empty-index]`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { query: '', scope: 'repo', jsonOut: null, hitsJson: null, allowEmptyIndex: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') out.scope = argv[++i] || 'repo';
    else if (a === '--json') out.jsonOut = argv[++i] || null;
    else if (a === '--hits-json') out.hitsJson = argv[++i] || null;
    else if (a === '--allow-empty-index') out.allowEmptyIndex = true;
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      usage(1);
    } else rest.push(a);
  }
  out.query = rest.join(' ').trim();
  if (!out.query) usage(1);
  if (out.scope !== 'repo' && out.scope !== 'divtube') {
    console.error('--scope must be repo or divtube');
    process.exit(2);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const packet = await composePhenotypicIdeal({
      query: args.query,
      scope: args.scope,
      hitsJson: args.hitsJson,
      allowEmptyIndex: args.allowEmptyIndex,
    });
    const text = JSON.stringify(packet, null, 2);
    if (args.jsonOut) {
      fs.writeFileSync(path.resolve(args.jsonOut), text + '\n', 'utf8');
    }
    console.log(text);
  } catch (err) {
    const payload = { error: err.message || String(err) };
    if (err.hint) payload.hint = err.hint;
    if (err.details) payload.details = err.details;
    console.error(JSON.stringify(payload));
    process.exit(err.code === 'EMPTY_INDEX' || err.code === 'SEARCH_FAILED' ? 3 : 1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message || String(err) }));
  process.exit(1);
});
