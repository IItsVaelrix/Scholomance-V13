#!/usr/bin/env node
/**
 * ONE SENTENCEHOOD AUTHORITY, REACHABLE FROM ANY LANGUAGE.
 *
 * `scripts/lib/gutenberg-corpus-sanitizer.mjs` owns
 * `SCHOL-GUTENBERG-SANITIZATION-v1`. `build_super_corpus.py` needs exactly that
 * contract, and a Python reimplementation of it would be a SECOND authority on
 * what a sentence is — two places for `Mr. Bennet` to drift apart, which is the
 * failure the Tribunal already tried once.
 *
 * So the ingest calls this, and the contract stays singular.
 *
 * Usage:
 *   node scripts/gutenberg-sanitize.mjs [--min-tokens N] [--max-tokens N] < book.txt
 *
 * Reads raw Gutenberg text on stdin. Emits the sanitation packet as JSON on
 * stdout: `{ contract, segments: [...], quarantine: {...}, counts: {...} }`.
 * Exits non-zero if the accounting invariant fails, so a caller cannot receive a
 * plausible packet that lost records on the way.
 */

import { sanitizeGutenbergText } from './lib/gutenberg-corpus-sanitizer.mjs';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};

/**
 * Word tokens, for the length bounds only. Deliberately crude: these counts
 * decide inclusion, never linguistics, and a caller reading the ledger needs to
 * know exactly what "token" meant when a record was quarantined as tooShort.
 */
const tokenize = (sentence) => sentence.split(/\s+/).filter(Boolean);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin();
try {
  const packet = sanitizeGutenbergText(raw, {
    tokenize,
    minTokens: argOf('--min-tokens', 1),
    maxTokens: argOf('--max-tokens', 250),
  });
  process.stdout.write(`${JSON.stringify({
    contract: packet.contract,
    counts: packet.counts,
    quarantine: packet.quarantine,
    segments: packet.segments.map((segment) => segment.text),
  })}\n`);
} catch (error) {
  // The invariant throwing is the contract working. Say so on stderr and fail
  // loudly rather than emitting a packet the caller would trust.
  process.stderr.write(`sanitation failed: ${error.message}\n`);
  process.exit(1);
}
