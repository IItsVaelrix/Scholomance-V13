// Career Graph shard publisher.
//
// Copies the sealed shard set (all *.sqlite + manifest.json) into public/ so
// Vite serves them as static assets at /data/career-graph/shards/<file>, where
// the SQLite-WASM worker fetches them. Build-output only — never edit the files
// in public/ by hand; re-run this after career:graph:shards.
//
// Usage: node scripts/career-graph/publish-shards.mjs [srcDir] [destDir]

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export async function publishShards({ srcDir, destDir, log = () => {} } = {}) {
  const src = resolve(srcDir || join(ROOT, 'data', 'career-graph', 'shards'));
  const dest = resolve(destDir || join(ROOT, 'public', 'data', 'career-graph', 'shards'));

  if (!existsSync(join(src, 'manifest.json'))) {
    throw new Error(
      `PUBLISH_NO_MANIFEST: ${join(src, 'manifest.json')} not found. ` +
      `Run 'npm run career:graph:shards' first.`
    );
  }

  // Start clean so a removed shard never lingers in public/.
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const entries = (await readdir(src)).filter(
    (f) => f.endsWith('.sqlite') || f === 'manifest.json'
  );
  let bytes = 0;
  for (const file of entries) {
    await cp(join(src, file), join(dest, file));
    bytes += (await stat(join(dest, file))).size;
  }

  log(
    `CAREER_SHARDS_PUBLISHED files=${entries.length} bytes=${bytes} dest=${dest}`
  );
  return { dest, fileCount: entries.length, bytes };
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [, , srcArg, destArg] = process.argv;
  const result = await publishShards({
    srcDir: srcArg,
    destDir: destArg,
    log: (l) => console.log(l),
  });
  console.log(`PUBLISH_OK files=${result.fileCount}`);
}
