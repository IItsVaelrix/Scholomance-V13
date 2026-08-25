#!/usr/bin/env node
/**
 * ENVELOPE ORACLE — regenerates the expected symbol envelopes that
 * `test_code_lens_envelope.py` asserts against.
 *
 * The point of this script is authorship. `code_lens._js_body_end` tracks
 * braces by hand, and a hand-written expectation for a hand-written brace
 * tracker is the same person marking their own paper — the failure mode that
 * turned a 16/16 mutation score into a measurement of its author's
 * imagination. So the expected line ranges here are produced by @babel/parser
 * and nothing else. Whoever edits the lens does not get to edit the answers.
 *
 * The fixtures are small, but every idiom in them was measured in this repo:
 * `Object.freeze({` opens a body brace inside a call paren (727 declaration
 * sites), and a destructured parameter list can outrun a fixed line budget
 * before the body brace is ever reached (AnalyzePanel.jsx:112).
 *
 *   node scripts/gen-envelope-fixture.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const require = createRequire(join(ROOT, 'package.json'));
const { parse } = require('@babel/parser');

const FIXTURE_DIR = join(ROOT, 'divtube_downloader/tests/fixtures/js_envelopes');
const OUT = join(FIXTURE_DIR, 'expected.json');

/** Top-level symbols the lens contracts to find, with Babel's line ranges. */
function symbolsOf(source) {
  const ast = parse(source, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'typescript', 'classProperties'],
  });
  const out = [];
  const push = (name, kind, node, exported) => {
    if (name) out.push({ name, kind, exported, line: node.loc.start.line, endLine: node.loc.end.line });
  };
  const handle = (d, exported) => {
    if (!d) return;
    if (d.type === 'FunctionDeclaration') push(d.id?.name, 'function', d, exported);
    else if (d.type === 'ClassDeclaration') push(d.id?.name, 'class', d, exported);
    else if (d.type === 'VariableDeclaration') {
      for (const v of d.declarations) {
        if (v.id.type !== 'Identifier') continue;
        const isFn = v.init && (v.init.type === 'ArrowFunctionExpression'
          || v.init.type === 'FunctionExpression');
        push(v.id.name, isFn ? 'function' : 'const', v, exported);
      }
    }
  };
  for (const n of ast.program.body) {
    if (n.type === 'ExportNamedDeclaration') handle(n.declaration, true);
    else if (n.type === 'ExportDefaultDeclaration') {
      const d = n.declaration;
      if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') {
        push(d.id?.name, d.type === 'ClassDeclaration' ? 'class' : 'function', d, true);
      }
    } else handle(n, false);
  }
  return out.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

const EXTS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

/** Fixture paths relative to the fixture dir, including the frozen corpus. */
function fixtureFiles(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...fixtureFiles(full, `${prefix}${name}/`));
    } else if (EXTS.includes(extname(name))) {
      out.push(`${prefix}${name}`);
    }
  }
  return out;
}

const files = fixtureFiles(FIXTURE_DIR);

const expected = {};
for (const f of files) {
  expected[f] = symbolsOf(readFileSync(join(FIXTURE_DIR, f), 'utf8'));
}

writeFileSync(OUT, `${JSON.stringify({
  oracle: '@babel/parser',
  generator: 'scripts/gen-envelope-fixture.mjs',
  note: 'Regenerate after editing a fixture. Never hand-edit these line numbers.',
  files: expected,
}, null, 2)}\n`);

const n = Object.values(expected).reduce((a, s) => a + s.length, 0);
console.log(`envelope oracle → ${OUT}`);
console.log(`  ${files.length} fixtures, ${n} symbols`);
