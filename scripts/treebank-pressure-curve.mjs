import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

if (isMainThread) {
  const CORPUS = path.resolve(`cache/ud/en_ewt-ud-dev.conllu`);
  const records = parseConllu(readFileSync(CORPUS, 'utf8'));

  // Bin by length
  const stats = {};
  
  // Sample up to 100 sentences per length bin to ensure we get a full pressure curve
  const byLength = Array.from({ length: 50 }, () => []);
  for (const record of records) {
    const len = record.tokens.length;
    if (len < 50) byLength[len].push(record);
  }
  
  const sample = [];
  for (let i = 1; i <= 35; i++) {
    sample.push(...byLength[i].slice(0, 15)); // 15 sentences of each length
  }
  
  let currentBin = 1;
  let binCount = 0;
  let binEvents = [];
  let binCov = 0;
  let binThrew = 0;

  console.log("TOKENS\tEVENTS\tCOVERAGE\tBUDGET_FAILS\tTIME_MS\tTEXT");

  async function processRecord(record) {
    return new Promise((resolve) => {
      const tokens = record.tokens.map(t => t.form);
      const worker = new Worker(new URL(import.meta.url), { workerData: { tokens, text: record.text } });
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({ len: tokens.length, events: 800000, root: 0, threw: 1, elapsed: 2000, text: record.text });
      }, 2000);
      
      worker.on('message', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      worker.on('error', () => {
        clearTimeout(timer);
        resolve({ len: tokens.length, events: 800000, root: 0, threw: 1, elapsed: 2000, text: record.text });
      });
    });
  }

  async function run() {
    for (const record of sample) {
      const res = await processRecord(record);
      
      const len = res.len;
      const bin = Math.floor((len - 1) / 5) * 5 + 1;
      const binLabel = `${bin}-${bin+4}`;
      if (!stats[binLabel]) stats[binLabel] = { count: 0, events: [], coverage: 0, threw: 0 };
      
      stats[binLabel].count++;
      stats[binLabel].events.push(res.events);
      stats[binLabel].coverage += res.root;
      stats[binLabel].threw += res.threw;
      
      console.log(`${len}\t${res.events}\t${res.root}\t${res.threw}\t${res.elapsed}\t${res.text.slice(0, 40)}`);
    }
    
    console.log("\n\nSUMMARY:");
    console.log("TOKENS\tCOUNT\tMEDIAN EVENTS\tP95 EVENTS\tCOVERAGE\tBUDGET FAILS");
    const bins = Object.keys(stats).sort((a,b) => parseInt(a) - parseInt(b));
    for (const bin of bins) {
      const s = stats[bin];
      s.events.sort((a,b) => a - b);
      const median = s.events[Math.floor(s.events.length / 2)];
      const p95 = s.events[Math.floor(s.events.length * 0.95)] || median;
      const cov = (s.coverage / s.count * 100).toFixed(1) + '%';
      const thr = (s.threw / s.count * 100).toFixed(1) + '%';
      console.log(`${bin.padEnd(7)}\t${s.count}\t${median.toString().padStart(8)}\t${p95.toString().padStart(8)}\t${cov.padStart(8)}\t${thr.padStart(8)}`);
    }
  }
  run();
} else {
  // Worker Thread
  const DICT = path.resolve('scholomance_dict.sqlite');
  const LEMMA_POS = new Map([
    ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
  ]);
  
  function loadLexicon() {
    if (!existsSync(DICT)) return { posMap: new Map() };
    const db = new Database(DICT, { readonly: true });
    const posTable = new Map();
    for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
      const tag = LEMMA_POS.get(r.pos);
      if (!tag) continue;
      const have = posTable.get(r.surface_lower);
      if (have) { if (!have.includes(tag)) have.push(tag); } else posTable.set(r.surface_lower, [tag]);
    }
    db.close();
    return { posMap: posTable };
  }
  
  const { posMap } = loadLexicon();
  const { tokens, text } = workerData;
  const start = performance.now();
  let threw = 0;
  let events = 0;
  let root = 0;
  
  try {
    const chart = composePacked(tokens, posMap);
    events = chart.events;
    root = chart.stable.length > 0 ? 1 : 0;
  } catch (err) {
    threw = 1;
  }
  
  const elapsed = Math.round(performance.now() - start);
  parentPort.postMessage({ len: tokens.length, events, root, threw, elapsed, text });
}
