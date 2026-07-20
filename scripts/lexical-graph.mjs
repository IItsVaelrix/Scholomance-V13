#!/usr/bin/env node
/**
 * Lexical Graph ops CLI — additive overlay for scholomance_dict.sqlite.
 *
 *   node scripts/lexical-graph.mjs migrate --db <path> --timestamp <ISO8601>
 *   node scripts/lexical-graph.mjs mirror --db <path> --timestamp <ISO8601>
 *   node scripts/lexical-graph.mjs seed-devices --db <path> --timestamp <ISO8601>
 *   node scripts/lexical-graph.mjs embed-devices --db <path> --timestamp <ISO8601>
 *   node scripts/lexical-graph.mjs build-lemma-forms --db <path> --timestamp <ISO8601>
 *   node scripts/lexical-graph.mjs all --db <path> --timestamp <ISO8601>
 *
 * `--timestamp` is required for every write command (no system-clock reads
 * for stamped fields). Each command runs in its own transaction.
 *
 * See: docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md
 */

import Database from 'better-sqlite3';
import { migrateLexicalGraph } from '../codex/core/lexical-graph/migrate.js';
import { mirrorEntries } from '../codex/core/lexical-graph/mirror.js';
import { seedLiteraryDevices } from '../codex/core/lexical-graph/seedDevices.js';
import { embedDevices } from '../codex/core/lexical-graph/embedDevices.js';
import { buildLemmaForms } from '../codex/core/lexical-analysis/buildLemmaForms.js';

const USAGE = `usage: node scripts/lexical-graph.mjs <command> --db <path> --timestamp <ISO8601>

Commands:
  migrate         Create the lexical-graph overlay tables (idempotent)
  mirror           Mirror legacy \`entry\` rows into \`lexical_entry\` (idempotent)
  seed-devices     Seed the curated literary-device catalog (idempotent)
  embed-devices    Generate TurboQuant embeddings for device nodes (idempotent)
  build-lemma-forms Build the complete inverse morphology relation (idempotent)
  all              Run migrate, mirror, seed-devices, embed-devices, lemma forms
`;

/**
 * @param {string[]} argv
 * @returns {{ command: string|null, options: { db: string|null, timestamp: string|null } }}
 */
export function parseArgs(argv) {
  const [command = null, ...rest] = argv;
  const options = { db: null, timestamp: null };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--db') {
      options.db = rest[i + 1] ?? null;
      i += 1;
    } else if (arg === '--timestamp') {
      options.timestamp = rest[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--db=')) {
      options.db = arg.slice('--db='.length);
    } else if (arg.startsWith('--timestamp=')) {
      options.timestamp = arg.slice('--timestamp='.length);
    }
  }

  return { command, options };
}

const WRITE_COMMANDS = new Set([
  'migrate',
  'mirror',
  'seed-devices',
  'embed-devices',
  'build-lemma-forms',
  'all',
]);

/**
 * Open an existing scholomance_dict.sqlite for offline write ops.
 * Refuses to create a new file when `--db` is mistyped.
 *
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
export function openWriteDatabase(dbPath) {
  return new Database(dbPath, { fileMustExist: true });
}

/**
 * Run the full lexical-graph overlay pipeline (each step in its own transaction).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ timestamp: string }} options
 * @returns {{ mirrored: number, seeded: number, embedded: number, lemmaForms: number }}
 */
export function runLexicalGraphAll(db, { timestamp }) {
  migrateLexicalGraph(db, { timestamp });
  const { mirrored } = mirrorEntries(db, { timestamp });
  const { seeded } = seedLiteraryDevices(db, { timestamp });
  const { embedded } = embedDevices(db, { timestamp });
  const { indexedLemmaCount: lemmaForms } = buildLemmaForms(db, { timestamp });
  return { mirrored, seeded, embedded, lemmaForms };
}

export async function runCli(argv) {
  const { command, options } = parseArgs(argv);

  if (!command) {
    console.error(USAGE);
    return 2;
  }

  if (!WRITE_COMMANDS.has(command)) {
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }

  if (!options.db) {
    console.error('Missing required --db <path>\n\n' + USAGE);
    return 2;
  }

  if (!options.timestamp || !options.timestamp.trim()) {
    console.error('Missing required --timestamp <ISO8601>\n\n' + USAGE);
    return 2;
  }

  const db = openWriteDatabase(options.db);
  try {
    if (command === 'migrate') {
      migrateLexicalGraph(db, { timestamp: options.timestamp });
      console.log(`lexical-graph migrate: overlay ready on ${options.db}`);
      return 0;
    }
    if (command === 'mirror') {
      const { mirrored } = mirrorEntries(db, { timestamp: options.timestamp });
      console.log(`lexical-graph mirror: mirrored ${mirrored} entries on ${options.db}`);
      return 0;
    }
    if (command === 'seed-devices') {
      const { seeded } = seedLiteraryDevices(db, { timestamp: options.timestamp });
      console.log(`lexical-graph seed-devices: seeded ${seeded} devices on ${options.db}`);
      return 0;
    }
    if (command === 'embed-devices') {
      const { embedded } = embedDevices(db, { timestamp: options.timestamp });
      console.log(`lexical-graph embed-devices: embedded ${embedded} devices on ${options.db}`);
      return 0;
    }
    if (command === 'build-lemma-forms') {
      migrateLexicalGraph(db, { timestamp: options.timestamp });
      const state = buildLemmaForms(db, { timestamp: options.timestamp });
      console.log(
        `lexical-graph build-lemma-forms: indexed ${state.indexedLemmaCount} lemmas on ${options.db}`,
      );
      return 0;
    }
    if (command === 'all') {
      const {
        mirrored,
        seeded,
        embedded,
        lemmaForms,
      } = runLexicalGraphAll(db, { timestamp: options.timestamp });
      console.log(
        `lexical-graph all: mirrored ${mirrored}, seeded ${seeded}, embedded ${embedded}, indexed ${lemmaForms} lemmas on ${options.db}`,
      );
      return 0;
    }
    console.error(`Unhandled command: ${command}`);
    return 1;
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
