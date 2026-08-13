#!/usr/bin/env node
/**
 * AN INDEPENDENT CHECK ON CORPUS SANITATION.
 *
 * `scripts/audit_corpus_damage.py` shares its predicates with the sanitizer, so
 * its post-sanitation zero is guaranteed by construction. This asks something
 * the sanitizer does not control: what the GRAMMAR can parse. `composePacked`
 * has no knowledge of wrapper markers, abbreviation lists or heading regexes.
 *
 * Measured 2026-08-13 over a matched deterministic sample, same token bounds on
 * both sides:
 *
 *   OLD  spans 40.23%  no-verb 14.76%  mean tokens 7.5
 *   NEW  spans 39.82%  no-verb 15.94%  mean tokens 7.5
 *
 * NOT BETTER — very slightly worse, and that is the expected direction. The
 * Failure Tribunal said it outright: short malformed fragments parse more easily
 * than whole sentences, so sanitation makes a coverage metric harder and
 * truthful. A corpus repair that RAISED parse rate would deserve suspicion.
 *
 * The defensible win is elsewhere and is verified against the raw source: 1,761
 * records had a word destroyed and now carry it again.
 */
import Database from 'better-sqlite3';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

const LEMMA_POS = new Map([['noun','n'],['verb','v'],['adjective','a'],['adverb','r']]);
const dict = new Database('scholomance_dict.sqlite', { readonly: true });
const posMap = new Map();
for (const r of dict.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
  const tag = LEMMA_POS.get(r.pos); if (!tag) continue;
  const have = posMap.get(r.surface_lower);
  if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(r.surface_lower, [tag]);
}
dict.close();

// Deterministic sample: every Nth record, same rule on both sides.
function sample(path, want) {
  const db = new Database(path, { readonly: true });
  const total = db.prepare('SELECT COUNT(*) AS n FROM sentence').get().n;
  const stride = Math.max(1, Math.floor(total / want));
  const rows = db.prepare('SELECT text FROM sentence WHERE id % ? = 0 LIMIT ?').all(stride, want);
  db.close();
  return rows.map(r => r.text);
}

const tokenize = t => t.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
for (const [label, path] of [
  ['OLD', 'scholomance_corpus.sqlite.pre-sanitation.bak'],
  ['NEW', 'scholomance_corpus.sqlite'],
]) {
  const texts = sample(path, 4000);
  let spans = 0, scored = 0, tokensTotal = 0, noVerb = 0;
  for (const text of texts) {
    const tokens = tokenize(text);
    if (tokens.length < 2 || tokens.length > 20) continue;   // same bound both sides
    scored += 1; tokensTotal += tokens.length;
    const r = composePacked(tokens, posMap);
    if (r.stable.length > 0) spans += 1;
    if (!r.atoms.some(a => a.type === 'V' || a.type === 'VP')) noVerb += 1;
  }
  console.log(`${label}: scored ${scored}  spans ${(spans/scored*100).toFixed(2)}%  no-verb ${(noVerb/scored*100).toFixed(2)}%  mean tokens ${(tokensTotal/scored).toFixed(1)}`);
}
