#!/usr/bin/env node

/**
 * EVIDENCE INTEGRITY HARNESS
 *
 * Built from nucleus `bytecode-seal + canonical-serializer + diagnostic-event-bus
 * + immutable-packet + schema-verifier` (topology T2, the fully-executable one),
 * proposed by the Semantic Valence Cyclotron and verified geometrically sound
 * (dangling 0 / 6 seeks) in 2026-08-11-nucleus-geometry-results.md
 *
 * The nucleus's port chain IS the pipeline:
 *
 *   structure -> [canonical-serializer] -> artifact -+-> [bytecode-seal]   -> checksum
 *                                                    +-> [schema-verifier] -> verdict
 *              artifact + checksum -> [immutable-packet] -> sealed-packet
 *                                  -> [diagnostic-event-bus] -> diagnostic-event
 *
 * WHY IT EXISTS: on 2026-08-11 three real integrity failures occurred in one
 * session — a 100k evidence artifact was overwritten by a 1,500-trial smoke test;
 * a sealed benchmark was rewritten mid-session by another process; and a scoring
 * change silently altered every downstream benchmark number. Each was caught by
 * luck or by a hand check. Nothing in the repository audits its own evidence.
 *
 * NOTE: the nucleus cited `codex/runtime/event-bus.js` for the diagnostic-event-bus
 * atom. That file does not exist — the atom bank carries an aspirational path. The
 * bus stage is therefore implemented inline and the discrepancy is reported.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { sha256Hex, stableStringify } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const ROOT = process.cwd();
const EVIDENCE_DIR = 'docs/superpowers/evidence';
const MANIFEST_PATH = join(EVIDENCE_DIR, 'INTEGRITY-MANIFEST.json');
const CONTRACT = 'PB-EVIDENCE-INTEGRITY-v1';

// ── diagnostic-event-bus (offers: diagnostic-event; seeks: sealed-packet) ──
const bus = [];
const emit = (severity, artifact, code, detail) => {
  bus.push({ severity, artifact, code, detail });
};

// ── canonical-serializer (offers: artifact; seeks: structure) ──────────────
function canonicalize(structure) {
  return stableStringify(structure);
}

// ── bytecode-seal (offers: checksum; seeks: artifact) ─────────────────────
function seal(artifact) {
  return `seal1:${sha256Hex(artifact)}`;
}

// ── schema-verifier (offers: schema-verdict; seeks: artifact) ─────────────
/**
 * Two independent checks:
 *   declared  — does the artifact name a contract and schemaVersion?
 *   selfSeal  — if it carries its own `checksum`, does that checksum still verify
 *               against its own body? This is the drift detector.
 */
function verifySchema(parsed) {
  const findings = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { declared: false, selfSeal: 'n/a', findings: ['NOT_AN_OBJECT'] };
  }
  const declared = typeof parsed.contract === 'string';
  if (!declared) findings.push('NO_CONTRACT');
  if (declared && typeof parsed.schemaVersion !== 'string') findings.push('NO_SCHEMA_VERSION');

  let selfSeal = 'absent';
  if (typeof parsed.checksum === 'string') {
    const { checksum, ...body } = parsed;
    const recomputed = sha256Hex(body);
    const claimed = checksum.includes(':') ? checksum.split(':').pop() : checksum;
    selfSeal = recomputed.startsWith(claimed) || claimed.startsWith(recomputed.slice(0, claimed.length))
      ? 'verified' : 'MISMATCH';
    if (selfSeal === 'MISMATCH') findings.push('SELF_CHECKSUM_MISMATCH');
  } else {
    findings.push('NO_SELF_CHECKSUM');
  }
  return { declared, selfSeal, findings };
}

// ── immutable-packet (offers: sealed-packet; seeks: artifact, checksum) ───
function buildPacket(path, artifact, checksum, schema, meta) {
  return Object.freeze({
    path, contentSeal: checksum, bytes: artifact.length,
    contract: meta.contract ?? null,
    schemaVersion: meta.schemaVersion ?? null,
    declaresContract: schema.declared,
    selfSeal: schema.selfSeal,
    provenance: meta.provenance,
    findings: schema.findings,
  });
}

// ── run ───────────────────────────────────────────────────────────────────
const dir = join(ROOT, EVIDENCE_DIR);
const files = readdirSync(dir)
  .filter((f) => ['.json', '.md'].includes(extname(f)))
  .filter((f) => f !== 'INTEGRITY-MANIFEST.json')
  .sort();

