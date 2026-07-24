import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sources from '../../config/career-graph-sources.json';
// @ts-expect-error - .mjs script has no bundled types
import {
  computeSha256,
  fetchSources,
  isPlaceholderDigest,
  PLACEHOLDER_DIGEST,
  verifySourceBytes,
} from '../../scripts/career-graph/fetch-sources.mjs';

describe('Career source manifest (Task 4)', () => {
  it('pins versions, checksums, licenses, and attribution', () => {
    expect(sources.onet.version).toBe('30.3');
    expect(sources.esco.version).toBe('1.2.1');
    for (const source of Object.values(sources)) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.license).toBeTruthy();
      expect(source.attribution).toBeTruthy();
    }
  });

  it('ships honest placeholder digests that the verifier refuses', () => {
    for (const source of Object.values(sources)) {
      expect(isPlaceholderDigest(source.sha256)).toBe(true);
      const result = verifySourceBytes(source, new TextEncoder().encode('anything'));
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('CHECKSUM_NOT_PINNED');
    }
  });
});

describe('Career source checksum law', () => {
  it('computes a stable SHA-256', () => {
    const digest = computeSha256(new TextEncoder().encode('career'));
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(computeSha256(new TextEncoder().encode('career')));
  });

  it('accepts bytes only when the digest matches a pinned (non-placeholder) value', () => {
    const bytes = new TextEncoder().encode('payload');
    const digest = computeSha256(bytes);
    expect(verifySourceBytes({ sha256: digest }, bytes)).toEqual({ ok: true, digest });
    expect(verifySourceBytes({ sha256: 'f'.repeat(64) }, bytes).reason).toBe('CHECKSUM_MISMATCH');
    expect(verifySourceBytes({ sha256: PLACEHOLDER_DIGEST }, bytes).reason).toBe('CHECKSUM_NOT_PINNED');
  });
});

describe('fetchSources (offline, no network)', () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'career-fetch-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function writeConfig(manifest: object) {
    const configPath = join(workDir, `config-${Math.random().toString(36).slice(2)}.json`);
    return writeFile(configPath, JSON.stringify(manifest, null, 2)).then(() => configPath);
  }

  it('records the real digest in record mode, then verifies it', async () => {
    const payload = new TextEncoder().encode('ONET-ZIP-BYTES');
    const fetchImpl = async () =>
      new Response(payload, { status: 200 });

    const configPath = await writeConfig({
      onet: {
        id: 'onet',
        version: '30.3',
        url: 'https://example.test/db.zip',
        filename: 'db.zip',
        sha256: PLACEHOLDER_DIGEST,
        checksumStatus: 'placeholder-unverified',
        license: 'CC-BY-4.0',
        attribution: 'test',
      },
    });
    const rawRoot = join(workDir, 'raw');

    // Verify mode refuses the placeholder.
    const refused = await fetchSources({ configPath, rawRoot, fetchImpl });
    expect(refused.ok).toBe(false);
    expect(refused.results[0].reason).toBe('CHECKSUM_NOT_PINNED');

    // Record mode pins the real digest.
    const recorded = await fetchSources({ configPath, rawRoot, fetchImpl, record: true });
    expect(recorded.ok).toBe(true);
    expect(recorded.results[0].digest).toBe(computeSha256(payload));

    // The config now holds the pinned digest.
    const pinned = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(pinned.onet.sha256).toBe(computeSha256(payload));
    expect(pinned.onet.checksumStatus).toBe('verified-pinned');

    // A subsequent verify (even offline, from cache) succeeds.
    const verified = await fetchSources({ configPath, rawRoot, offline: true });
    expect(verified.ok).toBe(true);
    expect(verified.results[0].cached).toBe(true);
  });

  it('fails offline when a cached file is missing', async () => {
    const configPath = await writeConfig({
      esco: {
        id: 'esco',
        version: '1.2.1',
        url: 'https://example.test/esco.zip',
        filename: 'esco.zip',
        sha256: 'a'.repeat(64),
        checksumStatus: 'verified-pinned',
        license: 'CC-BY-4.0',
        attribution: 'test',
      },
    });
    const rawRoot = join(workDir, 'raw-empty');
    await mkdir(rawRoot, { recursive: true });
    const result = await fetchSources({ configPath, rawRoot, offline: true });
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('OFFLINE_MISSING');
  });

  it('detects a checksum mismatch against a pinned digest', async () => {
    const fetchImpl = async () =>
      new Response(new TextEncoder().encode('TAMPERED'), { status: 200 });
    const configPath = await writeConfig({
      onet: {
        id: 'onet',
        version: '9.9',
        url: 'https://example.test/x.zip',
        filename: 'x.zip',
        sha256: 'b'.repeat(64),
        checksumStatus: 'verified-pinned',
        license: 'CC-BY-4.0',
        attribution: 'test',
      },
    });
    const rawRoot = join(workDir, 'raw-mismatch');
    const result = await fetchSources({ configPath, rawRoot, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('CHECKSUM_MISMATCH');
  });
});
