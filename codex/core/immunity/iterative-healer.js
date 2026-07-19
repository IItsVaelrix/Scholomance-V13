/**
 * ITERATIVE HEALER — closes the autonomous loop
 *
 * Sequences: diagnose → apply patch → verify → learn → repeat/stop.
 * Exposes a single heal() entry point that callers (bridge CLI, MCP, agent) invoke.
 *
 * @bytecode SCHOL-HEALER-V1
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');

const VERIFICATION_COMMANDS = {
  lint:     ['npm run lint'],
  typecheck:['npm run typecheck'],
  test:     ['npm test'],
  qa:       ['npm run test:qa'],
  backend:  ['npm run test:qa:backend', 'npm run verify:backend-contract'],
  e2e:      ['npm run test:e2e'],
  build:    ['npm run build'],
};

const DEFAULT_MAX_ITERATIONS = 3;
const DEFAULT_TEST_SUITE = 'qa';

export class IterativeHealer {
  constructor(raid, options = {}) {
    this.raid = raid;
    this.projectRoot = options.projectRoot || PROJECT_ROOT;
    this.maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
    this.defaultTestSuite = options.defaultTestSuite || DEFAULT_TEST_SUITE;
    this.iterationHistory = [];
  }

  /**
   * Main entry: diagnose → fix → verify → learn (with optional recursion)
   *
   * @param {object} bugReport  { symptoms, filePaths?, errorMessages?, layerHint? }
   * @param {object} opts
   * @param {string}  [opts.taskId]
   * @param {string}  [opts.testSuite]     - verification profile (default: 'qa')
   * @param {number}  [opts.maxIterations]
   * @param {string}  [opts.patchContent]  - optional pre-computed patch to apply
   * @param {string}  [opts.targetFile]    - target file for the patch
   * @returns {Promise<HealResult>}
   */
  async heal(bugReport, opts = {}) {
    const maxIt = opts.maxIterations ?? this.maxIterations;
    const testSuite = opts.testSuite || this.defaultTestSuite;
    const { taskId } = opts;

    let currentSymptoms = [...(bugReport.symptoms || [])];
    let currentFiles = [...(bugReport.filePaths || [])];
    let currentErrors = [...(bugReport.errorMessages || [])];
    let currentLayer = bugReport.layerHint || null;

    for (let iteration = 1; iteration <= maxIt; iteration++) {
      const enrichedReport = {
        symptoms: currentSymptoms,
        filePaths: currentFiles,
        errorMessages: currentErrors,
        layerHint: currentLayer,
        timestamp: Date.now(),
      };

      // --- DIAGNOSE ---
      const diagnosis = this.raid.query(enrichedReport);
      const iterRecord = {
        iteration,
        diagnosis: {
          verdict: diagnosis.verdict,
          confidence: diagnosis.confidence,
          patternId: diagnosis.matchedPattern?.id || null,
          patternName: diagnosis.matchedPattern?.name || null,
          fixPath: diagnosis.fixPath,
          owner: diagnosis.owner,
        },
        appliedFix: false,
        testResult: null,
        feedback: null,
      };

      if (diagnosis.verdict !== 'CONFIRMED' || !diagnosis.matchedPattern) {
        // Not confident enough — escalate
        iterRecord.status = 'ESCALATED';
        iterRecord.reason = `Verdict: ${diagnosis.verdict} (confidence: ${diagnosis.confidence?.toFixed(3)})`;
        this.iterationHistory.push(iterRecord);
        return this._buildResult('ESCALATED', diagnosis, iteration, iterRecord, taskId);
      }

      const pattern = diagnosis.matchedPattern;

      // --- APPLY FIX ---
      // Determine target file: explicit opts.targetFile, or first filePath from bugReport, or pattern's fixPath
      const targetFile = opts.targetFile
        || (currentFiles.length > 0 ? currentFiles[0] : null)
        || pattern.fixPath;

      if (!targetFile) {
        iterRecord.status = 'ESCALATED';
        iterRecord.reason = 'No target file to patch';
        this.iterationHistory.push(iterRecord);
        return this._buildResult('ESCALATED', diagnosis, iteration, iterRecord, taskId);
      }

      // Load fix template from pattern's fixPath if no explicit patch provided
      let patchToApply = opts.patchContent;
      if (!patchToApply && pattern.fixPath) {
        patchToApply = this._loadFixTemplate(pattern, targetFile, enrichedReport);
      }

      if (!patchToApply) {
        iterRecord.status = 'ESCALATED';
        iterRecord.reason = `Pattern ${pattern.id} has fixPath but no resolvable fix template`;
        this.iterationHistory.push(iterRecord);
        return this._buildResult('ESCALATED', diagnosis, iteration, iterRecord, taskId);
      }

      // Dry-run: diagnose + resolve patch, but never write or verify.
      if (opts.dryRun) {
        const preview = typeof patchToApply === 'string'
          ? patchToApply.slice(0, 4000)
          : String(patchToApply).slice(0, 4000);
        iterRecord.status = 'DRY_RUN';
        iterRecord.wouldApply = true;
        iterRecord.patchPreview = preview;
        this.iterationHistory.push(iterRecord);
        const base = this._buildResult('DRY_RUN', diagnosis, iteration, iterRecord, taskId);
        return {
          ...base,
          dry_run: true,
          target_file: targetFile,
          patch_preview: preview,
          would_apply: true,
          would_test_suite: testSuite,
        };
      }

      const applyResult = this._applyPatch(targetFile, patchToApply, iteration);
      iterRecord.appliedFix = true;
      iterRecord.applyResult = applyResult;

      if (!applyResult.success) {
        iterRecord.status = 'FAILED';
        iterRecord.reason = `Patch application failed: ${applyResult.error}`;
        this.iterationHistory.push(iterRecord);
        return this._buildResult('FAILED', diagnosis, iteration, iterRecord, taskId);
      }

      // --- VERIFY ---
      const testResult = this._runVerification(testSuite);
      iterRecord.testResult = testResult;

      // --- LEARN ---
      if (testResult.status === 'PASS') {
        this.raid.confirm(pattern.id);
        iterRecord.feedback = 'CONFIRMED';
        iterRecord.status = 'HEALED';
        this.iterationHistory.push(iterRecord);
        return this._buildResult('HEALED', diagnosis, iteration, iterRecord, taskId);
      }

      // Test FAILED — dampen pattern, enrich symptoms, retry
      this.raid.feedbackNegative(pattern.id);
      iterRecord.feedback = 'DAMPENED';

      const enriched = this._enrichFromTestOutput(testResult, enrichedReport);
      currentSymptoms = enriched.symptoms;
      currentFiles = enriched.filePaths;
      currentErrors = enriched.errorMessages;
      currentLayer = enriched.layerHint;

      iterRecord.enrichedSymptoms = currentSymptoms;
      this.iterationHistory.push(iterRecord);

      // Last iteration: give up after exhausting retries
      if (iteration === maxIt) {
        return this._buildResult('FAILED', diagnosis, iteration, iterRecord, taskId, {
          reason: `Exhausted ${maxIt} iterations`,
          testOutput: testResult.summary,
        });
      }
    }
  }

  /**
   * Load a fix template from the pattern's fixPath.
   * Patterns may reference a fix file, a template, or inline content.
   */
  _loadFixTemplate(pattern, targetFile, bugReport) {
    if (!pattern.fixPath) return null;

    const fixCandidate = path.resolve(this.projectRoot, pattern.fixPath);
    if (fs.existsSync(fixCandidate)) {
      return fs.readFileSync(fixCandidate, 'utf8');
    }

    // Check for a fix template directory
    const fixDir = path.join(this.projectRoot, 'codex/core/immunity/fixes');
    const fixFile = path.join(fixDir, `${pattern.id}.patch`);
    if (fs.existsSync(fixFile)) {
      return fs.readFileSync(fixFile, 'utf8');
    }

    // If fixPath looks like inline content (contains SEARCH/REPLACE markers), use it directly
    if (pattern.fixPath.includes('---\n') || pattern.fixPath.includes('===')) {
      return pattern.fixPath;
    }

    return null;
  }

  /**
   * Parse and apply a patch to the filesystem.
   * Supports two formats:
   *   1. SEARCH_BLOCK\n---\nREPLACE_BLOCK  (standard agent patch format)
   *   2. Unified diff (basic parsing)
   *   3. Raw content (replaces entire file)
   */
  _applyPatch(relativePath, patchContent, iteration, options = {}) {
    const { relaxedWhitespace = false, backup = true } = options;
    const absPath = path.resolve(this.projectRoot, relativePath);
    if (!fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${relativePath}` };
    }

    // Backup original on first iteration (or when backup is explicitly requested)
    if (backup && (iteration === 1 || iteration === -1)) {
      const bakPath = absPath + '.healer.bak';
      if (!fs.existsSync(bakPath)) {
        fs.copyFileSync(absPath, bakPath);
      }
    }

    /**
     * Normalize whitespace for fuzzy matching: collapse multiple spaces/tabs to
     * single spaces, trim trailing whitespace from each line, and trim the block.
     */
    const _normWs = (s) => s.split('\n').map(l => l.replace(/[\t ]+$/, '').replace(/^[\t ]+/, '')).join('\n').replace(/[\t ]+/g, ' ').trim();

    try {
      // Format 1: SEARCH / REPLACE block
      const sepIndex = patchContent.indexOf('\n---\n');
      if (sepIndex !== -1) {
        const searchBlock = patchContent.slice(0, sepIndex);
        const replaceBlock = patchContent.slice(sepIndex + 5);

        const currentContent = fs.readFileSync(absPath, 'utf8');
        if (currentContent.includes(searchBlock)) {
          // Exact match — fast path
          const newContent = currentContent.replace(searchBlock, replaceBlock);
          fs.writeFileSync(absPath, newContent, 'utf8');
          return { success: true, method: 'search_replace_exact', bytesWritten: newContent.length };
        }

        // ── Relaxed whitespace fallback ──────────────────────────────────
        if (relaxedWhitespace) {
          const normSearch = _normWs(searchBlock);
          const normContent = _normWs(currentContent);

          if (normContent.includes(normSearch)) {
            // Find the normalized match region in the original content by
            // walking character-by-character tracking index mappings.
            const normIdx = normContent.indexOf(normSearch);
            // Walk original to find where normalized index maps: count chars
            // that produce normContent up to normIdx.
            let origStart = 0;
            let nIdx = 0;
            for (let i = 0; i < currentContent.length && nIdx < normIdx; i++) {
              const ch = currentContent[i];
              // Skip collapsed whitespace
              if ((ch === ' ' || ch === '\t') && nIdx > 0 && normContent[nIdx - 1] === ' ') {
                continue;
              }
              if (ch === '\n') {
                // Normalized newline handling: skip trailing whitespace before \n
                const pre = currentContent.slice(Math.max(0, i - 20), i);
                const wsMatch = pre.match(/[\t ]+$/);
                if (wsMatch) { i -= wsMatch[0].length; continue; }
              }
              nIdx++;
              if (nIdx >= normIdx) { origStart = i + 1; break; }
            }
            // Walk to find end of normalized match
            let origEnd = origStart;
            let remaining = normSearch.length;
            for (let i = origStart; i < currentContent.length && remaining > 0; i++) {
              const ch = currentContent[i];
              if ((ch === ' ' || ch === '\t') && i > origStart && currentContent[i - 1] === ' ') continue;
              remaining--;
              if (remaining <= 0) { origEnd = i + 1; break; }
            }

            const originalBlock = currentContent.slice(origStart, origEnd);
            const newContent = currentContent.replace(originalBlock, replaceBlock);
            fs.writeFileSync(absPath, newContent, 'utf8');
            return {
              success: true,
              method: 'search_replace_relaxed',
              bytesWritten: newContent.length,
              note: 'Matched via relaxed whitespace normalization',
            };
          }

          // Still not found — give a helpful error with whitespace diff
          const searchPreview = searchBlock.slice(0, 120);
          const normPreview = normSearch.slice(0, 120);
          return {
            success: false,
            error: `Search block not found in ${relativePath} (exact OR relaxed). Block start: ${searchPreview}`,
            hint: `Normalized form: ${normPreview}. Try reading the file to copy the exact block.`,
          };
        }

        return {
          success: false,
          error: `Search block not found in ${relativePath}. Block start: ${searchBlock.slice(0, 80)}. Tip: set relaxed_whitespace=true`,
        };
      }

      // Format 2: Unified diff (---/+++ lines with @@ hunks)
      if (patchContent.startsWith('--- ') || patchContent.includes('\n--- ')) {
        const result = this._applyUnifiedDiff(absPath, patchContent);
        return result;
      }

      // Format 3: Treat as raw content replacement
      fs.writeFileSync(absPath, patchContent, 'utf8');
      return { success: true, method: 'full_replace', bytesWritten: patchContent.length };
    } catch (err) {
      // Rollback on error
      const bakPath = absPath + '.healer.bak';
      if (fs.existsSync(bakPath) && iteration === 1) {
        fs.copyFileSync(bakPath, absPath);
      }
      return { success: false, error: err.message };
    }
  }

  _applyUnifiedDiff(absPath, diffContent) {
    const currentLines = fs.readFileSync(absPath, 'utf8').split('\n');
    const resultLines = [...currentLines];
    let offset = 0;

    const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/gm;
    let match;
    while ((match = hunkRegex.exec(diffContent)) !== null) {
      const oldStart = parseInt(match[1], 10);
      const oldCount = match[2] ? parseInt(match[2], 10) : 1;
      const newStart = parseInt(match[3], 10);

      // Extract lines for this hunk
      const hunkStart = match.index;
      const nextMatch = diffContent.indexOf('@@ ', hunkStart + match[0].length);
      const hunkEnd = nextMatch !== -1 ? nextMatch : diffContent.length;
      const hunkLines = diffContent.slice(hunkStart + match[0].length, hunkEnd).split('\n').filter(l => l.length > 0);

      const removeLines = [];
      const addLines = [];
      for (const line of hunkLines) {
        if (line.startsWith('-')) removeLines.push(line.slice(1));
        else if (line.startsWith('+')) addLines.push(line.slice(1));
        // context lines (space-prefixed or no prefix) are skipped for positional reference
      }

      const idx = oldStart - 1 + offset;
      resultLines.splice(idx, removeLines.length, ...addLines);
      offset += addLines.length - removeLines.length;
    }

    fs.writeFileSync(absPath, resultLines.join('\n'), 'utf8');
    return { success: true, method: 'unified_diff' };
  }

  /**
   * Run a verification suite and return structured result.
   */
  _runVerification(testSuite) {
    const commands = VERIFICATION_COMMANDS[testSuite];
    if (!commands) {
      return { status: 'FAIL', suite: testSuite, error: `Unknown suite: ${testSuite}` };
    }

    const outputs = [];
    for (const cmd of commands) {
      outputs.push(`$ ${cmd}`);
      try {
        const out = execSync(cmd, {
          cwd: this.projectRoot,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 300000,
        });
        outputs.push(out);
      } catch (err) {
        const errMsg = err.stderr || err.stdout || err.message;
        outputs.push(errMsg);
        return {
          status: 'FAIL',
          suite: testSuite,
          commands,
          summary: outputs.join('\n').slice(-2000),
          error: errMsg.slice(-1000),
          exitCode: err.status,
        };
      }
    }

    return {
      status: 'PASS',
      suite: testSuite,
      commands,
      summary: outputs.join('\n').slice(-2000),
    };
  }

  /**
   * Parse test output for new symptom signals to enrich the bug report.
   * Extracts: failing test names, file paths from stack traces, error messages.
   */
  _enrichFromTestOutput(testResult, originalReport) {
    if (!testResult || !testResult.summary) {
      return {
        symptoms: originalReport.symptoms,
        filePaths: originalReport.filePaths,
        errorMessages: originalReport.errorMessages,
        layerHint: originalReport.layerHint,
      };
    }

    let text = testResult.summary || '';
    if (testResult.error) text += '\n' + testResult.error;

    const newSymptoms = [...originalReport.symptoms];
    const newFiles = [...originalReport.filePaths];
    const newErrors = [...(originalReport.errorMessages || [])];

    // Extract FAIL lines from Vitest/Playwright output
    const failRegex = /(?:FAIL|✗|×|failed)\s+([^\n]+)/gi;
    let m;
    while ((m = failRegex.exec(text)) !== null) {
      const line = m[1].trim();
      if (line && !newSymptoms.some(s => s.includes(line))) {
        newSymptoms.push(`Test failure: ${line}`);
      }
    }

    // Extract file paths from stack traces
    const fileRegex = /(?:at\s+)?(?:file:\/\/)?([\w/.-]+\.(?:js|jsx|ts|tsx|mjs)):\d+:\d+/g;
    while ((m = fileRegex.exec(text)) !== null) {
      const fp = m[1];
      if (fp.includes(this.projectRoot) || fp.startsWith('/')) {
        const rel = path.relative(this.projectRoot, fp);
        if (rel && !rel.startsWith('..') && !newFiles.includes(rel)) {
          newFiles.push(rel);
        }
      }
    }

    // Extract assertion errors
    const assertRegex = /(?:AssertionError|expect\.|received|expected)\s*([^.\n]{20,})/gi;
    while ((m = assertRegex.exec(text)) !== null) {
      const err = m[1].trim();
      if (err && !newErrors.includes(err)) {
        newErrors.push(err);
      }
    }

    return {
      symptoms: newSymptoms,
      filePaths: newFiles,
      errorMessages: newErrors,
      layerHint: originalReport.layerHint,
    };
  }

  _buildResult(status, diagnosis, iteration, lastRecord, taskId, extra = {}) {
    const pattern = diagnosis.matchedPattern;
    const raidStats = this.raid.getStats();

    return {
      healer_version: '1.0.0',
      bytecode: 'SCHOL-HEALER-V1',
      status,
      verdict: diagnosis.verdict,
      confidence: diagnosis.confidence,
      iterations: iteration,
      pattern: pattern ? {
        id: pattern.id,
        name: pattern.name,
        fixPath: pattern.fixPath,
        confidence: pattern.confidence,
        hitCount: pattern.hitCount,
        missCount: pattern.missCount,
      } : null,
      taskId: taskId || null,
      iterationHistory: this.iterationHistory,
      raidStats: {
        patternCount: raidStats.patternCount,
        confirmed: raidStats.confirmed,
        denied: raidStats.denied,
        novel: raidStats.novel,
      },
      ...extra,
    };
  }
}
