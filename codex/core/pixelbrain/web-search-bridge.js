/**
 * PB-WEB-SEARCH-BRIDGE-v1
 *
 * JS bridge to the Python web search module. Provides:
 *   - searchAndFreeze(query, opts) → frozen artifact
 *   - verifyArtifact(artifact) → bool
 *   - injectToCorpus(artifact, groundingIndex) → docs added
 *
 * DETERMINISM CONTRACT:
 *   Live search is non-deterministic. The freeze boundary is the
 *   determinism gate. Once frozen, the artifact is immutable and
 *   checksummed. The grounding index consumes frozen artifacts only.
 *
 *   This bridge NEVER feeds live search results into scoring channels.
 *   It always freezes first.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, 'web_search.py');
const CACHE_DIR = join(__dirname, '..', '..', '..', 'cache', 'web-search');

// ---------------------------------------------------------------------------
// Core: call Python module
// ---------------------------------------------------------------------------

function callPython(args, timeoutMs = 30000) {
  const result = execFileSync('python3', [PYTHON_SCRIPT, ...args], {
    encoding: 'utf-8',
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Search + Freeze
// ---------------------------------------------------------------------------

/**
 * Search the web and freeze results into a deterministic artifact.
 *
 * @param {string} query - Search query
 * @param {object} opts - Options
 * @param {number} opts.maxResults - Max results (default 10)
 * @param {boolean} opts.fetchPages - Fetch full page text (default false)
 * @param {string} opts.cacheDir - Override cache directory
 * @returns {object} Frozen artifact with checksum
 */
export function searchAndFreeze(query, opts = {}) {
  const {
    maxResults = 10,
    fetchPages = false,
    cacheDir = CACHE_DIR,
  } = opts;

  const args = ['freeze', query, '--max', String(maxResults), '--out', cacheDir];
  if (fetchPages) args.push('--fetch-pages');

  const output = callPython(args, fetchPages ? 120000 : 30000);

  // Parse the output to find the frozen file path
  const pathMatch = output.match(/Frozen: (.+\.json)/);
  if (!pathMatch) {
    throw new Error(`Freeze failed. Output:\n${output}`);
  }

  const artifactPath = pathMatch[1].trim();
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

  return { artifact, path: artifactPath };
}

/**
 * Search without freezing. NON-DETERMINISTIC. For inspection only.
 * Never feed the result into a scoring channel.
 *
 * @param {string} query
 * @param {number} maxResults
 * @returns {Array<{title: string, url: string, snippet: string}>}
 */
export function searchLive(query, maxResults = 10) {
  const output = callPython(['search', query, '--max', String(maxResults)]);
  return JSON.parse(output);
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Verify a frozen artifact's checksum.
 *
 * @param {object} artifact - Frozen artifact
 * @returns {boolean}
 */
export function verifyArtifact(artifact) {
  const canonical = JSON.stringify({
    schema: artifact.schema,
    query: artifact.query,
    results: artifact.results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    })),
  });
  // Python uses sort_keys=True, separators=(",",":")
  // We need to match that exactly
  const sorted = canonical
    .replace(/: /g, ':')
    .replace(/, /g, ',');
  // Actually, let's just call Python verify for correctness
  const tmpPath = join(CACHE_DIR, '_verify_tmp.json');
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(artifact));
  try {
    const output = callPython(['verify', tmpPath]);
    return output.includes('Valid: True');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Corpus injection
// ---------------------------------------------------------------------------

/**
 * Convert a frozen artifact into grounding-index corpus documents
 * and inject them into a GroundingIndex instance.
 *
 * @param {object} artifact - Frozen artifact (must pass verify)
 * @param {object} groundingIndex - GroundingIndex instance with addDocument()
 * @returns {{ added: number, docs: Array }}
 */
export function injectToCorpus(artifact, groundingIndex) {
  if (!verifyArtifact(artifact)) {
    throw new Error(
      `Artifact checksum mismatch: ${artifact.checksum}. ` +
      'Cannot inject unverified artifact into corpus.'
    );
  }

  const docs = [];
  for (const r of artifact.results) {
    const parts = [r.title, r.snippet];
    const pageText = r.page_text || '';
    if (pageText && !pageText.startsWith('[')) {
      parts.push(pageText.slice(0, 2000));
    }
    const text = parts.filter(Boolean).join('\n');

    const doc = {
      text,
      source: `web-search:${artifact.checksum}`,
      tag: 'web',
      url: r.url,
      query: artifact.query,
    };
    docs.push(doc);

    if (groundingIndex && typeof groundingIndex.addDocument === 'function') {
      groundingIndex.addDocument(text, {
        source: doc.source,
        tag: doc.tag,
      });
    }
  }

  return { added: docs.length, docs };
}

/**
 * Load a frozen artifact from disk.
 *
 * @param {string} path - Path to frozen JSON
 * @returns {object}
 */
export function loadArtifact(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * List all frozen artifacts in the cache directory.
 *
 * @param {string} cacheDir
 * @returns {Array<{path: string, query: string, checksum: string, results: number}>}
 */
export function listArtifacts(cacheDir = CACHE_DIR) {
  if (!existsSync(cacheDir)) return [];
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.frozen.json'));
  return files.map(f => {
    const path = join(cacheDir, f);
    try {
      const artifact = JSON.parse(readFileSync(path, 'utf-8'));
      return {
        path,
        query: artifact.query,
        checksum: artifact.checksum,
        results: artifact.result_count,
        frozen_at: artifact.frozen_at,
      };
    } catch {
      return { path, query: '?', checksum: '?', results: 0, frozen_at: '?' };
    }
  });
}
