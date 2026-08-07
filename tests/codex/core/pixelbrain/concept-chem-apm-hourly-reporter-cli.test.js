import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildEvidence,
  canonicalJson,
  run,
  sha256,
  writeEvidenceOnce,
} from '../../../../scripts/concept-chem-apm-hourly-reporter.mjs';

describe('canonical evidence primitives', () => {
  it('canonicalizes object keys while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [2, 1] }))
      .toBe('{"a":{"b":3,"y":2},"list":[2,1],"z":1}');
  });

  it('writes one complete immutable evidence file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'apm-chem-evidence-'));
    const outputPath = join(directory, 'nested', 'score.json');

    writeEvidenceOnce(outputPath, { schema: 'fixture', passed: true });

    expect(JSON.parse(readFileSync(outputPath, 'utf8')))
      .toEqual({ schema: 'fixture', passed: true });
    expect(() => writeEvidenceOnce(outputPath, { schema: 'replacement' }))
      .toThrow(/evidence already exists/);
    expect(JSON.parse(readFileSync(outputPath, 'utf8')))
      .toEqual({ schema: 'fixture', passed: true });
  });

  it('produces stable SHA-256 identifiers', () => {
    expect(sha256('abc'))
      .toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('corpus-backed evidence', () => {
  it('scores the frozen matrix with corpus grounding and records complete provenance', () => {
    const evidence = buildEvidence({
      repoRoot: process.cwd(),
      now: () => new Date('2026-08-03T12:00:00.000Z'),
    });
    const { evidenceChecksum, ...payload } = evidence;
    const reactions = evidence.scoredRounds.flatMap((round) => round.reactions);

    expect(evidence.schema).toBe('PB-CONCEPT-CHEM-APM-HOURLY-EVIDENCE-v1');
    expect(evidence.recordedAt).toBe('2026-08-03T12:00:00.000Z');
    expect(evidence.scoredRounds).toHaveLength(3);
    expect(reactions).toHaveLength(21);
    expect(reactions.every((reaction) => reaction.groundingSource === 'corpus')).toBe(true);
    expect(evidence.inputs.corpus.schema).toBe('PB-GROUNDING-v1');
    expect(evidence.inputs.corpus.checksum).toMatch(/^grnd1:/);
    expect(evidence.inputs.corpus.documentCount).toBeGreaterThan(0);
    expect(evidence.inputs.corpus.tokenCount).toBeGreaterThan(0);
    expect(evidence.inputs.engine.schema).toBe('PB-CONCEPT-CHEM-v1');
    expect(evidence.inputs.engine.stableMin).toBe(0.55);
    expect(evidence.inputs.engine.files).toHaveLength(3);
    expect(evidence.inputs.git.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(evidenceChecksum).toBe(sha256(canonicalJson(payload)));
  });

  it('repeats all scoring and provenance when only recordedAt changes', () => {
    const first = buildEvidence({
      repoRoot: process.cwd(),
      now: () => new Date('2026-08-03T12:00:00.000Z'),
    });
    const second = buildEvidence({
      repoRoot: process.cwd(),
      now: () => new Date('2026-08-03T13:00:00.000Z'),
    });

    expect(second.scoredRounds).toEqual(first.scoredRounds);
    expect(second.decision).toEqual(first.decision);
    expect(second.inputs).toEqual(first.inputs);
    expect(second.evidenceChecksum).not.toBe(first.evidenceChecksum);
  });
});

describe('CLI exit contract', () => {
  it.each([
    [true, 0],
    [false, 2],
  ])('writes evidence and maps decision passed=%s to exit %i', (passed, exitCode) => {
    const directory = mkdtempSync(join(tmpdir(), 'apm-chem-run-'));
    const outputPath = join(directory, 'score.json');
    const evidence = { schema: 'fixture', decision: { passed } };

    expect(run({
      repoRoot: process.cwd(),
      outputPath,
      build: () => evidence,
    })).toEqual({ exitCode, evidence });
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(evidence);
  });
});
