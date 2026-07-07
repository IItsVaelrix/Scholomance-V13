#!/usr/bin/env node

/**
 * Grok-local DivTube MCP entrypoint.
 *
 * This wrapper connects `divtube_downloader/grok` to `divtube_downloader/mcp.json`
 * and then delegates to the Scholomance collab MCP bridge. It keeps Grok's
 * identity/config local to the DivTube Cockpit while giving FULL access to the
 * entire Scholomance codebase (not limited to divtube_downloader/).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collabService } from '../../codex/server/collab/collab.service.js';
import { main as startScholomanceMcpBridge } from '../../codex/server/collab/mcp-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DIVTUBE_ROOT = path.join(PROJECT_ROOT, 'divtube_downloader');
const MCP_CONFIG_PATH = path.join(DIVTUBE_ROOT, 'mcp.json');
const MCP_SERVER_NAME = 'divtube-grok-collab';
const HEARTBEAT_MS = 60_000;

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readGrokMcpConfig() {
  const config = readJsonFile(MCP_CONFIG_PATH);
  const server = config?.mcpServers?.[MCP_SERVER_NAME];
  if (!server) {
    throw new Error(`Missing MCP server '${MCP_SERVER_NAME}' in ${MCP_CONFIG_PATH}`);
  }

  const payload = server?.registration?.payload;
  if (!payload?.id || !payload?.name || !payload?.role) {
    throw new Error(`Missing registration payload for '${MCP_SERVER_NAME}' in ${MCP_CONFIG_PATH}`);
  }

  return { config, server, payload };
}

function withRuntimeMetadata(payload) {
  return {
    ...payload,
    capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
    metadata: {
      ...(payload.metadata || {}),
      mcp_config_path: 'divtube_downloader/mcp.json',
      mcp_server_name: MCP_SERVER_NAME,
      bridge_entry: 'divtube_downloader/grok/mcp-bridge-entry.mjs',
      framework_origin: payload.framework_origin || payload.metadata?.framework_origin || 'xai-grok',
      // Note: Grok in the DivTube cockpit has full project access (see grok-divtube-playbook)
    },
  };
}

async function registerGrokAgent(payload) {
  const registration = withRuntimeMetadata(payload);
  const agent = await collabService.registerAgent(registration);
  await collabService.heartbeatAgent({ id: registration.id, status: 'online' });
  return agent;
}

function startHeartbeat(agentId) {
  const timer = setInterval(() => {
    void collabService
      .heartbeatAgent({ id: agentId, status: 'online' })
      .catch((error) => {
        console.error(`[Grok MCP] heartbeat failed for ${agentId}:`, error.message);
      });
  }, HEARTBEAT_MS);
  timer.unref?.();
  return timer;
}

export async function main() {
  const { payload } = readGrokMcpConfig();
  const registration = withRuntimeMetadata(payload);

  process.env.DIVTUBE_GROK_AGENT_ID = registration.id;
  process.env.DIVTUBE_GROK_ROOT = path.join(DIVTUBE_ROOT, 'grok');
  process.env.DIVTUBE_GROK_MCP_CONFIG = MCP_CONFIG_PATH;
  // Full codebase access enabled; cockpit context does not restrict fs/codebase tools.

  try {
    await registerGrokAgent(registration);
    startHeartbeat(registration.id);
    console.error(`[Grok MCP] registered ${registration.id} via ${MCP_SERVER_NAME}`);
  } catch (error) {
    console.error(`[Grok MCP] pre-registration skipped: ${error.message}`);
  }

  await startScholomanceMcpBridge();
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error('[Grok MCP] bridge failed:', error);
    process.exit(1);
  });
}

