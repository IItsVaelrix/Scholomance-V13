/**
 * Fetch Universal Dependencies English-EWT into `cache/ud/`.
 *
 * The treebank is NOT vendored into the repo — only this script is, so any
 * number the report prints is reproducible from a clean clone with one command.
 * EWT is CC BY-SA 4.0 and human-annotated, which is the whole point: a gold set
 * annotated by the same model that wrote the parser is partly self-agreement.
 *
 * Idempotent: an existing non-empty file is left alone.
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/UniversalDependencies/UD_English-EWT/master';
const FILES = ['en_ewt-ud-train.conllu', 'en_ewt-ud-dev.conllu', 'en_ewt-ud-test.conllu'];
const OUT_DIR = path.resolve('cache/ud');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of FILES) {
    const dest = path.join(OUT_DIR, name);
    if (existsSync(dest) && statSync(dest).size > 0) {
      console.log(`skip  ${name}  (${statSync(dest).size} bytes already present)`);
      continue;
    }
    const url = `${BASE}/${name}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status}`);
    }
    const body = await response.text();
    if (body.length === 0) throw new Error(`${url} -> empty body`);
    writeFileSync(dest, body, 'utf8');
    console.log(`fetch ${name}  ${body.length} bytes`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
