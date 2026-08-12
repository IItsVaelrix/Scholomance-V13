// @vitest-environment node
// The suite default is jsdom (vite.config.js), and cmu.phoneme.engine.js guards
// its loader with `typeof window !== "undefined"` — so under jsdom the CMU
// dictionary NEVER LOADS, loadCmuEntries() swallows that into [], and this file
// would test a rule-guessing fallback instead of the real pipeline. Measured
// 2026-08-12. Do not remove.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runG2PJury, runVerificationTests } from '../../../../codex/core/phonology/g2p/g2p.adapter.js';

function validateG2PIntegration({ verdict, diagnostics }) {
  if (!verdict || typeof verdict.ok !== 'boolean') {
    return { passed: false, reason: 'verdict.ok must be boolean' };
  }
  if (!Array.isArray(verdict.candidates)) {
    return { passed: false, reason: 'verdict.candidates must be array' };
  }
  if (!Array.isArray(verdict.votes)) {
    return { passed: false, reason: 'verdict.votes must be boolean' };
  }
  if (!diagnostics || typeof diagnostics.latencyMs !== 'number') {
    return { passed: false, reason: 'diagnostics.latencyMs must be number' };
  }
  return { passed: true };
}

async function checkCandidateStability(word, runFn, times) {
  const results = await Promise.all(Array.from({ length: times }, () => runFn(word)));
  const keys = results.map(candidates =>
    candidates.map(c => c.phonemes.join(' ')).sort().join('|')
  );
  const stable = keys.every(k => k === keys[0]);
  return { stable, runs: keys };
}

describe('G2P Jury Adapter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns policy off when policy option is off', async () => {
    const result = await runG2PJury('KELDOMN', null, { policy: 'off' });
    expect(result.verdict.policy).toBe('off');
    expect(result.verdict.ok).toBe(false);
    expect(result.verdict.candidates).toHaveLength(0);
  });

  it('returns deterministic verdict and runtime diagnostics', async () => {
    const result = await runG2PJury('KELDOMN');
    expect(result.verdict).toBeDefined();
    expect(result.diagnostics).toBeDefined();
    expect(typeof result.diagnostics.latencyMs).toBe('number');
    expect(typeof result.diagnostics.memoryDeltaBytes).toBe('number');
  });

  it('includes required fields in deterministic verdict', async () => {
    const result = await runG2PJury('KELDOMN');
    const verdict = result.verdict;
    expect(typeof verdict.ok).toBe('boolean');
    expect(typeof verdict.word).toBe('string');
    expect(Array.isArray(verdict.candidates)).toBe(true);
    expect(Array.isArray(verdict.votes)).toBe(true);
    expect(typeof verdict.aggregateScores).toBe('object');
    expect(verdict.flags.fidelityRejected).toBe(false);
    expect(verdict.flags.legalityViolated).toBe(false);
  });

  it('produces bounded candidate count', async () => {
    const result = await runG2PJury('KELDOMN');
    expect(result.verdict.candidates.length).toBeGreaterThanOrEqual(0);
    expect(result.verdict.candidates.length).toBeLessThanOrEqual(10);
  });

  it('produces valid juror votes', async () => {
    const result = await runG2PJury('KELDOMN');
    for (const vote of result.verdict.votes) {
      expect(typeof vote.candidateKey).toBe('string');
      expect(['PHONOTACTIC', 'SYNTACTIC', 'SEMANTIC', 'GRAPH', 'HHM']).toContain(vote.jurorId);
      expect(typeof vote.tokenWeight).toBe('number');
      expect(typeof vote.confidence).toBe('number');
      expect(typeof vote.stageSignal).toBe('number');
      expect(typeof vote.syntaxModifier).toBe('number');
      expect(typeof vote.rationale).toBe('string');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(vote.fidelityGrade);
    }
  });

  it('validates G2P integration contract', async () => {
    const verdict = await runG2PJury('KELDOMN');
    const validation = validateG2PIntegration({
      verdict: verdict.verdict,
      diagnostics: verdict.diagnostics,
    });
    expect(validation.passed).toBe(true);
  });

  it('checks candidate stability across multiple runs', async () => {
    const stability = await checkCandidateStability('KELDOMN', (word) => {
      return runG2PJury(word).then(r => r.verdict.candidates);
    }, 5);
    expect(stability.stable).toBe(true);
  });
});

describe('G2P Verification Tests', () => {
  it('passes smoke check for valid word', async () => {
    const result = await runVerificationTests('KELDOMN');
    expect(result.passed).toBe(true);
  });

  it('fails smoke check for short word', async () => {
    const result = await runVerificationTests('X');
    expect(result.passed).toBe(false);
  });
});
