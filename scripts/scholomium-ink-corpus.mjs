#!/usr/bin/env node
/**
 * Scholomium Ink — Corpus Ledger & Master Asset Generator CLI
 *
 * Usage:
 *   node scripts/scholomium-ink-corpus.mjs --build
 *   node scripts/scholomium-ink-corpus.mjs --audit
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MASTER_TREE_SPECS,
  buildMasterTreeBundle,
} from '../codex/core/pixelbrain/scholomium-ink/corpus/tree-masters.js';
import { CorpusLedger } from '../codex/core/pixelbrain/scholomium-ink/corpus/corpus-ledger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_ROOT = resolve(__dirname, '..', 'assets', 'ASSETS', 'scholomium-ink', 'trees');

export function buildTreeCorpusOnDisk() {
  const ledger = new CorpusLedger();
  const summary = [];

  for (const familyKey of Object.keys(MASTER_TREE_SPECS)) {
    const bundle = buildMasterTreeBundle(familyKey);
    const familyDir = resolve(ASSETS_ROOT, familyKey);
    mkdirSync(familyDir, { recursive: true });

    // 1. structural-brief.md
    writeFileSync(
      resolve(familyDir, 'structural-brief.md'),
      `# Structural Brief: ${bundle.spec.name}\n\n**Family:** ${bundle.spec.family}\n**Canvas:** ${bundle.spec.canvasWidth}x${bundle.spec.canvasHeight}\n**Archetype:** ${bundle.spec.envelope}\n**SCD128 Checksum:** \`${bundle.counselReceipt.checksum128}\`\n\n## Morphology\n${bundle.spec.brief}\n`,
      'utf8'
    );

    // 2. master.scdl
    writeFileSync(resolve(familyDir, 'master.scdl'), bundle.scdlSource, 'utf8');

    // 3. form-evidence.json
    writeFileSync(resolve(familyDir, 'form-evidence.json'), JSON.stringify(bundle.formView, null, 2), 'utf8');

    // 4. realization-evidence.json
    writeFileSync(resolve(familyDir, 'realization-evidence.json'), JSON.stringify(bundle.realView, null, 2), 'utf8');

    // 5. form64.json
    writeFileSync(resolve(familyDir, 'form64.json'), JSON.stringify(bundle.formPacket, null, 2), 'utf8');

    // 6. realization64.json
    writeFileSync(resolve(familyDir, 'realization64.json'), JSON.stringify(bundle.realizationPacket, null, 2), 'utf8');

    // 7. counsel-receipt.json
    writeFileSync(resolve(familyDir, 'counsel-receipt.json'), JSON.stringify(bundle.counselReceipt, null, 2), 'utf8');

    // 8. admission-receipt.json
    writeFileSync(resolve(familyDir, 'admission-receipt.json'), JSON.stringify(bundle.admissionReceipt, null, 2), 'utf8');

    // Admit to ledger
    ledger.admit({
      specimenId: bundle.spec.id,
      family: bundle.spec.family,
      counselReceipt: bundle.counselReceipt,
      admissionReceipt: bundle.admissionReceipt,
      scdlSource: bundle.scdlSource,
      evidenceBundle: {
        formDigest256: bundle.formPacket.digest256,
        realizationDigest256: bundle.realizationPacket.digest256,
      },
    });

    summary.push({
      family: familyKey,
      checksum128: bundle.counselReceipt.checksum128,
      admissionDigest: bundle.admissionReceipt.admissionDigest256.slice(0, 16) + '...',
    });
  }

  const snapshot = ledger.exportSnapshot();
  writeFileSync(resolve(ASSETS_ROOT, 'corpus-ledger.json'), JSON.stringify(snapshot, null, 2), 'utf8');

  return { ledger, summary, snapshot };
}

export function auditTreeCorpus() {
  const ledgerFile = resolve(ASSETS_ROOT, 'corpus-ledger.json');
  if (!existsSync(ledgerFile)) {
    return { ok: false, reason: 'corpus-ledger.json does not exist. Run with --build first.' };
  }

  const data = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  if (data.contract !== 'SCD128-CORPUS-LEDGER-v1') {
    return { ok: false, reason: `Invalid ledger contract: ${data.contract}` };
  }

  if (data.count !== 7 || data.entries?.length !== 7) {
    return { ok: false, reason: `Expected 7 master tree entries in ledger, found ${data.count}` };
  }

  return { ok: true, count: data.count, entries: data.entries };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith('scholomium-ink-corpus.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--audit')) {
    const res = auditTreeCorpus();
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('Building Scholomium Ink Seven-Tree Corpus...');
    const res = buildTreeCorpusOnDisk();
    console.log('Corpus build complete. Summary:');
    console.table(res.summary);
  }
}
