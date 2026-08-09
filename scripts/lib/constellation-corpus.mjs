/**
 * Shared corpus loaders for constellation bond simulations.
 *
 * Every reactor script needs the same two things — the lemma POS map and a UD
 * split — and each used to carry its own copy. One copy means one place for a
 * loader bug to live.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { parseConllu } from '../../codex/core/constellation/treebank.js';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

/** surface_lower → ['n','v',…] from the Scholomance dictionary. */
export function loadPosMap() {
  const db = new Database(path.resolve(ROOT, 'scholomance_dict.sqlite'), { readonly: true });
  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); }
    else posMap.set(r.surface_lower, [tag]);
  }
  db.close();
  return posMap;
}

/** @param {'train'|'dev'|'test'} split */
export function loadSplit(split) {
  const p = path.resolve(ROOT, `cache/ud/en_ewt-ud-${split}.conllu`);
  if (!existsSync(p)) throw new Error(`missing ${p}`);
  return parseConllu(readFileSync(p, 'utf8'));
}

/** Evidence directory for simulation write-ups. */
export const EVIDENCE_DIR = path.resolve(ROOT, 'docs/superpowers/evidence');
