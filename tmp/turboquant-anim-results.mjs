import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'fs';

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
  'animate-fadeIn animate-slideUp animate-spin animate-float animate-glow',
  'low-hp-pulse low-mp-pulse grim-pulse alchemical-shake',
  'inspector-pulse',
  'spin beacon-pulse',
  'tooltipFadeIn rundownFadeIn panelSlideDown',
  'portal-spin portal-breathe portal-moonlight-break portal-moon-cloud-pass portal-hint-pulse portal-beacon portal-phoneme-orbit wind-blow',
  'scanline-scroll glyph-pulse ring-spin text-flicker progress-pulse emitter-pulse',
  'ide-char-flicker ide-char-settle title-glow-cyan title-glow-gold title-glow-iridescent title-glow-spark title-glow-ethereal title-glow-ember oracle-grim-breathe oracle-scan oracle-serif-emerge grim-kinetic-emerge grim-rule-inscribe grim-glyph-ignite pronunciation-sharpener-converge pronunciation-ink-surface grim-phoneme-burst grim-phoneme-shimmer grim-phoneme-breathe grim-phoneme-pulse grim-phoneme-glide grim-trace-inscribe grim-channel-inscribe grim-marker-precipitate oracle-marker-pulse oracle-zodiac-turn orb-pulse oracle-beacon-pulse oracle-glyph-hum oracle-rune-orbit',
  'sigil-pop glow-pulse',
  'pulse rotate',
  'school-overlay-picker',
  'amp-active',
  'useAnimationSpec',
  'useAnimationSubmitter',
  'useAnimationIntent',
];

try {
  await client.connect(transport);
  const out = {};
  for (const q of queries) {
    const key = q.split(' ')[0];
    console.error(`SEARCH: ${key}`);
    out[key] = await call('codebase_search', { query: q });
  }
  writeFileSync('tmp/turboquant-anim-results.json', JSON.stringify(out, null, 2));
  console.log('done');
} finally {
  await Promise.allSettled([
    typeof client.close === 'function' ? client.close() : Promise.resolve(),
    typeof transport.close === 'function' ? transport.close() : Promise.resolve(),
  ]);
}
