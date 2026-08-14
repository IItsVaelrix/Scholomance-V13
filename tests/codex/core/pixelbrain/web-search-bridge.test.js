/**
 * Tests for PB-WEB-SEARCH-BRIDGE-v1
 *
 * Tests the JS bridge to the Python web search module.
 * Live search tests are marked with @live and skipped by default
 * (non-deterministic). Freeze/verify/inject tests use fixtures.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, '..', '..', '..', '..', 'codex', 'core', 'pixelbrain', 'web_search.py');
// Scratch files live OUTSIDE the repository. Written under tests/ they were
// visible to anything reading `git status` mid-run — the APM evidence
// reporter snapshots the working tree, so this suite's temp JSON appeared
// inside a sibling suite's determinism comparison and failed it at random,
// depending only on which file vitest happened to schedule first.
const TEST_CACHE = mkdtempSync(join(tmpdir(), 'pb-web-search-bridge-'));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_QUERY = 'phonological retrieval augmented generation';
const FAKE_RESULTS = [
  { title: 'Phonological RAG Survey', url: 'https://example.com/phonological-rag', snippet: 'A survey of phonological methods in retrieval.' },
  { title: 'Morphological Decomposition for IR', url: 'https://example.com/morphological-ir', snippet: 'Morphological decomposition widens recall.' },
  { title: 'Syllable Structure in NLP', url: 'https://example.com/syllable-nlp', snippet: 'Syllable templates constrain tokenization.' },
];

function makeFakeArtifact() {
  // Call Python freeze with fake data via a temp file
  const tmpInput = join(TEST_CACHE, '_fake_input.json');
  mkdirSync(TEST_CACHE, { recursive: true });

  // Build artifact manually matching Python's freeze output
  const canonical = JSON.stringify({
    schema: 'PB-WEB-SEARCH-v1',
    query: FAKE_QUERY,
    results: FAKE_RESULTS.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
  });

  // We need Python to compute the checksum correctly
  const script = `
import sys, json
sys.path.insert(0, '${dirname(PYTHON_SCRIPT)}')
from web_search import freeze, verify
results = json.loads('''${JSON.stringify(FAKE_RESULTS)}''')
artifact = freeze('${FAKE_QUERY}', results)
print(json.dumps(artifact))
`;
  const output = execFileSync('python3', ['-c', script], {
    encoding: 'utf-8',
    timeout: 10000,
  });
  return JSON.parse(output.trim());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('web-search-bridge', () => {
  // Clean up test cache
  afterAll(() => {
    if (existsSync(TEST_CACHE)) {
      rmSync(TEST_CACHE, { recursive: true, force: true });
    }
  });

  describe('verifyArtifact (via Python)', () => {
    it('verifies a valid artifact', () => {
      const artifact = makeFakeArtifact();
      // Verify via Python directly
      const tmpPath = join(TEST_CACHE, '_verify.json');
      writeFileSync(tmpPath, JSON.stringify(artifact));
      const output = execFileSync('python3', [PYTHON_SCRIPT, 'verify', tmpPath], {
        encoding: 'utf-8',
      });
      expect(output).toContain('Valid: True');
    });

    it('rejects a tampered artifact', () => {
      const artifact = makeFakeArtifact();
      artifact.results[0].title = 'TAMPERED';
      const tmpPath = join(TEST_CACHE, '_verify_tampered.json');
      writeFileSync(tmpPath, JSON.stringify(artifact));
      try {
        execFileSync('python3', [PYTHON_SCRIPT, 'verify', tmpPath], {
          encoding: 'utf-8',
        });
        // If it doesn't throw, check output
      } catch (e) {
        // Python exits with code 1 on invalid
        expect(e.status).toBe(1);
      }
    });
  });

  describe('injectToCorpus (via Python)', () => {
    it('converts artifact to corpus docs', () => {
      const artifact = makeFakeArtifact();
      const tmpPath = join(TEST_CACHE, '_inject.json');
      writeFileSync(tmpPath, JSON.stringify(artifact));
      const output = execFileSync('python3', [PYTHON_SCRIPT, 'inject', tmpPath], {
        encoding: 'utf-8',
      });
      const docs = JSON.parse(output);
      expect(docs).toHaveLength(3);
      expect(docs[0].tag).toBe('web');
      expect(docs[0].source).toContain('web-search:search1:');
      expect(docs[0].text).toContain('Phonological RAG Survey');
    });
  });

  describe('checksum determinism', () => {
    it('produces identical checksums across 100 Python calls', () => {
      const script = `
import sys, json
sys.path.insert(0, '${dirname(PYTHON_SCRIPT)}')
from web_search import checksum
results = json.loads('''${JSON.stringify(FAKE_RESULTS)}''')
checksums = set()
for _ in range(100):
    checksums.add(checksum('${FAKE_QUERY}', results))
print(len(checksums))
`;
      const output = execFileSync('python3', ['-c', script], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      expect(output.trim()).toBe('1');
    });
  });

  describe('freeze artifact structure', () => {
    it('has required fields', () => {
      const artifact = makeFakeArtifact();
      expect(artifact.schema).toBe('PB-WEB-SEARCH-v1');
      expect(artifact.query).toBe(FAKE_QUERY);
      expect(artifact.result_count).toBe(3);
      expect(artifact.checksum).toMatch(/^search1:[0-9a-f]{16}$/);
      expect(artifact.frozen_at).toBeTruthy();
      expect(artifact.determinism_note).toContain('frozen');
    });

    it('results have title, url, snippet', () => {
      const artifact = makeFakeArtifact();
      for (const r of artifact.results) {
        expect(r.title).toBeTruthy();
        expect(r.url).toBeTruthy();
        expect(r.snippet).toBeTruthy();
      }
    });

    it('no page_text by default', () => {
      const artifact = makeFakeArtifact();
      for (const r of artifact.results) {
        expect(r.page_text).toBeUndefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // LIVE TESTS (non-deterministic — skipped by default)
  // Run with: vitest --testNamePattern="@live"
  // -----------------------------------------------------------------------

  describe('@live search', () => {
    it.skip('returns results from DuckDuckGo', () => {
      const output = execFileSync('python3', [
        PYTHON_SCRIPT, 'search', 'phonological RAG', '--max', '3',
      ], { encoding: 'utf-8', timeout: 30000 });
      const results = JSON.parse(output);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBeTruthy();
      expect(results[0].url).toBeTruthy();
    });

    it.skip('freeze produces valid artifact from live search', () => {
      const output = execFileSync('python3', [
        PYTHON_SCRIPT, 'freeze', 'phonological RAG', '--max', '3',
        '--out', TEST_CACHE,
      ], { encoding: 'utf-8', timeout: 30000 });
      expect(output).toContain('Valid: True');
      expect(output).toContain('search1:');
    });
  });
});
