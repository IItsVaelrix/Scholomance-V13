import { describe, it, expect } from 'vitest';
import {
  runAuditionJury,
  runVerificationTests,
  POLICY_OFF,
  POLICY_PASS,
  POLICY_REJECT,
  isValidVerdict,
  answerKey,
} from '../../../../codex/core/constellation/audition/index.js';
import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';

const pos = new Map([
  ['the', []],
  ['old', ['a']],
  ['man', ['n']],
  ['fell', ['a', 'n', 'v']],
  ['dog', ['n']],
  ['is', []],
  ['will', []],
  ['chasing', ['v', 'a']],
  ['cat', ['n']],
  ['run', ['n', 'v']],
  ['ran', ['v']],
  ['.', []],
]);

describe('runAuditionJury', () => {
  it('policy off returns empty cast', () => {
    const result = runAuditionJury(['the', 'dog', 'ran'], null, { policy: POLICY_OFF });
    expect(result.verdict.policy).toBe(POLICY_OFF);
    expect(result.cast).toBeNull();
    expect(result.verdict.ok).toBe(false);
  });

  it('rejects when no candidates', () => {
    const result = runAuditionJury(['the', 'dog', 'ran'], { stable: [] });
    expect(result.verdict.policy).toBe(POLICY_REJECT);
    expect(result.verdict.flags.legalityViolated).toBe(true);
    expect(result.cast).toBeNull();
  });

  it('casts content-headed answer over auxiliary-headed slip', () => {
    const tokens = ['the', 'dog', 'will', 'run', '.'];
    const result = runAuditionJury(tokens, null, {
      answers: [
        { subject: 'dog', verb: 'will' },
        { subject: 'dog', verb: 'run' },
      ],
    });
    expect(isValidVerdict(result.verdict)).toBe(true);
    expect(result.verdict.ok).toBe(true);
    expect(result.verdict.policy).toBe(POLICY_PASS);
    expect(result.cast).toEqual({ subject: 'dog', verb: 'run' });
    expect(result.verdict.winner.candidateKey).toBe('dog|run');
    expect(result.verdict.decidedBy).toBeTruthy();
  });

  it('casts noun subject over determiner residue', () => {
    const tokens = ['the', 'old', 'man', 'fell'];
    const result = runAuditionJury(tokens, null, {
      answers: [
        { subject: 'the', verb: 'fell' },
        { subject: 'man', verb: 'fell' },
      ],
    });
    expect(result.cast).toEqual({ subject: 'man', verb: 'fell' });
  });

  it('vetoes punctuation-verb candidates', () => {
    const result = runAuditionJury(['the', 'dog', 'ran', '.'], null, {
      answers: [
        { subject: 'dog', verb: '.' },
        { subject: 'dog', verb: 'ran' },
      ],
    });
    expect(result.cast).toEqual({ subject: 'dog', verb: 'ran' });
    const vetoes = result.verdict.votes.filter((v) => v.veto);
    expect(vetoes.some((v) => v.candidateKey === 'dog|.')).toBe(true);
  });

  it('keeps understudies and may mark contested', () => {
    const result = runAuditionJury(['a', 'b', 'c'], null, {
      answers: [
        { subject: 'dog', verb: 'ran' },
        { subject: 'dog', verb: 'ran' },
        { subject: 'cat', verb: 'sat' },
      ],
    });
    expect(result.cast).toEqual({ subject: 'dog', verb: 'ran' });
    expect(result.understudies.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.verdict.understudies)).toBe(true);
  });

  it('runs end-to-end on a packed compose result', () => {
    const tokens = ['the', 'dog', 'chased', 'the', 'cat'];
    // chased not in pos — add it
    const localPos = new Map([...pos, ['chased', ['v']]]);
    const packed = composePacked(tokens, localPos);
    expect(packed.stable.length).toBeGreaterThan(0);

    const result = runAuditionJury(tokens, packed, { source: 'packed-stable' });
    expect(isValidVerdict(result.verdict)).toBe(true);
    expect(result.verdict.candidates.length).toBeGreaterThan(0);
    if (result.cast) {
      expect(result.cast.verb).toBeTruthy();
      expect(answerKey(result.cast)).toMatch(/\|/);
    }
  });

  it('prefers content verb on auxiliary sentence when both slips present', () => {
    const tokens = ['the', 'dog', 'is', 'chasing', 'the', 'cat', '.'];
    const result = runAuditionJury(tokens, null, {
      answers: [
        { subject: 'dog', verb: 'is' },
        { subject: 'dog', verb: 'chasing' },
      ],
    });
    expect(result.cast).toEqual({ subject: 'dog', verb: 'chasing' });
  });

  it('runVerificationTests reports structural pass', () => {
    const v = runVerificationTests(['the', 'dog', 'ran'], null);
    // no candidates without compose/answers → still a structured verdict
    expect(typeof v.passed).toBe('boolean');
    expect(v.verdict).toBeTruthy();
  });

  it('diagnostics expose latency fields', () => {
    const result = runAuditionJury(['x'], null, {
      answers: [{ subject: null, verb: 'x' }],
    });
    expect(Number.isFinite(result.diagnostics.latencyMs)).toBe(true);
    expect(Number.isFinite(result.diagnostics.memoryDeltaBytes)).toBe(true);
  });
});
