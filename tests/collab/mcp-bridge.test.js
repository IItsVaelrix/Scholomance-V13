import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
    class HoistedCollabServiceError extends Error {
        constructor(code, message, options = {}) {
            super(message);
            this.name = 'CollabServiceError';
            this.code = code;
            this.statusCode = options.statusCode ?? 500;
            this.details = options.details ?? {};
        }
    }

    return { HoistedCollabServiceError };
});

vi.mock('../../codex/server/collab/collab.service.js', () => ({
    CollabServiceError: hoisted.HoistedCollabServiceError,
    collabService: {},
}));

const subtletyHoisted = vi.hoisted(() => ({
    getStatus: vi.fn(() => ({
        storePath: '/tmp/subtlety-resonance.jsonl',
        recent: [],
        dedupSize: 0,
    })),
}));

vi.mock('../../codex/core/pixelbrain/subtlety-runtime.js', () => ({
    getSubtletyRuntime: vi.fn(() => ({
        getStatus: subtletyHoisted.getStatus,
    })),
}));

import { registerCollabMcpBridge } from '../../codex/server/collab/mcp-bridge.js';
import { AcquireLockSchema } from '../../codex/server/collab/collab.schemas.js';

function createFakeServer() {
    const resources = new Map();
    const tools = new Map();

    return {
        resources,
        tools,
        resource(name, uri, handler) {
            resources.set(name, { uri, handler });
        },
        tool(name, schema, handler) {
            tools.set(name, { schema, handler });
        },
    };
}

function createMockService() {
    return {
        listAgents: vi.fn(() => [{ id: 'agent-ui' }]),
        listTasks: vi.fn(() => [{ id: 'task-1' }]),
        listLocks: vi.fn(() => []),
        listActivity: vi.fn(() => [{ id: 1, action: 'task_created' }]),
        listPipelines: vi.fn(() => [{ id: 'pipe-1', status: 'running' }]),
        getStatus: vi.fn(() => ({ total_agents: 1, running_pipelines: 1 })),
        registerAgent: vi.fn((params) => ({ ...params, status: 'online' })),
        heartbeatAgent: vi.fn((params) => ({ ...params })),
        createTask: vi.fn((params) => ({ id: 'task-created', ...params })),
        getTask: vi.fn((id) => ({ id, status: 'backlog' })),
        assignTask: vi.fn((params) => ({ id: params.task_id, assigned_agent: params.agent_id })),
        updateTask: vi.fn((params) => ({ id: params.id, status: params.status ?? 'backlog' })),
        acquireLock: vi.fn((params) => ({ conflict: false, file_path: params.file_path, locked_by: params.agent_id })),
        releaseLock: vi.fn(() => ({ ok: true })),
        createPipeline: vi.fn((params) => ({ pipeline: { id: 'pipe-created', pipeline_type: params.pipeline_type } })),
        getPipeline: vi.fn((id) => ({ id, status: 'running' })),
        advancePipeline: vi.fn((params) => ({ pipeline: { id: params.id, status: 'completed' }, terminal: false })),
        failPipeline: vi.fn((params) => ({ pipeline: { id: params.id, status: 'failed', reason: params.reason } })),
        deleteTask: vi.fn(() => ({ ok: true })),
        logActivity: vi.fn(),
    };
}

