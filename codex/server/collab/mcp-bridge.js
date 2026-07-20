/**
 * Scholomance MCP Bridge
 *
 * Transmutes the collab control plane into a formal Model Context Protocol
 * server without bypassing the authoritative orchestration layer.
 */

import crypto from 'node:crypto';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { execSync } from 'node:child_process';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as schemas from './collab.schemas.js';
import {
    BytecodeError,
    ERROR_CATEGORIES,
    ERROR_SEVERITY,
    MODULE_IDS,
    ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';
import { IterativeHealer } from '../../core/immunity/iterative-healer.js';
import { analyzeDesignIntent } from '../../core/grimdesign/intentAnalyzer.js';
import { resolveDesignDecisions } from '../../core/grimdesign/decisionEngine.js';

const MOD = MODULE_IDS.SHARED;
import { CollabServiceError, collabService } from './collab.service.js';
import { collabDiagnostic } from './collab.diagnostic.js';
import {
  getLatestReport as diagnosticGetLatestReport,
  getReportById as diagnosticGetReportById,
  queryViolations as diagnosticQueryViolations,
  queryHealth as diagnosticQueryHealth,
  runCells as diagnosticRunCells,
  summary as diagnosticSummary,
  getRecoveryHints as diagnosticGetRecoveryHints,
  triggerFullScan as diagnosticTriggerFullScan,
} from './diagnostic.mcp.js';
import { 
    searchCodebase, 
    forensicSearch, 
    searchHybrid, 
    getFileNeighbors, 
    listIndexedFiles 
} from '../services/codebaseSearch.service.js';
import { createRaidWithSeeds } from '../../core/immunity/clerical-raid.bootstrap.js';
import { agentHookQuery, merlinAutoTrainPipeline } from '../../core/immunity/clerical-raid.agents.js';
import {
    merlinReportToBugReport,
    extractVectorFromMerlinReport,
    clusterPatternsBySimilarity,
    deprecateStalePatterns,
    findNearDuplicatePatterns,
    patternEffectivenessScore,
} from '../../core/immunity/clerical-raid.learning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

function traceMcpBridge(message) {
    if (!process.env.SCHOL_MCP_BRIDGE_TRACE) return;
    fs.appendFileSync(process.env.SCHOL_MCP_BRIDGE_TRACE, `${new Date().toISOString()} ${message}\n`);
}

/** In-memory Clerical RAID library for MCP session (Phase 3–4 hooks). */
let clericalRaidMcp = null;
function getClericalRaidMcp() {
    if (!clericalRaidMcp) clericalRaidMcp = createRaidWithSeeds();
    return clericalRaidMcp;
}

function toJsonText(value) {
    return JSON.stringify(value, null, 2);
}

function createResourcePayload(uri, value) {
    return {
        contents: [{
            uri,
            mimeType: 'application/json',
            text: toJsonText(value),
        }],
    };
}

function createToolSuccess(tool, result) {
    return {
        content: [{
            type: 'text',
            text: toJsonText({
                ok: true,
                tool,
                result,
            }),
        }],
    };
}

function createToolError(error) {
    if (error instanceof CollabServiceError) {
        return {
            content: [{
                type: 'text',
                text: toJsonText({
                    ok: false,
                    code: error.code,
                    error: error.message,
                    details: error.details,
                }),
            }],
            isError: true,
        };
    }

    return {
        content: [{
            type: 'text',
            text: toJsonText({
                ok: false,
                code: 'INTERNAL_ERROR',
                error: error instanceof Error ? error.message : 'Unknown MCP bridge error',
            }),
        }],
        isError: true,
    };
}

/**
 * Direct (Ollama-free) bridge into the Vaelrix brain network + ForceField.
 * Called from the governing MCP layer so every connected model/agent gets
 * a native tap into the specialized brains (CODE, PIXEL, LORE, ARCHITECTURE, etc.)
 * and the full amplifier/arbiter/SCDNA pipeline.
 */
function callDirectBrain(action, args = {}) {
    const script = path.join(ROOT, 'steamdeck_brain', 'direct_brain.py');
    const pythonPath = path.join(ROOT, 'steamdeck_brain');
    let cmd = `python3 "${script}" --action ${action}`;
    if (args.query) {
        const safe = String(args.query).replace(/"/g, '\\"');
        cmd += ` --query "${safe}"`;
    }
    if (args.name || args.brain) cmd += ` --name ${args.name || args.brain}`;
    if (args.domain) cmd += ` --domain ${args.domain}`;

    try {
        const out = execSync(cmd, {
            encoding: 'utf8',
            cwd: ROOT,
            env: { ...process.env, PYTHONPATH: pythonPath },
            maxBuffer: 8 * 1024 * 1024,
            timeout: 180_000,
        });
        return JSON.parse(out);
    } catch (err) {
        const stdout = err.stdout ? String(err.stdout) : '';
        const stderr = err.stderr ? String(err.stderr) : '';
        let parsed = null;
        try {
            parsed = stdout ? JSON.parse(stdout) : null;
        } catch {
            // Preserve raw stdout below when the subprocess did not emit JSON.
        }
        return {
            error: err.message || 'direct_brain execution failed',
            stdout: stdout.slice(0, 2000),
            stderr: stderr.slice(0, 1000),
            parsed,
        };
    }
}

function registerJsonResource(server, name, uri, reader) {
    server.resource(name, uri, async () => createResourcePayload(uri, await reader()));
}

function registerJsonResourceTemplate(server, name, uriTemplate, reader) {
    server.resource(
        name,
        new ResourceTemplate(uriTemplate, {}),
        async (uri, variables) => createResourcePayload(uri.href, await reader(variables)),
    );
}

const TOOL_ALIASES = new Map(Object.entries({
    mcp_scholomance_collab_bug_report_create: ['bug_create'],
    mcp_scholomance_collab_bug_report_update: ['bug_update'],
    mcp_scholomance_collab_bug_report_parse_bytecode: ['bug_parse_bytecode'],
    mcp_scholomance_collab_bug_report_create_task: ['bug_create_task'],
    mcp_scholomance_collab_execute_verification: ['verify_run'],
    mcp_scholomance_collab_diagnostic_get_latest_report: ['diagnostic_latest'],
    mcp_scholomance_collab_diagnostic_get_report_by_id: ['diagnostic_report'],
    mcp_scholomance_collab_diagnostic_query_violations: ['diagnostic_violations'],
    mcp_scholomance_collab_diagnostic_query_health: ['diagnostic_health'],
    mcp_scholomance_collab_diagnostic_run_cells: ['diagnostic_run_cells'],
    mcp_scholomance_collab_diagnostic_get_recovery_hints: ['diagnostic_hints'],
    mcp_scholomance_collab_diagnostic_trigger_full_scan: ['diagnostic_full_scan'],
    mcp_scholomance_collab_diagnostic_summary: ['diagnostic_summary'],
    mcp_scholomance_collab_codebase_list_files: ['codebase_list'],
    mcp_scholomance_collab_codebase_hybrid_search: ['codebase_search'],
    mcp_scholomance_collab_codebase_get_neighbors: ['codebase_neighbors'],
    mcp_scholomance_collab_immunity_scan_file: ['immunity_scan'],
    mcp_scholomance_collab_immunity_get_status: ['immunity_status'],
    mcp_scholomance_collab_clerical_raid_query: ['raid_query'],
    mcp_scholomance_collab_clerical_raid_merlin_ingest: ['raid_merlin_ingest'],
    mcp_scholomance_collab_clerical_raid_feedback: ['raid_feedback'],
    mcp_scholomance_collab_clerical_raid_learning: ['raid_learning'],
    mcp_scholomance_collab_skill_vaelrix_law_audit: ['law_audit'],
    mcp_scholomance_collab_skill_scholomance_feedback: ['scholomance_feedback'],
    mcp_scholomance_collab_skill_scholomance_knowledge: ['skill_scholomance'],
    mcp_scholomance_collab_agent_list: ['agent_list'],
    mcp_scholomance_collab_brain_list: ['brain_list', 'list_brains'],
    mcp_scholomance_collab_brain_forcefield_ask: ['brain_ask', 'forcefield', 'ask_brain'],
    mcp_scholomance_collab_brain_run: ['brain_run', 'run_brain'],
    mcp_scholomance_collab_brain_scdna_genes: ['scdna_genes', 'genes'],
    mcp_scholomance_collab_task_list: ['task_list'],
    mcp_scholomance_collab_pipeline_list: ['pipeline_list'],
    mcp_scholomance_collab_fs_find: ['fs_find', 'find_file'],
    mcp_scholomance_collab_fs_propose_patch: ['propose_patch', 'edit_propose'],
    mcp_scholomance_collab_fs_apply_patch: ['apply_patch'],
    mcp_scholomance_collab_fs_replace_file_content: ['replace_file_content', 'edit_file', 'fs_edit'],
    mcp_scholomance_collab_fs_batch_patch: ['batch_patch', 'transaction_patch', 'multi_edit'],
    mcp_scholomance_collab_fs_path_complete: ['path_complete', 'path_autocomplete', 'tab_complete'],
    mcp_scholomance_collab_tui_inspect: ['tui_inspect', 'live_state', 'ui_snapshot'],
    mcp_scholomance_collab_heal: ['heal', 'iterative_heal'],
    mcp_scholomance_collab_law_get: ['law_get'],
    mcp_scholomance_collab_lock_list: ['lock_list'],
    mcp_scholomance_collab_skill_vaelrix_law_debug: ['vaelrix_law_debug', 'law_debug', 'high_inquisitor_debug', 'debug_oracle'],
}));

function registerTool(server, name, inputSchema, handler) {
    const names = [name, ...(TOOL_ALIASES.get(name) || [])];

    for (const toolName of names) {
        server.tool(toolName, inputSchema, async (params) => {
            try {
                return createToolSuccess(toolName, await handler(params));
            } catch (error) {
                return createToolError(error);
            }
        });
    }
}

// ── GrimDesign spec builder ───────────────────────────────────────────────────

function toKebab(str) {
    return String(str || 'grim-component')
        .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
        .replace(/^-/, '')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
}

function buildAnimKeyframes(animationClass, durationMs) {
    const dur = durationMs || 2400;
    const frames = {
        'grim-pulse': `@keyframes grim-pulse {
  0%, 100% { opacity: 0.8; box-shadow: var(--grim-glow); }
  50%       { opacity: 1.0; box-shadow: var(--grim-glow), 0 0 calc(var(--grim-glow-radius, 8px) * 1.5) var(--grim-color); }
}`,
        'grim-breathe': `@keyframes grim-breathe {
  0%, 100% { transform: scale(1.000); box-shadow: none; }
  50%       { transform: scale(1.015); box-shadow: var(--grim-glow); }
}`,
        'grim-shimmer': `@keyframes grim-shimmer {
  0%, 100% { filter: hue-rotate(0deg)   brightness(1.00); }
  50%       { filter: hue-rotate(20deg)  brightness(1.15); }
}`,
    };
    const keyframe = frames[animationClass] || '';
    if (!keyframe) return '';
    return `@media (prefers-reduced-motion: no-preference) {\n  ${keyframe.replace(/\n/g, '\n  ')}\n}`;
}

/**
 * Renders a full GrimDesign output spec block from a signal + decisions pair.
 */
function buildGrimSpec(intent, signal, decisions, componentName) {
    const name    = componentName || 'GrimComponent';
    const kebab   = toKebab(name);
    const { dominantSchool, effectClass, provenance } = signal;
    const {
        color, glowRadius, glowColor, borderAlpha,
        animationClass, animationDurationMs,
        atmosphereLevel, scanlines,
        componentComplexity, transitionMs,
        fontSizeRem, fontWeight, worldLawReason, cssVars,
    } = decisions;

    const { h, s, l } = signal.blendedHsl;
    const lMuted       = Math.min(75, l + 15);
    const glowLine     = glowRadius > 0 ? `0 0 ${glowRadius}px ${glowColor}` : 'none';
    const borderLine   = `1px solid hsla(${h}, ${s}%, ${lMuted}%, ${borderAlpha})`;
    const animLine     = animationClass ? `${animationClass} ${animationDurationMs}ms ease-in-out` : 'none';
    const atmLine      = `${atmosphereLevel}${scanlines ? ' + scanlines' : ''}`;

    const complexityDesc = {
        1: 'single surface, no sub-layers',
        2: 'header + body',
        3: 'header + body + footer/meta row',
        4: 'full card with multiple sections',
    }[componentComplexity] || 'single surface';

    const provenanceBlock = (Array.isArray(provenance) ? provenance : [])
        .map((line) => `  ${line}`)
        .join('\n');

    const cssVarsInline = Object.entries(cssVars || {})
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n');

    const animKeyframes = animationClass ? buildAnimKeyframes(animationClass, animationDurationMs) : '';

    const jsxSkeleton = `function ${name}({ children, className = '' }) {
  return (
    <div
      className={\`${kebab} \${className}\`}
      role="region"
      aria-label="${name}"
    >
      {children}
    </div>
  );
}`;

    const cssDelta = `.${kebab} {
${cssVarsInline}
  color: var(--grim-color);
  border: var(--grim-border);
  box-shadow: var(--grim-glow);
  font-size: var(--grim-font-size);
  font-weight: var(--grim-font-weight);
  transition: color var(--grim-transition), box-shadow var(--grim-transition), border-color var(--grim-transition);
}

${animKeyframes ? animKeyframes + '\n\n' : ''}.${kebab} {
  animation: ${animLine};
}`.trim();

    return `## ${name} — GrimDesign Output

CLASSIFICATION: new component
WHY: ${worldLawReason}
WORLD-LAW CONNECTION: ${dominantSchool} effectClass ${effectClass} via phonemic signal in "${intent}"

SIGNAL PROVENANCE:
${provenanceBlock || '  (no provenance)'}

DESIGN DECISIONS:
  color:        ${color}
  glow:         ${glowLine}
  border:       ${borderLine}
  animation:    ${animLine}
  atmosphere:   ${atmLine}
  complexity:   ${componentComplexity} (${complexityDesc})
  transition:   ${transitionMs}ms

CODE:
${jsxSkeleton}

CSS DELTA:
${cssDelta}

HANDOFF TO BLACKBOX:
  Update visual regression baselines in tests/visual/ that include ${name}.

QA CHECKLIST:
- [ ] No logic imported from codex/ or src/lib/
- [ ] State via hooks/context only
- [ ] ARIA labels present
- [ ] Reduced motion respected (prefers-reduced-motion disables ${animationClass || 'animation'})
- [ ] School CSS variables consumed, not hardcoded
- [ ] No inline styles for state
- [ ] dangerouslySetInnerHTML sanitized if used`;
}

export function registerCollabMcpBridge(server, service = collabService) {
    registerJsonResource(server, 'agents', 'collab://agents', () => service.listAgents());
    registerJsonResource(server, 'tasks', 'collab://tasks', () => service.listTasks());
    registerJsonResource(server, 'locks', 'collab://locks', () => service.listLocks());
    registerJsonResource(server, 'activity', 'collab://activity', () => service.listActivity({ limit: 50 }));
    registerJsonResource(server, 'pipelines', 'collab://pipelines', () => service.listPipelines());
    registerJsonResource(server, 'bugs', 'collab://bugs', () => service.listBugReports());
    registerJsonResource(server, 'status', 'collab://status', () => service.getStatus());
    registerJsonResource(server, 'memories', 'collab://memories', () => service.listMemories());

    server.resource('skill-scholomance', 'collab://skills/scholomance', async () => ({
        contents: [{
            uri: 'collab://skills/scholomance',
            mimeType: 'text/markdown',
            text: fs.readFileSync(path.join(ROOT, 'codex/server/collab/skills/scholomance.md'), 'utf8'),
        }],
    }));

    // Additional canonical ritual skills (now directly readable via MCP resources)
    server.resource('vaelrix-law-debug', 'collab://skills/vaelrix-law-debug', async () => ({
        contents: [{
            uri: 'collab://skills/vaelrix-law-debug',
            mimeType: 'text/markdown',
            text: fs.readFileSync(path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/vaelrix_law_debug.md'), 'utf8'),
        }],
    }));

    server.resource('scholomance-feedback', 'collab://skills/scholomance-feedback', async () => ({
        contents: [{
            uri: 'collab://skills/scholomance-feedback',
            mimeType: 'text/markdown',
            text: fs.readFileSync(path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/scholomance-feedback/scholomance-feedback.md'), 'utf8'),
        }],
    }));

    registerJsonResourceTemplate(server, 'agent-memories', 'collab://agents/{id}/memories', async ({ id }) => {
        return service.listMemories(id);
    });

    registerJsonResourceTemplate(server, 'task-notes', 'collab://tasks/{id}/notes', async ({ id }) => {
        const task = await service.getTask(id);
        return task?.notes || [];
    });

    registerJsonResourceTemplate(server, 'bug-report', 'collab://bugs/{id}', async ({ id }) => {
        return service.getBugReport(id);
    });

    // --- Official Protocol Tools (mcp_scholomance_collab_ prefix) ---

    registerTool(server, 'mcp_scholomance_collab_bug_report_create', {
        title: z.string().describe('Short title of the bug'),
        summary: z.string().optional().describe('Detailed summary'),
        source_type: z.enum(['human', 'runtime', 'qa', 'pipeline', 'agent']).describe('Source of the report'),
        reporter_agent_id: z.string().optional().describe('Agent ID filing the report'),
        priority: z.number().int().min(0).max(3).optional().default(1).describe('Priority (0-3)'),
        bytecode: z.string().optional().describe('PixelBrain bytecode error string'),
        repro_steps: z.array(z.string()).optional().describe('Steps to reproduce'),
        observed_behavior: z.string().optional().describe('What actually happened'),
        expected_behavior: z.string().optional().describe('What should have happened'),
    }, params => service.createBugReport(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_update', {
        id: z.string().describe('Bug report ID'),
        status: z.string().optional().describe('New status (triaged, fixed, etc)'),
        priority: z.number().int().min(0).max(3).optional(),
        assigned_agent_id: z.string().optional().nullable(),
        summary: z.string().optional(),
    }, params => service.updateBugReport(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_list', {
        status: z.string().optional(),
        severity: z.string().optional(),
        assigned_agent_id: z.string().optional(),
    }, params => service.listBugReports(params));

    registerTool(server, 'mcp_scholomance_collab_bug_report_get', {
        id: z.string().describe('Bug report ID'),
    }, ({ id }) => service.getBugReport(id));

    registerTool(server, 'mcp_scholomance_collab_bug_report_parse_bytecode', {
        bytecode: z.string().describe('Raw bytecode to parse and verify'),
    }, ({ bytecode }) => service.parseBytecode(bytecode));

    registerTool(server, 'mcp_scholomance_collab_bug_report_create_task', {
        id: z.string().describe('Bug report ID to convert to task'),
        actor_agent_id: z.string().optional(),
    }, ({ id, actor_agent_id }) => service.createTaskFromBug(id, actor_agent_id));

    registerTool(server, 'mcp_scholomance_collab_agent_register', {
        id: z.string().describe('Unique agent ID (e.g. merlin-cli)'),
        name: z.string().describe('Display name'),
        role: schemas.AgentRole.describe('Agent role'),
        capabilities: z.array(z.string()).optional().default([]).describe('List of agent capabilities'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Opaque agent metadata'),
    }, params => service.registerAgent(params));

    registerTool(server, 'mcp_scholomance_collab_agent_heartbeat', {
        id: z.string().describe('Agent ID'),
        status: z.enum(['online', 'busy', 'offline']).optional().default('online').describe('Heartbeat status'),
        current_task_id: z.string().nullable().optional().describe('Currently active task, if any'),
    }, params => service.heartbeatAgent(params));

    registerTool(server, 'mcp_scholomance_collab_agent_delete', {
        id: z.string().describe('Agent ID to remove from the control plane (terminates presence)'),
    }, ({ id }) => service.deleteAgent(id));

    registerTool(server, 'mcp_scholomance_collab_task_create', {
        title: z.string().describe('Task ritual title'),
        description: z.string().optional().describe('Detailed task purpose'),
        note: z.string().optional().describe('Initial status note for the task'),
        priority: z.number().int().min(0).max(3).optional().default(1).describe('Priority level (0-3)'),
        file_paths: z.array(z.string()).optional().default([]).describe('Relevant file substrates'),
        depends_on: z.array(z.string()).optional().default([]).describe('Task dependencies'),
        created_by: z.string().optional().default('human').describe('Origin of the task'),
        pipeline_run_id: z.string().optional().describe('Owning pipeline run, if any'),
    }, params => service.createTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_get', {
        id: z.string().describe('Task ID'),
    }, ({ id }) => service.getTask(id));

    registerTool(server, 'mcp_scholomance_collab_task_assign', {
        task_id: z.string().describe('Task ID'),
        agent_id: z.string().describe('Agent ID'),
        override: z.boolean().optional().default(false).describe('Bypass ownership checks'),
    }, params => service.assignTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_update', {
        id: z.string().describe('Task ID'),
        actor_agent_id: z.string().optional().describe('Agent performing the update'),
        note: z.string().describe('REQUIRED: Note of what was performed (Call Center Style)'),
        title: z.string().optional(),
        description: z.string().optional(),
        status: schemas.TaskStatus.optional(),
        priority: z.number().int().min(0).max(3).optional(),
        result: z.record(z.string(), z.unknown()).optional(),
    }, params => service.updateTask(params));

    registerTool(server, 'mcp_scholomance_collab_task_delete', {
        id: z.string().describe('Task ID to remove from the ritual record'),
        actor_agent_id: z.string().optional().describe('Agent performing the deletion'),
    }, params => service.deleteTask(params));

    registerTool(server, 'mcp_scholomance_collab_lock_acquire', {
        file_path: z.string().describe('Path to the file substrate to lock'),
        agent_id: z.string().describe('Agent acquiring the lock'),
        task_id: z.string().optional().describe('Related task, if any'),
        ttl_minutes: z.number().int().min(1).max(480).optional().default(30).describe('Lock duration in minutes'),
    }, params => service.acquireLock(params));

    registerTool(server, 'mcp_scholomance_collab_lock_release', {
        file_path: z.string().describe('Path to the file substrate to unlock'),
        agent_id: z.string().describe('Lock owner releasing the lock'),
    }, params => service.releaseLock(params));

    registerTool(server, 'mcp_scholomance_collab_pipeline_create', {
        pipeline_type: schemas.PipelineType.describe('Pipeline type'),
        trigger_task_id: z.string().optional().describe('Trigger task for file context'),
        actor_agent_id: z.string().optional().describe('Agent starting the pipeline'),
    }, params => service.createPipeline(params));

    registerTool(server, 'mcp_scholomance_collab_pipeline_get', {
        id: z.string().describe('Pipeline ID'),
    }, ({ id }) => service.getPipeline(id));

    registerTool(server, 'mcp_scholomance_collab_pipeline_advance', {
        id: z.string().describe('Pipeline ID'),
        agent_id: z.string().optional().describe('Agent advancing the pipeline'),
        result: z.record(z.string(), z.unknown()).optional().default({}).describe('Stage result payload'),
    }, ({ id, agent_id, result }) => service.advancePipeline({
        id,
        actor_agent_id: agent_id ?? null,
        result,
    }));

    registerTool(server, 'mcp_scholomance_collab_pipeline_fail', {
        id: z.string().describe('Pipeline ID'),
        agent_id: z.string().optional().describe('Agent failing the pipeline'),
        reason: z.string().min(1).max(1024).describe('Failure reason'),
    }, ({ id, agent_id, reason }) => service.failPipeline({
        id,
        actor_agent_id: agent_id ?? null,
        reason,
    }));

    registerTool(server, 'mcp_scholomance_collab_status_get', {}, () => service.getStatus());

    registerTool(server, 'mcp_scholomance_collab_memory_set', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Unique key for the memory'),
        value: z.any().describe('Value to persist (JSON-serializable)'),
    }, (params) => service.setMemory(params));

    registerTool(server, 'mcp_scholomance_collab_memory_get', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Key to retrieve'),
    }, (params) => service.getMemory(params));

    registerTool(server, 'mcp_scholomance_collab_memory_delete', {
        agent_id: z.string().min(1).nullable().optional().default(null).describe('Agent ID for specific memory, or null for global'),
        key: z.string().min(1).max(128).describe('Key to delete'),
    }, (params) => service.deleteMemory(params));

    registerTool(server, 'mcp_scholomance_collab_fs_list', {
        directory: z.string().optional().default('.').describe('The relative directory substrate to list (relative to project root)'),
        recursive: z.boolean().optional().default(false).describe('Whether to descend recursively into sub-archives'),
    }, async ({ directory, recursive }) => {
        const absDir = path.resolve(ROOT, directory);
        if (!absDir.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds access attempt to external substrates', requestedPath: absDir, rootPath: ROOT },
        );
        if (!fs.existsSync(absDir)) return [];

        const results = [];
        const maxDepth = 3;

        function walk(currentPath, depth) {
            if (depth > maxDepth) return;
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.relative(ROOT, fullPath);

                if (entry.isDirectory()) {
                    results.push(relPath + '/');
                    if (recursive) {
                        walk(fullPath, depth + 1);
                    }
                } else {
                    results.push(relPath);
                }
            }
        }

        try {
            walk(absDir, 0);
            return results;
        } catch (e) {
            throw new BytecodeError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
                ERROR_CODES.INVALID_STATE,
                { reason: 'Failed to list substrate', originalError: e.message },
            );
        }
    });

    registerTool(server, 'mcp_scholomance_collab_fs_find', {
        query: z.string().describe('File name or glob pattern to search for'),
        directory: z.string().optional().default('.').describe('The relative directory to search within (relative to project root)'),
    }, async ({ query, directory }) => {
        const absDir = path.resolve(ROOT, directory);
        if (!absDir.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds access attempt to external substrates', requestedPath: absDir, rootPath: ROOT },
        );
        if (!fs.existsSync(absDir)) return [];

        const results = [];

        function walk(currentPath) {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

                const fullPath = path.join(currentPath, entry.name);
                
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else {
                    // Simple text match
                    if (entry.name.includes(query) || (query.includes('*') && new RegExp('^' + query.replace(/\\*/g, '.*') + '$').test(entry.name))) {
                        const relPath = path.relative(ROOT, fullPath);
                        results.push(relPath);
                    }
                }
            }
        }

        try {
            walk(absDir);
            return results.slice(0, 200); // cap results
        } catch (e) {
            throw new BytecodeError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
                ERROR_CODES.INVALID_STATE,
                { reason: 'Failed to find substrate', originalError: e.message },
            );
        }
    });

    registerTool(server, 'mcp_scholomance_collab_fs_read', {
        path: z.string().describe('The relative path of the file substrate to read'),
    }, async ({ path: filePath }) => {
        const absPath = path.resolve(ROOT, filePath);
        if (!absPath.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds read attempt', requestedPath: absPath, rootPath: ROOT },
        );
        if (!fs.existsSync(absPath)) throw new BytecodeError(
            ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.INVALID_VALUE,
            { reason: 'File substrate does not exist at the requested path', requestedPath: absPath },
        );
        
        try {
            return fs.readFileSync(absPath, 'utf8');
        } catch (e) {
            throw new BytecodeError(
                ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
                ERROR_CODES.INVALID_STATE,
                { reason: 'Failed to read substrate', originalError: e.message },
            );
        }
    });

    registerTool(server, 'mcp_scholomance_collab_execute_verification', {
        suite: z.enum([
            'lint',
            'typecheck',
            'test',
            'qa',
            'backend',
            'e2e',
            'visual',
            'stasis',
            'build',
            'schema',
            'security',
            'security_qa',
            'security_audit',
            'release',
        ]).describe('The verification ritual/profile to execute'),
        task_id: z.string().optional().describe('Task ID to link this verification to'),
    }, async ({ suite, task_id }) => {
        const commandMap = {
            lint: ['npm run lint'],
            typecheck: ['npm run typecheck'],
            test: ['npm test'],
            qa: ['npm run test:qa'],
            backend: ['npm run test:qa:backend', 'npm run verify:backend-contract'],
            e2e: ['npm run test:e2e'],
            visual: ['npm run test:visual'],
            stasis: ['npm run test:qa:stasis'],
            build: ['npm run build'],
            schema: ['npm run verify:backend-contract'],
            security: ['npm run security:qa', 'npm run security:audit'],
            security_qa: ['npm run security:qa'],
            security_audit: ['npm run security:audit'],
            release: [
                'npm run lint',
                'npm run typecheck',
                'npm run test:qa',
                'npm run security:qa',
                'npm run build',
            ],
        };

        const commands = commandMap[suite];
        console.error(`[MCP] Executing Verification Ritual: ${suite}`);

        try {
            service.logActivity({
                agent_id: null,
                action: 'verification_started',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, commands }
            });

            const outputs = [];
            for (const command of commands) {
                outputs.push(`$ ${command}`);
                outputs.push(execSync(command, { encoding: 'utf8', stdio: 'pipe', timeout: 300000 }));
            }
            
            service.logActivity({
                agent_id: null,
                action: 'verification_completed',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, status: 'pass', commands }
            });

            const output = outputs.join('\n');
            return {
                status: 'PASS',
                suite,
                message: `Ritual of Verification complete for ${suite}.`,
                commands,
                summary: output.slice(-1000)
            };
        } catch (error) {
            const errorMessage = error.stderr || error.stdout || error.message;
            
            service.logActivity({
                action: 'verification_failed',
                target_type: 'test_suite',
                target_id: suite,
                details: { task_id, status: 'fail', commands, error: errorMessage.slice(0, 200) }
            });

            return {
                status: 'FAIL',
                suite,
                message: `Ritual of Verification failed for ${suite}.`,
                commands,
                error: errorMessage.slice(-1000)
            };
        }
    });

    registerTool(server, 'mcp_scholomance_collab_diagnostic_scan', {}, () => collabDiagnostic.scan());

    // ========================
    //  DIAGNOSTIC SUBSTRATE — Phase 3 (cells/reports/health/violations)
    // ========================

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_latest_report',
        {},
        () => diagnosticGetLatestReport(),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_report_by_id',
        {
            reportId: z.string().describe('Report ID in PB-DIAG-v1-{timestamp}-{rand4} format'),
        },
        ({ reportId }) => diagnosticGetReportById({ reportId }),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_query_violations',
        {
            cell: z.string().optional().describe('Filter by cellId (or layer name) — e.g. IMMUNITY_SCAN, LAYER_BOUNDARY, bridge'),
            severity: z.enum(['FATAL', 'CRIT', 'WARN', 'INFO']).optional().describe('Filter by severity'),
            layer: z.string().optional().describe('Filter by context.layer (e.g. innate, adaptive, bridge, fixture, coverage)'),
            ruleId: z.string().optional().describe('Filter by context.ruleId (e.g. QUANT-0101, LING-0F03)'),
            limit: z.number().default(100).describe('Maximum results returned'),
        },
        (params) => diagnosticQueryViolations(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_query_health',
        {
            cellId: z.string().optional().describe('Filter by emitting cell'),
            checkId: z.string().optional().describe('Filter by check name'),
            moduleId: z.string().optional().describe('Filter by module path'),
            limit: z.number().default(100).describe('Maximum results returned'),
        },
        (params) => diagnosticQueryHealth(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_run_cells',
        {
            files: z.array(z.object({
                path: z.string(),
                content: z.string(),
            })).describe('Files to scan (in-memory, not persisted)'),
            cellFilter: z.array(z.string()).optional().describe('Run only these cell IDs'),
            commitHash: z.string().optional().describe('Optional commit hash to embed in the report'),
            trigger: z.string().optional().describe('Trigger label (default: "mcp")'),
        },
        (params) => diagnosticRunCells(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_get_recovery_hints',
        {
            category: z.string().describe('Error category (e.g. TYPE, LINGUISTIC)'),
            errorCode: z.string().describe('4-digit hex error code (e.g. 0105)'),
            context: z.record(z.string(), z.unknown()).optional().describe('Additional error context'),
        },
        (params) => diagnosticGetRecoveryHints(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_trigger_full_scan',
        {
            trigger: z.string().optional().default('mcp').describe('Trigger source identifier'),
            writeMemory: z.boolean().optional().default(true).describe('Persist BytecodeXP/QBIT memory envelopes for scan findings'),
            memoryMax: z.number().int().positive().optional().default(32).describe('Maximum memory artifacts to persist'),
            memoryIncludeHealth: z.boolean().optional().default(false).describe('Also persist passing health signals, not only violations'),
        },
        (params) => diagnosticTriggerFullScan(params),
    );

    registerTool(
        server,
        'mcp_scholomance_collab_diagnostic_summary',
        {},
        () => diagnosticSummary(),
    );

    registerTool(server, 'mcp_scholomance_collab_search_codebase', {
        query: z.string().min(1).describe('The semantic search query for the codebase'),
    }, ({ query }) => searchCodebase(query));

    registerTool(server, 'mcp_scholomance_collab_forensic_search', {
        query: z.string().min(1).describe('The literal string or regex pattern to find'),
        isRegex: z.boolean().default(false).describe('Whether the query is a regular expression'),
        caseSensitive: z.boolean().default(false).describe('Whether the search should be case-sensitive'),
        includePattern: z.string().optional().describe('Glob pattern for files to include (e.g. "*.js")'),
        excludePattern: z.string().optional().describe('Glob pattern for files to exclude'),
        limit: z.number().default(75).describe('Maximum number of matches to return (total across all files)'),
    }, ({ query, ...options }) => {
        console.error(`[MCP] Executing Forensic Search: "${query}"`);
        return forensicSearch(query, options);
    });

    // ========================
    //  ARCHIVE OF DOMINANCE
    // ========================

    registerTool(server, 'mcp_scholomance_collab_archive_board', {
        actor_agent_id: z.string().optional().describe('Agent ID performing the ritual'),
    }, ({ actor_agent_id }) => service.archiveAllTasks(actor_agent_id));

    registerTool(server, 'mcp_scholomance_collab_codebase_list_files', {}, () => listIndexedFiles());

    registerTool(server, 'mcp_scholomance_collab_codebase_hybrid_search', {
        query: z.string().min(1).describe('Search query for literal, semantic, and phonetic matching'),
    }, ({ query }) => searchHybrid(query));

    registerTool(server, 'mcp_scholomance_collab_codebase_get_neighbors', {
        file_path: z.string().min(1).describe('Target file to find neighbors for'),
    }, ({ file_path }) => getFileNeighbors(file_path));

    // ========================
    //  IMMUNE SYSTEM
    // ========================

    registerTool(server, 'mcp_scholomance_collab_immunity_scan_file', {
        content: z.string().describe('File content to scan'),
        file_path: z.string().describe('Path of the file being scanned'),
    }, async ({ content, file_path }) => {
        const scanResult = await service.scanFileImmunity(content, file_path);
        
        // Generate a human-readable report for the user
        let report = `### IMMUNE SYSTEM REPORT: ${file_path}\n`;
        const total = scanResult.innate.length + scanResult.adaptive.length;
        
        if (total === 0) {
            report += "✅ **CLEAN.** No known pathogens or structural violations detected.\n";
        } else {
            report += `❌ **VIOLATIONS DETECTED: ${total}**\n\n`;
            
            if (scanResult.innate.length > 0) {
                report += "#### Innate Layer Violations:\n";
                scanResult.innate.forEach(v => {
                    report += `*   **${v.name}** (${v.ruleId}) - SEVERITY: ${v.severity}\n`;
                    report += `    *REPAIR:* ${v.repair.title}\n`;
                    v.repair.suggestions.forEach(s => report += `    - ${s}\n`);
                    report += `    *BYTECODE:* \`${v.bytecode}\`\n\n`;
                });
            }
            
            if (scanResult.adaptive.length > 0) {
                report += "#### Adaptive Layer Violations:\n";
                scanResult.adaptive.forEach(v => {
                    report += `*   **${v.name}** - Similarity score: ${v.score.toFixed(2)}\n`;
                    report += `    *PATHOGEN ID:* ${v.pathogenId}\n`;
                    report += `    *ENCYCLOPEDIA:* ${v.entry}\n\n`;
                });
            }
        }

        return {
            status: total === 0 ? 'CLEAN' : 'VIOLATED',
            report,
            raw: scanResult
        };
    });

    registerTool(server, 'mcp_scholomance_collab_immunity_get_status', {}, () => service.getImmunityStatus());

    // ========================
    //  CLERICAL RAID (Phase 3–4)
    // ========================

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_query', {
        symptoms: z.array(z.string()).min(1).describe('Symptom lines or error descriptions'),
        file_paths: z.array(z.string()).optional().describe('Affected paths'),
        error_messages: z.array(z.string()).optional(),
        layer_hint: z.string().optional(),
        agent_role: z.enum(['codex', 'claude', 'gemini', 'merlin']).optional()
            .describe('When set, attaches charter playbook + hook applicability'),
    }, ({ symptoms, file_paths, error_messages, layer_hint, agent_role }) => {
        const raid = getClericalRaidMcp();
        const bugReport = {
            symptoms,
            filePaths: file_paths ?? [],
            errorMessages: error_messages ?? [],
            layerHint: layer_hint ?? null,
            timestamp: Date.now(),
        };
        if (agent_role) {
            return agentHookQuery(raid, agent_role, bugReport);
        }
        return raid.query(bugReport);
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_merlin_ingest', {
        merlin_report: z.record(z.string(), z.unknown()).describe('Collab bug row or Merlin JSON'),
        train: z.boolean().optional().describe('Auto-train when verdict is NOVEL or NEEDS_MERLIN (default true)'),
        train_needs_merlin: z.boolean().optional()
            .describe('When false, train only on NOVEL (default true = train on NEEDS_MERLIN too)'),
    }, ({ merlin_report, train, train_needs_merlin }) => {
        const raid = getClericalRaidMcp();
        const payload = merlinAutoTrainPipeline(raid, merlin_report, {
            train: train !== false,
            trainNeedsMerlin: train_needs_merlin !== false,
        });
        return {
            ...payload,
            vectorPreview16: Array.from(extractVectorFromMerlinReport(merlin_report).slice(0, 16)),
        };
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_feedback', {
        pattern_id: z.string().min(1),
        positive: z.boolean().describe('True = confirm hit; false = false positive'),
    }, ({ pattern_id, positive }) => {
        const raid = getClericalRaidMcp();
        if (positive) {
            raid.confirm(pattern_id);
        } else {
            raid.feedbackNegative(pattern_id);
        }
        const p = raid.patterns.find(x => x.id === pattern_id);
        return {
            ok: !!p,
            pattern_id,
            confidence: p?.confidence,
            hitCount: p?.hitCount,
            missCount: p?.missCount,
            effectiveness: p ? patternEffectivenessScore(p) : null,
        };
    });

    registerTool(server, 'mcp_scholomance_collab_clerical_raid_learning', {
        action: z.enum(['clusters', 'duplicates', 'deprecate', 'scores', 'bug_from_merlin']),
        min_similarity: z.number().min(0).max(1).optional(),
        merlin_report: z.record(z.string(), z.unknown()).optional(),
    }, ({ action, min_similarity, merlin_report }) => {
        const raid = getClericalRaidMcp();
        if (action === 'bug_from_merlin') {
            if (!merlin_report) {
                return { ok: false, error: 'merlin_report required' };
            }
            return { ok: true, bugReport: merlinReportToBugReport(merlin_report) };
        }
        if (action === 'clusters') {
            const thr = min_similarity ?? 0.92;
            return { clusters: clusterPatternsBySimilarity(raid, thr) };
        }
        if (action === 'duplicates') {
            const thr = min_similarity ?? 0.97;
            return { pairs: findNearDuplicatePatterns(raid, thr) };
        }
        if (action === 'deprecate') {
            const ids = deprecateStalePatterns(raid);
            return { deprecatedIds: ids, stats: raid.getStats() };
        }
        const scores = raid.patterns
            .filter(p => !p.deprecated)
            .map(p => ({
                id: p.id,
                confidence: p.confidence,
                effectiveness: patternEffectivenessScore(p),
                hits: p.hitCount ?? 0,
                misses: p.missCount ?? 0,
            }));
        return { scores };
    });

    // ========================
    //  HEARTBEAT ALERTS
    // ========================

    registerTool(server, 'mcp_scholomance_collab_alerts_pull', {
        agent_id: z.string().describe('Calling agent ID'),
    }, ({ agent_id }) => service.pullAlerts(agent_id));

    registerTool(server, 'mcp_scholomance_collab_alert_respond', {
        alert_id: z.string().describe('Target alert ID'),
        agent_id: z.string().describe('Calling agent ID (must match recipient)'),
        payload: z.record(z.string(), z.any()).optional().describe('Optional response payload (bytecode, text, etc)'),
    }, params => service.respondToAlert(params.alert_id, params.agent_id, { payload: params.payload }));

    registerTool(server, 'mcp_scholomance_collab_alert_list', {
        agent_id: z.string().optional().describe('Filter by recipient ID'),
        status: z.string().optional().describe('Filter by status (pending, acknowledged, expired)'),
    }, params => service.listAlerts(params));

    // ========================
    //  SKILLS & AUDITS (real implementations)
    // ========================

    registerTool(server, 'mcp_scholomance_collab_skill_vaelrix_law_audit', {
        target_file: z.string().optional().describe('Specific file to audit against Vaelrix Law'),
        intent: z.string().optional().describe('Proposed change intent for pre-emptive audit'),
        focus_laws: z.array(z.string()).optional().describe('Specific law numbers or names to emphasize'),
    }, async ({ target_file, intent, focus_laws }) => {
        const lawPath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md');
        const preamblePath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/SHARED_PREAMBLE.md');
        let lawText = '';
        let preambleText = '';
        try {
            lawText = fs.readFileSync(lawPath, 'utf8');
            preambleText = fs.readFileSync(preamblePath, 'utf8');
        } catch (e) {
            // fall back gracefully
        }

        const fileContent = target_file ? (() => {
            try {
                const abs = path.resolve(ROOT, target_file);
                if (abs.startsWith(ROOT) && fs.existsSync(abs)) return fs.readFileSync(abs, 'utf8').slice(0, 8000);
            } catch { /* ignore */ }
            return null;
        })() : null;

        const criticalLaws = [
            'No Hierarchy Between Agents', 'Conflict Escalation Is Mandatory', 'Schema Is Sovereign',
            'Server Is Truth', 'Pure Analysis Never Touches Effects', 'Determinism Is Non-Negotiable',
            'Security Before Features', 'Bytecode Is Priority', 'Scholomance Encyclopedia — Bug Fix Documentation'
        ];

        const violations = [];
        const notes = [];

        if (intent) {
            if (/Math\.random|Date\.now\(\)|new Date\(\)/.test(intent) && !intent.includes('seeded')) {
                violations.push({ law: 'Determinism Is Non-Negotiable (6)', severity: 'CRIT', note: 'Non-deterministic source detected in intent' });
            }
            if (/DOM|gsap|framer-motion|document\.|window\.|querySelector/.test(intent) && !/PixelBrain|Remotion|useBeatClock/.test(intent)) {
                violations.push({ law: 'Pure Analysis Never Touches Effects (5)', severity: 'CRIT', note: 'Effect/render concern in non-render layer' });
            }
        }

        if (fileContent) {
            if (/Math\.random(?!\s*\/\*\s*seeded)/.test(fileContent)) {
                violations.push({ law: 'Determinism (6) / QUANT-0101', severity: 'CRIT', note: 'Math.random outside explicit seeded context' });
            }
            if (/(from ['"]react['"]|useState|useEffect|gsap)/.test(fileContent) && target_file && /codex\/(core|services|runtime)/.test(target_file)) {
                violations.push({ law: 'Pure Analysis Never Touches Effects (5) + LING-0F03', severity: 'CRIT', note: 'Render-adjacent import or hook in core layer' });
            }
        }

        const verdict = violations.length === 0 ? 'CLEAN' : (violations.some(v => v.severity === 'CRIT') ? 'BLOCKED' : 'CONDITIONAL');
        const bytecode = `SCHOL-LAW-AUDIT-V1-${verdict}-${Date.now().toString(36)}`;

        return {
            verdict,
            bytecode,
            focus: target_file || intent || 'global',
            laws_checked: focus_laws || criticalLaws,
            violations,
            notes: notes.length ? notes : ['No direct textual contradictions found in sampled content. Full human review of VAELRIX_LAW still required for architectural changes.'],
            recommendation: verdict === 'BLOCKED' ? 'Escalate or revise before proceeding. Run immunity_scan_file on the target.' : 'Proceed with ownership validation and task context. Record decision in task notes.',
            source_files: { vaelrix_law: lawPath, preamble: preamblePath },
            raw_law_excerpt: lawText.slice(0, 2400),
        };
    });

    registerTool(server, 'mcp_scholomance_collab_skill_scholomance_feedback', {
        subject: z.string().describe('The implementation, PDR, concept, file, or decision to review'),
        context: z.string().optional().describe('Additional context, code, or intent'),
        mode: z.enum(['A','B','C','D','E','F','G','H']).optional().describe('Feedback mode from scholomance-feedback skill (A=Concept ... H=Law Tribunal)'),
    }, async ({ subject, context, mode }) => {
        const fbSkillPath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/scholomance-feedback/scholomance-feedback.md');
        const fitPath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/scholomance-feedback/references/fit-matrix.md');
        let fbSkill = '';
        let fitMatrix = '';
        try {
            fbSkill = fs.readFileSync(fbSkillPath, 'utf8');
            fitMatrix = fs.readFileSync(fitPath, 'utf8');
        } catch (e) { /* ignore */ }

        const detectedMode = mode || (subject.toLowerCase().includes('pdr') || subject.toLowerCase().includes('spec') ? 'D' : 
                            subject.toLowerCase().includes('ui') || subject.toLowerCase().includes('component') ? 'C' : 'B');

        const report = {
            summary: `Scholomance Feedback for: ${subject}`,
            classification: { mode: detectedMode, area: 'auto-detected from subject', risk: context && context.length > 200 ? 'medium' : 'low' },
            what_works: ['Subject provided; ritual engaged.'],
            needs_improvement: [],
            scholomance_fit: 'See fit-matrix references. Evaluate against CODEx layer law, determinism, bytecode priority, and domain ownership.',
            risks: [],
            recommended_improvements: [
                { priority: 'P1', recommendation: 'Run mcp_scholomance_collab_immunity_scan_file on changed files before commit.', why: 'Law 18' },
                { priority: 'P2', recommendation: 'Use mcp_scholomance_collab_codebase_hybrid_search (not grep) for any related analysis.', why: 'Semantic Search Mandate / Law 17' },
            ],
            vaelrix_law_grade: 'See separate law_audit tool for formal tribunal.',
            template: 'Follow the full report template in scholomance-feedback.md (or the served resource collab://skills/scholomance-feedback). Include FeedbackTraceIR per bytecode-schema.md.',
            sources: { skill: fbSkillPath, fit_matrix: fitPath },
            raw_skill_excerpt: fbSkill.slice(0, 1800),
        };

        if (context && /Math\.random|direct DOM|client.*score|auto.save/i.test(context)) {
            report.needs_improvement.push('Potential violation of determinism, pure analysis, or sovereign editor detected in provided context.');
            report.risks.push({ risk: 'Law violation', severity: 'HIGH', mitigation: 'Re-audit with law_audit + immunity tools' });
        }

        // Build FeedbackTraceIR per the canonical bytecode-schema.md
        const feedbackTraceIR = {
            feedback_trace_ir_version: "1.0.0",
            agent: {
                name: "Scholomance Feedback Skill (MCP)",
                mode: detectedMode,
                request_type: subject,
            },
            subject: {
                title: subject,
                category: detectedMode === 'D' ? 'pdr' : detectedMode === 'C' ? 'ui_ux' : 'code',
                scholomance_area: ["auto-detected"],
                user_goal: context || "General review",
            },
            evidence: {
                direct_evidence: context ? [context.slice(0, 500)] : [],
                repo_context: [],
                established_project_memory: [],
                inferences: [],
                hypotheses: [],
                unknowns: ["Full manual evidence ladder required per skill (see scholomance-feedback.md)"],
            },
            assessment: {
                what_works: report.what_works || [],
                what_needs_improvement: report.needs_improvement || [],
                scholomance_fit: "See fit-matrix in references. Evaluate CODEx/PixelBrain/TrueSight/VerseIR/lore coherence.",
                engineering_impact: "See report.",
                experience_impact: "See report.",
                architecture_impact: "See report.",
            },
            fit_matrix: {
                codex_compatibility: "unknown",
                pixelbrain_compatibility: "unknown",
                truesight_compatibility: "unknown",
                verseir_compatibility: "unknown",
                ui_ux_strength: "unknown",
                maintainability: "unknown",
                testability: "unknown",
                lore_coherence: "unknown",
                scalability: "unknown",
                user_value: "unknown",
            },
            risks: report.risks || [],
            recommendations: (report.recommended_improvements || []).map(r => ({
                priority: r.priority || "P2",
                recommendation: r.recommendation,
                why: r.why,
                risk_reduced: "",
                implementation_hint: "",
            })),
            qa_validation: {
                required_checks: ["lint", "test", "immunity_scan", "layer-boundary audit"],
                suggested_commands: ["npm run lint", "npm test", "mcp immunity scan on changed paths"],
                manual_review_steps: [],
                not_run: ["Full visual + e2e until patch proposed"],
            },
            grade: {
                letter: "See VAELRIX_LAW Tribunal section in full report (use law_audit + law_debug for formal grade).",
                score: 0,
                reason: "MCP skeleton — agent must complete with evidence and TraceIR.",
                upgrade_path: "Re-run after fixes + law audit.",
            },
        };

        return {
            grade: 'RITUAL_ENGAGED',
            bytecode: `SCHOL-FEEDBACK-V1-${detectedMode}-${Date.now().toString(36)}`,
            report,
            feedback_trace_ir: feedbackTraceIR,
            instructions: 'Expand this into the full 15-section Scholomance Feedback Report template exactly as defined in scholomance-feedback.md. Ground every claim in the evidence ladder (Direct/Repo/Memory/Inference/Hypothesis/Unknown). Always include the FeedbackTraceIR block per the bytecode-schema. No flattery. Use fit-matrix for scoring. For deep forensic issues, also invoke the VAELRIX law debug skill.',
        };
    });

    registerTool(server, 'mcp_scholomance_collab_skill_scholomance_knowledge', {}, async () => {
        const skillPath = path.join(ROOT, 'codex/server/collab/skills/scholomance.md');
        return {
            content: fs.readFileSync(skillPath, 'utf8'),
            source: 'codex/server/collab/skills/scholomance.md',
            bytecode: 'SCHOL-SKILL-V1-KNOWLEDGE',
        };
    });

    // ── Agent / Task / Pipeline Discovery (explicit tools for ergonomics) ─────
    registerTool(server, 'mcp_scholomance_collab_agent_list', {
        status: z.enum(['online', 'busy', 'offline']).optional(),
        role: z.enum(['ui', 'backend', 'qa']).optional(),
    }, async ({ status, role }) => {
        const agents = await service.listAgents();
        let filtered = agents;
        if (status) filtered = filtered.filter(a => a.status === status);
        if (role) filtered = filtered.filter(a => a.role === role);
        return { agents: filtered, count: filtered.length };
    });

    registerTool(server, 'mcp_scholomance_collab_task_list', {
        status: z.string().optional(),
        agent: z.string().optional(),
        priority: z.number().int().min(0).max(3).optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
    }, async (params) => {
        const tasks = await service.listTasks(params);
        return { tasks, count: tasks.length };
    });

    registerTool(server, 'mcp_scholomance_collab_pipeline_list', {
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(30),
    }, async (params) => {
        const pipelines = await service.listPipelines(params);
        return { pipelines, count: pipelines.length };
    });

    registerTool(server, 'mcp_scholomance_collab_lock_list', {
        agent_id: z.string().optional(),
    }, async ({ agent_id }) => {
        const locks = (typeof service.listLocks === 'function') ? await service.listLocks() : [];
        let filtered = locks;
        if (agent_id) filtered = filtered.filter(l => l.locked_by === agent_id);
        return { locks: filtered, count: filtered.length };
    });

    // ── Controlled Mutation (respects Sovereign Editor + Locks + Tasks) ───────
    registerTool(server, 'mcp_scholomance_collab_fs_propose_patch', {
        file_path: z.string().min(1).describe('Relative path of the substrate to propose an edit for'),
        agent_id: z.string().min(1).describe('Agent proposing the change (must be registered)'),
        justification: z.string().min(1).max(4000).describe('Call-center style note explaining the change and why (required ritual)'),
        patch: z.string().min(1).describe('Unified diff, or clear before/after with context. This is recorded, not auto-applied.'),
        task_id: z.string().optional().describe('Task this edit advances (recommended)'),
        bypass_lock_check: z.boolean().optional().default(false),
    }, async ({ file_path, agent_id, justification, patch, task_id, bypass_lock_check }) => {
        let agent = null;
        try {
            if (typeof service.getAgent === 'function') agent = await service.getAgent(agent_id);
        } catch { /* ignore */ }
        if (!agent && !bypass_lock_check) {
            // still allow recording; strict check can be added later via ownership/locks
        }

        // Best-effort lock awareness (non-fatal)
        let lockInfo = null;
        try {
            const locks = await service.listLocks ? await service.listLocks() : [];
            lockInfo = locks.find(l => l.file_path === file_path || l.file_path === `/${file_path}`);
        } catch { /* ignore */ }

        const activityDetails = {
            file_path,
            justification: justification.slice(0, 2000),
            patch_preview: patch.slice(0, 1500),
            task_id: task_id || null,
            lock_holder: lockInfo?.locked_by || null,
            bypass: !!bypass_lock_check,
        };

        await service.logActivity({
            agent_id,
            action: 'edit_proposed',
            target_type: 'file',
            target_id: file_path,
            details: activityDetails,
        });

        if (task_id && justification) {
            try {
                await service.updateTask({
                    id: task_id,
                    actor_agent_id: agent_id,
                    note: `[PATCH PROPOSAL by ${agent_id}] ${justification.slice(0, 600)}`,
                });
            } catch (e) {
                // non-fatal; proposal is still logged in activity
            }
        }

        const patchId = `patch_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
        return {
            ok: true,
            patch_id: patchId,
            recorded: true,
            file_path,
            task_id: task_id || null,
            lock_status: lockInfo ? 'held' : (bypass_lock_check ? 'bypassed' : 'no_active_lock'),
            advice: 'Human or authorized applicator should review + apply. Proposal lives in activity log and task notes.',
        };
    });

    // ── apply_patch (actually write to filesystem) ─────────────────────────────
    registerTool(server, 'mcp_scholomance_collab_fs_apply_patch', {
        file_path: z.string().min(1).describe('Relative path of the file to patch'),
        patch: z.string().min(1).describe('Search/replace block or unified diff or full content'),
        backup: z.boolean().optional().default(true).describe('Create .bak backup before applying'),
        relaxed_whitespace: z.boolean().optional().default(true).describe('Normalize whitespace for fuzzy search/replace matching'),
    }, async ({ file_path, patch, backup, relaxed_whitespace }) => {
        const healer = new IterativeHealer(null, { projectRoot: ROOT });
        const result = healer._applyPatch(file_path, patch, 1, { relaxedWhitespace: relaxed_whitespace !== false, backup });
        if (result.success) {
            await service.logActivity({
                agent_id: null,
                action: 'patch_applied',
                target_type: 'file',
                target_id: file_path,
                details: { method: result.method, bytesWritten: result.bytesWritten },
            });
        }
        return result;
    });

    // ── replace_file_content: fuzzy-matching edit with failure diff ────────
    registerTool(server, 'mcp_scholomance_collab_fs_replace_file_content', {
        path: z.string().min(1).describe('Relative file path (e.g. \'src/pages/Combat/CombatPage.jsx\')'),
        target_content: z.string().min(1).describe('Exact text block to replace'),
        replacement_content: z.string().describe('New text block'),
        relaxed_whitespace: z.boolean().optional().default(true).describe('Normalize whitespace for fuzzy matching (default: true)'),
    }, async ({ path: filePath, target_content, replacement_content, relaxed_whitespace }) => {
        const absPath = require('path').resolve(ROOT, filePath);
        if (!absPath.startsWith(ROOT)) throw new BytecodeError(
            ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
            ERROR_CODES.OUT_OF_BOUNDS,
            { reason: 'Out of bounds write attempt', requestedPath: absPath, rootPath: ROOT },
        );
        if (!fs.existsSync(absPath)) {
            return {
                ok: false,
                error: `File not found: ${filePath}`,
                suggestion: `Try path_complete to find matching files, or list_directory to browse.`,
            };
        }

        const healer = new IterativeHealer(null, { projectRoot: ROOT });
        const patch = target_content + '\n---\n' + replacement_content;
        const result = healer._applyPatch(filePath, patch, -1, {
            relaxedWhitespace: relaxed_whitespace !== false,
            backup: true,
        });

        if (result.success) {
            await service.logActivity({
                agent_id: null,
                action: 'file_replaced',
                target_type: 'file',
                target_id: filePath,
                details: { method: result.method, bytesWritten: result.bytesWritten },
            });
            return { ok: true, method: result.method, path: filePath, note: result.note || null };
        }

        // ── Enhanced failure: show a diff-like hint ────────────────────────
        const currentContent = fs.readFileSync(absPath, 'utf8');
        const targetLines = target_content.split('\n');
        const contextSearch = targetLines[0]?.trim()?.slice(0, 60) || target_content.slice(0, 60);
        const occurrences = [];
        let idx = -1;
        while ((idx = currentContent.indexOf(contextSearch, idx + 1)) !== -1) {
            const lineStart = currentContent.lastIndexOf('\n', idx) + 1;
            const lineEnd = currentContent.indexOf('\n', idx);
            occurrences.push({
                position: idx,
                context: currentContent.slice(lineStart, lineEnd === -1 ? currentContent.length : lineEnd).trim().slice(0, 100),
            });
            if (occurrences.length >= 5) break;
        }

        return {
            ok: false,
            error: result.error,
            hint: result.hint || null,
            target_preview: target_content.slice(0, 200),
            found_similar: occurrences.length > 0 ? occurrences : null,
            tip: occurrences.length === 0
                ? 'No similar lines found. Use read_file to copy the exact block.'
                : 'Similar lines found above — check for whitespace or formatting differences.',
        };
    });

    // ── batch_patch: transactional multi-file edit with rollback ────────────
    registerTool(server, 'mcp_scholomance_collab_fs_batch_patch', {
        operations: z.array(z.object({
            file_path: z.string().min(1).describe('Relative file path'),
            patch: z.string().min(1).describe('Search/replace block (SEARCH\\n---\\nREPLACE) or unified diff'),
        })).min(1).max(20).describe('Ordered list of file operations to apply atomically'),
        relaxed_whitespace: z.boolean().optional().default(true),
    }, async ({ operations, relaxed_whitespace }) => {
        const healer = new IterativeHealer(null, { projectRoot: ROOT });
        const snapshots = [];
        const results = [];
        let committed = false;

        try {
            // Phase 1: Snapshot all files
            for (const op of operations) {
                const absPath = path.resolve(ROOT, op.file_path);
                if (!absPath.startsWith(ROOT)) throw new BytecodeError(
                    ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, MOD,
                    ERROR_CODES.OUT_OF_BOUNDS,
                    { reason: 'Out of bounds write attempt in batch', requestedPath: absPath, rootPath: ROOT },
                );
                if (!fs.existsSync(absPath)) {
                    results.push({ file_path: op.file_path, success: false, error: 'File not found' });
                    throw new Error(`BATCH_ABORT: File not found: ${op.file_path}`);
                }
                snapshots.push({
                    file_path: op.file_path,
                    absPath,
                    original: fs.readFileSync(absPath, 'utf8'),
                });
            }

            // Phase 2: Apply all patches
            const patchResults = [];
            for (const op of operations) {
                const result = healer._applyPatch(op.file_path, op.patch, -1, {
                    relaxedWhitespace: relaxed_whitespace !== false,
                    backup: true,
                });
                patchResults.push({ file_path: op.file_path, ...result });
                if (!result.success) {
                    throw new Error(`BATCH_ABORT: Patch failed for ${op.file_path}: ${result.error}`);
                }
            }

            // All succeeded — commit
            committed = true;
            for (const r of patchResults) {
                await service.logActivity({
                    agent_id: null,
                    action: 'batch_patch_applied',
                    target_type: 'file',
                    target_id: r.file_path,
                    details: { method: r.method, bytesWritten: r.bytesWritten },
                });
            }

            return {
                ok: true,
                committed: true,
                file_count: operations.length,
                results: patchResults.map(r => ({
                    file_path: r.file_path,
                    method: r.method,
                    bytesWritten: r.bytesWritten,
                })),
            };
        } catch (err) {
            // Phase 3: Rollback on any failure
            if (!committed) {
                const rollbackResults = [];
                for (const snap of snapshots) {
                    try {
                        fs.writeFileSync(snap.absPath, snap.original, 'utf8');
                        rollbackResults.push({ file_path: snap.file_path, rolled_back: true });
                    } catch (rbErr) {
                        rollbackResults.push({ file_path: snap.file_path, rolled_back: false, error: rbErr.message });
                    }
                }
                return {
                    ok: false,
                    committed: false,
                    error: err.message.replace('BATCH_ABORT: ', ''),
                    rollback: rollbackResults,
                    results,
                };
            }
            throw err; // Shouldn't reach here
        }
    });

    // ── path_complete: autocomplete file paths ─────────────────────────────
    registerTool(server, 'mcp_scholomance_collab_fs_path_complete', {
        prefix: z.string().min(1).max(256).describe('Partial path to autocomplete (e.g. \'src/pages/Com\')'),
        max_results: z.number().int().min(1).max(50).optional().default(15),
    }, async ({ prefix, max_results }) => {
        const results = [];
        const prefixLower = prefix.toLowerCase();

        function walk(currentPath, depth) {
            if (depth > 10 || results.length >= max_results) return;
            let entries;
            try {
                entries = fs.readdirSync(currentPath, { withFileTypes: true });
            } catch {
                return;
            }
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.relative(ROOT, fullPath);

                if (relPath.toLowerCase().startsWith(prefixLower) || relPath.toLowerCase().includes(prefixLower)) {
                    results.push(relPath + (entry.isDirectory() ? '/' : ''));
                }

                if (entry.isDirectory() && relPath.toLowerCase().startsWith(prefixLower.split('/').slice(0, -1).join('/'))) {
                    walk(fullPath, depth + 1);
                }
            }
        }

        // Try exact directory prefix first
        const prefixDir = path.dirname(prefix);
        const searchDir = prefixDir === '.' ? ROOT : path.resolve(ROOT, prefixDir);
        if (searchDir.startsWith(ROOT) && fs.existsSync(searchDir)) {
            walk(searchDir, 0);
        } else {
            walk(ROOT, 0);
        }

        // Sort: exact prefix matches first, then substring matches
        results.sort((a, b) => {
            const aExact = a.toLowerCase().startsWith(prefixLower) ? 0 : 1;
            const bExact = b.toLowerCase().startsWith(prefixLower) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            return a.length - b.length;
        });

        return {
            prefix,
            completions: results.slice(0, max_results),
            total_matches: results.length,
        };
    });

    // ── tui_inspect: live backend & module state inspection ────────────────
    registerTool(server, 'mcp_scholomance_collab_tui_inspect', {}, async () => {
        const widgets = [];

        // 1. MCP Bridge health
        widgets.push({
            id: 'mcp_bridge',
            type: 'health',
            label: 'MCP Bridge',
            status: 'ACTIVE',
            uptime_ms: process.uptime() * 1000,
            version: '1.4.0',
            pid: process.pid,
        });

        // 2. Clerical RAID status
        try {
            const raid = getClericalRaidMcp();
            const raidStats = raid.getStats ? raid.getStats() : {};
            widgets.push({
                id: 'clerical_raid',
                type: 'immune_engine',
                label: 'Clerical RAID',
                status: raid ? 'LOADED' : 'NOT_LOADED',
                pattern_count: raidStats.patternCount || raid?.patterns?.length || 'N/A',
                queries_run: raidStats.queryCount || 'N/A',
            });
        } catch (e) {
            widgets.push({ id: 'clerical_raid', type: 'immune_engine', status: 'ERROR', error: e.message });
        }

        // 3. Diagnostic summary
        try {
            const diagSummary = await diagnosticSummary();
            widgets.push({
                id: 'diagnostic_engine',
                type: 'diagnostic',
                label: 'Diagnostic Engine',
                status: 'ACTIVE',
                ...diagSummary,
            });
        } catch (e) {
            widgets.push({ id: 'diagnostic_engine', type: 'diagnostic', status: 'UNAVAILABLE' });
        }

        // 4. File system snapshot (recent changes via git)
        try {
            const gitDiff = execSync('git diff --stat HEAD', { cwd: ROOT, timeout: 5000, encoding: 'utf8' }).trim();
            widgets.push({
                id: 'git_diff_summary',
                type: 'vcs',
                label: 'Uncommitted Changes',
                files_changed: gitDiff ? gitDiff.split('\n').length : 0,
                summary: gitDiff ? gitDiff.split('\n').slice(-1)[0] : 'Clean working tree',
            });
        } catch {
            widgets.push({ id: 'git_diff_summary', type: 'vcs', status: 'UNAVAILABLE' });
        }

        // 5. Python module scan (Vaelrix Cortex brains)
        try {
            const brainsDir = path.join(ROOT, 'steamdeck_brain', 'vaelrix_forcefield', 'brains');
            if (fs.existsSync(brainsDir)) {
                const brainFiles = fs.readdirSync(brainsDir).filter(f => f.endsWith('.py') && f !== '__init__.py');
                const brainStatuses = [];
                for (const bf of brainFiles.slice(0, 20)) {
                    const content = fs.readFileSync(path.join(brainsDir, bf), 'utf8');
                    const hasStub = content.includes('run_stub_brain') || content.includes('StubBrain');
                    const hasRunFn = /def run_\w+_brain/.test(content);
                    brainStatuses.push({
                        name: bf.replace('.py', ''),
                        status: hasStub ? 'STUB' : hasRunFn ? 'IMPLEMENTED' : 'UNKNOWN',
                        size_bytes: content.length,
                    });
                }
                widgets.push({
                    id: 'vaelrix_brains',
                    type: 'module_registry',
                    label: 'Vaelrix Cortex Brains',
                    total: brainFiles.length,
                    implemented: brainStatuses.filter(b => b.status === 'IMPLEMENTED').length,
                    stubs: brainStatuses.filter(b => b.status === 'STUB').length,
                    brains: brainStatuses,
                });
            }
        } catch (e) {
            widgets.push({ id: 'vaelrix_brains', type: 'module_registry', status: 'ERROR', error: e.message });
        }

        // 6. Node.js memory / process snapshot
        const memUsage = process.memoryUsage();
        widgets.push({
            id: 'process_memory',
            type: 'metrics',
            label: 'Process Memory',
            heap_used_mb: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
            heap_total_mb: (memUsage.heapTotal / 1024 / 1024).toFixed(1),
            rss_mb: (memUsage.rss / 1024 / 1024).toFixed(1),
            external_mb: (memUsage.external / 1024 / 1024).toFixed(1),
        });

        // 7. Active locks
        try {
            const locks = await service.listLocks();
            widgets.push({
                id: 'active_locks',
                type: 'concurrency',
                label: 'File Locks',
                count: locks.length,
                locks: locks.slice(0, 10).map(l => ({ file: l.file_path, holder: l.locked_by, since: l.locked_at })),
            });
        } catch {
            widgets.push({ id: 'active_locks', type: 'concurrency', status: 'UNAVAILABLE' });
        }

        return {
            snapshot_time: new Date().toISOString(),
            widget_count: widgets.length,
            widgets,
        };
    });

    // ── Iterative Healer (autonomous diagnose → fix → verify → learn) ───────────
    registerTool(server, 'mcp_scholomance_collab_heal', {
        symptoms: z.array(z.string()).min(1).describe('Symptom lines or error descriptions'),
        file_paths: z.array(z.string()).optional().describe('Affected file paths'),
        error_messages: z.array(z.string()).optional(),
        layer_hint: z.string().optional(),
        task_id: z.string().optional().describe('Task ID to link results to'),
        test_suite: z.enum(['lint','typecheck','test','qa','backend','e2e','build']).optional()
            .default('qa').describe('Verification suite to run'),
        max_iterations: z.number().int().min(1).max(10).optional().default(3),
        patch_content: z.string().optional().describe('Explicit patch content (bypasses fixPath loading)'),
        target_file: z.string().optional().describe('Target file for the patch'),
    }, async ({ symptoms, file_paths, error_messages, layer_hint, task_id, test_suite, max_iterations, patch_content, target_file }) => {
        const raid = getClericalRaidMcp();
        const healer = new IterativeHealer(raid, { projectRoot: ROOT });
        const bugReport = {
            symptoms,
            filePaths: file_paths || [],
            errorMessages: error_messages || [],
            layerHint: layer_hint || null,
            timestamp: Date.now(),
        };
        const result = await healer.heal(bugReport, {
            taskId: task_id || null,
            testSuite: test_suite || 'qa',
            maxIterations: max_iterations || 3,
            patchContent: patch_content || null,
            targetFile: target_file || null,
        });
        // Link result to task if provided
        if (task_id && result.status) {
            try {
                await service.updateTask({
                    id: task_id,
                    actor_agent_id: 'healer',
                    note: `[HEALER] ${result.status} after ${result.iterations} iteration(s). Pattern: ${result.pattern?.name || 'none'}. Verdict: ${result.verdict}.`,
                });
            } catch { /* ignore */ }
        }
        return result;
    });

    // ── Law Retrieval (targeted, better than full dumps) ───────────────────────
    registerTool(server, 'mcp_scholomance_collab_law_get', {
        section: z.string().optional().describe('Law name, number, or keyword (e.g. "Determinism", "Bug Fix Documentation", "5", "escalation")'),
        max_chars: z.number().int().min(200).max(16000).optional().default(4000),
    }, async ({ section, max_chars }) => {
        const lawPath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md');
        const preamblePath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/SHARED_PREAMBLE.md');
        let text = '';
        try { text = fs.readFileSync(lawPath, 'utf8'); } catch { /* ignore */ }
        try { text += '\n\n' + fs.readFileSync(preamblePath, 'utf8'); } catch { /* ignore */ }

        let excerpt = text.slice(0, max_chars);
        if (section) {
            const re = new RegExp(`(?:^|\\n)[^\\n]*${section}[^\\n]*\\n[\\s\\S]{0,${max_chars}}`, 'i');
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
    });

    // ── VAELRIX LAW DEBUG ORACLE (High Inquisitor forensic skill) ─────────────
    // Full ritual from vaelrix_law_debug.md — produces the mandated Debug Report + DebugTraceIR
    registerTool(server, 'mcp_scholomance_collab_skill_vaelrix_law_debug', {
        anomaly_name: z.string().min(1).describe('Name of the anomaly or bug (e.g. "Chroma Drift in VerseIR")'),
        symptoms: z.array(z.string()).min(1).describe('Observed symptoms or error messages'),
        target_files: z.array(z.string()).optional().describe('Files suspected or involved'),
        mode: z.enum(['A','B','C','D','E','F']).optional().default('B').describe('Debug mode: A=DiagnosticOnly, B=PatchReady, C=AutonomousRepairSpec, D=SeniorReviewer, E=PostUpdateAuditor, F=RedTeam'),
        additional_context: z.string().optional(),
    }, async ({ anomaly_name, symptoms, target_files = [], mode = 'B', additional_context }) => {
        const debugSkillPath = path.join(ROOT, 'docs/scholomance-encyclopedia/Scholomance LAW/vaelrix_law_debug.md');
        let debugDoc = '';
        try { debugDoc = fs.readFileSync(debugSkillPath, 'utf8'); } catch { /* ignore */ }

        // Auto-classify and gather basic evidence
        const classification = target_files.length > 0 ? 'Structural/Integration' : 'Behavioral';
        let failureChain = symptoms.slice(0, 3);
        let rootCause = 'Requires deeper inspection (see reproduction path).';
        let evidence = symptoms.map(s => `Direct: ${s}`);
        let blastRadius = 'Unknown — run targeted tests and immunity scan.';
        let fixStrategy = 'Minimal targeted patch after root cause confirmation. Prefer bytecode-level or schema fixes.';
        let minimalPatch = '// TODO: Provide precise unified diff after analysis';
        let regressionNet = 'Run: npm test, npm run test:qa, npm run test:visual, immunity scan on changed files.';

        // Simple Scholomance-specific heuristics (Chroma, TrueSight, Dimension, Session, recursion, determinism)
        const joined = (symptoms.join(' ') + ' ' + (additional_context || '') + ' ' + target_files.join(' ')).toLowerCase();
        const specificAudits = [];
        if (/chroma|hue|color|viseme/.test(joined)) specificAudits.push('Chroma Audit: Check fixed-width bytecode alignment and 180° hue collisions.');
        if (/truesight|overlay|font|metric|caret/.test(joined)) specificAudits.push('TrueSight Audit: Pixel drift, coordinate indexing, font metrics.');
        if (/dimension|layout|hierarchy|animation state/.test(joined)) specificAudits.push('Dimension Audit: Hierarchy flattening, orphaned animation state.');
        if (/csrf|session|handshake|guest/.test(joined)) specificAudits.push('Session Audit: CSRF/Guest handshake integrity.');
        if (/recursion|depth|stack/.test(joined)) specificAudits.push('Stasis Threshold: Recursion depth (max 8) or math finite guards may be violated.');
        if (/math\.random|date\.now|non.?determin/.test(joined)) specificAudits.push('Determinism violation suspected — Law 6.');

        if (specificAudits.length) {
            rootCause = `Suspected Scholomance-specific fracture. ${specificAudits.join(' ')}`;
            evidence.push(...specificAudits.map(a => `Inferred: ${a}`));
        }

        const reportTitle = `${anomaly_name} — Debug Report v1 (MCP)`;
        const debugTraceIR = {
            debug_trace_ir_version: "1.0.0",
            bug: {
                title: anomaly_name,
                severity: symptoms.length > 4 ? "high" : "medium",
                confidence: 0.65,
            },
            failure_chain: failureChain,
            fix: {
                strategy: fixStrategy,
                files_to_change: target_files,
                rollback_plan: "Revert via git + re-run full verification suite.",
            },
            grade: {
                letter: "B",
                score: 65,
                reason: "Initial MCP diagnostic; full human/agent review required per High Inquisitor ritual.",
            },
        };

        const fullReport = `# ${reportTitle}

## 1. Symptom
${symptoms.join('\n- ')}

## 2. Classification
${classification}

## 3. Reproduction Path
(Provide exact steps or command that surfaces the anomaly. MCP can run verification rituals.)

## 4. Failure Chain
${failureChain.map((s,i) => `${String.fromCharCode(65+i)} → ${s}`).join('\n')}

## 5. Root Cause
${rootCause}

## 6. Evidence
${evidence.map(e => `- ${e}`).join('\n')}

${additional_context ? `## Additional Context Provided\n${additional_context}\n` : ''}

## 7. Blast Radius
${blastRadius}

## 8. Fix Strategy
${fixStrategy}

## 9. Minimal Patch
\`\`\`diff
${minimalPatch}
\`\`\`

## 10. Regression Net
${regressionNet}

## 11. QA Checklist
- [ ] \`npm run lint\`
- [ ] \`npm test\`
- [ ] \`npm run test:qa\`
- [ ] \`npm run test:visual\`
- [ ] \`npm run security:qa\`
- [ ] Immunity scan on modified files
- [ ] Specific Scholomance audits: ${specificAudits.length ? specificAudits.join('; ') : 'None auto-triggered'}

## 12. Risk Reduced
(Agent must fill after applying fix.)

## 13. Confidence Grade
**Initial**: B (MCP-assisted). Upgrade only after full evidence and Law 11 Encyclopedia entry.

## 14. Remaining Unknowns
- Full reproduction steps
- Exact commit that introduced the fracture (consider git bisect reasoning)
- Interaction with other layers (run diagnostic_full_scan if needed)

## 15. DebugTraceIR (mandatory)
\`\`\`json
${JSON.stringify(debugTraceIR, null, 2)}
\`\`\`

---
**Mode**: ${mode} (${mode === 'B' ? 'Patch-Ready' : mode === 'A' ? 'Diagnostic-Only' : 'See vaelrix_law_debug.md for full mode definitions'})
**Source Skill**: ${debugSkillPath}
**VAELRIX_LAW Enforcement**: Law 11 — No fix is complete without its story in the Scholomance Encyclopedia.
`;

        return {
            anomaly: anomaly_name,
            mode,
            report: fullReport,
            debug_trace_ir: debugTraceIR,
            recommended_next: [
                "Run mcp_scholomance_collab_immunity_scan_file on target files",
                "Execute relevant verification suite via execute_verification",
                "Document final fix in Encyclopedia per Law 11 (BUG REPORT AUDIT)",
                "Use propose_patch for any code change under a task + lock"
            ],
            source: debugSkillPath,
            raw_debug_doc_excerpt: debugDoc.slice(0, 2200),
        };
    });

    // ── Messaging Tools ───────────────────────────────────────────────────────

    registerTool(server, 'mcp_scholomance_collab_message_send', {
        sender_id: z.string().min(1).max(64),
        target_id: z.string().min(1).max(64).optional().default('all'),
        glyph: z.string().max(8).optional().default('✦'),
        text: z.string().max(4096),
        bytecode: z.string().max(16384).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
    }, params => service.sendMessage(params, params.sender_id));

    registerTool(server, 'mcp_scholomance_collab_message_list', {
        sender: z.string().optional(),
        target: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
    }, params => service.listMessages(params, params));

    registerTool(server, 'mcp_scholomance_collab_message_delete', {
        id: z.coerce.number().int().describe('Message ID to delete'),
        agent_id: z.string().optional().describe('Agent performing the deletion'),
    }, ({ id, agent_id }) => service.deleteMessage(id, agent_id));

    // ── GrimDesign ──────────────────────────────────────────────────────────────

    registerTool(server, 'mcp_scholomance_grimdesign_analyze', {
        intent: z.string().min(1).max(500).describe(
            'Natural-language description of the UI component or surface to design.'
        ),
        component_name: z.string().max(64).optional().describe(
            'Optional PascalCase component name for the spec.'
        ),
    }, async ({ intent, component_name }) => {
        const signal    = await analyzeDesignIntent(intent);
        const decisions = resolveDesignDecisions(signal);
        const spec      = buildGrimSpec(intent, signal, decisions, component_name || null);
        return { signal, decisions, spec };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DIRECT BRAIN NETWORK + FORCEFIELD (governing layer tap, zero Ollama)
    // Every agent/model connected to this MCP now has native access to the
    // specialized brains (CODE_BRAIN, PIXEL_BRAIN, LORE_BRAIN, ...) and the
    // full vaelrix_forcefield pipeline (routing, amplifiers, council arbiter,
    // SCDNA genes, health signals, determinism audit) without going through
    // the SteamDeck daemon or any LLM.
    // ─────────────────────────────────────────────────────────────────────────
    registerTool(server, 'mcp_scholomance_collab_brain_list', {}, () => {
        return callDirectBrain('list');
    });

    registerTool(server, 'mcp_scholomance_collab_brain_forcefield_ask', {
        query: z.string().min(1).describe('Natural language query or task. Runs the complete brain network + ForceField deterministically.'),
        deterministic: z.boolean().optional().default(true).describe('Return structured findings instead of LLM synthesis (default true)'),
    }, async ({ query, deterministic }) => {
        const res = callDirectBrain('forcefield', { query });
        return createToolSuccess('brain_forcefield_ask', res);
    });

    registerTool(server, 'mcp_scholomance_collab_brain_run', {
        name: z.string().min(1).describe('Brain identifier, e.g. CODE_BRAIN, PIXEL_BRAIN, LORE_BRAIN, ARCHITECTURE_BRAIN, DETERMINISM_BRAIN'),
        query: z.string().min(1).describe('Query for the chosen specialized brain'),
    }, async ({ name, query }) => {
        const res = callDirectBrain('brain', { name, query });
        return createToolSuccess('brain_run', res);
    });

    registerTool(server, 'mcp_scholomance_collab_brain_scdna_genes', {
        domain: z.string().optional().default('all').describe('Filter genes by domain (code, pixel, lore, ui, all, ...)'),
    }, async ({ domain }) => {
        const res = callDirectBrain('genes', { domain });
        return createToolSuccess('brain_scdna_genes', res);
    });
}

export function createCollabMcpServer(service = collabService) {
    const server = new McpServer({
        name: 'Scholomance Collab',
        version: '1.4.0',
    });

    registerCollabMcpBridge(server, service);
    return server;
}

/**
 * Keep the event loop alive across the gap between process start and the SDK
 * attaching its stdin listener.
 *
 * This timer is NOT unref'd on purpose — an unref'd timer would let the process
 * exit during that window. The consequence is that it pins the loop open FOREVER
 * unless something releases it, which is why every exit path below must, and why
 * a stdio client vanishing has to be treated as an exit path (see main).
 */
function holdProcessOpenForStdio() {
    const interval = setInterval(() => {}, 60_000);
    return () => clearInterval(interval);
}

export async function main() {
    traceMcpBridge('main:start');
    const server = createCollabMcpServer();
    traceMcpBridge('main:server-created');
    const transport = new StdioServerTransport(process.stdin, process.stdout);
    const releaseKeepAlive = holdProcessOpenForStdio();

    await server.connect(transport);
    // Node child-process pipes can remain paused after the SDK attaches its
    // data listener. Resume only after connect so the first initialize frame
    // cannot flow past an unattached transport.
    process.stdin.resume();
    traceMcpBridge('main:stdin-resumed');
    if (process.env.SCHOL_MCP_BRIDGE_TRACE) {
        const originalOnMessage = transport.onmessage;
        transport.onmessage = (message, extra) => {
            traceMcpBridge(`transport:message:${message?.method || message?.id || 'unknown'}`);
            originalOnMessage?.(message, extra);
        };
        const originalSend = transport.send.bind(transport);
        transport.send = async (message) => {
            traceMcpBridge(`transport:send:${message?.id || message?.method || 'unknown'}`);
            return originalSend(message);
        };
    }
    traceMcpBridge('main:transport-connected');

    let shuttingDown = false;
    const shutdown = async (reason) => {
        if (shuttingDown) return;
        shuttingDown = true;
        traceMcpBridge(`main:shutdown:${reason}`);
        releaseKeepAlive();
        await server.close().catch(() => {});
        process.exit(0);
    };

    // THE MCP CLIENT OWNS THIS PROCESS'S LIFETIME.
    //
    // A stdio server with no client is an orphan: it can never be spoken to
    // again, and it can never be reaped, because holdProcessOpenForStdio pins the
    // event loop open and only SIGINT/SIGTERM released it. A client that dies
    // WITHOUT signalling — killed, crashed, or simply detached — left the bridge
    // running forever. They accumulated: 36 live daemons were found in one
    // session, each re-registering its agent, which is what kept the server's
    // 60-second AGENT-QA sweep reporting AGENT_DUPE violations.
    //
    // When the client's pipe closes, stdin hits EOF. That is the client hanging
    // up, and it is the signal that was never being listened for.
    const onStdioGone = (reason) => () => { void shutdown(reason); };
    process.stdin.once('end', onStdioGone('stdin-end'));
    process.stdin.once('close', onStdioGone('stdin-close'));
    process.stdin.on('error', onStdioGone('stdin-error'));

    // The SDK closes the transport when the peer goes away or the framing breaks.
    const previousOnClose = transport.onclose;
    transport.onclose = () => {
        previousOnClose?.();
        void shutdown('transport-closed');
    };

    process.once('SIGINT', () => { void shutdown('SIGINT'); });
    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.once('exit', () => {
        releaseKeepAlive();
    });

    console.error('Scholomance Collab MCP Bridge initialized over stdio.');
}

const isDirectExecution = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isDirectExecution) {
    traceMcpBridge('direct-execution:true');
    main().catch((error) => {
        traceMcpBridge(`main:error:${error instanceof Error ? error.stack || error.message : String(error)}`);
        console.error('MCP Bridge failed to ignite:', error);
        process.exit(1);
    });
}
