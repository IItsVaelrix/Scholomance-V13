#!/usr/bin/env node
/**
 * BUILD WORDNET SENSE INDEX
 *
 * Ingests Open English WordNet 2024 into a compact lemma → supersense artifact
 * that `semantotopography` can import with zero runtime I/O.
 *
 *   node scripts/build-wordnet-senses.mjs
 *   → codex/core/semantic/data/wordnet-senses.json
 *
 * WHY. semantotopography resolved unknown words through a deterministic hash
 * fallback, which assigned two random primitives to anything its 40 authored
 * primitives did not cover. Measured over 68,480 WordNet lemmas that collapsed
 * the vocabulary into 1,473 distinct classes and labelled 1,917 lemmas NEGATED —
 * `carafe`, `brushwood`, `blurred` among them. The engine was confabulating with
 * a straight face, and doing it reproducibly, which made it look principled.
 *
 * WordNet's 45 lexicographer files are the closed, curated, human-authored
 * inventory that role needs — the semantic counterpart of ARPAbet, ingested
 * rather than invented. A lemma WordNet does not know resolves to nothing, and
 * nothing is a value the caller can see.
 */

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';

const SOURCE = 'dict_data/english-wordnet-2024.xml.gz';
const OUTPUT = 'codex/core/semantic/data/wordnet-senses.json';

const SYNSET_RE = /<Synset id="([^"]+)"[^>]*?members="([^"]*)"[^>]*?lexfile="([^"]+)"/;

async function main() {
  const lexfiles = new Set();
  const lemmaSenses = new Map();

  const rl = createInterface({
    input: createReadStream(SOURCE).pipe(createGunzip()),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const match = SYNSET_RE.exec(line);
    if (!match) continue;
    const [, , members, lexfile] = match;
    lexfiles.add(lexfile);

    for (const member of members.split(/\s+/)) {
      if (!member) continue;
      // Member ids look like `oewn-able-a`: strip the namespace and the trailing
      // part-of-speech marker to recover the lemma.
      const lemma = member.replace(/^oewn-/, '').replace(/-[nvasr]$/, '').toLowerCase();
      // Single tokens only — the resolver works word by word, and a multi-word
      // entry would never be looked up.
      if (!/^[a-z]+$/.test(lemma)) continue;
      if (!lemmaSenses.has(lemma)) lemmaSenses.set(lemma, new Set());
      lemmaSenses.get(lemma).add(lexfile);
    }
  }

  const inventory = [...lexfiles].sort();
  const index = Object.create(null);
  for (const [lemma, senses] of [...lemmaSenses].sort((a, b) => a[0].localeCompare(b[0]))) {
    index[lemma] = [...senses].map(s => inventory.indexOf(s)).sort((a, b) => a - b);
  }

  const artifact = {
    source: 'Open English WordNet 2024',
    license: 'CC BY 4.0',
    generatedBy: 'scripts/build-wordnet-senses.mjs',
    inventory,
    lemmaCount: Object.keys(index).length,
    index
  };

  mkdirSync(dirname(resolve(OUTPUT)), { recursive: true });
  const json = JSON.stringify(artifact);
  writeFileSync(OUTPUT, json);

  console.log(`supersenses : ${inventory.length}`);
  console.log(`lemmas      : ${artifact.lemmaCount}`);
  console.log(`artifact    : ${OUTPUT} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
