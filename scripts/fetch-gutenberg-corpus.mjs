#!/usr/bin/env node
/**
 * GUTENBERG CORPUS FETCHER — grows cache/gutenberg by register
 *
 * WHY, with the arithmetic that sets the target. Measured over the 117-book
 * cache (15.56M tokens): the mean rate at which a well-attested adjective
 * appears directly after an intensifier is 3.08%, so a word needs roughly 649
 * occurrences before its intensity score rests on n=20.
 *
 *     shadowy   164 occurrences   10.5 per M tokens   ->  ~62M tokens
 *     dusky     141                9.1               ->  ~72M
 *     luminous  145                9.3               ->  ~70M
 *     murky      44                2.8               ->  ~230M
 *
 * The core imagery register therefore needs about 10x the current cache.
 *
 * ─── WHY NOT THE gutendex API ─────────────────────────────────────────────
 *
 * The first version discovered ids through gutendex's paged search. Measured,
 * it rate-limits hard after roughly six requests:
 *
 *     page 1   278ms        page 7   82,293ms
 *     page 2    30ms        page 8   49,882ms
 *     page 3    34ms        page 9   51,943ms
 *     page 6    28ms        page 10  41,787ms
 *
 * Eleven topics at ~7 pages each is close to an hour of pure lookup before a
 * single book downloads. Project Gutenberg publishes the entire catalogue as
 * ONE 21MB CSV — 90,420 rows — so discovery costs a single request.
 *
 * Downloads were never the problem. Measured against gutenberg.org: 12.2 MB/s
 * at concurrency 8 with no failures, so ~1,200 books is about 75 seconds of
 * transfer.
 *
 * Incremental: anything already in cache/gutenberg is skipped, and books are
 * written as they arrive, so an interrupted run keeps everything it fetched.
 *
 * Usage:
 *   node scripts/fetch-gutenberg-corpus.mjs --register imagery --limit 1200
 *   node scripts/fetch-gutenberg-corpus.mjs --register science --limit 400
 *   node scripts/fetch-gutenberg-corpus.mjs --refresh-catalog
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), 'cache', 'gutenberg');
const CATALOG_PATH = join(process.cwd(), 'cache', 'pg_catalog.csv');
const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv';
const CONCURRENCY = 8;
const MIN_TEXT_BYTES = 20000;

/**
 * Registers as subject keywords, matched against the catalogue's Subjects,
 * Bookshelves and LoCC columns.
 *
 * REGISTER IS NOT INTERCHANGEABLE. A thousand science texts will not make
 * `dusky` measurable; they populate a different part of the space
 * (`empirical`, `contingent`, `axiomatic`). Words become measurable in the
 * register that uses them.
 */
const REGISTERS = Object.freeze({
  imagery: ['gothic', 'horror', 'ghost', 'supernatural', 'fantasy', 'mythology',
    'folklore', 'fairy tales', 'legends', 'poetry', 'romanticism', 'adventure',
    'sea stories', 'voyages', 'nature'],
  literary: ['fiction', 'love stories', 'domestic fiction', 'historical fiction',
    'psychological fiction', 'drama', 'tragedies', 'satire', 'short stories'],
  science: ['science', 'natural history', 'astronomy', 'physics', 'chemistry',
    'biology', 'geology', 'medicine', 'botany', 'zoology'],
  philosophy: ['philosophy', 'ethics', 'psychology', 'religion', 'political science',
    'economics', 'logic', 'metaphysics'],
});

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** Minimal RFC4180 row splitter — Subjects fields carry commas inside quotes. */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

async function ensureCatalog(refresh) {
  if (!refresh && existsSync(CATALOG_PATH)) return readFileSync(CATALOG_PATH, 'utf8');
  console.log('[fetch] downloading catalogue (~21MB, one request)');
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`catalogue HTTP ${res.status}`);
  const csv = await res.text();
  mkdirSync(join(process.cwd(), 'cache'), { recursive: true });
  writeFileSync(CATALOG_PATH, csv);
  return csv;
}

/** Rows matching the register, English text only, as {id, title}. */
function selectFromCatalog(csv, keywords) {
  const lines = csv.split('\n');
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const idC = col['Text#'];
  const picks = [];

  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    if (f[col.Type] !== 'Text') continue;
    if (!/^en/i.test(f[col.Language] || '')) continue;

    const haystack = `${f[col.Subjects] || ''} ${f[col.Bookshelves] || ''} ${f[col.LoCC] || ''}`.toLowerCase();
    if (!keywords.some((k) => haystack.includes(k))) continue;

    const id = Number(f[idC]);
    if (Number.isInteger(id) && id > 0) picks.push({ id, title: (f[col.Title] || '').slice(0, 60) });
  }
  return picks;
}

async function fetchText(id) {
  for (const url of [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Scholomance/corpus-builder' } });
      if (res.status === 429 || res.status === 403) return { blocked: true };
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length < MIN_TEXT_BYTES) continue;
      return { text };
    } catch { /* try next path */ }
  }
  return {};
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const have = new Set(
    readdirSync(CACHE_DIR).filter((f) => f.endsWith('.txt')).map((f) => Number(f.slice(2, -4))),
  );

  const registerName = arg('register', 'imagery');
  const limit = Number(arg('limit', '1200'));
  const keywords = REGISTERS[registerName];
  if (!keywords) throw new Error(`unknown register: ${registerName}`);

  const csv = await ensureCatalog(process.argv.includes('--refresh-catalog'));
  const matches = selectFromCatalog(csv, keywords);
  const queue = matches.filter((m) => !have.has(m.id)).slice(0, limit);

  console.log(`[fetch] register=${registerName}  catalogue matches=${matches.length.toLocaleString()}`);
  console.log(`[fetch] cache holds ${have.size}; queueing ${queue.length} new books\n`);

  let ok = 0;
  let failed = 0;
  let blocked = false;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length && !blocked) {
      const { id } = queue[cursor];
      cursor += 1;
      const r = await fetchText(id);
      if (r.blocked) {
        // Back off rather than hammering a server that has said no.
        blocked = true;
        console.log('[fetch] server returned 429/403 — stopping to avoid a block');
        return;
      }
      if (!r.text) { failed += 1; continue; }
      writeFileSync(join(CACHE_DIR, `pg${id}.txt`), r.text);
      ok += 1;
      if (ok % 50 === 0) console.log(`[fetch] ${ok} downloaded, ${failed} unavailable`);
    }
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const secs = (Date.now() - t0) / 1000;
  console.log(`\n[fetch] done: ${ok} downloaded, ${failed} unavailable in ${secs.toFixed(0)}s`);
  console.log(`[fetch] cache now ${have.size + ok} books`);
}

main().catch((err) => { console.error(err); process.exit(1); });
