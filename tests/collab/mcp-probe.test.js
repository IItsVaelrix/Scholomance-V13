import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
    classifyProbeFailure,
    getCanonicalBridgeLaunchSpec,
    runCollabMcpProbe,
} from '../../codex/server/collab/mcp-probe.js';

function createFakeTransport() {
    return {
        pid: 4242,
        stderr: new PassThrough(),
        close: vi.fn(async () => {}),
    };
}

describe('collab MCP probe', () => {
    it('returns a structured success report for initialize/listResources/listTools', async () => {
        const transport = createFakeTransport();
        const client = {
            connect: vi.fn(async () => {
                transport.stderr.write('bridge initialized\n');
            }),
            getServerVersion: vi.fn(() => ({ name: 'Scholomance Collab', version: '1.2.0' })),
            getServerCapabilities: vi.fn(() => ({ resources: {}, tools: {} })),
            listResources: vi.fn(async () => ({
                resources: [{ uri: 'collab://status' }, { uri: 'collab://tasks' }],
            })),
            listResourceTemplates: vi.fn(async () => ({
                resourceTemplates: [{ uriTemplate: 'collab://tasks/{id}/notes' }],
            })),
            listTools: vi.fn(async () => ({
                tools: [{ name: 'collab_status_get' }, { name: 'collab_task_update' }],
            })),
            readResource: vi.fn(async () => ({
                contents: [{ text: '{"total_agents":1}' }],
            })),
            close: vi.fn(async () => {}),
        };

        const report = await runCollabMcpProbe({
            timeoutMs: 250,
            transportFactory: () => transport,
            clientFactory: () => client,
            allowRawFallback: false,
        });

        expect(report.ok).toBe(true);
        expect(report.stage).toBe('complete');
        expect(report.transport.pid).toBe(4242);
        expect(report.counts).toEqual({
            resources: 2,
            resource_templates: 1,
            tools: 2,
        });
        expect(report.resources).toEqual(['collab://status', 'collab://tasks']);
        expect(report.resource_templates).toEqual(['collab://tasks/{id}/notes']);
        expect(report.tools).toEqual(['collab_status_get', 'collab_task_update']);
        expect(report.status_resource).toEqual({ total_agents: 1 });
        expect(report.stderr).toContain('bridge initialized');
        expect(report.timings_ms.initialize).not.toBeNull();
        expect(report.timings_ms.list_resources).not.toBeNull();
        expect(report.timings_ms.list_tools).not.toBeNull();
        expect(report.timings_ms.total).not.toBeNull();
        expect(client.close).toHaveBeenCalledTimes(1);
        expect(transport.close).toHaveBeenCalledTimes(1);
    });

    it('records sdk initialize failure details when fallback succeeds', async () => {
        const transport = createFakeTransport();
        const client = {
            connect: vi.fn(async () => {
                throw new Error('connection closed: initialize response');
            }),
            close: vi.fn(async () => {}),
        };

        const report = await runCollabMcpProbe({
            timeoutMs: 250,
            transportFactory: () => transport,
            clientFactory: () => client,
            fallbackTransportMode: 'memory',
        });

        expect(report.ok).toBe(true);
        expect(report.stage).toBe('complete');
        expect(report.transport.mode).toBe('in-memory');
        expect(report.fallback).toMatchObject({
            from: 'sdk-stdio',
            reason: 'connection closed: initialize response',
            classification: 'transport_handshake_failure',
        });
        expect(client.close).toHaveBeenCalledTimes(1);
        expect(transport.close).toHaveBeenCalledTimes(1);
    });

    it('classifies initialize handshake failures cleanly', async () => {
        const transport = createFakeTransport();
        const client = {
            connect: vi.fn(async () => {
                throw new Error('connection closed: initialize response');
            }),
            close: vi.fn(async () => {}),
        };

        const report = await runCollabMcpProbe({
            timeoutMs: 250,
            transportFactory: () => transport,
            clientFactory: () => client,
            allowRawFallback: false,
        });

        expect(report.ok).toBe(false);
        expect(report.stage).toBe('initialize');
        expect(report.failure_classification).toBe('transport_handshake_failure');
        expect(report.guidance).toContain('spawned-child stdio transport problem');
        expect(report.error?.message).toBe('connection closed: initialize response');
        expect(client.close).toHaveBeenCalledTimes(1);
        expect(transport.close).toHaveBeenCalledTimes(1);
    });

    it('classifies bridge startup failures from stderr', () => {
        const classification = classifyProbeFailure({
            stage: 'initialize',
            error: { message: 'Server failed to start' },
            stderrText: 'MCP Bridge failed to ignite: SyntaxError: Unexpected token',
        });

        expect(classification).toBe('bridge_startup_failure');
    });

    it('uses the stable bridge entrypoint for canonical stdio launches', () => {
        const launchSpec = getCanonicalBridgeLaunchSpec();

        expect(launchSpec.args.at(-1)).toMatch(/codex[/\\]server[/\\]collab[/\\]mcp-bridge-entry\.js$/);
    });

    it('handles a large newline-delimited tools/list response in shell-pipe mode', async () => {
        const report = await runCollabMcpProbe({
            transportMode: 'raw',
            timeoutMs: 5000,
        });

        expect(report.ok).toBe(true);
        expect(report.stage).toBe('complete');
        expect(report.counts.tools).toBeGreaterThan(100);
    });
});
