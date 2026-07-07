#!/usr/bin/env node
/**
 * SCHOLOMANCE BRIDGE
 *
 * Unified CLI bridge for the DivTube TUI exposing:
 *   - Clerical RAID (scan, diagnose, train, stats, agent-query, merlin-ingest,
 *     cluster, duplicates, maintenance, feedback)
 *   - Cleri Probe (prion scan)
 *   - BytecodeHealth (green-path signal creation + verification)
 *   - Archive (codebase file listing, search, neighbors)
 *
 * Usage:
 *   node scripts/scholomance-bridge.mjs <command> [args...]
 *
 * Example:
 *   node scripts/scholomance-bridge.mjs scan "null pointer in combat hook"
 *   node scripts/scholomance-bridge.mjs stats
 *   node scripts/scholomance-bridge.mjs health IMMUNE_CELL PASS_COORD
 *   node scripts/scholomance-bridge.mjs archive-files
 *   node scripts/scholomance-bridge.mjs archive-search "quantum resonance"
 *   node scripts/scholomance-bridge.mjs archive-neighbors "src/pages/Combat/CombatPage.jsx"
 *
 * Each command outputs JSON to stdout.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

// ─── Lazy imports for MCP sub-modules ───────────────────────────────
async function importDiagnosticMcp() {
  return import(path.join(PROJECT_ROOT, 'codex/server/collab/diagnostic.mcp.js'));
}

async function createImmunityService() {
  const mod = await import(path.join(PROJECT_ROOT, 'codex/server/services/immunity.service.js'));
  return mod.createImmunityService({ log: console });
}

let _collabPersistence = null;
async function getCollabPersistence() {
  if (_collabPersistence) return _collabPersistence;
  try {
    const mod = await import(path.join(PROJECT_ROOT, 'codex/server/collab/collab.persistence.js'));
    _collabPersistence = mod.collabPersistence;
    return _collabPersistence;
  } catch (e) {
    return null;
  }
}

async function importBytecodeError() {
  return import(path.join(PROJECT_ROOT, 'codex/core/pixelbrain/bytecode-error.js'));
}

async function importCodebaseSearch() {
  return import(path.join(PROJECT_ROOT, 'codex/server/services/codebaseSearch.service.js'));
}

const LAW_DIR = path.join(PROJECT_ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW');

// ─── Clerical RAID ────────────────────────────────────────────────────

async function loadRaid() {
  const { createRaidWithSeeds } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.bootstrap.js')
  );
  return createRaidWithSeeds();
}

function normalizeBugReport(raw) {
  const symptoms = Array.isArray(raw.symptoms) ? raw.symptoms : [];
  const filePaths = Array.isArray(raw.filePaths) ? raw.filePaths : [];
  const errorMessages = [];
  if (raw.errorMessage) errorMessages.push(raw.errorMessage);
  if (Array.isArray(raw.errorMessages)) errorMessages.push(...raw.errorMessages);
  return {
    symptoms: symptoms.length ? symptoms : (raw.text ? [raw.text] : []),
    filePaths,
    layerHint: raw.layer ?? raw.layerHint ?? null,
    errorMessages,
    timestamp: raw.timestamp ?? Date.now()
  };
}

async function cmdScan(text) {
  const raid = await loadRaid();
  const result = raid.query({
    symptoms: [text],
    filePaths: [],
    timestamp: Date.now()
  });
  return result;
}

async function cmdDiagnose(reportPath) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.promises.readFile(abs, 'utf8'));
  const raid = await loadRaid();
  return raid.query(normalizeBugReport(json));
}

async function cmdTrain(patternPath) {
  const abs = path.isAbsolute(patternPath) ? patternPath : path.join(process.cwd(), patternPath);
  const json = JSON.parse(await fs.promises.readFile(abs, 'utf8'));
  const { Pattern } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.core.js')
  );
  const { AGENT_INDEX } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.schema.js')
  );
  const raid = await loadRaid();
  const pattern = new Pattern(
    json.id,
    json.name,
    json.symptoms ?? [],
    json.filePaths ?? [],
    json.errorMessages ?? [],
    resolveOwner(json.owner, AGENT_INDEX),
    json.fixPath ?? '',
    json.confidence ?? 1.0
  );
  raid.train(pattern);
  return { ok: true, id: pattern.id, patternCount: raid.patterns.length };
}

function resolveOwner(raw, AGENT_INDEX) {
  const OWNER_ALIASES = {
    codex: AGENT_INDEX.CODEX,
    claude: AGENT_INDEX.CLAUDE,
    gemini: AGENT_INDEX.GEMINI,
    blackbox: AGENT_INDEX.BLACKBOX,
    merlin: AGENT_INDEX.BLACKBOX,
    unknown: AGENT_INDEX.UNKNOWN
  };
  if (typeof raw === 'number' && raw >= 0 && raw <= 4) return raw;
  if (typeof raw === 'string') {
    const k = raw.toLowerCase();
    if (k in OWNER_ALIASES) return OWNER_ALIASES[k];
  }
  return AGENT_INDEX.UNKNOWN;
}

async function cmdStats() {
  const raid = await loadRaid();
  return raid.getStats();
}

async function cmdAgentQuery(agentKey, reportPath) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.promises.readFile(abs, 'utf8'));
  const raid = await loadRaid();
  const { agentHookQuery } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.agents.js')
  );
  return agentHookQuery(raid, agentKey, normalizeBugReport(json));
}

async function cmdMerlinIngest(reportPath, train = true) {
  const abs = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  const json = JSON.parse(await fs.promises.readFile(abs, 'utf8'));
  const raid = await loadRaid();
  const { autoTrainFromMerlinReport, extractVectorFromMerlinReport } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.learning.js')
  );
  const payload = autoTrainFromMerlinReport(raid, json, { train });
  const preview = extractVectorFromMerlinReport(json);
  return {
    ...payload,
    vectorPreview16: Array.from(preview.slice(0, 16))
  };
}

async function cmdCluster(minSim = 0.92) {
  const raid = await loadRaid();
  const { clusterPatternsBySimilarity } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.learning.js')
  );
  const clusters = clusterPatternsBySimilarity(raid, minSim);
  return { clusterCount: clusters.length, clusters };
}

async function cmdDuplicates(minSim = 0.97) {
  const raid = await loadRaid();
  const { findNearDuplicatePatterns } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.learning.js')
  );
  const pairs = findNearDuplicatePatterns(raid, minSim);
  return { pairCount: pairs.length, pairs };
}

async function cmdMaintenance() {
  const raid = await loadRaid();
  const { deprecateStalePatterns, patternEffectivenessScore } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.learning.js')
  );
  const deprecatedIds = deprecateStalePatterns(raid);
  const scores = raid.patterns
    .filter(p => !p.deprecated)
    .map(p => ({
      id: p.id,
      effectiveness: patternEffectivenessScore(p),
      hits: p.hitCount ?? 0,
      misses: p.missCount ?? 0
    }));
  return { deprecatedIds, stats: raid.getStats(), effectiveness: scores };
}

async function cmdFeedback(patternId, confirm) {
  const raid = await loadRaid();
  if (confirm) raid.confirm(patternId);
  else raid.feedbackNegative(patternId);
  const p = raid.patterns.find(x => x.id === patternId);
  return {
    ok: !!p,
    patternId,
    confidence: p?.confidence,
    hitCount: p?.hitCount,
    missCount: p?.missCount,
    effectiveness: p ? (await getEffectivenessScore(raid, p)) : null
  };
}

async function getEffectivenessScore(raid, pattern) {
  const { patternEffectivenessScore } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.learning.js')
  );
  return patternEffectivenessScore(pattern);
}

async function cmdRebuildIndex() {
  const raid = await loadRaid();
  raid.rebuildIndex();
  return { ok: true, ...raid.getStats() };
}

// ─── Cleri Probe ──────────────────────────────────────────────────────

async function cmdProbe(text, mode = 'prion', minResonance = 0.75, limit = 20) {
  const probeScript = path.join(PROJECT_ROOT, 'scripts/cleri-probe.js');
  if (!fs.existsSync(probeScript)) {
    return { error: 'cleri-probe.js not found at ' + probeScript };
  }
  const { execSync } = await import('node:child_process');
  const nodeBin = process.execPath;
  const args = [probeScript, text, '--mode=' + mode, '--min-resonance=' + minResonance, '--limit=' + limit];
  try {
    const output = execSync(nodeBin + ' ' + args.map(a => JSON.stringify(a)).join(' '), {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000
    });
    return { raw: output.trim() };
  } catch (e) {
    return { error: e.message, stderr: e.stderr?.toString() };
  }
}

// ─── BytecodeHealth ───────────────────────────────────────────────────

async function cmdCreateHealth(cellId, checkId, moduleId = null, context = {}) {
  const {
    BytecodeHealth,
    HEALTH_CODES,
    encodeBytecodeHealth,
    verifyHealthDeterminism
  } = await import(path.join(PROJECT_ROOT, 'codex/core/diagnostic/BytecodeHealth.js'));

  if (cellId === 'verify') {
    const result = verifyHealthDeterminism(checkId, moduleId || 'DEFAULT_CHECK');
    return result;
  }

  const h = new BytecodeHealth({
    code: HEALTH_CODES.IMMUNE_PASS_COORD,
    cellId,
    checkId,
    moduleId,
    context
  });
  return h.toJSON();
}

async function cmdVerifyHealth(cellId, checkId) {
  const { verifyHealthDeterminism } = await import(
    path.join(PROJECT_ROOT, 'codex/core/diagnostic/BytecodeHealth.js')
  );
  return verifyHealthDeterminism(cellId, checkId);
}

// ─── Archive (Codebase Filesystem) ────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.cache', 'coverage',
  '__pycache__', '.gradle', '.venv', 'gradle-8.5', 'references'
]);

function* walkFiles(dir, rootDir = dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walkFiles(fullPath, rootDir);
      } else {
        yield path.relative(rootDir, fullPath);
      }
    }
  } catch {
    // permission denied, skip
  }
}

async function cmdArchiveFiles() {
  const root = PROJECT_ROOT;
  const files = Array.from(walkFiles(root, root));
  return { count: files.length, files: files.slice(0, 1000) };
}

async function cmdArchiveSearch(query) {
  const { execSync } = await import('node:child_process');
  const q = query.toLowerCase();
  const root = PROJECT_ROOT;
  const results = [];
  
  // 1. Path match (fast)
  for (const relPath of walkFiles(root, root)) {
    if (results.length >= 50) break;
    if (relPath.toLowerCase().includes(q)) {
      results.push({ file_path: relPath, match: 'path' });
    }
  }

  // 2. Content match via grep (much faster than fs.readFileSync on 34k files)
  if (results.length < 20) {
    try {
      // Use grep -rlI to quickly find non-binary files containing the exact string
      const grepCmd = `grep -rlI --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.venv "${query.replace(/"/g, '\\"')}" .`;
      const output = execSync(grepCmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.split('\n').map(l => l.trim().replace(/^\.\//, '')).filter(Boolean);
      for (const line of lines) {
        if (results.length >= 50) break;
        // Ignore dirs grep might still catch despite -I
        const firstSegment = line.split('/')[0];
        if (IGNORED_DIRS.has(firstSegment)) continue;
        
        if (!results.some(r => r.file_path === line)) {
          results.push({ file_path: line, match: 'content' });
        }
      }
    } catch {
      // grep returns exit code 1 if no matches found, which throws
    }
  }
  return { query, count: results.length, results };
}

async function cmdArchiveNeighbors(filePath) {
  const root = PROJECT_ROOT;
  const target = path.resolve(root, filePath);
  const targetDir = path.dirname(target);
  const targetName = path.basename(target, path.extname(target));
  const neighbors = [];
  try {
    const dir = path.dirname(target);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name !== path.basename(target)) {
        neighbors.push({
          file_path: path.relative(root, path.join(dir, entry.name)),
          relation: 'sibling'
        });
      }
    }
  } catch {}
  if (neighbors.length < 10) {
    for (const relPath of walkFiles(root, root)) {
      if (neighbors.length >= 20) break;
      if (relPath === path.relative(root, target)) continue;
      if (neighbors.some(n => n.file_path === relPath)) continue;
      const name = path.basename(relPath, path.extname(relPath));
      if (name.includes(targetName) || targetName.includes(name)) {
        neighbors.push({
          file_path: relPath,
          relation: 'name_match'
        });
      }
    }
  }
  return { focus: path.relative(root, target), count: neighbors.length, neighbors };
}

// ─── MCP: Law ─────────────────────────────────────────────────────────

async function cmdLawGet(section, maxChars = 4000) {
  const lawFile = path.join(LAW_DIR, 'VAELRIX_LAW.md');
  const preambleFile = path.join(LAW_DIR, 'SHARED_PREAMBLE.md');
  let text = '';
  try { text = fs.readFileSync(lawFile, 'utf8'); } catch {}
  try { text += '\n\n' + fs.readFileSync(preambleFile, 'utf8'); } catch {}

  let excerpt = text.slice(0, maxChars);
  if (section) {
    const re = new RegExp(`(?:^|\\n)[^\\n]*${section}[^\\n]*\\n[\\s\\S]{0,${maxChars}}`, 'i');
    const match = text.match(re);
    if (match) excerpt = match[0];
  }

  return {
    section: section || 'global',
    source: 'VAELRIX_LAW.md + SHARED_PREAMBLE.md',
    excerpt,
    full_length: text.length,
    bytecode: 'SCHOL-LAW-RETRIEVE-V1',
  };
}

async function cmdLawAudit(filePath, intent, focusLaws) {
  const lawFile = path.join(LAW_DIR, 'VAELRIX_LAW.md');
  const preambleFile = path.join(LAW_DIR, 'SHARED_PREAMBLE.md');
  let lawText = '';
  try { lawText = fs.readFileSync(lawFile, 'utf8'); } catch {}
  try { lawText += '\n\n' + fs.readFileSync(preambleFile, 'utf8'); } catch {}

  const criticalLaws = ['Determinism', 'Pure Analysis', 'Bug Fix Documentation', 'Escalation'];
  const violations = [];
  const evidence = [];

  const targetContent = filePath
    ? (() => { try { return fs.readFileSync(path.resolve(PROJECT_ROOT, filePath), 'utf8'); } catch { return null; } })()
    : null;

  if (intent) {
    const iLower = intent.toLowerCase();
    if (/math\.random|date\.now|non.?determin/i.test(iLower)) {
      violations.push({ law: 'Determinism Is Non-Negotiable (6)', severity: 'CRIT', note: 'Non-deterministic source detected in intent' });
    }
    if (/render|effect|visual|display/.test(iLower)) {
      violations.push({ law: 'Pure Analysis Never Touches Effects (5)', severity: 'CRIT', note: 'Effect/render concern in non-render layer' });
    }
  }

  if (targetContent) {
    if (/Math\.random\(\)/.test(targetContent)) {
      violations.push({ law: 'Determinism (6) / QUANT-0101', severity: 'CRIT', note: 'Math.random outside explicit seeded context' });
    }
    if (/\bimport.*\b(render|react|three|pixi)\b/.test(targetContent)) {
      violations.push({ law: 'Pure Analysis Never Touches Effects (5) + LING-0F03', severity: 'CRIT', note: 'Render-adjacent import or hook in core layer' });
    }
  }

  return {
    ok: true,
    target_file: filePath || null,
    intent: intent || null,
    laws_checked: focusLaws || criticalLaws,
    violations,
    evidence,
    source_files: { vaelrix_law: lawFile, preamble: preambleFile },
    raw_law_excerpt: lawText.slice(0, 2400),
  };
}

async function cmdLawDebug(anomalyName, symptoms, targetFiles, mode = 'B', additionalContext) {
  const classification = targetFiles.length > 0 ? 'Structural/Integration' : 'Behavioral';
  const specificAudits = [];
  const joined = (symptoms.join(' ') + ' ' + (additionalContext || '') + ' ' + targetFiles.join(' ')).toLowerCase();

  if (/chroma|hue|color|viseme/.test(joined)) specificAudits.push('Chroma Audit: Check fixed-width bytecode alignment and 180° hue collisions.');
  if (/truesight|overlay|font|metric|caret/.test(joined)) specificAudits.push('TrueSight Audit: Pixel drift, coordinate indexing, font metrics.');
  if (/dimension|layout|hierarchy/.test(joined)) specificAudits.push('Dimension Audit: Hierarchy flattening, orphaned animation state.');
  if (/csrf|session|handshake|guest/.test(joined)) specificAudits.push('Session Audit: CSRF/Guest handshake integrity.');
  if (/recursion|depth|stack/.test(joined)) specificAudits.push('Stasis Threshold: Recursion depth (max 8) or math finite guards may be violated.');
  if (/math\.random|date\.now|non.?determin/.test(joined)) specificAudits.push('Determinism violation suspected — Law 6.');

  const debugTraceIR = {
    debug_trace_ir_version: "1.0.0",
    bug: { title: anomalyName, severity: symptoms.length > 4 ? "high" : "medium", confidence: 0.65 },
    failure_chain: symptoms.slice(0, 3),
    fix: { strategy: 'Minimal targeted patch after root cause confirmation.', files_to_change: targetFiles, rollback_plan: "Revert via git + re-run full verification suite." },
    grade: { letter: "B", score: 65, reason: "Initial MCP diagnostic; full human/agent review required per High Inquisitor ritual." },
  };

  const fullReport = [
    `# ${anomalyName} — Debug Report v1 (MCP)`,
    '',
    '## 1. Symptom',
    ...symptoms,
    '',
    '## 2. Classification',
    classification,
    '',
    '## 5. Root Cause',
    specificAudits.length ? `Suspected Scholomance-specific fracture. ${specificAudits.join(' ')}` : 'Requires deeper inspection.',
    '',
    '## 6. Evidence',
    ...symptoms.map(s => `- Direct: ${s}`),
    ...specificAudits.map(a => `- Inferred: ${a}`),
    '',
    additionalContext ? `## Additional Context\n${additionalContext}\n` : '',
    '## 15. DebugTraceIR',
    '```json',
    JSON.stringify(debugTraceIR, null, 2),
    '```',
  ].join('\n');

  return {
    anomaly: anomalyName,
    mode,
    report: fullReport,
    debug_trace_ir: debugTraceIR,
    recommended_next: [
      "Run immunity_scan on target files",
      "Execute relevant verification suite",
      "Document final fix in Encyclopedia per Law 11",
    ],
  };
}

// ─── MCP: Diagnostic ──────────────────────────────────────────────────

async function cmdDiagnosticScan({ trigger = 'mcp', writeMemory = true, memoryMax = 32, memoryIncludeHealth = false }) {
  const diag = await importDiagnosticMcp();
  return diag.triggerFullScan({ trigger, writeMemory, memoryMax, memoryIncludeHealth });
}

async function cmdDiagnosticSummary() {
  const diag = await importDiagnosticMcp();
  return diag.summary();
}

async function cmdDiagnosticLatest() {
  const diag = await importDiagnosticMcp();
  return diag.getLatestReport();
}

async function cmdDiagnosticReport(reportId) {
  const diag = await importDiagnosticMcp();
  return diag.getReportById({ reportId });
}

async function cmdDiagnosticViolations({ cell, severity, layer, ruleId, limit = 100 }) {
  const diag = await importDiagnosticMcp();
  return diag.queryViolations({ cell, severity, layer, ruleId, limit });
}

async function cmdDiagnosticHealth({ cellId, checkId, moduleId, limit = 100 }) {
  const diag = await importDiagnosticMcp();
  return diag.queryHealth({ cellId, checkId, moduleId, limit });
}

async function cmdDiagnosticHints(category, errorCode, context = {}) {
  const diag = await importDiagnosticMcp();
  return diag.getRecoveryHints({ category, errorCode, context });
}

async function cmdDiagnosticRunCells(files, cellFilter, commitHash, trigger) {
  const diag = await importDiagnosticMcp();
  return diag.runCells({ files, cellFilter, commitHash, trigger });
}

// ─── MCP: Immunity ────────────────────────────────────────────────────

async function cmdImmunityScan(filePath) {
  const absPath = path.resolve(PROJECT_ROOT, filePath);
  if (!fs.existsSync(absPath)) {
    return { error: `File not found: ${filePath}` };
  }
  const content = fs.readFileSync(absPath, 'utf8');
  const svc = await createImmunityService();
  return svc.scanFile(content, filePath);
}

async function cmdImmunityStatus() {
  const svc = await createImmunityService();
  return svc.getStatus();
}

// ─── MCP: RAID Query (enhanced) ───────────────────────────────────────

async function cmdRaidQuery(symptoms, filePaths, errorMessages, layerHint, agentRole) {
  const { createRaidWithSeeds } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.bootstrap.js')
  );
  const raid = createRaidWithSeeds();
  const bugReport = {
    symptoms: Array.isArray(symptoms) ? symptoms : [symptoms],
    filePaths: filePaths || [],
    errorMessages: errorMessages || [],
    layerHint: layerHint || null,
    timestamp: Date.now(),
  };

  if (agentRole) {
    const { agentHookQuery } = await import(
      path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.agents.js')
    );
    return agentHookQuery(raid, agentRole, bugReport);
  }
  return raid.query(bugReport);
}

// ─── MCP: Codebase Search ─────────────────────────────────────────────

async function cmdCodebaseHybridSearch(query) {
  const svc = await importCodebaseSearch();
  return svc.searchHybrid(query);
}

async function cmdForensicSearch(query, { isRegex = false, caseSensitive = false, includePattern, excludePattern, limit = 75 } = {}) {
  const svc = await importCodebaseSearch();
  return svc.forensicSearch(query, { isRegex, caseSensitive, includePattern, excludePattern, limit });
}

// ─── MCP: SQLite-backed CRUD (Bug Reports, Tasks, Agents, Memory) ───

async function withDb() {
  const db = await getCollabPersistence();
  if (!db) throw new Error('Collab persistence not available (better-sqlite3 not installed or DB not initialized). Run the collab server first.');
  return db;
}

async function cmdBugCreate({ title, summary, source_type, reporter_agent_id, priority = 1, bytecode, repro_steps, observed_behavior, expected_behavior }) {
  const db = await withDb();
  return db.bug_reports.create({ title, summary, source_type, reporter_agent_id, priority, bytecode, repro_steps: repro_steps || [], observed_behavior, expected_behavior });
}

async function cmdBugList({ status, severity, assigned_agent_id } = {}) {
  const db = await withDb();
  return db.bug_reports.getAll({ status, severity, assigned_agent_id });
}

async function cmdBugGet(id) {
  const db = await withDb();
  return db.bug_reports.getById(id);
}

async function cmdBugUpdate({ id, status, priority, assigned_agent_id, summary }) {
  const db = await withDb();
  return db.bug_reports.update(id, { status, priority, assigned_agent_id, summary });
}

async function cmdTaskCreate({ title, description, note, priority = 1, file_paths = [], depends_on = [], created_by = 'human', pipeline_run_id }) {
  const db = await withDb();
  return db.tasks.create({ title, description, note, priority, file_paths: JSON.stringify(file_paths), depends_on: JSON.stringify(depends_on), created_by, pipeline_run_id });
}

async function cmdTaskList({ status, agent } = {}) {
  const db = await withDb();
  return db.tasks.getAll({ status, assigned_agent: agent });
}

async function cmdTaskGet(id) {
  const db = await withDb();
  return db.tasks.getById(id);
}

async function cmdTaskUpdate({ id, title, description, status, priority, note }) {
  const db = await withDb();
  return db.tasks.update(id, { title, description, status, priority, note });
}

async function cmdAgentList({ role } = {}) {
  const db = await withDb();
  const agents = await db.agents.getAll();
  if (role) return agents.filter(a => a.role === role);
  return agents;
}

async function cmdMemoryGet(key, agentId = null) {
  const db = await withDb();
  const result = db.memories.get(agentId, key);
  // If the stored value is an object, return as-is; the bridge JSON-serializes it
  return result;
}

async function cmdInitPersistence() {
  try {
    const db = await getCollabPersistence();
    if (!db) return { available: false, reason: 'better-sqlite3 not installed' };
    return { available: true, dbPath: db.db?.name || 'in-memory' };
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

async function cmdMemorySet(key, value, agentId = null) {
  const db = await withDb();
  // Try to parse as JSON so callers can pass structured values via CLI
  let parsed = value;
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
    try { parsed = JSON.parse(value); } catch {}
  }
  return db.memories.set(agentId, key, parsed);
}

// ─── Iterative Healer ──────────────────────────────────────────────────

async function cmdApplyPatch(filePath, patchContent, backup = true) {
  const { IterativeHealer } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/iterative-healer.js')
  );
  const healer = new IterativeHealer(null, { projectRoot: PROJECT_ROOT });
  return healer._applyPatch(filePath, patchContent, 1);
}

async function cmdHeal(opts = {}) {
  const { createRaidWithSeeds } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/clerical-raid.bootstrap.js')
  );
  const { IterativeHealer } = await import(
    path.join(PROJECT_ROOT, 'codex/core/immunity/iterative-healer.js')
  );

  let bugReport;
  if (opts.bugReportFile) {
    // Support inline JSON or file path
    const trimmed = opts.bugReportFile.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        bugReport = JSON.parse(trimmed);
      } catch {
        bugReport = null;
      }
    }
    if (!bugReport) {
      const abs = path.isAbsolute(trimmed)
        ? trimmed
        : path.resolve(process.cwd(), trimmed);
      bugReport = JSON.parse(await fs.promises.readFile(abs, 'utf8'));
    }
  } else {
    bugReport = {
      symptoms: Array.isArray(opts.symptoms) ? opts.symptoms : [opts.symptoms || 'generic bug'],
      filePaths: opts.filePaths || [],
      errorMessages: opts.errorMessages || [],
      layerHint: opts.layerHint || null,
    };
  }

  const raid = createRaidWithSeeds();
  const healer = new IterativeHealer(raid, { projectRoot: PROJECT_ROOT });
  return healer.heal(bugReport, {
    taskId: opts.taskId || null,
    testSuite: opts.testSuite || 'qa',
    maxIterations: parseInt(opts.maxIterations) || 3,
    patchContent: opts.patch || null,
    targetFile: opts.targetFile || null,
  });
}

// ─── Main Dispatch ────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/scholomance-bridge.mjs <command> [args...]

Commands:
  # Clerical RAID
  scan <text>                RAID symptom scan
  diagnose <bug.json>        Diagnose a bug report file
  train <pattern.json>       Train a new pattern from file
  stats                      RAID statistics
  agent-query <agent> <bug.json>  Query via agent hook
  merlin-ingest <bug.json>   Auto-train from Merlin report
  cluster [--min-sim N]      Cluster similar patterns
  duplicates [--min-sim N]   Find near-duplicate patterns
  maintenance                Deprecate stale patterns
  feedback <id> --confirm|--reject  Pattern feedback
  rebuild-index              Re-quantize pattern index

  # Cleri Probe
  probe <text> [--mode M] [--min-resonance R]  Cleri probe scan

  # BytecodeHealth
  health <cellId> <checkId>  Create BytecodeHealth signal
  health-verify <cellId> <checkId>  Run 100x determinism check

  # Archive
  archive-files              List all indexed source files
  archive-search <query>     Search codebase path/name
  archive-neighbors <path>   Find neighboring files

  # MCP: Law
  law-get <section>          Query Vaelrix Law (e.g. "Determinism", "5")
    --max-chars N            Max chars to return (200-16000, default 4000)
  law-audit <file_path>      Audit a file against Vaelrix Law
    --intent <text>          Proposed change intent for pre-emptive audit
    --focus-laws <laws>      Comma-separated law names to check
  law-debug <anomaly> <symptoms...>  High Inquisitor debug report
    --mode A|B|C|D|E|F       Debug mode (default B=PatchReady)

  # MCP: Diagnostic
  diagnostic-scan            Run full codebase diagnostic scan
    --trigger <name>         Trigger source (default mcp)
    --write-memory <bool>    Persist findings (default true)
  diagnostic-summary         Quick summary of latest diagnostic report
  diagnostic-latest          Full latest diagnostic report
  diagnostic-report <id>     Get specific report by ID
  diagnostic-violations      Query violations from latest report
    --cell <name>            Filter by cell/layer name
    --severity <level>       Filter by severity (FATAL|CRIT|WARN|INFO)
    --layer <name>           Filter by context layer
    --rule-id <id>           Filter by rule ID
    --limit N                Max results (default 100)
  diagnostic-health           Query health signals from latest report
    --cell-id <name>         Filter by cell ID
    --check-id <name>        Filter by check name
    --module-id <path>       Filter by module path
    --limit N                Max results (default 100)
  diagnostic-hints <cat> <code>  Get recovery hints for error
    --context <json>         Additional error context
  diagnostic-run-cells       Run diagnostic cells on in-memory files
    --files <json>           Array of {path, content} objects
    --cell-filter <json>     Array of cell IDs to run

  # MCP: Immunity
  immunity-scan <file_path>  Scan file through immune system
  immunity-status            Immune system health status

  # MCP: RAID Query (enhanced)
  raid-query <symptoms...>   Full RAID query with optional agent hook
    --file-paths <paths>     Comma-separated affected file paths
    --error-msgs <msgs>      Comma-separated error messages
    --layer-hint <hint>      Layer hint
    --agent <role>           Agent role hook (codex|claude|gemini|merlin)

  # MCP: Codebase Search
  codebase-search <query>    Semantic + literal hybrid search
  forensic-search <query>    Advanced regex/literal file search
    --is-regex               Treat query as regex
    --case-sensitive         Case-sensitive search
    --include <glob>         File include pattern
    --exclude <glob>         File exclude pattern
    --limit N                Max results (default 75)

  # MCP: Bug Reports (requires collab server DB)
  bug-create <title> <source_type>  Create bug report
    --summary <text>         Detailed summary
    --priority <0-3>         Priority (default 1)
    --bytecode <str>         Bytecode error string
    --reporter <agent_id>    Agent ID
  bug-list [--status X] [--severity X]  List bug reports
  bug-get <id>               Get bug report by ID
  bug-update <id>            Update bug report
    --status <str>           New status
    --priority <0-3>         New priority

  # MCP: Tasks (requires collab server DB)
  task-create <title>        Create task
    --description <text>     Task description
    --priority <0-3>         Priority (default 1)
    --file-paths <paths>     Comma-separated file paths
  task-list [--status X]     List tasks
  task-get <id>              Get task by ID
  task-update <id>           Update task
    --status <str>           New status
    --note <text>            Update note (required)

  # MCP: Agents (requires collab server DB)
  agent-list [--role X]      List registered agents

  # MCP: Memory (requires collab server DB)
  memory-get <key>           Get memory value
    --agent-id <id>          Agent-specific memory
  memory-set <key> <value>   Set memory value
    --agent-id <id>          Agent-specific memory

  # MCP: Init (probe persistence availability)
  init-persistence           Check if persistence (SQLite) is available and initialize the DB

  # Iterative Healer (autonomous fix loop)
  apply-patch <file> <patch>  Apply a search/replace patch to a file
    --patch-file <path>       Load patch from file instead of inline

  heal <symptoms...>          Run the autonomous healing loop
    --bug-report <file.json>  Load full bug report from JSON file
    --file-paths <paths>      Comma-separated affected file paths
    --error-msgs <msgs>       Comma-separated error messages
    --layer-hint <hint>       Layer hint for RAID
    --task-id <id>            Task ID to link results to
    --test-suite <suite>      Verification suite (default: qa)
    --max-iterations N        Max heal iterations (default: 3)
    --patch <content>         Explicit patch content to apply
    --target-file <path>      Target file for the patch`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          out.flags[key] = argv[++i];
        } else {
          out.flags[key] = true;
        }
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    console.log(USAGE);
    process.exit(0);
  }

  const command = argv[0];
  const rest = parseArgs(argv.slice(1));

  let result;
  switch (command) {
    // ── Legacy commands ──────────────
    case 'scan':
      result = await cmdScan(rest._.join(' ').trim());
      break;
    case 'diagnose':
      result = await cmdDiagnose(rest._[0] || rest.flags.report);
      break;
    case 'train':
      result = await cmdTrain(rest._[0] || rest.flags.pattern);
      break;
    case 'stats':
      result = await cmdStats();
      break;
    case 'agent-query':
      result = await cmdAgentQuery(rest._[0], rest._[1] || rest.flags.report);
      break;
    case 'merlin-ingest':
      result = await cmdMerlinIngest(rest._[0] || rest.flags.report, !rest.flags['no-train']);
      break;
    case 'cluster':
      result = await cmdCluster(parseFloat(rest.flags['min-sim'] || rest.flags.minSim) || 0.92);
      break;
    case 'duplicates':
      result = await cmdDuplicates(parseFloat(rest.flags['min-sim'] || rest.flags.minSim) || 0.97);
      break;
    case 'maintenance':
      result = await cmdMaintenance();
      break;
    case 'feedback':
      result = await cmdFeedback(rest._[0] || rest.flags.pattern, !!rest.flags.confirm);
      break;
    case 'rebuild-index':
      result = await cmdRebuildIndex();
      break;
    case 'probe':
      result = await cmdProbe(
        rest._.join(' ').trim(),
        rest.flags.mode || 'prion',
        parseFloat(rest.flags['min-resonance'] || rest.flags.minResonance) || 0.75,
        parseInt(rest.flags.limit) || 20
      );
      break;
    case 'health':
      result = await cmdCreateHealth(
        rest._[0],
        rest._[1],
        rest.flags.module || null,
        rest.flags.context ? JSON.parse(rest.flags.context) : {}
      );
      break;
    case 'health-verify':
      result = await cmdVerifyHealth(rest._[0], rest._[1] || 'DEFAULT_CHECK');
      break;
    case 'archive-files':
      result = await cmdArchiveFiles();
      break;
    case 'archive-search':
      result = await cmdArchiveSearch(rest._.join(' ').trim());
      break;
    case 'archive-neighbors':
      result = await cmdArchiveNeighbors(rest._[0]);
      break;

    // ── MCP: Law ────────────────────────
    case 'law-get':
      result = await cmdLawGet(rest._[0], parseInt(rest.flags['max-chars'] || rest.flags.maxChars) || 4000);
      break;
    case 'law-audit': {
      const focusRaw = rest.flags['focus-laws'] || rest.flags.focusLaws;
      result = await cmdLawAudit(rest._[0], rest.flags.intent, focusRaw ? focusRaw.split(',').map(s => s.trim()) : null);
      break;
    }
    case 'law-debug':
      result = await cmdLawDebug(
        rest._[0] || 'Unnamed Anomaly',
        rest._.slice(1).length ? rest._.slice(1) : (rest.flags.symptoms ? rest.flags.symptoms.split(',') : ['Unknown symptom']),
        rest.flags['target-files'] ? rest.flags['target-files'].split(',') : [],
        (rest.flags.mode || 'B').toUpperCase(),
        rest.flags.context || rest.flags['additional-context'] || ''
      );
      break;

    // ── MCP: Diagnostic ───────────────
    case 'diagnostic-scan':
      result = await cmdDiagnosticScan({
        trigger: rest.flags.trigger || 'mcp',
        writeMemory: rest.flags['write-memory'] !== 'false',
        memoryMax: parseInt(rest.flags['memory-max'] || rest.flags.memoryMax) || 32,
        memoryIncludeHealth: rest.flags['memory-include-health'] === 'true',
      });
      break;
    case 'diagnostic-summary':
      result = await cmdDiagnosticSummary();
      break;
    case 'diagnostic-latest':
      result = await cmdDiagnosticLatest();
      break;
    case 'diagnostic-report':
      result = await cmdDiagnosticReport(rest._[0] || rest.flags.id);
      break;
    case 'diagnostic-violations':
      result = await cmdDiagnosticViolations({
        cell: rest.flags.cell || null,
        severity: rest.flags.severity || null,
        layer: rest.flags.layer || null,
        ruleId: rest.flags['rule-id'] || rest.flags.ruleId || null,
        limit: parseInt(rest.flags.limit) || 100,
      });
      break;
    case 'diagnostic-health':
      result = await cmdDiagnosticHealth({
        cellId: rest.flags['cell-id'] || rest.flags.cellId || null,
        checkId: rest.flags['check-id'] || rest.flags.checkId || null,
        moduleId: rest.flags['module-id'] || rest.flags.moduleId || null,
        limit: parseInt(rest.flags.limit) || 100,
      });
      break;
    case 'diagnostic-hints':
      result = await cmdDiagnosticHints(
        rest._[0] || rest.flags.category,
        rest._[1] || rest.flags.code || rest.flags.errorCode,
        rest.flags.context ? JSON.parse(rest.flags.context) : {}
      );
      break;
    case 'diagnostic-run-cells':
      result = await cmdDiagnosticRunCells(
        rest.flags.files ? JSON.parse(rest.flags.files) : [],
        rest.flags['cell-filter'] ? JSON.parse(rest.flags['cell-filter']) : null,
        rest.flags['commit-hash'] || 'mcp-inline',
        rest.flags.trigger || 'mcp'
      );
      break;

    // ── MCP: Immunity ────────────────
    case 'immunity-scan':
      result = await cmdImmunityScan(rest._[0] || rest.flags.path || rest.flags.file);
      break;
    case 'immunity-status':
      result = await cmdImmunityStatus();
      break;

    // ── MCP: RAID Query ─────────────
    case 'raid-query':
      result = await cmdRaidQuery(
        rest._.length ? rest._ : (rest.flags.symptoms ? [rest.flags.symptoms] : ['generic query']),
        rest.flags['file-paths'] ? rest.flags['file-paths'].split(',') : [],
        rest.flags['error-msgs'] ? rest.flags['error-msgs'].split(',') : [],
        rest.flags['layer-hint'] || rest.flags.layerHint || null,
        rest.flags.agent || null
      );
      break;

    // ── MCP: Codebase Search ────────
    case 'codebase-search':
      result = await cmdCodebaseHybridSearch(rest._.join(' ').trim());
      break;
    case 'forensic-search':
      result = await cmdForensicSearch(rest._.join(' ').trim(), {
        isRegex: !!rest.flags['is-regex'] || !!rest.flags.isRegex,
        caseSensitive: !!rest.flags['case-sensitive'] || !!rest.flags.caseSensitive,
        includePattern: rest.flags.include || null,
        excludePattern: rest.flags.exclude || null,
        limit: parseInt(rest.flags.limit) || 75,
      });
      break;

    // ── MCP: Bug Reports (SQLite) ───
    case 'bug-create':
      result = await cmdBugCreate({
        title: rest._[0],
        summary: rest.flags.summary || null,
        source_type: rest._[1] || rest.flags['source-type'] || 'agent',
        reporter_agent_id: rest.flags.reporter || null,
        priority: parseInt(rest.flags.priority) || 1,
        bytecode: rest.flags.bytecode || null,
        repro_steps: rest.flags['repro-steps'] ? rest.flags['repro-steps'].split('|') : [],
        observed_behavior: rest.flags['observed-behavior'] || null,
        expected_behavior: rest.flags['expected-behavior'] || null,
      });
      break;
    case 'bug-list':
      result = await cmdBugList({
        status: rest.flags.status || null,
        severity: rest.flags.severity || null,
        assigned_agent_id: rest.flags['assigned-agent'] || null,
      });
      break;
    case 'bug-get':
      result = await cmdBugGet(rest._[0] || rest.flags.id);
      break;
    case 'bug-update':
      result = await cmdBugUpdate({
        id: rest._[0] || rest.flags.id,
        status: rest.flags.status || null,
        priority: rest.flags.priority ? parseInt(rest.flags.priority) : null,
        assigned_agent_id: rest.flags['assigned-agent'] || null,
        summary: rest.flags.summary || null,
      });
      break;

    // ── MCP: Tasks (SQLite) ─────────
    case 'task-create':
      result = await cmdTaskCreate({
        title: rest._[0],
        description: rest.flags.description || null,
        note: rest.flags.note || null,
        priority: parseInt(rest.flags.priority) || 1,
        file_paths: rest.flags['file-paths'] ? rest.flags['file-paths'].split(',') : [],
        depends_on: rest.flags['depends-on'] ? rest.flags['depends-on'].split(',') : [],
        created_by: rest.flags['created-by'] || 'bridge',
      });
      break;
    case 'task-list':
      result = await cmdTaskList({
        status: rest.flags.status || null,
        agent: rest.flags.agent || null,
      });
      break;
    case 'task-get':
      result = await cmdTaskGet(rest._[0] || rest.flags.id);
      break;
    case 'task-update':
      result = await cmdTaskUpdate({
        id: rest._[0] || rest.flags.id,
        title: rest.flags.title || null,
        description: rest.flags.description || null,
        status: rest.flags.status || null,
        priority: rest.flags.priority ? parseInt(rest.flags.priority) : null,
        note: rest.flags.note || '',
      });
      break;

    // ── MCP: Agents (SQLite) ────────
    case 'agent-list':
      result = await cmdAgentList({ role: rest.flags.role || null });
      break;

    // ── MCP: Memory (SQLite) ────────
    case 'memory-get':
      result = await cmdMemoryGet(rest._[0] || rest.flags.key, rest.flags['agent-id'] || rest.flags.agentId || null);
      break;
    case 'memory-set':
      result = await cmdMemorySet(
        rest._[0] || rest.flags.key,
        rest._[1] || rest.flags.value || true,
        rest.flags['agent-id'] || rest.flags.agentId || null
      );
      break;

    // ── MCP: Init ────────────────────
    case 'init-persistence':
      result = await cmdInitPersistence();
      break;

    // ── Iterative Healer ─────────
    case 'apply-patch': {
      let patchContent;
      if (rest.flags['patch-file']) {
        if (rest.flags['patch-file'] === '/dev/stdin') {
          patchContent = fs.readFileSync('/dev/stdin', 'utf8');
        } else {
          patchContent = fs.readFileSync(rest.flags['patch-file'], 'utf8');
        }
      } else {
        patchContent = rest._.slice(1).join(' ').trim();
      }
      result = await cmdApplyPatch(rest._[0], patchContent, rest.flags.backup !== 'false');
      break;
    }
    case 'heal':
      result = await cmdHeal({
        symptoms: rest._.length ? rest._ : (rest.flags.symptoms ? [rest.flags.symptoms] : null),
        filePaths: rest.flags['file-paths'] ? rest.flags['file-paths'].split(',') : [],
        errorMessages: rest.flags['error-msgs'] ? rest.flags['error-msgs'].split(',') : [],
        layerHint: rest.flags['layer-hint'] || null,
        bugReportFile: rest.flags['bug-report'] || null,
        taskId: rest.flags['task-id'] || null,
        testSuite: rest.flags['test-suite'] || 'qa',
        maxIterations: rest.flags['max-iterations'] || 3,
        patch: rest.flags.patch || null,
        targetFile: rest.flags['target-file'] || null,
      });
      break;

    // ── Osmosis: Memory Cell Substrate Scan ────────
    case 'osmosis-scan': {
      const payloadStr = rest.flags.payload || rest._[0] || '[]';
      let payload;
      try {
        payload = JSON.parse(payloadStr);
      } catch (e) {
        result = { error: `Invalid JSON payload: ${e.message}` };
        break;
      }

      try {
        const {
          createMemoryCellPacket,
          evaluateMemoryCellOsmosis,
          scanMemoryCells,
          MEMORY_CELL_VECTOR_DIMENSIONS,
        } = await import(path.join(PROJECT_ROOT, 'codex/core/immunity/memory-cell-osmosis.js'));

        const cells = [];
        const observations = [];

        for (const entry of payload) {
          // Build a 128-dim vector from the payload
          const rawVec = Array.isArray(entry.vector) ? entry.vector : [];
          const vec = new Float32Array(MEMORY_CELL_VECTOR_DIMENSIONS);
          for (let i = 0; i < Math.min(rawVec.length, MEMORY_CELL_VECTOR_DIMENSIONS); i++) {
            vec[i] = Math.max(-1, Math.min(1, Number(rawVec[i]) || 0));
          }

          // Determine cell family and mode
          const family = entry.family || 'runtime';
          const mode = entry.mode || 'baseline';
          const cellId = entry.cell_id || entry.key || `cell-${cells.length}`;

          // Create the memory cell packet
          const cell = createMemoryCellPacket({
            id: cellId,
            family,
            mode,
            vector: vec,
            membrane: entry.membrane || {
              similarityFloor: 0.92,
              driftCeiling: 0.08,
              concentrationLimit: 0.99,
            },
            stableContext: {
              detector: 'substrate-osmosis-bridge',
              key: entry.key || cellId,
              scanSource: 'divtube-tui',
            },
            seed: 42,
          });

          cells.push(cell);
          observations.push({
            vector: vec,
            concentration: entry.concentration || 0,
          });
        }

        // Run osmosis evaluation on each cell
        const results = [];
        for (let i = 0; i < cells.length; i++) {
          try {
            const osmResult = evaluateMemoryCellOsmosis(cells[i], observations[i]);
            results.push({
              ...osmResult,
              key: payload[i].key || payload[i].cell_id || `cell-${i}`,
            });
          } catch (evalErr) {
            results.push({
              cellId: cells[i].id,
              key: payload[i].key || `cell-${i}`,
              status: 'error',
              anomalyKind: 'evaluation_error',
              similarity: 0,
              drift: 1,
              concentration: 0,
              confidence: 0,
              error: evalErr.message,
            });
          }
        }

        result = {
          contract: 'SCHOL-MEMCELL-OSMOSIS-SCAN-v1',
          scanned: cells.length,
          anomalies: results.filter(r => r.status === 'anomaly').length,
          results,
        };
      } catch (e) {
        result = { error: `Osmosis scan failed: ${e.message}`, stack: e.stack };
      }
      break;
    }

    default:
      console.error('Unknown command: ' + command);
      console.error(USAGE);
      process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
