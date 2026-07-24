import { describe, expect, it } from 'vitest';
import { CareerGraphClient } from '../../src/lib/career/graph/client';
import {
  InMemoryCareerGraphTransport,
  buildSeedManifest,
} from '../../src/lib/career/graph/in-memory-transport';
import { SEED_ARTIFACT_ID } from '../../src/lib/career/graph/seed-graph';
import { GRAPH_DIAGNOSTIC } from '../../src/lib/career/graph/analyze-graph';
import type { CareerGraphWorkerResponse } from '../../src/lib/career/graph/worker-protocol';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeClient() {
  return new CareerGraphClient(() => new InMemoryCareerGraphTransport());
}

describe('InMemoryCareerGraphTransport', () => {
  it('answers initialize with a sealed, deterministic manifest', async () => {
    const transport = new InMemoryCareerGraphTransport();
    const received: CareerGraphWorkerResponse[] = [];
    transport.addEventListener('message', (e) => received.push(e.data as CareerGraphWorkerResponse));
    transport.postMessage({ requestId: 'cg-init', kind: 'initialize', manifestUrl: 'unused' });
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ requestId: 'cg-init', kind: 'ready' });
    const manifest = buildSeedManifest();
    expect(manifest.artifactId).toBe(SEED_ARTIFACT_ID);
    expect(manifest.conceptCount).toBeGreaterThan(0);
    expect(manifest.checksum).toBe(buildSeedManifest().checksum);
  });

  it('drives the full UI flow through the real CareerGraphClient', async () => {
    const client = makeClient();
    const posting =
      'We need Python, SQL, machine learning, data analysis, software testing, marketing strategy and SEO.';
    const resume = 'Experienced with Python and SQL. Built data pipelines.';

    // First pass: ambiguous target role → confirmation requested, no skills yet.
    const first = await client.analyze({ resumeText: resume, jobDescriptionText: posting });
    expect(first.mode).toBe('graph');
    expect(first.diagnostics.some((d) => d.code === GRAPH_DIAGNOSTIC.OCCUPATION_CONFIRMATION_REQUIRED)).toBe(true);
    expect(first.skills).toEqual([]);
    expect(first.occupations.length).toBeGreaterThan(1);

    // Candidate confirms Data Scientists → classified skills released.
    const second = await client.analyze({
      resumeText: resume,
      jobDescriptionText: posting,
      confirmedOccupationId: 'onet:15-2051.00',
    });
    expect(second.occupations).toHaveLength(1);
    expect(second.occupations[0].conceptId).toBe('onet:15-2051.00');
    expect(second.skills.length).toBeGreaterThan(0);
    const ml = second.skills.find((s) => s.conceptId === 'onet:skill:machine-learning');
    expect(ml?.classification).toBe('missing');
    expect(ml?.jobEvidence.length).toBeGreaterThan(0);
    client.dispose();
  });

  it('resolves a cancelled request into the lexical fallback', async () => {
    const client = makeClient();
    const pending = client.analyze({ resumeText: 'Python.', jobDescriptionText: 'Python developer.' });
    client.cancel();
    const result = await pending;
    expect(result.mode).toBe('lexical');
    expect(result.diagnostics[0].code).toBe('CANCELLED');
  });

  it('produces schema-valid payloads admitted by the client boundary', async () => {
    const client = makeClient();
    const result = await client.analyze({
      resumeText: 'Marketing and SEO.',
      jobDescriptionText: 'SEO and marketing strategy role.',
    });
    // A schema-invalid payload would have fallen back to lexical mode.
    expect(result.mode).toBe('graph');
    expect(result.artifactId).toBe(SEED_ARTIFACT_ID);
    client.dispose();
  });
});