const packets = [];
for (const f of files) {
  const rel = join(EVIDENCE_DIR, f);
  const full = join(dir, f);
  const rawText = readFileSync(full, 'utf8');

  if (extname(f) === '.md') {
    // Markdown evidence: seal the bytes, and check it cites a repro command.
    const artifact = canonicalize({ text: rawText });
    const checksum = seal(artifact);
    const findings = [];
    if (!/\n\s{4}node |```bash|## Repro/i.test(rawText)) findings.push('NO_REPRO_COMMAND');
    packets.push(buildPacket(rel, artifact, checksum,
      { declared: false, selfSeal: 'n/a', findings }, { provenance: null }));
    for (const c of findings) emit('warn', rel, c, 'markdown evidence');
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    emit('error', rel, 'UNPARSEABLE', error.message);
    continue;
  }

  const artifact = canonicalize(parsed);
  const checksum = seal(artifact);
  const schema = verifySchema(parsed);

  // Scoring provenance — the axis that silently changed today.
  const provenance = {
    chemistry: parsed.chemistry?.checksum
      ?? parsed.protocol?.chemistry?.checksum
      ?? parsed.chemistryProvenance?.checksum ?? null,
    atomBank: parsed.atomBankChecksum ?? parsed.control?.atomBankChecksum ?? null,
    grounding: parsed.groundingIndexChecksum ?? null,
  };
  const dependsOnChemistry = /cyclotron|fission|benchmark|chem/i.test(f);
  if (dependsOnChemistry && !provenance.chemistry) {
    schema.findings.push('NO_CHEMISTRY_PROVENANCE');
  }

  for (const c of schema.findings) {
    emit(c === 'SELF_CHECKSUM_MISMATCH' ? 'error' : 'warn', rel, c,
      c === 'NO_CHEMISTRY_PROVENANCE'
        ? 'numbers depend on concept-chemistry.js but no weights version is recorded'
        : '');
  }
  packets.push(buildPacket(rel, artifact, checksum, schema,
    { ...parsed, provenance }));
}

// ── drift detection against a prior manifest ──────────────────────────────
let drift = [];
if (existsSync(join(ROOT, MANIFEST_PATH))) {
  const prior = JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), 'utf8'));
  const priorByPath = new Map((prior.packets ?? []).map((p) => [p.path, p]));
  for (const p of packets) {
    const before = priorByPath.get(p.path);
    if (before && before.contentSeal !== p.contentSeal) {
      drift.push({ path: p.path, from: before.contentSeal, to: p.contentSeal });
      emit('error', p.path, 'CONTENT_DRIFT', 'artifact changed since last manifest');
    }
  }
  for (const [path] of priorByPath) {
    if (!packets.some((p) => p.path === path)) {
      drift.push({ path, from: 'present', to: 'DELETED' });
      emit('error', path, 'ARTIFACT_DELETED', 'was in manifest, now absent');
    }
  }
}

const manifest = {
  contract: CONTRACT,
  schemaVersion: '1.0.0',
  generatedFrom: 'nucleus bytecode-seal+canonical-serializer+diagnostic-event-bus+immutable-packet+schema-verifier (T2)',
  artifactCount: packets.length,
  packets,
  drift,
};
manifest.checksum = `evidence-integrity1:${sha256Hex(manifest)}`;

const byCode = {};
for (const e of bus) byCode[e.code] = (byCode[e.code] ?? 0) + 1;

console.log('=== EVIDENCE INTEGRITY HARNESS ===');
console.log(`audited ${packets.length} artifacts in ${EVIDENCE_DIR}\n`);
console.log('finding                        count');
for (const [code, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(28)} ${String(n).padStart(4)}`);
}
const errors = bus.filter((e) => e.severity === 'error');
console.log(`\nerrors ${errors.length}   warnings ${bus.length - errors.length}`);
for (const e of errors) console.log(`  ERROR  ${e.code.padEnd(24)} ${e.artifact}`);

if (!process.argv.includes('--write')) {
  console.log('\n(dry run — pass --write to record the baseline manifest)');
} else {
  writeFileSync(join(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`\nmanifest written -> ${MANIFEST_PATH}`);
}
process.exitCode = errors.length ? 1 : 0;
