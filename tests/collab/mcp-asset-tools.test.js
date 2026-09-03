/**
 * Asset-generation MCP tools (audit 2026-09-03, MAJOR #4).
 *
 * The audit's claim was measured at the wire: 83 registered tools, zero of them
 * able to forge or compile an asset, so an assistant told to "make a bespoke
 * sword" had nothing to call. These tests boot the real server over the SDK's
 * in-memory transport and assert the capability is now both DISCOVERABLE
 * (present in listTools with a description) and EXECUTABLE (callTool returns a
 * real result), which is the distinction the audit was actually drawing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCollabMcpServer } from '../../codex/server/collab/mcp-bridge.js';

let client;
let server;

beforeAll(async () => {
  server = createCollabMcpServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'asset-tools-test', version: '1.0.0' });
  // Order matters: the server must be attached before the client's initialize
  // handshake has anywhere to land.
  await server.connect(serverT);
  await client.connect(clientT);
}, 60_000);

afterAll(async () => {
  await client?.close?.();
  await server?.close?.();
});

/**
 * Unwrap the bridge's tool envelope. createToolSuccess() wraps every handler
 * return as { ok, tool, result }, so assertions must look at .result — or a
 * handler's own { ok:false } reads as success at this level, which is exactly
 * the sort of thing worth pinning down.
 */
const payload = (res) => {
  const raw = JSON.parse(res?.content?.[0]?.text ?? '{}');
  return raw.result ?? raw;
};

describe('MCP asset-generation surface', () => {
  it('registers the three asset tools on the real server', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const want of [
      'mcp_scholomance_collab_asset_scdl',
      'mcp_scholomance_collab_asset_effects_list',
      'mcp_scholomance_collab_asset_output_conventions',
    ]) {
      expect(names).toContain(want);
    }
  });

  it('gives each asset tool a description so keyword search finds it', async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const scdl = byName['mcp_scholomance_collab_asset_scdl'];
    expect(scdl.description).toMatch(/sword|shield|chestplate|sprite/i);
    expect(byName['mcp_scholomance_collab_asset_effects_list'].description)
      .toMatch(/bevel|facet|glow|heraldry|symmetry/i);
  });

  it('asset_effects_list actually runs and reports measured liveness', async () => {
    const res = await client.callTool({
      name: 'mcp_scholomance_collab_asset_effects_list',
      arguments: { query: 'bevel' },
    });
    expect(res.isError).toBeFalsy();
    const data = payload(res);
    expect(data.ok).toBe(true);
    expect(data.total).toBeGreaterThan(40);
    expect(data.summary.wired).toBeGreaterThan(0);
    expect(data.effects.length).toBeGreaterThan(0);
    expect(data.effects.every((e) => /bevel/i.test(e.module + e.what))).toBe(true);
  }, 120_000);

  it('asset_output_conventions answers the two-door question', async () => {
    const res = await client.callTool({
      name: 'mcp_scholomance_collab_asset_output_conventions', arguments: {},
    });
    const data = payload(res);
    expect(data.rules.foundryDoorB).toMatch(/output\/foundry/);
    expect(data.rules.scdlDoorA).toMatch(/beside the source/);
    expect(data.rules.committed).toMatch(/gitignored|NOT in git/i);
  });

  it('asset_scdl check surfaces stderr diagnostics on a successful exit', async () => {
    const res = await client.callTool({
      name: 'mcp_scholomance_collab_asset_scdl',
      arguments: { command: 'check', file: 'codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl' },
    });
    const data = payload(res);
    expect(data.ok).toBe(true);
    expect(data.exitCode).toBe(0);
    // The whole point: the CLI exits 0 here and puts the warnings on stderr.
    // An implementation that only read stdout would report a clean compile.
    expect(data.stderr).toMatch(/SCDL-005/);
    expect((data.stdout + data.stderr)).not.toMatch(/PB-ERR-v1/);
  }, 120_000);

  it('asset_scdl refuses a missing file with a hint instead of a stack trace', async () => {
    const res = await client.callTool({
      name: 'mcp_scholomance_collab_asset_scdl',
      arguments: { command: 'compile', file: 'nope/does-not-exist.scdl' },
    });
    const data = payload(res);
    expect(data.ok).toBe(false);
    expect(data.hint).toMatch(/fixtures/);
  });
});
