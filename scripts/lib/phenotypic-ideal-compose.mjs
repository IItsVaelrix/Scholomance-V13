/**
 * Phenotypic Idealism compose library (no shebang — safe for Vitest / MCP import).
 *
 * CLI: scripts/phenotypic-ideal.mjs
 * MCP: mcp_scholomance_collab_phenotypic_ideal
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assemblePhenotypicIdealPacket,
  validatePhenotypicIdealPacket,
} from './phenotypic-ideal-packet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const STEAMDECK = path.join(ROOT, 'steamdeck_brain');

async function searchHits(query, scope = 'repo') {
  const { searchCodebase } = await import(
    path.join(ROOT, 'codex/server/services/codebaseSearch.service.js')
  );
  // Boon 2: bias retrieval itself for scope=divtube — restrict the indexed
  // candidate set to the harness subtree so the top-N is divtube-only instead
  // of collab-server/OAuth noise. repo scope leaves retrieval unbiased.
  const searchOptions =
    scope === 'divtube' ? { pathPrefix: 'divtube_downloader/' } : {};
  const result = await searchCodebase(query, searchOptions);
  const indexSize = result?.metadata?.index_size ?? 0;
  const hits = (result?.results || []).map((r) => ({
    path: r.file_path,
    score: r.score,
    preview: r.preview || '',
    chunkIndex: r.chunk_index ?? 0,
  }));
  return {
    hits,
    engine: result?.metadata?.engine || 'float32-cosine-v1',
    indexSize,
  };
}

function loadHitsJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload)) throw new Error('hits-json must be a JSON array');
  return payload.map((item) => {
    if (typeof item === 'string') return { path: item, score: 0.5, preview: '', chunkIndex: 0 };
    return {
      path: String(item.path || ''),
      score: typeof item.score === 'number' ? item.score : 0.5,
      preview: String(item.preview || ''),
      chunkIndex: typeof item.chunkIndex === 'number' ? item.chunkIndex : 0,
    };
  }).filter((h) => h.path);
}

function attachEvidence(query, hits) {
  const py = process.env.PYTHON || 'python3';
  const hitsPayload = JSON.stringify(hits.map((h) => ({ path: h.path })));
  const proc = spawnSync(
    py,
    [
      '-m',
      'vaelrix_forcefield.scdna.phenotypic_evidence',
      '--query',
      query,
      '--hits-json',
      hitsPayload,
    ],
    {
      cwd: STEAMDECK,
      encoding: 'utf8',
      env: { ...process.env, PYTHONPATH: STEAMDECK },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (proc.status !== 0) {
    const err = (proc.stderr || proc.stdout || '').trim() || `python exit ${proc.status}`;
    throw new Error(`SCDNA evidence attach failed: ${err}`);
  }
  const out = JSON.parse(proc.stdout || '{}');
  if (out.error) throw new Error(out.error);
  return out;
}

/**
 * Compose a PHENOTYPIC-IDEAL-v1 packet.
 * @param {{
 *   query: string,
 *   scope?: 'repo'|'divtube',
 *   hitsJson?: string|null,
 *   hits?: Array<{path:string,score?:number,preview?:string,chunkIndex?:number}>|null,
 *   allowEmptyIndex?: boolean,
 * }} opts
 */
export async function composePhenotypicIdeal(opts = {}) {
  const query = String(opts.query || '').trim();
  if (!query) throw new Error('query is required');
  const scope = opts.scope === 'divtube' ? 'divtube' : 'repo';
  const allowEmptyIndex = Boolean(opts.allowEmptyIndex);

  let hits;
  let engine = 'float32-cosine-v1';
  let indexSize = null;

  if (Array.isArray(opts.hits)) {
    hits = opts.hits.map((h) => ({
      path: String(h.path || ''),
      score: typeof h.score === 'number' ? h.score : 0.5,
      preview: String(h.preview || ''),
      chunkIndex: typeof h.chunkIndex === 'number' ? h.chunkIndex : 0,
    })).filter((h) => h.path);
    engine = 'injected-hits';
  } else if (opts.hitsJson) {
    hits = loadHitsJson(path.resolve(String(opts.hitsJson)));
    engine = 'injected-hits';
  } else {
    try {
      const searched = await searchHits(query, scope);
      hits = searched.hits;
      engine = searched.engine;
      indexSize = searched.indexSize;
    } catch (err) {
      const e = new Error(`codebase search failed: ${err.message}`);
      e.code = 'SEARCH_FAILED';
      e.hint = 'Ensure collab DB is available, or pass hitsJson for offline compose';
      throw e;
    }
    if (indexSize === 0 && !allowEmptyIndex) {
      const e = new Error('codebase TurboQuant index is empty');
      e.code = 'EMPTY_INDEX';
      e.hint = 'Run: node scripts/index_codebase_vectors.js  (or pass hitsJson / allowEmptyIndex)';
      throw e;
    }
  }

  // Boon 2: scope must bias EVIDENCE, not only the observed phenotype. Filter
  // hits to the scoped subtree BEFORE attachEvidence so capabilities/genes are
  // matched against in-scope neighbors — not collab-server/OAuth noise when the
  // operator asked for scope=divtube. The guard mirrors the assembly-stage
  // filter: if no in-scope hits exist, fall back to the full neighbor set
  // rather than emitting an empty archaeology.
  if (scope === 'divtube') {
    const scoped = hits.filter((h) => h.path.startsWith('divtube_downloader/'));
    if (scoped.length) hits = scoped;
  }

  const evidence = attachEvidence(query, hits);
  const packet = assemblePhenotypicIdealPacket({
    query,
    scope,
    engine,
    hits,
    capabilities: evidence.capabilities || [],
    genes: evidence.genes || [],
  });

  const errors = validatePhenotypicIdealPacket(packet);
  if (errors.length) {
    const e = new Error('invalid phenotypic packet');
    e.code = 'INVALID_PACKET';
    e.details = errors;
    throw e;
  }
  return packet;
}
