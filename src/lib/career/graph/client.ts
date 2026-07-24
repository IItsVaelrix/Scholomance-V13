/**
 * Cancellable, UI-facing Career Graph client.
 *
 * Wraps a worker transport (anything that satisfies `CareerGraphTransport`) and
 * exposes `initialize` / `analyze` / `cancel` / `dispose`. Guarantees:
 *   - A stale response (requestId !== active) never resolves the current promise.
 *   - A degraded/error/cancelled response resolves to a lexical fallback that
 *     preserves the diagnostic, so the UI always has a coherent result.
 *   - `dispose()` terminates the worker and rejects any in-flight request.
 *
 * The transport is injected so the client is fully unit-testable without a real
 * `Worker` or SQLite WASM.
 */
import type { CareerGraphAnalysis, CareerGraphDiagnostic } from './contracts';
import type { CareerGraphWorkerRequest } from './worker-protocol';
import { CareerGraphAnalysisSchema } from './schemas';
import { buildLexicalFallback } from './fallback';
import { stableHash } from '../parser/identity-utils';

/** Minimal worker transport the client depends on. */
export interface CareerGraphTransport {
  postMessage(message: CareerGraphWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface CareerGraphInput {
  resumeText: string;
  jobDescriptionText: string;
  confirmedOccupationId?: string;
}

export interface AnalyzeOptions {
  fallback?: (diagnostic: CareerGraphDiagnostic) => CareerGraphAnalysis;
}

interface PendingRequest {
  requestId: string;
  resolve: (analysis: CareerGraphAnalysis) => void;
  reject: (error: Error) => void;
  fallback: (diagnostic: CareerGraphDiagnostic) => CareerGraphAnalysis;
}

/** Deterministic request id derived from the input and a monotonic sequence. */
export function stableRequestId(input: CareerGraphInput, sequence: number): string {
  const canon = `${input.resumeText}\u0000${input.jobDescriptionText}\u0000${
    input.confirmedOccupationId ?? ''
  }`;
  return `cg-${sequence}-${stableHash(canon)}`;
}

function toDiagnostic(error: unknown): CareerGraphDiagnostic {
  return {
    code: 'GRAPH_UNAVAILABLE',
    severity: 'warning',
    message: error instanceof Error ? error.message : String(error),
  };
}

export class CareerGraphClient {
  private worker: CareerGraphTransport | null = null;
  private sequence = 0;
  private activeRequestId: string | null = null;
  private pending: PendingRequest | null = null;
  private readonly workerFactory: () => CareerGraphTransport;
  private readonly listener: (event: MessageEvent) => void;

  constructor(workerFactory: () => CareerGraphTransport) {
    this.workerFactory = workerFactory;
    this.listener = (event) => this.onMessage(event.data);
  }

  private ensureWorker(): CareerGraphTransport {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener('message', this.listener);
    }
    return this.worker;
  }

  /** Lazily create the worker and signal initialization. */
  initialize(manifestUrl: string): void {
    const worker = this.ensureWorker();
    const requestId = stableRequestId({ resumeText: '', jobDescriptionText: '' }, ++this.sequence);
    worker.postMessage({ requestId, kind: 'initialize', manifestUrl });
  }

  async analyze(
    input: CareerGraphInput,
    options: AnalyzeOptions = {}
  ): Promise<CareerGraphAnalysis> {
    const requestId = stableRequestId(input, ++this.sequence);
    this.activeRequestId = requestId;
    const fallback = options.fallback ?? buildLexicalFallback;
    const worker = this.ensureWorker();

    try {
      return await new Promise<CareerGraphAnalysis>((resolve, reject) => {
        this.pending = { requestId, resolve, reject, fallback };
        worker.postMessage({
          requestId,
          kind: 'analyze',
          resumeText: input.resumeText,
          jobDescriptionText: input.jobDescriptionText,
          confirmedOccupationId: input.confirmedOccupationId,
        });
      });
    } catch (error) {
      return fallback(toDiagnostic(error));
    }
  }

  /** Post an explicit cancel for the active request. */
  cancel(): void {
    if (this.worker && this.activeRequestId) {
      this.worker.postMessage({ requestId: this.activeRequestId, kind: 'cancel' });
    }
  }

  /** Terminate the worker and reject any in-flight request. */
  dispose(): void {
    if (this.worker) {
      this.worker.removeEventListener('message', this.listener);
      this.worker.terminate();
      this.worker = null;
    }
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.reject(new Error('CLIENT_DISPOSED'));
    }
  }

  private onMessage(data: unknown): void {
    const pending = this.pending;
    if (!pending || typeof data !== 'object' || data === null) return;
    const msg = data as Record<string, unknown>;

    // A stale response never resolves the current promise.
    if (msg.requestId !== pending.requestId) return;

    if (msg.kind === 'analysis') {
      const parsed = CareerGraphAnalysisSchema.safeParse(msg.payload);
      this.pending = null;
      if (parsed.success) {
        pending.resolve(parsed.data);
      } else {
        pending.resolve(
          pending.fallback({
            code: 'INVALID_ANALYSIS_PAYLOAD',
            severity: 'error',
            message: 'Worker returned an invalid analysis payload.',
          })
        );
      }
      return;
    }

    if (msg.kind === 'degraded' || msg.kind === 'error') {
      this.pending = null;
      pending.resolve(
        pending.fallback({
          code: typeof msg.code === 'string' ? msg.code : 'GRAPH_DEGRADED',
          severity: 'warning',
          message:
            typeof msg.message === 'string'
              ? msg.message
              : 'Career graph degraded; lexical fallback engaged.',
        })
      );
      return;
    }

    if (msg.kind === 'cancelled') {
      this.pending = null;
      pending.resolve(
        pending.fallback({
          code: 'CANCELLED',
          severity: 'info',
          message: 'Career graph request cancelled.',
        })
      );
    }
  }
}
