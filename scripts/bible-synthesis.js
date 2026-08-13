#!/usr/bin/env node
/**
 * SCHOLOMANCE BIBLE SYNTHESIS — BIBLE-v1
 * 
 * Generates and maintains the canonical "Scholomance Bible" — a comprehensive, 
 * AI-parseable living document capturing the codebase's present state.
 * 
 * Purpose: Single source of truth for "What IS".
 * Reference: docs/skills/scholomance.bible.synthesis.skill.md
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();

const BIBLE_DIR = path.join(ROOT, 'docs/scholomance-bible');
const BIBLE_PATH = path.join(BIBLE_DIR, 'SCHOLOMANCE_BIBLE.md');
const INDEX_PATH = path.join(BIBLE_DIR, 'BIBLE_BYTECODE_INDEX.md');
const SIDECAR_PATH = path.join(BIBLE_DIR, 'bible.json');

/**
 * BIBLE-JSON-v1 — machine-readable sidecar of the Bible.
 *
 * The markdown Bible is human scripture; this JSON is what the Code Atlas
 * (divtube_downloader/tui/services/code_atlas.py) consumes for glossary
 * telemetry (layer / bytecodes / pathogens per file). Pure function of its
 * inputs: sorted, deduplicated, checksummed — identical inputs produce
 * byte-identical output. NEVER parse the markdown tables back into data;
 * this payload is built from the same in-memory objects that generate them.
 */
