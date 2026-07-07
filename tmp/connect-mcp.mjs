import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cwd = process.cwd();
const client = new Client({ name: 'Codex Backend', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [`--env-file=${cwd}/.env`, `${cwd}/codex/server/collab/mcp-bridge.js`],
  cwd,
  env: { ...process.env },
  stderr: 'pipe',
});

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const txt = res.content?.find((item) => item.type === 'text')?.text;
  return txt ? JSON.parse(txt) : res;
};

try {
  await client.connect(transport);
  const register = await call('mcp_scholomance_collab_agent_register', {
    id: 'codex-backend',
    name: 'Codex Backend',
    role: 'backend',
    capabilities: ['node', 'fastify', 'schemas', 'mcp'],
  });
  const heartbeat = await call('mcp_scholomance_collab_agent_heartbeat', {
    id: 'codex-backend',
    status: 'online',
  });
  console.log(JSON.stringify({ ok: true, register, heartbeat }, null, 2));
} finally {
  await Promise.allSettled([
    typeof client.close === 'function' ? client.close() : Promise.resolve(),
    typeof transport.close === 'function' ? transport.close() : Promise.resolve(),
  ]);
}
