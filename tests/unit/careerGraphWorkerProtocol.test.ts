import { describe, expect, it } from 'vitest';
import {
  parseWorkerResponse,
  createRequestIdGenerator,
} from '../../src/lib/career/graph/worker-protocol';
import { makeCareerGraphAnalysis } from '../fixtures/career-graph/runtime-fixtures';

describe('Career Graph worker protocol', () => {
  it('rejects stale or malformed worker messages', () => {
    expect(
      parseWorkerResponse({
        requestId: 'r1',
        kind: 'analysis',
        artifactId: '',
        payload: {},
      }).success
    ).toBe(false);
  });

  it('rejects a missing requestId', () => {
    expect(parseWorkerResponse({ kind: 'analysis', artifactId: 'x', payload: {} }).success).toBe(false);
  });

  it('rejects an unknown message kind', () => {
    expect(parseWorkerResponse({ requestId: 'r1', kind: 'teleport' }).success).toBe(false);
  });

  it('accepts a well-formed analysis response with a valid payload', () => {
    const analysis = makeCareerGraphAnalysis({ artifactId: 'career-graph:onet-30.3:esco-1.2.1' });
    const parsed = parseWorkerResponse({
      requestId: 'r1',
      kind: 'analysis',
      artifactId: analysis.artifactId,
      payload: analysis,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.response?.kind).toBe('analysis');
  });

  it('accepts a structured error response', () => {
    const parsed = parseWorkerResponse({
      requestId: 'r1',
      kind: 'error',
      code: 'SHARD_NOT_RESIDENT',
      message: 'family 15 not loaded',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.response?.kind).toBe('error');
  });

  it('accepts a cancelled response', () => {
    expect(parseWorkerResponse({ requestId: 'r1', kind: 'cancelled' }).success).toBe(true);
  });

  it('generates deterministic, unique request ids without randomness', () => {
    const gen = createRequestIdGenerator();
    expect(gen()).toBe('cg-1');
    expect(gen()).toBe('cg-2');
    const fresh = createRequestIdGenerator();
    expect(fresh()).toBe('cg-1');
  });
});