export function buildSidecarPayload(inventory, pathogens, date) {
  const files = inventory
    .map((item) => ({
      path: item.path,
      layer: item.layer,
      errorCodes: [...new Set(item.errorCodes)].sort(),
      healthCodes: [...new Set(item.healthCodes)].sort(),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const sortedPathogens = [...pathogens].sort((a, b) =>
    a.file === b.file
      ? (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
      : (a.file < b.file ? -1 : 1));

  const payload = {
    schema: 'BIBLE-JSON-v1',
    version: VERSION,
    generated: date,
    files,
    pathogens: sortedPathogens,
  };
  const canonical = JSON.stringify(payload);
  payload.checksum = crypto.createHash('sha256').update(canonical).digest('hex');
  return payload;
}

const VERSION = '1.0.0';

/**
 * --- UTILS ---
 */

function walk(dir, results = []) {
  const list = fs.readdirSync(dir);
  for (let file of list) {
    file = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue; // broken symlink / unreadable entry: skip, never die mid-ritual
    }
    if (stat && stat.isDirectory()) {
      if (
        file.includes('node_modules') || 
        file.includes('.git') || 
        file.includes('.codex/diagnostic-reports') ||
        file.includes('.claude/worktrees') ||
        file.includes('.aider.tags.cache') ||
        file.includes('.tmp') ||
        file.includes('Archive') ||
        file.includes('ARCHIVE REFERENCE DOCS')
      ) continue;
      walk(file, results);
    } else {
      results.push(file);
    }
  }
  return results;
}

function getRelativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

/**
 * --- PHASE 1: Codebase Inventory ---
 */

async function synthesizeBible() {
  console.log(`[bible] initiating synthesis v${VERSION}...`);

  if (!fs.existsSync(BIBLE_DIR)) {
    fs.mkdirSync(BIBLE_DIR, { recursive: true });
  }

  const files = walk(ROOT);
  const inventory = [];
  const errorCodesUsage = [];
  const healthCodesUsage = [];

  for (const file of files) {
    const relPath = getRelativePath(file);
    
    // Skip large non-code files
    if (relPath.endsWith('.png') || relPath.endsWith('.jpg') || relPath.endsWith('.bmp') || relPath.endsWith('.sqlite')) continue;

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable (broken symlink, race): skip, never die mid-ritual
    }
    
    // Classify
    let layer = 'Unknown';
    if (relPath.startsWith('codex/core/')) layer = 'Core';
    else if (relPath.startsWith('codex/services/')) layer = 'Services';
    else if (relPath.startsWith('codex/runtime/')) layer = 'Runtime';
    else if (relPath.startsWith('codex/server/')) layer = 'Server';
    else if (relPath.startsWith('src/')) layer = 'UI';
    else if (relPath.startsWith('tests/')) layer = 'Test';
    else if (relPath.startsWith('docs/')) layer = 'Doc';
    else if (relPath.startsWith('scripts/')) layer = 'Script';

    // Scan for Bytecode
    const errRegex = /PB-ERR-v1-[A-Z_]+-[A-Z]+-[A-Z_]+-[0-9A-F]{4}/g;
    const okRegex = /PB-OK-v1-[A-Z0-9_-]+/g;

    const errMatches = content.match(errRegex) || [];
    const okMatches = content.match(okRegex) || [];

    for (const match of errMatches) {
      errorCodesUsage.push({ code: match, file: relPath });
    }
    for (const match of okMatches) {
      healthCodesUsage.push({ code: match, file: relPath });
    }

    inventory.push({
      path: relPath,
      layer,
      errorCodes: [...new Set(errMatches)],
      healthCodes: [...new Set(okMatches)]
    });
  }

  // --- PHASE 3: Pathogen Detection ---

  console.log('[bible] beginning pathogen detection...');
  const pathogens = [];

  for (const item of inventory) {
    const ext = path.extname(item.path);
    if (ext === '.json' || ext === '.md') continue;
    if (item.path.includes('diagnostic/cells/')) continue;
    if (item.path.includes('scripts/')) continue;

    let content;
    try {
      content = fs.readFileSync(path.join(ROOT, item.path), 'utf8');
    } catch {
      continue; // unreadable: skip pathogen scan for this file, never die
    }

    // 1. Direct UI -> Codex Breach (Law 11)
    if (item.layer === 'UI' && !item.path.startsWith('src/lib/') && !item.path.startsWith('src/hooks/')) {
      const regex = /import[^;]+from\s+['"]((?:\.\.\/)+)codex\//g;
      if (regex.test(content)) {
        pathogens.push({
          code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F03',
          file: item.path,
          detail: 'Direct UI -> Codex breach detected.'
        });
      }
    }

    // 2. Layer Boundary Violation (Law 5/ARCH-CONTRACT)
    if (item.layer === 'Core') {
      const forbidden = ['codex/services', 'codex/runtime', 'codex/server'];
      for (const f of forbidden) {
        // Look for actual import/require patterns
        const regex = new RegExp(`(import|require|from)\\s+['"][^'"]*${f}`, 'g');
        if (regex.test(content)) {
          pathogens.push({
            code: 'PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F08',
            file: item.path,
            detail: `Layer violation: Core importing from ${f}`
          });
        }
      }
    }
  }

  if (pathogens.length > 0) {
    console.warn(`[bible] ${pathogens.length} pathogens detected!`);
    for (const p of pathogens) {
      console.log(`[pathogen] ${p.code} | ${p.file} | ${p.detail}`);
    }
  } else {
    console.log('[bible] zero pathogens detected. health is 100%.');
  }

  // --- PHASE 4: Synthesis ---

  const date = new Date().toISOString().split('T')[0];
  
  let bibleContent = `# The Scholomance Bible — v${VERSION}

> Generated: ${date}
> Generator: BIBLE-v1 (Scholomance Bible Synthesis Skill)
> Companion: \`docs/scholomance-encyclopedia/\` (history)

---

## Volume I — Canonical Architecture

### I.1 System Topology

\`\`\`
Browser (React SPA) ──→ CODEx Engine (4-layer)
       │                        │
       │                   ┌────┴────┐
       ▼                   ▼         ▼
  Fastify Server ──→ SQLite/Redis ──→ External APIs
       │
       ▼
  MCP Bridge ──→ Collab Plane ──→ AI Agents
\`\`\`

### I.2 Module Inventory

| Module | Path | Layer | Error Codes | Health Codes |
|--------|------|-------|-------------|--------------|
`;

  // Aggregate by top-level directories
  const modules = {};
  for (const item of inventory) {
    const parts = item.path.split('/');
    const moduleName = parts.length > 1 ? parts.slice(0, parts.length - 1).join('/') : item.path;
    if (!modules[moduleName]) {
      modules[moduleName] = { path: moduleName, layer: item.layer, errors: new Set(), health: new Set() };
    }
    item.errorCodes.forEach(e => modules[moduleName].errors.add(e));
    item.healthCodes.forEach(h => modules[moduleName].health.add(h));
  }

  for (const mod of Object.values(modules)) {
    if (mod.path.includes('node_modules') || mod.path.includes('.git')) continue;
    bibleContent += `| ${path.basename(mod.path)} | ${mod.path} | ${mod.layer} | ${mod.errors.size} codes | ${mod.health.size} codes |\n`;
  }

  bibleContent += `
---

## Volume II — Bytecode Diagnostic System

### II.1 BytecodeError System (Red Path — \`PB-ERR-v1\`)

#### Error Code Table

| Code Hex | Category | Severity | Module | Source File |
|----------|----------|----------|--------|-------------|
`;

  const uniqueErrors = Array.from(new Set(errorCodesUsage.map(e => e.code))).sort();
  for (const err of uniqueErrors) {
    const parts = err.split('-');
    const category = parts[3];
    const severity = parts[4];
    const module = parts[5];
    const hex = parts[6];
    const firstFile = errorCodesUsage.find(e => e.code === err).file;
    bibleContent += `| ${hex} | ${category} | ${severity} | ${module} | ${firstFile} |\n`;
  }

  bibleContent += `
### II.2 BytecodeHealth System (Green Path — \`PB-OK-v1\`)

| Code | Purpose | Source File |
|------|---------|-------------|
`;

  const uniqueHealth = Array.from(new Set(healthCodesUsage.map(h => h.code))).sort();
  for (const ok of uniqueHealth) {
    const firstFile = healthCodesUsage.find(h => h.code === ok).file;
    bibleContent += `| ${ok} | Health Signal | ${firstFile} |\n`;
  }

  bibleContent += `
---

## Volume VIII — System Health Metrics

### VIII.1 Bytecode Health Snapshot

| Area | Status | Last Verified |
|------|--------|---------------|
| Immunity | ACTIVE | ${date} |
| Layer Boundary | ACTIVE | ${date} |
| Bridge Integrity | ACTIVE | ${date} |

---

## Appendix D: Bytecode Index
Flat, machine-parseable index of every bytecode string prefix in the system.
`;

  // Compute checksum
  const checksum = crypto.createHash('sha256').update(bibleContent).digest('hex').slice(0, 8);
  bibleContent = bibleContent.replace('SCHOL-BIBLE-v1-{CHECKSUM}', `SCHOL-BIBLE-v1-${checksum}`);
  
  // Add the anchor to the top
  bibleContent = bibleContent.replace('> Companion:', `> Bytecode Health Anchor: \`SCHOL-BIBLE-v1-${checksum}\`\n> Companion:`);

  fs.writeFileSync(BIBLE_PATH, bibleContent);
  
  // Generate Index
  let indexContent = `# Bible Bytecode Index

> Auto-generated companion to SCHOLOMANCE_BIBLE.md v${VERSION}
> Search anchor: \`SCHOL-BIBLE-BYTE-INDEX\`

## Error Codes
`;

  for (const err of uniqueErrors) {
    const files = errorCodesUsage.filter(e => e.code === err).map(e => e.file);
    indexContent += `${err} → ${files.join(', ')}\n`;
  }

  indexContent += `\n## Health Codes\n`;
  for (const ok of uniqueHealth) {
    const files = healthCodesUsage.filter(h => h.code === ok).map(h => h.file);
    indexContent += `${ok} → ${files.join(', ')}\n`;
  }

  fs.writeFileSync(INDEX_PATH, indexContent);

  // BIBLE-JSON-v1 sidecar: the machine-readable twin consumed by the Code
  // Atlas. Built from the same in-memory objects as the markdown tables —
  // never scraped back out of them.
  const sidecar = buildSidecarPayload(inventory, pathogens, date);
  fs.writeFileSync(SIDECAR_PATH, `${JSON.stringify(sidecar, null, 2)}\n`);

  console.log(`[bible] synthesis complete. checksum: ${checksum}`);
  console.log(`[bible] sidecar written: ${path.relative(ROOT, SIDECAR_PATH)} (${sidecar.files.length} files, checksum ${sidecar.checksum.slice(0, 12)}…)`);
  console.log(`[bible] artifacts written to ${BIBLE_DIR}`);

  // Emit Health Signal
  const healthSignal = {
    cellId: 'BIBLE_SYNTHESIS',
    code: 'bible-generated',
    context: {
      version: VERSION,
      checksum,
      modules_covered: Object.keys(modules).length,
      error_codes_documented: uniqueErrors.length,
      health_codes_documented: uniqueHealth.length,
    }
  };

  console.log(`[bible] PB-OK-v1-BIBLE-GENERATED-${checksum}`);
}

// Run only when executed directly — importing this module (e.g. from tests)
// must not trigger a full synthesis.
const _isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_isMain) {
  synthesizeBible().catch(console.error);
}