describe('collab MCP bridge parity', () => {
    let fakeServer;
    let service;

    beforeEach(() => {
        fakeServer = createFakeServer();
        service = createMockService();
        registerCollabMcpBridge(fakeServer, service);
    });

    it('registers the required PDR resources and tools', () => {
        expect(Array.from(fakeServer.resources.keys())).toEqual(
            expect.arrayContaining([
                'agents',
                'tasks',
                'locks',
                'activity',
                'pipelines',
                'status',
            ]),
        );

        expect(Array.from(fakeServer.tools.keys())).toEqual(
            expect.arrayContaining([
                'mcp_scholomance_collab_agent_register',
                'mcp_scholomance_collab_agent_heartbeat',
                'mcp_scholomance_collab_task_create',
                'mcp_scholomance_collab_task_assign',
                'mcp_scholomance_collab_task_update',
                'mcp_scholomance_collab_lock_acquire',
                'mcp_scholomance_collab_lock_release',
                'mcp_scholomance_collab_pipeline_create',
                'mcp_scholomance_collab_pipeline_advance',
                'mcp_scholomance_collab_pipeline_fail',
                'mcp_scholomance_collab_status_get',
                'mcp_scholomance_collab_task_get',
                'mcp_scholomance_collab_task_delete',
                'mcp_scholomance_collab_pipeline_get',
                'mcp_scholomance_collab_fs_list',
                'mcp_scholomance_collab_fs_read',
                'mcp_scholomance_collab_execute_verification',
                'verify_run',
                'mcp_scholomance_collab_memory_set',
                'mcp_scholomance_collab_memory_get',
                'diagnostic_latest',
                'diagnostic_hints',
                'codebase_neighbors',
                'immunity_status',
                'mcp_scholomance_collab_subtlety_status',
                'subtlety_status',
                'raid_query',
                'law_audit',
            ]),
        );
    });

    it('exposes short readable aliases for tool hosts with strict name budgets', () => {
        const codexNamespacePrefix = 'mcp__scholomance_collab__';
        const aliases = [
            'bug_create',
            'bug_update',
            'bug_parse_bytecode',
            'bug_create_task',
            'verify_run',
            'diagnostic_latest',
            'diagnostic_report',
            'diagnostic_violations',
            'diagnostic_health',
            'diagnostic_run_cells',
            'diagnostic_hints',
            'diagnostic_full_scan',
            'diagnostic_summary',
            'codebase_list',
            'codebase_search',
            'codebase_neighbors',
            'immunity_scan',
            'immunity_status',
            'subtlety_status',
            'raid_query',
            'raid_merlin_ingest',
            'raid_feedback',
            'raid_learning',
            'law_audit',
            'scholomance_feedback',
        ];

        for (const alias of aliases) {
            expect(fakeServer.tools.has(alias), alias).toBe(true);
            expect(`${codexNamespacePrefix}${alias}`.length, alias).toBeLessThanOrEqual(64);
        }
    });

    it('returns parseable JSON for resources and tool success payloads', async () => {
        const statusResource = fakeServer.resources.get('status');
        const statusPayload = await statusResource.handler();
        expect(statusPayload.contents[0].uri).toBe('collab://status');
        expect(JSON.parse(statusPayload.contents[0].text)).toEqual({ total_agents: 1, running_pipelines: 1 });

        const advanceTool = fakeServer.tools.get('mcp_scholomance_collab_pipeline_advance');
        const toolPayload = await advanceTool.handler({
            id: 'pipe-created',
            agent_id: 'agent-ui',
            result: { ok: true },
        });

        expect(toolPayload.isError).toBeUndefined();
        const parsed = JSON.parse(toolPayload.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.tool).toBe('mcp_scholomance_collab_pipeline_advance');
        expect(parsed.result.pipeline.id).toBe('pipe-created');
    });

    it('exposes and forwards the ownership override on every lock surface', async () => {
        const routeInput = AcquireLockSchema.parse({
            file_path: 'PolarisOS/worldpacks/example.wand.json',
            agent_id: 'agent-ui',
            override: true,
        });
        expect(routeInput.override).toBe(true);

        const lockTool = fakeServer.tools.get('mcp_scholomance_collab_lock_acquire');
        expect(lockTool.schema.override).toBeDefined();

        await lockTool.handler({
            file_path: 'PolarisOS/worldpacks/example.wand.json',
            agent_id: 'agent-ui',
            override: true,
        });
        expect(service.acquireLock).toHaveBeenCalledWith(expect.objectContaining({
            override: true,
        }));
    });

    it('supports setting and getting memories through tools', async () => {
        service.setMemory = vi.fn((params) => ({ ...params, updated_at: 'now' }));
        service.getMemory = vi.fn((params) => ({ ...params, value: 'remembered', updated_at: 'now' }));

        const setTool = fakeServer.tools.get('mcp_scholomance_collab_memory_set');
        const setPayload = await setTool.handler({ key: 'test', value: 'foo' });
        expect(JSON.parse(setPayload.content[0].text).ok).toBe(true);

        const getTool = fakeServer.tools.get('mcp_scholomance_collab_memory_get');
        const getPayload = await getTool.handler({ key: 'test' });
        const getResult = JSON.parse(getPayload.content[0].text);
        expect(getResult.ok).toBe(true);
    });

    it('maps domain conflicts into consistent MCP errors', async () => {
        service.releaseLock.mockImplementation(() => {
            throw new hoisted.HoistedCollabServiceError('LOCK_NOT_FOUND', 'Lock not found or not owned by you', {
                statusCode: 404,
                details: { file_path: 'src/pages/Test.jsx', agent_id: 'agent-ui' },
            });
        });

        const releaseTool = fakeServer.tools.get('mcp_scholomance_collab_lock_release');
        const toolPayload = await releaseTool.handler({
            file_path: 'src/pages/Test.jsx',
            agent_id: 'agent-ui',
        });
        const parsed = JSON.parse(toolPayload.content[0].text);

        expect(toolPayload.isError).toBe(true);
        expect(parsed).toEqual({
            ok: false,
            code: 'LOCK_NOT_FOUND',
            error: 'Lock not found or not owned by you',
            details: {
                file_path: 'src/pages/Test.jsx',
                agent_id: 'agent-ui',
            },
        });
    });

    it('subtlety_status returns runtime status from getSubtletyRuntime', async () => {
        const tool = fakeServer.tools.get('mcp_scholomance_collab_subtlety_status');
        expect(tool).toBeTruthy();

        const alias = fakeServer.tools.get('subtlety_status');
        expect(alias).toBeTruthy();

        const toolPayload = await tool.handler({});
        expect(toolPayload.isError).toBeFalsy();

        const parsed = JSON.parse(toolPayload.content[0].text);
        expect(parsed.ok).toBe(true);
        expect(parsed.tool).toBe('mcp_scholomance_collab_subtlety_status');
        expect(parsed.result).toEqual({
            storePath: '/tmp/subtlety-resonance.jsonl',
            recent: [],
            dedupSize: 0,
        });
        expect(subtletyHoisted.getStatus).toHaveBeenCalled();
    });
});
