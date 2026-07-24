/**
 * Career Graph worker runtime state machine (transport-agnostic).
 *
 * This is the unit-testable core of `src/workers/career-graph.worker.ts`, separated
 * from the SQLite WASM I/O so cancellation and staleness rules can be verified
 * without a real worker. Guarantees:
 *   - A cancelled request never publishes an `analysis` result.
 *   - A stale response (superseded by a newer request id) is dropped.
 *   - Analysis failures publish a structured `error`, never a thrown exception.
 */
import type { CareerGraphAnalysis } from './contracts';
import type { CareerGraphWorkerRequest, CareerGraphWorkerResponse } from './worker-protocol';
import { buildLexicalFallback } from './fallback';

export interface AnalyzeInput {
  resumeText: string;
  jobDescriptionText: string;
  confirmedOccupationId?: string;
}

export interface WorkerRuntimeOptions {
  /** The graph analysis implementation. Defaults to a deterministic lexical fallback. */
  analyze?: (input: AnalyzeInput) => Promise<CareerGraphAnalysis>;
}

export interface CareerWorkerRuntime {
  onMessage: (request: CareerGraphWorkerRequest) => void;
  whenIdle: () => Promise<void>;
}

const defaultAnalyze = async (): Promise<CareerGraphAnalysis> => buildLexicalFallback();

export function createCareerWorkerRuntime(
  publish: (response: CareerGraphWorkerResponse) => void,
  options: WorkerRuntimeOptions = {}
): CareerWorkerRuntime {
  const analyze = options.analyze ?? defaultAnalyze;
  const cancelled = new Set<string>();
  let latestRequestId: string | null = null;
  const pending: Promise<void>[] = [];

  function onMessage(request: CareerGraphWorkerRequest): void {
    if (request.kind === 'cancel') {
      cancelled.add(request.requestId);
      return;
    }
    if (request.kind !== 'analyze') return;

    const { requestId, resumeText, jobDescriptionText, confirmedOccupationId } = request;
    latestRequestId = requestId;

    const task = analyze({ resumeText, jobDescriptionText, confirmedOccupationId })
      .then((analysis) => {
        // Drop cancelled or stale results.
        if (cancelled.has(requestId) || requestId !== latestRequestId) {
          publish({ requestId, kind: 'cancelled' });
          return;
        }
        publish({
          requestId,
          kind: 'analysis',
          artifactId: analysis.artifactId,
          payload: analysis,
        });
      })
      .catch((error: unknown) => {
        if (cancelled.has(requestId) || requestId !== latestRequestId) return;
        publish({
          requestId,
          kind: 'error',
          code: 'ANALYSIS_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    pending.push(task);
  }

  async function whenIdle(): Promise<void> {
    await Promise.all(pending);
  }

  return { onMessage, whenIdle };
}
