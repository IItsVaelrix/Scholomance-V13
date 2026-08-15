#!/usr/bin/env node
/**
 * RESONANCE BEACON PROBE — does a state broadcast break POS ties?
 *
 *   node scripts/resonance-beacon-probe.mjs
 */
import { compose, BONDS, projectAnswer } from '../codex/core/constellation/compose.js';
import {
  buildBeaconField,
  readingScores,
  rankByResonance,
} from '../codex/core/constellation/resonance-beacon.js';

const pos = new Map([
  ['the', []], ['a', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
  ['old', ['a']], ['men', ['n']], ['ran', ['v']],
  ['they', []], ['can', ['n', 'v']], ['run', ['v']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']],
  ['barn', ['n']],
]);

const cases = [
  { tokens: ['the', 'round', 'fell'], want: { token: 'round', type: 'N' }, gold: { subject: 'round', verb: 'fell' } },
  { tokens: ['old', 'men', 'ran'], want: { token: 'men', type: 'N' }, gold: { subject: 'men', verb: 'ran' } },
  { tokens: ['they', 'can', 'run'], want: { token: 'can', type: 'MODAL' }, gold: { subject: 'they', verb: 'run' } },
  { tokens: ['the', 'horse', 'raced', 'past', 'the', 'barn', 'fell'], want: { token: 'raced', type: 'V' } },
];

console.log('token\twant\twin\tscore\trivals');
let wins = 0;
for (const c of cases) {
  const field = buildBeaconField(c.tokens, pos);
  const scores = readingScores(field, BONDS);
  const idx = c.tokens.indexOf(c.want.token);
  const row = scores[idx];
  const win = row[0];
  const ok = win.type === c.want.type;
  if (ok) wins += 1;
  const rivals = row.slice(1, 4).map((r) => `${r.type}:${r.score.toFixed(2)}`).join(',');
  console.log(`${c.tokens.join(' ')}\t${c.want.type}\t${win.type}\t${win.score.toFixed(2)}\t${rivals} ${ok ? 'OK' : 'MISS'}`);

  if (c.gold) {
    const chart = compose(c.tokens, pos);
    const ranked = rankByResonance(chart.stable, field, BONDS);
    const top = ranked[0] ? projectAnswer(ranked[0].molecule) : null;
    const match = top && top.subject === c.gold.subject && top.verb === c.gold.verb;
    console.log(`  parse top → ${top ? `${top.subject}|${top.verb}` : 'none'}  gold ${c.gold.subject}|${c.gold.verb}  ${match ? 'OK' : 'MISS'}`);
  }
}
console.log(`\nreading wins ${wins}/${cases.length}`);
