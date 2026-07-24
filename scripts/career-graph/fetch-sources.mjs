// Pinned-source fetcher and checksum verifier for the Career Graph (Task 4).
//
// Sources are pinned in config/career-graph-sources.json with an exact URL,
// license, attribution, and SHA-256 digest. Downloaded bytes are verified
// against the pinned digest BEFORE being written to data/career-graph/raw/.
// Nothing is ever fetched at runtime by the browser product.
//
// Honest pinning workflow (no fabricated provenance):
//   - Fresh scaffold ships with all-zero PLACEHOLDER digests
//     (checksumStatus: "placeholder-unverified"). Verify mode REFUSES to accept
//     a placeholder and tells the operator to pin the real digest.
//   - `CAREER_GRAPH_RECORD_CHECKSUMS=1 npm run career:sources:fetch` downloads
//     each source, computes its real SHA-256, writes the file, and records the
//     digest + checksumStatus:"verified-pinned" back into the config. The
//     operator reviews provenance, then commits the pinned config.
//   - `CAREER_GRAPH_OFFLINE=1` re-verifies already-cached files without network.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export const PLACEHOLDER_DIGEST = '0'.repeat(64);

/** SHA-256 hex digest of a byte buffer. */
export function computeSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** True when a digest is the unverified all-zero placeholder. */
export function isPlaceholderDigest(digest) {
  return typeof digest === 'string' && /^0{64}$/.test(digest);
}

/**
 * Pure verification of downloaded bytes against a pinned source entry.
 *
 * @param {{ sha256: string, id?: string }} source
 * @param {Uint8Array|Buffer} bytes
 * @returns {{ ok: boolean, digest: string, reason?: 'CHECKSUM_NOT_PINNED' | 'CHECKSUM_MISMATCH' }}
 */
export function verifySourceBytes(source, bytes) {
  const digest = computeSha256(bytes);
  if (isPlaceholderDigest(source.sha256)) {
    return { ok: false, digest, reason: 'CHECKSUM_NOT_PINNED' };
  }
  if (digest !== source.sha256) {
    return { ok: false, digest, reason: 'CHECKSUM_MISMATCH' };
  }
  return { ok: true, digest };
}

/** Load the pinned source manifest. */
export async function loadSourceManifest(configPath) {
  const text = await readFile(configPath, 'utf-8');
  return JSON.parse(text);
}

function rawDirFor(rawRoot, source) {
  return join(rawRoot, source.version);
}

/**
 * Fetch (or re-verify cached) sources, enforcing pinned checksums.
 *
 * @param {{
 *   configPath?: string,
 *   rawRoot?: string,
 *   record?: boolean,
 *   offline?: boolean,
 *   fetchImpl?: typeof fetch,
 *   log?: (line: string) => void,
 * }} [options]
 * @returns {Promise<{ ok: boolean, results: object[], manifest: object }>}
 */
export async function fetchSources(options = {}) {
  const configPath = resolve(options.configPath || join(ROOT, 'config', 'career-graph-sources.json'));
  const rawRoot = resolve(options.rawRoot || join(ROOT, 'data', 'career-graph', 'raw'));
  const record = options.record ?? false;
  const offline = options.offline ?? false;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const log = options.log ?? (() => {});

  const manifest = await loadSourceManifest(configPath);
  const results = [];
  let ok = true;

  for (const source of Object.values(manifest)) {
    const dir = rawDirFor(rawRoot, source);
    const targetPath = join(dir, source.filename);

    let bytes;
    if (offline) {
      if (!existsSync(targetPath)) {
        ok = false;
        results.push({ id: source.id, ok: false, reason: 'OFFLINE_MISSING', path: targetPath });
        log(`CAREER_SOURCE_OFFLINE_MISSING:${source.id}:${targetPath}`);
        continue;
      }
      bytes = await readFile(targetPath);
    } else {
      const res = await fetchImpl(source.url);
      if (!res.ok) {
        ok = false;
        results.push({ id: source.id, ok: false, reason: 'HTTP_ERROR', status: res.status });
        log(`CAREER_SOURCE_HTTP_ERROR:${source.id}:${res.status}`);
        continue;
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    const verification = verifySourceBytes(source, bytes);

    if (record) {
      // Trust-on-first-use: pin the real digest after download.
      await mkdir(dir, { recursive: true });
      await writeFile(targetPath, bytes);
      source.sha256 = verification.digest;
      source.checksumStatus = 'verified-pinned';
      results.push({ id: source.id, ok: true, recorded: true, digest: verification.digest, path: targetPath });
      log(`CAREER_SOURCE_RECORDED:${source.id}:${verification.digest}`);
      continue;
    }

    if (!verification.ok) {
      ok = false;
      results.push({ id: source.id, ok: false, reason: verification.reason, digest: verification.digest });
      if (verification.reason === 'CHECKSUM_NOT_PINNED') {
        log(
          `CAREER_SOURCE_CHECKSUM_NOT_PINNED:${source.id} — run with CAREER_GRAPH_RECORD_CHECKSUMS=1 to pin the real digest after reviewing provenance`
        );
      } else {
        log(`CAREER_SOURCE_CHECKSUM_MISMATCH:${source.id}:${verification.digest}`);
      }
      continue;
    }

    await mkdir(dir, { recursive: true });
    if (!offline) await writeFile(targetPath, bytes);
    results.push({ id: source.id, ok: true, digest: verification.digest, path: targetPath, cached: offline });
    log(`CAREER_SOURCE_VERIFIED:${source.id}${offline ? ' (cached)' : ''}`);
  }

  if (record) {
    await writeFile(configPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  return { ok, results, manifest };
}

// CLI entry.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const record = process.env.CAREER_GRAPH_RECORD_CHECKSUMS === '1' || argv.includes('--record');
  const offline = process.env.CAREER_GRAPH_OFFLINE === '1' || argv.includes('--offline');
  const result = await fetchSources({
    record,
    offline,
    log: (line) => console.log(line),
  });
  if (!result.ok) {
    console.error('CAREER_SOURCES_INCOMPLETE');
    process.exit(1);
  }
  console.log(`CAREER_SOURCES_OK count=${result.results.length} mode=${record ? 'record' : offline ? 'offline' : 'verify'}`);
}
