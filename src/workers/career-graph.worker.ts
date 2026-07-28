/**
 * Career Graph browser worker.
 *
 * Runs the deterministic evidence-first analysis against the real O*NET/ESCO
 * corpus, held as sealed SQLite-WASM shards. Cancellation and staleness are
 * delegated to `createCareerWorkerRuntime` (shared, unit-tested); this module
 * adds only the browser I/O the runtime is deliberately kept free of:
 *
 *   1. lazy residency init (fetch manifest + pinned shards) on first analyze,
 *   2. resolving the confirmed occupation's family shard and making it resident
 *      BEFORE the synchronous pipeline runs (the port is sync, shard loads are
 *      not), using the exact confirm rule the pipeline applies, and
 *   3. corpus provenance so a real result is never labeled as the seed demo.
 */
/// <reference lib="webworker" />
import { createCareerWorkerRuntime, type AnalyzeInput } from '../lib/career/graph/worker-runtime';
import { analyzeCareerGraph, selectConfirmedOccupation } from '../lib/career/graph/analyze-graph';
import { inferOccupations } from '../lib/career/graph/reference-query';
import { occupationFamily } from '../lib/career/graph/sqlite-graph-port';
import { CAREER_POLICY_BUNDLE } from '../lib/career/graph/policies';
import {
  ShardResidency,
  httpShardFetcher,
  type ShardManifest,
} from '../lib/career/graph/shard-residency';
import type { CareerGraphAnalysis, CareerGraphDiagnostic } from '../lib/career/graph/contracts';

// Shards + manifest are served as static assets (see career:graph:publish).
const SHARD_BASE = '/data/career-graph/shards';
const MANIFEST_URL = `${SHARD_BASE}/manifest.json`;

const residency = new ShardResidency(MANIFEST_URL, httpShardFetcher(SHARD_BASE));
let manifest: ShardManifest | null = null;
let familyTag = 0;

/** Corpus provenance derived from the sealed manifest — no fabricated digests. */
function corpusProvenance(m: ShardManifest): CareerGraphDiagnostic {
  return {
    code: 'CAREER_GRAPH_CORPUS',
    severity: 'info',
    message:
      `Running on the sealed Career Graph corpus (${m.policy}, digest ` +
      `${m.contentDigest.slice(0, 12)}…): ${m.shards.length} shards, ` +
      `residency ≤ ${m.residency.maxFamilyShards} families.`,
  };
}

async function analyze(input: AnalyzeInput): Promise<CareerGraphAnalysis> {
  if (!manifest) manifest = await residency.initialize();

  const options = {
    policy: CAREER_POLICY_BUNDLE,
    artifactId: `career-graph:${manifest.contentDigest.slice(0, 12)}`,
    provenance: corpusProvenance(manifest),
  };

  // Resolve — and make resident — the family the pipeline will traverse, using
  // the same confirm rule the pipeline applies, before the synchronous run.
  const query = input.jobDescriptionText.trim() || input.resumeText.trim();
  const candidates = inferOccupations(residency.port(), query, { policy: CAREER_POLICY_BUNDLE });
  const confirmed = selectConfirmedOccupation(candidates, input.confirmedOccupationId);
  if (confirmed) {
    const group = occupationFamily(confirmed.conceptId);
    if (group) await residency.ensureFamily(group, `family-${familyTag++}`);
  }

  return analyzeCareerGraph(residency.port(), input, options);
}

const runtime = createCareerWorkerRuntime((response) => {
  (self as DedicatedWorkerGlobalScope).postMessage(response);
}, { analyze });

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  if (msg && msg.kind === 'terminate') {
    residency.dispose();
    return;
  }
  runtime.onMessage(msg);
});
