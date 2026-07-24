import { describe, expect, it } from 'vitest';
import {
  createCareerWorkerRuntime,
  type CareerWorkerRuntime,
} from '../../src/lib/career/graph/worker-runtime';
import type {
  CareerGraphWorkerRequest,
  CareerGraphWorkerResponse,
} from '../../src/lib/career/graph/worker-protocol';
import { makeCareerGraphAnalysis } from '../fixtures/career-graph/runtime-fixtures';

function makeWorkerHarness(analyze?: (input: any) => Promise<any>) {
  const responses: CareerGraphWorkerResponse[] = [];
  const runtime: CareerWorkerRuntime = createCareerWorkerRuntime(
    (message) => responses.push(message),
    analyze ? { analyze } : {}
  );
  return {
    responses,
    post: (message: CareerGraphWorkerRequest) => runtime.onMessage(message),
    flush: () => runtime.whenIdle(),
  };
}

describe('Career Graph worker cancellation & staleness', () => {
  it('does not publish a canceled request', async () => {
    const runtime = makeWorkerHarness();
    runtime.post({ requestId: 'r1', kind: 'analyze', resumeText: 'SQL', jobDescriptionText: 'SQL' });
    runtime.post({ requestId: 'r1', kind: 'cancel' });
    await runtime.flush();
    expect(
      runtime.responses.some((row) => row.requestId === 'r1' && row.kind === 'analysis')
    ).toBe(false);
  });

  it('publishes an analysis for an uncancelled request', async () => {
    const runtime = makeWorkerHarness(async () =>
      makeCareerGraphAnalysis({ artifactId: 'career-graph:test' })
    );
    runtime.post({ requestId: 'r1', kind: 'analyze', resumeText: 'SQL', jobDescriptionText: 'SQL' });
    await runtime.flush();
    const analysis = runtime.responses.find((row) => row.kind === 'analysis');
    expect(analysis).toBeDefined();
    expect(analysis?.requestId).toBe('r1');
  });

  it('drops a stale result superseded by a newer request id', async () => {
    let resolveFirst!: (value: any) => void;
    const firstPending = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const runtime = makeWorkerHarness((input) =>
      input.resumeText === 'first' ? firstPending : Promise.resolve(makeCareerGraphAnalysis({ artifactId: 'second' }))
    );

    runtime.post({ requestId: 'r1', kind: 'analyze', resumeText: 'first', jobDescriptionText: '' });
    runtime.post({ requestId: 'r2', kind: 'analyze', resumeText: 'second', jobDescriptionText: '' });
    // Now resolve the first (stale) request.
    resolveFirst(makeCareerGraphAnalysis({ artifactId: 'first' }));
    await runtime.flush();

    const published = runtime.responses.filter((row) => row.kind === 'analysis');
    expect(published).toHaveLength(1);
    expect(published[0].requestId).toBe('r2');
  });

  it('publishes a structured error when analysis throws', async () => {
    const runtime = makeWorkerHarness(async () => {
      throw new Error('shard missing');
    });
    runtime.post({ requestId: 'r1', kind: 'analyze', resumeText: 'SQL', jobDescriptionText: 'SQL' });
    await runtime.flush();
    const error = runtime.responses.find((row) => row.kind === 'error');
    expect(error).toBeDefined();
    expect(error?.kind === 'error' && error.message).toBe('shard missing');
  });
});
