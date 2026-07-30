#!/usr/bin/env node

/**
 * UI Stasis QA Test Runner
 * 
 * Usage:
 *   node tests/qa/run-stasis-tests.js              # Run all stasis tests
 *   node tests/qa/run-stasis-tests.js --watch     # Watch mode
 *   node tests/qa/run-stasis-tests.js --coverage  # With coverage
 *   node tests/qa/run-stasis-tests.js --verbose   # Detailed output
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// Parse arguments
const args = process.argv.slice(2);
const WATCH = args.includes('--watch');
const COVERAGE = args.includes('--coverage');
const VERBOSE = args.includes('--verbose');
const HELP = args.includes('--help') || args.includes('-h');

if (HELP) {
  console.log(`
UI Stasis QA Test Runner
========================

Usage:
  node tests/qa/run-stasis-tests.js [options]

Options:
  --watch      Run tests in watch mode (re-run on file changes)
  --coverage   Generate coverage report
  --verbose    Show detailed test output
  --help       Show this help message

Examples:
  # Run all stasis tests
  node tests/qa/run-stasis-tests.js

  # Watch mode
  node tests/qa/run-stasis-tests.js --watch

  # With coverage
  node tests/qa/run-stasis-tests.js --coverage

  # Verbose output
  node tests/qa/run-stasis-tests.js --verbose

  # Combine options
  node tests/qa/run-stasis-tests.js --watch --verbose
`);
  process.exit(0);
}

// Build vitest command
const testFile = join(__dirname, 'ui-stasis-bytecode.test.jsx');
let command = `npm test -- ${testFile}`;

if (WATCH) {
  command += ' --watch';
}

if (COVERAGE) {
  command += ' --coverage';
}

if (VERBOSE) {
  command += ' --reporter=verbose';
}

// Check if test file exists
try {
  readFileSync(testFile, 'utf-8');
} catch (err) {
  console.error('❌ Test file not found:', testFile);
  console.error('\nMake sure you are running from the project root.');
  process.exit(1);
}

// Run tests
console.log('🧪 Running UI Stasis QA Tests...\n');
console.log('📁 Test file:', testFile.replace(ROOT, ''));
console.log('🔧 Options:', {
  watch: WATCH,
  coverage: COVERAGE,
  verbose: VERBOSE,
});
console.log('\n' + '='.repeat(60) + '\n');

try {
  execSync(command, {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All stasis tests passed!');
  console.log('='.repeat(60) + '\n');
} catch (err) {
  console.error('\n❌ Stasis tests failed!');
  console.error('\nReview the output above for bytecode error details.');
  console.error('\nSee: tests/qa/QA_METHODOLOGY.md for triage process.');
  process.exit(1);
}
