/**
 * PRECEDENT ADAPTER TRUTH PASS
 *
 * The adapter is complete and tested (precedent-compose-integration) but is
 * not a page channel. analyzePrecedent is not a live entry: the page service
 * does not import this module. Pin that state so a future session cannot
 * assume the case book is on the sky.
 *
 * If you wire precedent into constellationPage.service.js, delete the
 * NOT WIRED claim from the adapter header in the same commit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ADAPTER = join(ROOT, 'codex/server/services/constellation/precedent.adapter.js');
const SERVICE = join(ROOT, 'codex/server/services/constellationPage.service.js');

describe('precedent adapter truth pass', () => {
  it('declares EXPERIMENTAL — NOT WIRED status', () => {
    const src = readFileSync(ADAPTER, 'utf8');
    expect(src).toContain('STATUS: EXPERIMENTAL');
    expect(src).toContain('NOT WIRED');
  });

  it('is not imported by the constellation page service', () => {
    const src = readFileSync(SERVICE, 'utf8');
    expect(src).not.toMatch(/precedent\.adapter/);
    expect(src).not.toMatch(/analyzePrecedent/);
    expect(src).not.toMatch(/loadCaseBook/);
  });
});
