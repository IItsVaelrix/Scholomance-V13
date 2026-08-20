#!/usr/bin/env node
/**
 * PARSER FAILURE ATLAS
 *
 * Research ledger of compose failures. Does not admit a root. Does not
 * write a bond. TEST is sealed.
 *
 *   node scripts/parser-failure-atlas.mjs
 *   node scripts/parser-failure-atlas.mjs --splits dev
 *   node scripts/parser-failure-atlas.mjs --splits train,dev --limit 400
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';
import { ATLAS_CONTRACT, PLATES } from '../codex/research/parser-failure-atlas/atlas-schema.js';
import { collectFailures } from '../codex/research/parser-failure-atlas/collect-failures.js';
import { freezeFailure } from '../codex/research/parser-failure-atlas/freeze-case.js';
import { plateAtlas } from '../codex/research/parser-failure-atlas/plate.js';
import { buildAtlas } from '../codex/research/parser-failure-atlas/build-atlas.js';
import {
  interiorConstructions,
  isClauseRootLabel,
  replicateInteriors,
} from '../codex/research/parser-failure-atlas/replicate-interiors.js';
import { clusterPunctuation } from '../codex/research/parser-failure-atlas/cluster-punctuation.js';

const OUT_DEFAULT = 'docs/superpowers/evidence/2026-08-18-parser-failure-atlas';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function writeJson(dir, name, value) {
  writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function slim(frozen) {
  return {
    caseId: frozen.caseId,
    split: frozen.split,
    sentId: frozen.sentId,
    text: frozen.text,
    gold: frozen.gold,
    plate: frozen.plate,
    tokens: frozen.tokens,
    diagnosis: frozen.diagnosis,
    chart: {
      spanningTypes: frozen.chart.spanningTypes,
      leftoverTypes: frozen.chart.leftoverTypes,
      frontierSignature: frozen.chart.frontierSignature,
    },
    metrics: frozen.metrics,
  };
}

function renderReport({ splits, collected, atlas, top, interiors, replication, punct }) {
  const lines = [];
  lines.push('# Parser failure atlas');
  lines.push('');
  lines.push(`Contract: \`${ATLAS_CONTRACT}\``);
  lines.push('Compose was not modified. No root was admitted. TEST was not opened for ranking.');
  lines.push('');
  lines.push('## Collection');
  lines.push('');
  lines.push(`- splits: ${splits.join(', ')}`);
  lines.push(`- scored: ${collected.scored}`);
  lines.push(`- skipped too long: ${collected.skipped.tooLong}`);
  lines.push(`- threw: ${collected.skipped.threw}`);
  lines.push(`- atlas cases: ${atlas.cases}`);
  lines.push('');
  lines.push('## Plates');
  lines.push('');
  lines.push('| Plate | Cases |');
  lines.push('|---|---:|');
  for (const plate of PLATES) {
    lines.push(`| ${plate} | ${atlas.plates[plate] || 0} |`);
  }
  lines.push('');
  lines.push('## Construction holes (GRAMMAR sole-cause)');
  lines.push('');
  lines.push('`promisedUnblock` is the number of sentences whose entire frontier is this one category. Mixed frontiers are counted as failures and are not promised.');
  lines.push('');
  lines.push('| Category | Failures | Sole cause / promised unblock | Gold-root lemmas |');
  lines.push('|---|---:|---:|---:|');
  for (const row of (atlas.constructions || []).slice(0, 20)) {
    lines.push(`| ${row.label} | ${row.failures} | ${row.promisedUnblock} | ${row.lemmas} |`);
  }
  lines.push('');
  lines.push('## Leftover types on ROOT_TYPE_MISMATCH');
  lines.push('');
  lines.push('Illumination is not admission. These are spanning types that are not licensed roots.');
  lines.push('');
  lines.push('| Type | Cases |');
  lines.push('|---|---:|');
  for (const row of atlas.leftovers || []) {
    lines.push(`| ${row.type} | ${row.cases} |`);
  }
  lines.push('');
  lines.push('## Interior sole-cause holes (root * -> ROOT excluded)');
  lines.push('');
  lines.push('| Category | Failures | promisedUnblock |');
  lines.push('|---|---:|---:|');
  for (const row of (interiors || []).slice(0, 12)) {
    lines.push(`| ${row.label} | ${row.failures} | ${row.promisedUnblock} |`);
  }
  lines.push('');
  if (replication) {
    lines.push('## DEV vs TRAIN replication');
    lines.push('');
    lines.push(`Watchlist interiors recurring in both top ${replication.topK}: ${replication.recurredCount}/${replication.watchlist.length}. TEST not opened.`);
    lines.push('');
    lines.push('| Category | DEV rank | DEV share | TRAIN rank | TRAIN share | Recurred |');
    lines.push('|---|---:|---:|---:|---:|---|');
    for (const w of replication.watchlist) {
      const ds = w.dev ? w.dev.share.toFixed(3) : '—';
      const ts = w.train ? w.train.share.toFixed(3) : '—';
      const dr = w.dev ? w.dev.rank : '—';
      const tr = w.train ? w.train.rank : '—';
      lines.push(`| ${w.label} | ${dr} | ${ds} | ${tr} | ${ts} | ${w.recurred ? 'yes' : 'no'} |`);
    }
    lines.push('');
  }
  if (punct) {
    lines.push('## Punctuation families (sole-cause punct only)');
    lines.push('');
    lines.push('promisedUnblock is inside each family. There is no bag-level promise.');
    lines.push('');
    lines.push('| Family | Cases / promisedUnblock | Lemmas | Example |');
    lines.push('|---|---:|---:|---|');
    for (const family of Object.keys(punct)) {
      const row = punct[family];
      const ex = row.examples?.[0]?.text ? String(row.examples[0].text).slice(0, 72) : '';
      lines.push(`| ${row.family} | ${row.promisedUnblock} | ${row.lemmas} | ${ex} |`);
    }
    lines.push('');
  }
  lines.push('## Top 3 construction holes');
  lines.push('');
  if (!top.length) lines.push('No sole-cause GRAMMAR holes on this slice.');
  for (const [i, row] of top.entries()) {
    const note = isClauseRootLabel(row.label) ? ' — clause unreached, not a root bond' : '';
    lines.push(`${i + 1}. **${row.label}** — ${row.promisedUnblock} promised unblock / ${row.failures} failures / ${row.lemmas} lemmas${note}`);
  }
  lines.push('');
  lines.push('Stop. Do not add a bond. Do not open a doorway. TEST stays sealed.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeDerived(outDir, frozen, splits, collected) {
  const atlas = buildAtlas(frozen);
  const plated = plateAtlas(frozen);
  const interiors = interiorConstructions(atlas.constructions);
  const top = (atlas.constructions || []).filter((c) => c.promisedUnblock > 0).slice(0, 3);
  const bySplit = Object.create(null);
  for (const split of splits) {
    const slice = frozen.filter((c) => c.split === split);
    if (!slice.length) continue;
    bySplit[split] = buildAtlas(slice);
    writeJson(outDir, `atlas-${split}.json`, bySplit[split]);
  }
  const replication = (bySplit.dev && bySplit.train)
    ? replicateInteriors({
      dev: bySplit.dev.constructions,
      train: bySplit.train.constructions,
    })
    : null;
  const punct = clusterPunctuation(frozen);
  writeJson(outDir, 'atlas.json', atlas);
  writeJson(outDir, 'cases.json', frozen.map(slim));
  writeJson(outDir, 'plates.json', Object.fromEntries(
    PLATES.map((p) => [p, (plated[p] || []).map((c) => c.caseId)]),
  ));
  writeJson(outDir, 'replication.json', replication);
  writeJson(outDir, 'punct-clusters.json', punct);
  writeJson(outDir, 'top-holes.json', {
    contract: ATLAS_CONTRACT,
    note: 'Stop here. Do not implement these bonds in this phase. Interior ranking excludes root (* -> ROOT).',
    holes: top,
    interiors: interiors.slice(0, 8),
  });
  const report = renderReport({
    splits,
    collected,
    atlas,
    top,
    interiors,
    replication,
    punct,
  });
  writeFileSync(path.join(outDir, 'report.md'), report);
  console.log(report);
  console.log(`wrote ${outDir}`);
}

function main() {
  const outDir = arg('out', OUT_DEFAULT);
  const fromCases = arg('from-cases', null);
  const splits = String(arg('splits', 'dev')).split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Number(arg('limit', '0')) || 0;
  const maxTokens = Number(arg('max-tokens', '28')) || 28;

  mkdirSync(outDir, { recursive: true });

  if (fromCases) {
    const frozen = JSON.parse(readFileSync(fromCases, 'utf8'));
    const present = [...new Set(frozen.map((c) => c.split))];
    writeDerived(outDir, frozen, present, {
      scored: frozen.length,
      skipped: { tooLong: 0, threw: 0 },
    });
    return;
  }

  for (const split of splits) {
    if (split === 'test') {
      throw new Error('TEST is sealed. Score it only with --seal-test after design freeze.');
    }
  }

  mkdirSync(outDir, { recursive: true });
  const posMap = loadPosMap();
  const frozen = [];
  const skipped = { tooLong: 0, threw: 0 };
  let scored = 0;

  for (const split of splits) {
    let records = loadSplit(split);
    if (limit > 0) records = records.slice(0, limit);
    console.log(`scoring ${split} n=${records.length} maxTokens=${maxTokens}`);
    const collected = collectFailures(records, posMap, { split, maxTokens });
    scored += collected.scored;
    skipped.tooLong += collected.skipped.tooLong;
    skipped.threw += collected.skipped.threw;
    for (const row of collected.cases) frozen.push(row);
  }

  writeDerived(outDir, frozen, splits, { scored, skipped });
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}


