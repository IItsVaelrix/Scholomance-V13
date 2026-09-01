import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCollabMcpServer } from './mcp-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_ENV_FILE = path.join(ROOT, '.env');
const DEFAULT_BRIDGE_PATH = path.join(ROOT, 'codex', 'server', 'collab', 'mcp-bridge-entry.js');
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_STATUS_URI = 'collab://status';
const DEFAULT_STATUS_TOOL = 'mcp_scholomance_collab_status_get';
const DEFAULT_CLIENT_INFO = {
    name: 'Scholomance MCP Probe',
    version: '1.0.0',
};

export function getCanonicalBridgeLaunchSpec(options = {}) {
    const command = options.command ?? process.execPath;
    const cwd = options.cwd ?? ROOT;
    const bridgePath = options.bridgePath ?? DEFAULT_BRIDGE_PATH;
    const envFile = options.envFile === undefined
        ? (fs.existsSync(DEFAULT_ENV_FILE) ? DEFAULT_ENV_FILE : null)
        : options.envFile;
    const args = options.args ?? [
        ...(envFile ? [`--env-file=${envFile}`] : []),
        bridgePath,
    ];

    return {
        command,
        args,
        cwd,
        env: {
            ...process.env,
            ...(options.env ?? {}),
        },
        stderr: options.stderr ?? 'pipe',
    };
}

function createTimeoutError(stage, timeoutMs) {
    const error = new Error(`${stage} timed out after ${timeoutMs}ms`);
    error.code = 'MCP_PROBE_TIMEOUT';
    error.stage = stage;
    return error;
}

async function withTimeout(promise, timeoutMs, stage) {
    let timer;

    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(createTimeoutError(stage, timeoutMs)), timeoutMs);
                timer.unref?.();
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function createStderrCollector(maxChars = 20000) {
    let buffer = '';

    return {
        attach(stream) {
            if (!stream || typeof stream.on !== 'function') return;
            stream.on('data', (chunk) => {
                const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
                buffer += text;
                if (buffer.length > maxChars) {
                    buffer = buffer.slice(-maxChars);
                }
            });
        },
        getText() {
            return buffer.trim();
        },
        getLines() {
            return buffer
                .split(/\r?\n/)
                .map((line) => line.trimEnd())
                .filter(Boolean);
        },
    };
}

function roundMs(value) {
    return Number(value.toFixed(2));
}

function normalizeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            code: error.code ?? null,
            stage: error.stage ?? null,
        };
    }

    return {
        name: 'Error',
        message: String(error),
        code: null,
        stage: null,
    };
}

export function classifyProbeFailure({ stage, error, stderrText }) {
    const message = `${error?.message ?? ''} ${stderrText ?? ''}`.toLowerCase();

    if (stage === 'initialize' && /\b(timeout|timed out|closed|connection closed|initialize response)\b/.test(message)) {
        return 'transport_handshake_failure';
    }

    if (/\bfailed to ignite\b|\bsyntaxerror\b|\breferenceerror\b|\btypeerror\b/.test(message)) {
        return 'bridge_startup_failure';
    }

    if (stage === 'readStatusResource' || stage === 'listResources' || stage === 'listTools') {
        return 'bridge_runtime_failure';
    }

    return 'unknown_failure';
}

export function buildProbeGuidance({ failureClassification, stderr }) {
    const hasStderr = Array.isArray(stderr) ? stderr.length > 0 : Boolean(stderr);

    switch (failureClassification) {
        case 'transport_handshake_failure':
            return hasStderr
                ? 'The bridge process started but did not complete the initialize handshake. Inspect stderr first, then compare against a raw shell-pipe initialize to separate bridge failures from host transport failures.'
                : 'The bridge process launched but did not answer initialize. If a raw shell-pipe initialize succeeds, treat this as a spawned-child stdio transport problem in the current host rather than a repo-local bridge failure.';
        case 'bridge_startup_failure':
            return 'The bridge failed before the MCP handshake completed. Inspect stderr for startup errors and fix those before retrying any editor-hosted MCP client.';
        case 'bridge_runtime_failure':
            return 'Initialize succeeded, but a follow-up MCP operation failed. Inspect the failing stage and its stderr output to isolate the broken resource or tool surface.';
        default:
            return 'Probe failure was not classified cleanly. Compare the probe result with a raw shell-pipe initialize and capture stderr before changing the bridge implementation.';
    }
}

