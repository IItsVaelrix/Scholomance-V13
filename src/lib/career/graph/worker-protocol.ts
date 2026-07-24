/**
 * Career Graph browser-worker request/response protocol.
 *
 * The worker opens read-only SQLite WASM shards and answers `analyze` requests.
 * `parseWorkerResponse` is the boundary guard that admits worker messages into the
 * typed space: it rejects stale/malformed messages (missing request id, unknown
 * kind, empty artifact id, or a payload that fails the `CareerGraphAnalysis`
 * schema) so a corrupt or out-of-order message can never surface as a result.
 *
 * Request ids are produced by a deterministic counter generator — no randomness.
 */
import type { CareerGraphAnalysis, CareerGraphManifest } from './contracts';
import { CareerGraphAnalysisSchema, CareerGraphManifestSchema } from './schemas';

export type CareerGraphWorkerRequest =
  | { requestId: string; kind: 'initialize'; manifestUrl: string }
  | {
      requestId: string;
      kind: 'analyze';
      resumeText: string;
      jobDescriptionText: string;
      confirmedOccupationId?: string;
    }
  | { requestId: string; kind: 'cancel' };

export type CareerGraphWorkerResponse =
  | { requestId: string; kind: 'analysis'; artifactId: string; payload: CareerGraphAnalysis }
  | { requestId: string; kind: 'ready'; manifest: CareerGraphManifest }
  | { requestId: string; kind: 'error'; code: string; message: string }
  | { requestId: string; kind: 'cancelled' };

export interface ParsedWorkerResponse {
  success: boolean;
  reason?: string;
  response?: CareerGraphWorkerResponse;
}

/** Deterministic request-id generator: `cg-1`, `cg-2`, ... (no randomness). */
export function createRequestIdGenerator(prefix = 'cg'): () => string {
  let counter = 0;
  return () => `${prefix}-${++counter}`;
}

function fail(reason: string): ParsedWorkerResponse {
  return { success: false, reason };
}

/** Validate and admit a raw worker message. Never throws. */
export function parseWorkerResponse(raw: unknown): ParsedWorkerResponse {
  if (typeof raw !== 'object' || raw === null) {
    return fail('NOT_AN_OBJECT');
  }
  const msg = raw as Record<string, unknown>;
  if (typeof msg.requestId !== 'string' || msg.requestId.length === 0) {
    return fail('MISSING_REQUEST_ID');
  }
  const requestId = msg.requestId;

  switch (msg.kind) {
    case 'analysis': {
      if (typeof msg.artifactId !== 'string' || msg.artifactId.length === 0) {
        return fail('EMPTY_ARTIFACT_ID');
      }
      const parsed = CareerGraphAnalysisSchema.safeParse(msg.payload);
      if (!parsed.success) {
        return fail('INVALID_ANALYSIS_PAYLOAD');
      }
      return {
        success: true,
        response: { requestId, kind: 'analysis', artifactId: msg.artifactId, payload: parsed.data },
      };
    }
    case 'ready': {
      const parsed = CareerGraphManifestSchema.safeParse(msg.manifest);
      if (!parsed.success) {
        return fail('INVALID_MANIFEST');
      }
      return { success: true, response: { requestId, kind: 'ready', manifest: parsed.data } };
    }
    case 'error': {
      if (typeof msg.code !== 'string' || typeof msg.message !== 'string') {
        return fail('INVALID_ERROR');
      }
      return {
        success: true,
        response: { requestId, kind: 'error', code: msg.code, message: msg.message },
      };
    }
    case 'cancelled': {
      return { success: true, response: { requestId, kind: 'cancelled' } };
    }
    default:
      return fail('UNKNOWN_KIND');
  }
}
