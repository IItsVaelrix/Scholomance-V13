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

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(JSON.stringify((tools?.tools ?? []).map(t => ({ name: t.name, description: t.description })), null, 2));
} finally {
  await Promise.allSettled([
    typeof client.close === 'function' ? client.close() : Promise.resolve(),
    typeof transport.close === 'function' ? transport.close() : Promise.resolve(),
  ]);
}