function safeParseResourceText(text) {
    if (typeof text !== 'string' || text.length === 0) return null;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function closeProbeClient(client, transport) {
    await Promise.allSettled([
        typeof client?.close === 'function' ? client.close() : Promise.resolve(),
        typeof transport?.close === 'function' ? transport.close() : Promise.resolve(),
    ]);
}

function createBaseReport({ timeoutMs, launchSpec }) {
    return {
        ok: false,
        stage: 'initialize',
        transport: {
            mode: 'sdk-stdio',
            command: launchSpec.command,
            args: [...launchSpec.args],
            cwd: launchSpec.cwd,
            pid: null,
        },
        timeout_ms: timeoutMs,
        server: null,
        capabilities: null,
        counts: {
            resources: 0,
            resource_templates: 0,
            tools: 0,
        },
        timings_ms: {
            initialize: null,
            list_resources: null,
            list_resource_templates: null,
            list_tools: null,
            read_status_resource: null,
            probe_tool_execution: null,
            total: null,
        },
        resources: [],
        resource_templates: [],
        tools: [],
        status_resource: null,
        tool_probe: null,
        stderr: [],
        failure_classification: null,
        guidance: null,
        error: null,
        fallback: null,
    };
}

function createRawLineClient({ launchSpec, timeoutMs, stderrCollector }) {
    let nextId = 1;
    let stdoutBuffer = '';
    const pending = new Map();
    const child = spawn(launchSpec.command, launchSpec.args, {
        cwd: launchSpec.cwd,
        env: launchSpec.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
    });

    stderrCollector.attach(child.stderr);

    child.stdout.on('data', (chunk) => {
        stdoutBuffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        let newlineIndex = stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
            const line = stdoutBuffer.slice(0, newlineIndex).trim();
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            if (line) {
                try {
                    const message = JSON.parse(line);
                    if (message.id !== undefined && pending.has(message.id)) {
                        const { resolve, reject, timer } = pending.get(message.id);
                        pending.delete(message.id);
                        clearTimeout(timer);
                        if (message.error) {
                            reject(new Error(message.error.message || JSON.stringify(message.error)));
                        } else {
                            resolve(message.result);
                        }
                    }
                } catch (error) {
                    for (const { reject, timer } of pending.values()) {
                        clearTimeout(timer);
                        reject(error);
                    }
                    pending.clear();
                }
            }
            newlineIndex = stdoutBuffer.indexOf('\n');
        }
    });

    child.on('close', () => {
        for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(new Error('Raw MCP child process closed before responding'));
        }
        pending.clear();
    });

    function request(method, params = {}) {
        const id = nextId;
        nextId += 1;
        const payload = { jsonrpc: '2.0', id, method, params };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(createTimeoutError(method, timeoutMs));
            }, timeoutMs);
            timer.unref?.();
            pending.set(id, { resolve, reject, timer });
            child.stdin.write(`${JSON.stringify(payload)}\n`);
        });
    }

    function notify(method, params = {}) {
        const payload = { jsonrpc: '2.0', method, params };
        child.stdin.write(`${JSON.stringify(payload)}\n`);
    }

    async function close() {
        child.stdin.end();
        if (child.exitCode === null) {
            child.kill('SIGTERM');
        }
    }

    return { child, request, notify, close };
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function createShellPipePayload({ readStatusResource, statusUri, probeToolExecution, statusTool }) {
    const messages = [
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: DEFAULT_CLIENT_INFO,
            },
        },
        {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
        },
        { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'resources/templates/list', params: {} },
        { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
    ];

    if (readStatusResource) {
        messages.push({
            jsonrpc: '2.0',
            id: 5,
            method: 'resources/read',
            params: { uri: statusUri },
        });
    }

    if (probeToolExecution) {
        messages.push({
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: statusTool, arguments: {} },
        });
    }

    return `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
}

async function runShellPipeCollabMcpProbe(options) {
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const readStatusResource = options.readStatusResource ?? true;
    const statusUri = options.statusUri ?? DEFAULT_STATUS_URI;
    const statusTool = options.statusTool ?? DEFAULT_STATUS_TOOL;
    const launchSpec = getCanonicalBridgeLaunchSpec(options.launch);
    const report = createBaseReport({ timeoutMs, launchSpec });
    const totalStart = performance.now();
    const payload = createShellPipePayload({
        readStatusResource,
        statusUri,
        probeToolExecution: Boolean(options.probeToolExecution),
        statusTool,
    });
    const command = [
        'printf %s',
        shellQuote(payload),
        '|',
        shellQuote(launchSpec.command),
        ...launchSpec.args.map(shellQuote),
    ].join(' ');
    const child = spawn('/bin/bash', ['-lc', command], {
        cwd: launchSpec.cwd,
        env: launchSpec.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });
    report.transport.mode = 'shell-pipe-stdio';
    report.transport.command = '/bin/bash';
    report.transport.args = ['-lc', command];
    report.transport.pid = child.pid ?? null;

    let stdoutBuffer = '';
    const parsedResponses = new Map();
    const expectedResponseIds = new Set([1, 2, 3, 4]);
    if (readStatusResource) expectedResponseIds.add(5);
    if (options.probeToolExecution) expectedResponseIds.add(6);
    const stderrCollector = createStderrCollector(options.maxStderrChars ?? 20000);
    stderrCollector.attach(child.stderr);

    try {
        const responses = await withTimeout(new Promise((resolve, reject) => {
            const maybeResolve = () => {
                const complete = Array.from(expectedResponseIds).every((id) => parsedResponses.has(id));
                if (complete) resolve(parsedResponses);
            };

            child.stdout.on('data', (chunk) => {
                stdoutBuffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
                let newlineIndex = stdoutBuffer.indexOf('\n');
                while (newlineIndex !== -1) {
                    const line = stdoutBuffer.slice(0, newlineIndex).trim();
                    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
                    if (line) {
                        try {
                            const message = JSON.parse(line);
                            if (message.id !== undefined) parsedResponses.set(message.id, message);
                            maybeResolve();
                        } catch (error) {
                            reject(error);
                            return;
                        }
                    }
                    newlineIndex = stdoutBuffer.indexOf('\n');
                }
            });
            child.on('error', reject);
            child.on('close', (code, signal) => {
                if (stdoutBuffer.trim()) {
                    reject(new SyntaxError('Shell-pipe MCP response ended with an incomplete JSON line'));
                    return;
                }
                maybeResolve();
                reject(new Error(`Shell-pipe MCP process exited before all responses code=${code} signal=${signal ?? 'none'}`));
            });
        }), timeoutMs, 'initialize');

        const initializeResponse = responses.get(1);
        if (!initializeResponse?.result) {
            throw new Error(initializeResponse?.error?.message || 'Shell-pipe initialize response missing');
        }

        report.timings_ms.initialize = roundMs(performance.now() - totalStart);
        report.server = initializeResponse.result.serverInfo ?? null;
        report.capabilities = initializeResponse.result.capabilities ?? null;

        report.stage = 'listResources';
        const resourceResult = responses.get(2)?.result;
        if (!resourceResult) throw new Error(responses.get(2)?.error?.message || 'resources/list response missing');
        report.resources = (resourceResult.resources ?? []).map((resource) => resource.uri);
        report.counts.resources = report.resources.length;
        report.timings_ms.list_resources = 0;

        report.stage = 'listResourceTemplates';
        const resourceTemplateResult = responses.get(3)?.result;
        if (!resourceTemplateResult) {
            throw new Error(responses.get(3)?.error?.message || 'resources/templates/list response missing');
        }
        report.resource_templates = (resourceTemplateResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate);
        report.counts.resource_templates = report.resource_templates.length;
        report.timings_ms.list_resource_templates = 0;

        report.stage = 'listTools';
        const toolResult = responses.get(4)?.result;
        if (!toolResult) throw new Error(responses.get(4)?.error?.message || 'tools/list response missing');
        report.tools = (toolResult.tools ?? []).map((tool) => tool.name);
        report.counts.tools = report.tools.length;
        report.timings_ms.list_tools = 0;

        if (readStatusResource) {
            report.stage = 'readStatusResource';
            const statusResult = responses.get(5)?.result;
            if (!statusResult) throw new Error(responses.get(5)?.error?.message || 'resources/read response missing');
            report.status_resource = safeParseResourceText(statusResult.contents?.[0]?.text ?? null);
            report.timings_ms.read_status_resource = 0;
        }

        if (options.probeToolExecution) {
            report.stage = 'probeToolExecution';
            const toolCallResult = responses.get(6)?.result;
            if (!toolCallResult) throw new Error(responses.get(6)?.error?.message || 'tools/call response missing');
            report.tool_probe = {
                tool: statusTool,
                ok: !toolCallResult.isError,
                content: toolCallResult.content?.[0]?.text ?? null,
            };
            report.timings_ms.probe_tool_execution = 0;
            if (toolCallResult.isError) {
                throw new Error(`Tool execution probe failed: ${report.tool_probe.content}`);
            }
        }

        report.ok = true;
        report.stage = 'complete';
        return report;
    } catch (error) {
        report.error = normalizeError(error);
        report.failure_classification = classifyProbeFailure({
            stage: report.stage,
            error: report.error,
            stderrText: stderrCollector.getText(),
        });
        report.guidance = buildProbeGuidance({
            failureClassification: report.failure_classification,
            stderr: stderrCollector.getLines(),
        });
        return report;
    } finally {
        report.timings_ms.total = roundMs(performance.now() - totalStart);
        report.stderr = stderrCollector.getLines();
        if (child.exitCode === null) child.kill('SIGTERM');
    }
}

async function runRawCollabMcpProbe(options) {
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const readStatusResource = options.readStatusResource ?? true;
    const statusUri = options.statusUri ?? DEFAULT_STATUS_URI;
    const statusTool = options.statusTool ?? DEFAULT_STATUS_TOOL;
    const launchSpec = getCanonicalBridgeLaunchSpec(options.launch);
    const stderrCollector = createStderrCollector(options.maxStderrChars ?? 20000);
    const report = createBaseReport({ timeoutMs, launchSpec });
    report.transport.mode = 'raw-stdio';
    const totalStart = performance.now();
    const client = createRawLineClient({ launchSpec, timeoutMs, stderrCollector });
    report.transport.pid = client.child.pid ?? null;

    try {
        let stepStart = performance.now();
        const initializeResult = await withTimeout(client.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: DEFAULT_CLIENT_INFO,
        }), timeoutMs, 'initialize');
        report.timings_ms.initialize = roundMs(performance.now() - stepStart);
        report.server = initializeResult.serverInfo ?? null;
        report.capabilities = initializeResult.capabilities ?? null;
        client.notify('notifications/initialized');

        report.stage = 'listResources';
        stepStart = performance.now();
        const resourceResult = await withTimeout(client.request('resources/list'), timeoutMs, 'listResources');
        report.timings_ms.list_resources = roundMs(performance.now() - stepStart);
        report.resources = (resourceResult.resources ?? []).map((resource) => resource.uri);
        report.counts.resources = report.resources.length;

        report.stage = 'listResourceTemplates';
        stepStart = performance.now();
        const resourceTemplateResult = await withTimeout(
            client.request('resources/templates/list'),
            timeoutMs,
            'listResourceTemplates',
        );
        report.timings_ms.list_resource_templates = roundMs(performance.now() - stepStart);
        report.resource_templates = (resourceTemplateResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate);
        report.counts.resource_templates = report.resource_templates.length;

        report.stage = 'listTools';
        stepStart = performance.now();
        const toolResult = await withTimeout(client.request('tools/list'), timeoutMs, 'listTools');
        report.timings_ms.list_tools = roundMs(performance.now() - stepStart);
        report.tools = (toolResult.tools ?? []).map((tool) => tool.name);
        report.counts.tools = report.tools.length;

        if (readStatusResource) {
            report.stage = 'readStatusResource';
            stepStart = performance.now();
            const statusResult = await withTimeout(
                client.request('resources/read', { uri: statusUri }),
                timeoutMs,
                'readStatusResource',
            );
            report.timings_ms.read_status_resource = roundMs(performance.now() - stepStart);
            report.status_resource = safeParseResourceText(statusResult.contents?.[0]?.text ?? null);
        }

        if (options.probeToolExecution) {
            report.stage = 'probeToolExecution';
            stepStart = performance.now();
            const toolResult = await withTimeout(
                client.request('tools/call', { name: statusTool, arguments: {} }),
                timeoutMs,
                'probeToolExecution',
            );
            report.timings_ms.probe_tool_execution = roundMs(performance.now() - stepStart);
            report.tool_probe = {
                tool: statusTool,
                ok: !toolResult.isError,
                content: toolResult.content?.[0]?.text ?? null,
            };
            if (toolResult.isError) {
                throw new Error(`Tool execution probe failed: ${report.tool_probe.content}`);
            }
        }

        report.ok = true;
        report.stage = 'complete';
        return report;
    } catch (error) {
        report.error = normalizeError(error);
        report.failure_classification = classifyProbeFailure({
            stage: report.stage,
            error: report.error,
            stderrText: stderrCollector.getText(),
        });
        report.guidance = buildProbeGuidance({
            failureClassification: report.failure_classification,
            stderr: stderrCollector.getLines(),
        });
        return report;
    } finally {
        report.timings_ms.total = roundMs(performance.now() - totalStart);
        report.stderr = stderrCollector.getLines();
        await client.close();
    }
}

async function runInMemoryCollabMcpProbe(options) {
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const readStatusResource = options.readStatusResource ?? true;
    const statusUri = options.statusUri ?? DEFAULT_STATUS_URI;
    const statusTool = options.statusTool ?? DEFAULT_STATUS_TOOL;
    const launchSpec = getCanonicalBridgeLaunchSpec(options.launch);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(DEFAULT_CLIENT_INFO);
    const server = createCollabMcpServer();
    const report = createBaseReport({ timeoutMs, launchSpec });
    const totalStart = performance.now();
    report.transport.mode = 'in-memory';

    try {
        let stepStart = performance.now();
        await withTimeout(Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport),
        ]), timeoutMs, 'initialize');
        report.timings_ms.initialize = roundMs(performance.now() - stepStart);
        report.server = client.getServerVersion?.() ?? null;
        report.capabilities = client.getServerCapabilities?.() ?? null;

        report.stage = 'listResources';
        stepStart = performance.now();
        const resourceResult = await withTimeout(client.listResources(), timeoutMs, 'listResources');
        report.timings_ms.list_resources = roundMs(performance.now() - stepStart);
        report.resources = (resourceResult.resources ?? []).map((resource) => resource.uri);
        report.counts.resources = report.resources.length;

        report.stage = 'listResourceTemplates';
        stepStart = performance.now();
        const resourceTemplateResult = await withTimeout(
            client.listResourceTemplates(),
            timeoutMs,
            'listResourceTemplates',
        );
        report.timings_ms.list_resource_templates = roundMs(performance.now() - stepStart);
        report.resource_templates = (resourceTemplateResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate);
        report.counts.resource_templates = report.resource_templates.length;

        report.stage = 'listTools';
        stepStart = performance.now();
        const toolResult = await withTimeout(client.listTools(), timeoutMs, 'listTools');
        report.timings_ms.list_tools = roundMs(performance.now() - stepStart);
        report.tools = (toolResult.tools ?? []).map((tool) => tool.name);
        report.counts.tools = report.tools.length;

        if (readStatusResource) {
            report.stage = 'readStatusResource';
            stepStart = performance.now();
            const statusResult = await withTimeout(
                client.readResource({ uri: statusUri }),
                timeoutMs,
                'readStatusResource',
            );
            report.timings_ms.read_status_resource = roundMs(performance.now() - stepStart);
            report.status_resource = safeParseResourceText(statusResult.contents?.[0]?.text ?? null);
        }

        if (options.probeToolExecution) {
            report.stage = 'probeToolExecution';
            stepStart = performance.now();
            const toolResult = await withTimeout(
                client.callTool({ name: statusTool, arguments: {} }),
                timeoutMs,
                'probeToolExecution'
            );
            report.timings_ms.probe_tool_execution = roundMs(performance.now() - stepStart);
            report.tool_probe = {
                tool: statusTool,
                ok: !toolResult.isError,
                content: toolResult.content?.[0]?.text ?? null,
            };
            if (toolResult.isError) {
                throw new Error(`Tool execution probe failed: ${report.tool_probe.content}`);
            }
        }

        report.ok = true;
        report.stage = 'complete';
        return report;
    } catch (error) {
        report.error = normalizeError(error);
        report.failure_classification = classifyProbeFailure({
            stage: report.stage,
            error: report.error,
            stderrText: '',
        });
        report.guidance = buildProbeGuidance({
            failureClassification: report.failure_classification,
            stderr: [],
        });
        return report;
    } finally {
        report.timings_ms.total = roundMs(performance.now() - totalStart);
        await closeProbeClient(client, clientTransport);
        await server.close().catch(() => {});
    }
}

export async function runCollabMcpProbe(options = {}) {
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const readStatusResource = options.readStatusResource ?? true;
    const statusUri = options.statusUri ?? DEFAULT_STATUS_URI;
    const statusTool = options.statusTool ?? DEFAULT_STATUS_TOOL;
    const launchSpec = getCanonicalBridgeLaunchSpec(options.launch);
    const stderrCollector = createStderrCollector(options.maxStderrChars ?? 20000);
    const transport = options.transportFactory
        ? options.transportFactory(launchSpec)
        : new StdioClientTransport(launchSpec);
    const client = options.clientFactory
        ? options.clientFactory(DEFAULT_CLIENT_INFO)
        : new Client(DEFAULT_CLIENT_INFO);
    if (options.transportMode === 'raw') {
        return runShellPipeCollabMcpProbe(options);
    }
    if (options.transportMode === 'raw-interactive') {
        return runRawCollabMcpProbe(options);
    }
    if (options.transportMode === 'memory') {
        return runInMemoryCollabMcpProbe(options);
    }

    const report = createBaseReport({ timeoutMs, launchSpec });
    const totalStart = performance.now();

    stderrCollector.attach(transport.stderr);

    try {
        let stepStart = performance.now();
        await withTimeout(client.connect(transport), timeoutMs, 'initialize');
        report.timings_ms.initialize = roundMs(performance.now() - stepStart);
        report.transport.pid = transport.pid ?? null;
        report.server = client.getServerVersion?.() ?? null;
        report.capabilities = client.getServerCapabilities?.() ?? null;

        report.stage = 'listResources';
        stepStart = performance.now();
        const resourceResult = await withTimeout(client.listResources(), timeoutMs, 'listResources');
        report.timings_ms.list_resources = roundMs(performance.now() - stepStart);
        report.resources = (resourceResult.resources ?? []).map((resource) => resource.uri);
        report.counts.resources = report.resources.length;

        report.stage = 'listResourceTemplates';
        stepStart = performance.now();
        const resourceTemplateResult = await withTimeout(
            client.listResourceTemplates(),
            timeoutMs,
            'listResourceTemplates',
        );
        report.timings_ms.list_resource_templates = roundMs(performance.now() - stepStart);
        report.resource_templates = (resourceTemplateResult.resourceTemplates ?? []).map((resource) => resource.uriTemplate);
        report.counts.resource_templates = report.resource_templates.length;

        report.stage = 'listTools';
        stepStart = performance.now();
        const toolResult = await withTimeout(client.listTools(), timeoutMs, 'listTools');
        report.timings_ms.list_tools = roundMs(performance.now() - stepStart);
        report.tools = (toolResult.tools ?? []).map((tool) => tool.name);
        report.counts.tools = report.tools.length;

        if (readStatusResource) {
            report.stage = 'readStatusResource';
            stepStart = performance.now();
            const statusResult = await withTimeout(
                client.readResource({ uri: statusUri }),
                timeoutMs,
                'readStatusResource',
            );
            report.timings_ms.read_status_resource = roundMs(performance.now() - stepStart);
            report.status_resource = safeParseResourceText(statusResult.contents?.[0]?.text ?? null);
        }

        // Phase 6.5: Tool Execution Probe
        if (options.probeToolExecution) {
            report.stage = 'probeToolExecution';
            stepStart = performance.now();
            const toolResult = await withTimeout(
                client.callTool({ name: statusTool, arguments: {} }),
                timeoutMs,
                'probeToolExecution'
            );
            report.timings_ms.probe_tool_execution = roundMs(performance.now() - stepStart);
            report.tool_probe = {
                tool: statusTool,
                ok: !toolResult.isError,
                content: toolResult.content?.[0]?.text ?? null,
            };
            if (toolResult.isError) {
                throw new Error(`Tool execution probe failed: ${report.tool_probe.content}`);
            }
        }

        report.ok = true;
        report.stage = 'complete';
        return report;
    } catch (error) {
        report.error = normalizeError(error);
        report.failure_classification = classifyProbeFailure({
            stage: report.stage,
            error: report.error,
            stderrText: stderrCollector.getText(),
        });
        report.guidance = buildProbeGuidance({
            failureClassification: report.failure_classification,
            stderr: stderrCollector.getLines(),
        });

        if (options.allowRawFallback !== false && report.stage === 'initialize') {
            const fallbackMode = options.fallbackTransportMode ?? 'memory';
            const fallbackRunner = fallbackMode === 'raw'
                ? runShellPipeCollabMcpProbe
                : fallbackMode === 'raw-interactive'
                    ? runRawCollabMcpProbe
                    : runInMemoryCollabMcpProbe;
            const fallbackReport = await fallbackRunner({
                ...options,
                transportMode: fallbackMode,
            });
            fallbackReport.fallback = {
                from: 'sdk-stdio',
                reason: report.error.message,
                classification: report.failure_classification,
                guidance: report.guidance,
            };
            return fallbackReport;
        }

        return report;
    } finally {
        report.timings_ms.total = roundMs(performance.now() - totalStart);
        report.transport.pid = transport.pid ?? report.transport.pid ?? null;
        report.stderr = stderrCollector.getLines();
        await closeProbeClient(client, transport);
    }
}

export function formatProbeReport(report) {
    const lines = [
        'Scholomance MCP Probe',
        `status: ${report.ok ? 'PASS' : 'FAIL'}`,
        `stage: ${report.stage}`,
    ];

    if (report.server) {
        lines.push(`server: ${report.server.name} ${report.server.version}`);
    }

    if (report.transport?.pid) {
        lines.push(`pid: ${report.transport.pid}`);
    }
    if (report.transport?.mode) {
        lines.push(`transport: ${report.transport.mode}`);
    }
    if (report.fallback) {
        lines.push(`fallback: ${report.fallback.from} -> ${report.transport.mode} (${report.fallback.classification})`);
    }

    lines.push(
        `timings_ms: initialize=${report.timings_ms.initialize ?? 'n/a'} listResources=${report.timings_ms.list_resources ?? 'n/a'} listResourceTemplates=${report.timings_ms.list_resource_templates ?? 'n/a'} listTools=${report.timings_ms.list_tools ?? 'n/a'} readStatus=${report.timings_ms.read_status_resource ?? 'n/a'} total=${report.timings_ms.total ?? 'n/a'}`,
    );
    lines.push(
        `counts: resources=${report.counts.resources} templates=${report.counts.resource_templates} tools=${report.counts.tools}`,
    );

    if (report.tool_probe) {
        lines.push(`tool_probe: ${report.tool_probe.tool} ${report.tool_probe.ok ? 'PASS' : 'FAIL'}`);
    }

    if (report.error) {
        lines.push(`error: ${report.error.message}`);
    }

    if (report.failure_classification) {
        lines.push(`classification: ${report.failure_classification}`);
    }

    if (report.guidance) {
        lines.push(`guidance: ${report.guidance}`);
    }

    if (report.stderr.length > 0) {
        lines.push('stderr:');
        lines.push(...report.stderr.map((line) => `  ${line}`));
    }

    return lines.join('\n');
}
