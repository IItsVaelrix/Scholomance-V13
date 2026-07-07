#!/usr/bin/env node
import process from 'node:process';

import {
  PIPELINE_CORPUS_CASE_IDS,
  runPixelBrainPipelineCorpus,
} from '../codex/core/pixelbrain/pipeline-golden-corpus.js';

function usage() {
  return [
    'Usage: node scripts/pixelbrain-pipeline-corpus.mjs [--json] [--case <case-id>]',
    '',
    'Options:',
    '  --json          Print PixelBrainPipelineCorpusReport JSON.',
    '  --case <id>     Run one stable corpus case ID.',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { json: argv.includes('--json'), caseIds: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') continue;
    if (arg === '--case') {
      const id = argv[index + 1];
      if (!id) throw new Error('Missing value for --case');
      opts.caseIds = [id];
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true, opts };
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
  }
  return { help: false, opts };
}

try {
  const { help, opts } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(usage());
    process.exit(0);
  }
  if (opts.caseIds && !PIPELINE_CORPUS_CASE_IDS.includes(opts.caseIds[0])) {
    throw new Error(`Unknown case: ${opts.caseIds[0]}`);
  }

  const report = runPixelBrainPipelineCorpus({ caseIds: opts.caseIds || undefined });
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`PixelBrain pipeline corpus: ${report.status} (${report.summary.passed}/${report.summary.cases})`);
    for (const entry of report.cases) {
      const marker = entry.status === 'pass' ? 'PASS' : 'FAIL';
      const evidence = entry.bytecodeErrors.length > 0 ? ` bytecodeEvidence=${entry.bytecodeErrors.length}` : '';
      console.log(`${marker} ${entry.id}${evidence}`);
      if (entry.status === 'fail') {
        console.log(`  expected: ${JSON.stringify(entry.expected)}`);
        console.log(`  observed: ${JSON.stringify(entry.observed)}`);
        for (const bytecode of entry.bytecodeErrors) console.log(`  ${bytecode}`);
      }
    }
  }

  process.exit(report.status === 'pass' ? 0 : 1);
} catch (error) {
  console.error(error?.message || error);
  console.error(usage());
  process.exit(1);
}
