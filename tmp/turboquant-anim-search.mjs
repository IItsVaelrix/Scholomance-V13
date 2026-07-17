import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cwd = process.cwd();
const client = new Client({ name: 'Codex Backend', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [`--env-file=${cwd}/.env`, `${cwd}/codex/server/collab/mcp-bridge.js`],
  cwd,
  env: { ...process.env, PATH: '/tmp/node-install/bin:' + process.env.PATH },
  stderr: 'pipe',
});

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const txt = res.content?.find((item) => item.type === 'text')?.text;
  return txt ? JSON.parse(txt) : res;
};

const queries = [
  '@keyframes animation-name',
  'requestAnimationFrame cancelAnimationFrame',
  'framer-motion motion.div AnimatePresence',
  'useAnimation useReducedMotion variants',
  'prefers-reduced-motion',
];

try {
  await client.connect(transport);
  const results = {};
  for (const q of queries) {
    console.error(`QUERY: ${q}`);
    const res = await call('codebase_search', { query: q });
    results[q] = res;
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await Promise.allSettled([
    typeof client.close === 'function' ? client.close() : Promise.resolve(),
    typeof transport.close === 'function' ? transport.close() : Promise.resolve(),
  ]);
}
