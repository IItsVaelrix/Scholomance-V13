/**
 * Career benchmark report.
 *
 *   npm run career:benchmark
 *
 * Runs the DEFAULT pipeline (the flow a user without the Career Graph feature flag gets)
 * over the 20-pair corpus in `tests/fixtures/career-benchmark/pairs.ts` and prints what the
 * tool actually does. The hard invariants are asserted separately, and permanently, in
 * `tests/unit/careerBenchmarkInvariants.test.ts` — this script is the readable companion:
 * it answers "how much, of what kind, and where is it silent?" rather than pass/fail.
 *
 * Run it before and after any change to the advisor. The numbers are the argument.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

// The corpus and pipeline are TypeScript; load them through vite-node's transform.
const { createServer } = await import('vite');
const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
  logLevel: 'error',
});

async function load(rel) {
  return server.ssrLoadModule(pathToFileURL(resolve(process.cwd(), rel)).pathname);
}

const { BENCHMARK_PAIRS } = await load('tests/fixtures/career-benchmark/pairs.ts');
const { parseResumeSource } = await load('src/lib/career/parser/parse-resume.ts');
const { analyzeCareerFit } = await load('src/lib/career/analysis/analyze-career.ts');
const { buildImprovements } = await load('src/lib/career/improve/build-improvements.ts');

const rows = [];
const typeTotals = new Map();
let editCount = 0;
let noteCount = 0;

for (const pair of BENCHMARK_PAIRS) {
  const doc = await parseResumeSource({ type: 'paste', content: pair.resume });
  const analysis = analyzeCareerFit(doc, pair.jd);
  const improvements = buildImprovements(pair.jd, doc);
  const suggestions = [...(analysis.suggestions ?? []), ...improvements];

  for (const s of suggestions) {
    typeTotals.set(s.type, (typeTotals.get(s.type) ?? 0) + 1);
    if (s.after) editCount += 1;
    else noteCount += 1;
  }

  const edits = suggestions.filter((s) => s.after).length;
  rows.push({
    id: pair.id,
    total: suggestions.length,
    edits,
    notes: suggestions.length - edits,
    parse: analysis.scorecard?.parseQuality ?? null,
    archetype: pair.archetype,
  });
}

const total = rows.reduce((n, r) => n + r.total, 0);
const silent = rows.filter((r) => r.total === 0);
const noEdits = rows.filter((r) => r.edits === 0);
const counts = rows.map((r) => r.total).sort((a, b) => a - b);
const median = counts[Math.floor(counts.length / 2)];

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log('\nCareer benchmark — default pipeline over %d pairs\n', BENCHMARK_PAIRS.length);
console.log(pad('pair', 20), padL('total', 6), padL('edits', 6), padL('notes', 6), padL('parse%', 7));
console.log('-'.repeat(48));
for (const r of rows) {
  console.log(pad(r.id, 20), padL(r.total, 6), padL(r.edits, 6), padL(r.notes, 6), padL(r.parse ?? '-', 7));
}

console.log('\nTotals');
console.log('  suggestions           ', total, `(median ${median}/pair)`);
console.log('  actionable edits      ', editCount);
console.log('  advisory notes        ', noteCount);
console.log('  pairs with 0 anything ', silent.length, silent.map((r) => r.id).join(', '));
console.log('  pairs with 0 EDITS    ', noEdits.length, noEdits.map((r) => r.id).join(', '));

console.log('\nBy type');
for (const [type, n] of [...typeTotals].sort((a, b) => b[1] - a[1])) {
  console.log('  ', pad(type, 16), padL(n, 4));
}

console.log(
  '\nNote: these are authored fixtures. They measure advisor behaviour, not extraction\n' +
    'robustness — real PDFs and DOCX files are the gap this corpus cannot cover.\n'
);

await server.close();
