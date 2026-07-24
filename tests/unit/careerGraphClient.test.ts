import { describe, expect, it } from 'vitest';
import { CareerGraphClient, stableRequestId } from '../../src/lib/career/graph/client';
import type {
  CareerGraphWorkerRequest,
  CareerGraphWorkerResponse,
} from '../../src/lib/career/graph/worker-protocol';
import type { CareerGraphDiagnostic } from '../../src/lib/career/graph/contracts';
import { makeCareerGraphAnalysis } from '../fixtures/career-graph/runtime-fixtures';

class FakeWorker {
  latestRequestId = '';
  posted: CareerGraphWorkerRequest[] = [];
  terminated = false;
  listeners = new Set<(event: MessageEvent) => void>();
  postMessage(message: CareerGraphWorkerRequest) {
    this.latestRequestId = message.requestId;
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
    this.listeners.clear();
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }
  emit(data: CareerGraphWorkerResponse) {
    const event = new MessageEvent('message', { data });
    for (const listener of this.listeners) listener(event);
  }
}

describe('CareerGraphClient', () => {
  it('rejects stale responses and falls back without losing lexical analysis', async () => {
    const worker = new FakeWorker();
    const client = new CareerGraphClient(() => worker);
    const input = {
      resumeText: 'Built SQL reporting systems.',
      jobDescriptionText: 'SQL required.',
    };
    const lexicalFallback = (diagnostic: CareerGraphDiagnostic) =>
      makeCareerGraphAnalysis({ mode: 'lexical', diagnostics: [diagnostic] });
    const stale = makeCareerGraphAnalysis({ artifactId: 'stale-artifact' });

    const pending = client.analyze(input, { fallback: lexicalFallback });
    worker.emit({ requestId: 'old', kind: 'analysis', artifactId: 'stale-artifact', payload: stale });
    worker.emit({ requestId: worker.latestRequestId, kind: 'degraded', code: 'SHARD_MISSING' });

    await expect(pending).resolves.toMatchObject({
      mode: 'lexical',
      diagnostics: [{ code: 'SHARD_MISSING' }],
    });
  });

  it('resolves a valid analysis response with the matching request id', async () => {
    const worker = new FakeWorker();
    const client = new CareerGraphClient(() => worker);
    const analysis = makeCareerGraphAnalysis({ artifactId: 'career-graph:real' });

    const pending = client.analyze({ resumeText: 'SQL', jobDescriptionText: 'SQL' });
    worker.emit({
      requestId: worker.latestRequestId,
      kind: 'analysis',
      artifactId: analysis.artifactId,
      payload: analysis,
    });

    await expect(pending).resolves.toMatchObject({ artifactId: 'career-graph:real' });
  });

  it('falls back when the analysis payload fails schema validation', async () => {
    const worker = new FakeWorker();
    const client = new CareerGraphClient(() => worker);
    const pending = client.analyze({ resumeText: 'SQL', jobDescriptionText: 'SQL' });
    worker.emit({
      requestId: worker.latestRequestId,
      kind: 'analysis',
      artifactId: 'x',
      payload: { bogus: true } as any,
    });
    const result = await pending;
    expect(result.mode).toBe('lexical');
    expect(result.diagnostics[0].code).toBe('INVALID_ANALYSIS_PAYLOAD');
  });

  it('cancel posts an explicit cancel for the active request', async () => {
    const worker = new FakeWorker();
    const client = new CareerGraphClient(() => worker);
    const pending = client.analyze({ resumeText: 'SQL', jobDescriptionText: 'SQL' });
    client.cancel();
    expect(worker.posted.some((m) => m.kind === 'cancel')).toBe(true);
    worker.emit({ requestId: worker.latestRequestId, kind: 'cancelled' });
    const result = await pending;
    expect(result.diagnostics[0].code).toBe('CANCELLED');
  });

  it('dispose terminates the worker and rejects the in-flight request into fallback', async () => {
    const worker = new FakeWorker();
    const client = new CareerGraphClient(() => worker);
    const pending = client.analyze({ resumeText: 'SQL', jobDescriptionText: 'SQL' });
    client.dispose();
    expect(worker.terminated).toBe(true);
    const result = await pending; // rejection is caught and turned into fallback
    expect(result.mode).toBe('lexical');
    expect(result.diagnostics[0].code).toBe('GRAPH_UNAVAILABLE');
  });

  it('produces deterministic request ids', () => {
    const input = { resumeText: 'a', jobDescriptionText: 'b' };
    expect(stableRequestId(input, 1)).toBe(stableRequestId(input, 1));
    expect(stableRequestId(input, 1)).not.toBe(stableRequestId(input, 2));
  });
});
