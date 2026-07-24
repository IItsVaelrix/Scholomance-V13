/**
 * In-memory `CareerGraphTransport`.
 *
 * Wraps the pure `analyzeCareerGraph` pipeline in the exact worker protocol the
 * browser SQLite-WASM worker will speak, so the real `CareerGraphClient` drives
 * it with zero special-casing. Responses are delivered asynchronously via
 * `queueMicrotask` (simulating worker turn latency) through `MessageEvent`s.
 *
 * Guarantees mirrored from a real worker:
 *  - `initialize` → `ready` with a sealed manifest.
 *  - `analyze`    → `analysis` (schema-valid payload) or `error`.
 *  - `cancel`     → the matching request resolves as `cancelled` if it has not
 *                   already been emitted (best-effort, since analysis is sync).
 *  - `terminate`  → clears listeners; no further messages are emitted.
 */
import type { CareerGraphTransport } from './client';
import type {
  CareerGraphWorkerRequest,
  CareerGraphWorkerResponse,
} from './worker-protocol';
import type { CareerGraphManifest } from './contracts';
import type { CareerGraphQueryPort } from './reference-query';
import { analyzeCareerGraph, type AnalyzeGraphOptions } from './analyze-graph';
import { createSeedGraphPort, SEED_ARTIFACT_ID, seedConceptCount, seedRelationCount } from './seed-graph';
import { CAREER_GRAPH_SCHEMA_POLICY } from './policies';
import { SEED_SOURCE_RELEASE } from './seed-graph';
import { stableHash } from '../parser/identity-utils';

/** Deterministic sealed manifest for the seed artifact (no fabricated digests). */
export function buildSeedManifest(): CareerGraphManifest {
  const conceptCount = seedConceptCount();
  const relationCount = seedRelationCount();
  const checksum = stableHash(
    `${SEED_ARTIFACT_ID}|${CAREER_GRAPH_SCHEMA_POLICY}|${SEED_SOURCE_RELEASE}|${conceptCount}|${relationCount}`
  );
  return {
    artifactId: SEED_ARTIFACT_ID,
    policy: CAREER_GRAPH_SCHEMA_POLICY,
    sources: [SEED_SOURCE_RELEASE],
    conceptCount,
    relationCount,
    checksum,
  };
}

export class InMemoryCareerGraphTransport implements CareerGraphTransport {
  private listeners = new Set<(event: MessageEvent) => void>();
  private cancelled = new Set<string>();
  private terminated = false;
  private readonly port: CareerGraphQueryPort;
  private readonly options: AnalyzeGraphOptions;

  constructor(port: CareerGraphQueryPort = createSeedGraphPort(), options: AnalyzeGraphOptions = {}) {
    this.port = port;
    this.options = options;
  }

  postMessage(message: CareerGraphWorkerRequest): void {
    if (this.terminated) return;
    if (message.kind === 'cancel') {
      this.cancelled.add(message.requestId);
      return;
    }
    // Deliver asynchronously to simulate a worker turn boundary.
    queueMicrotask(() => this.handle(message));
  }

  private handle(message: CareerGraphWorkerRequest): void {
    if (this.terminated) return;

    if (message.kind === 'initialize') {
      this.emit({ requestId: message.requestId, kind: 'ready', manifest: buildSeedManifest() });
      return;
    }

    if (message.kind === 'analyze') {
      const { requestId } = message;
      if (this.cancelled.has(requestId)) {
        this.emit({ requestId, kind: 'cancelled' });
        return;
      }
      try {
        const analysis = analyzeCareerGraph(
          this.port,
          {
            resumeText: message.resumeText,
            jobDescriptionText: message.jobDescriptionText,
            confirmedOccupationId: message.confirmedOccupationId,
          },
          this.options
        );
        if (this.cancelled.has(requestId)) {
          this.emit({ requestId, kind: 'cancelled' });
          return;
        }
        this.emit({
          requestId,
          kind: 'analysis',
          artifactId: analysis.artifactId,
          payload: analysis,
        });
      } catch (error) {
        this.emit({
          requestId,
          kind: 'error',
          code: 'SEED_ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private emit(response: CareerGraphWorkerResponse): void {
    if (this.terminated) return;
    const event = new MessageEvent('message', { data: response });
    for (const listener of this.listeners) listener(event);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
  }
}
