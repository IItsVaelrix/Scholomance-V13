import { describe, it, expect } from 'vitest';
import {
  createCoverageJuror,
  createContentHeadJuror,
  createClauseShapeJuror,
  createEnsembleJuror,
  createOrderJuror,
  AUDITION_JUROR_IDS,
  isValidVote,
  isFunctionWord,
} from '../../../../codex/core/constellation/audition/jurors/index.js';

const base = (answer, extras = {}) => ({
  answer,
  candidateKey: `${answer.subject ?? ''}|${answer.verb ?? ''}`,
  source: 'manual',
  spanning: true,
  from: 0,
  to: 3,
  n: 4,
  order: 0,
  agreement: 1,
  confidence: 0.7,
  tokens: ['the', 'dog', 'will', 'run'],
  ...extras,
});

describe('Audition jurors', () => {
  it('createCoverageJuror returns valid vote and prefers spanning', () => {
    const juror = createCoverageJuror();
    expect(juror.id).toBe(AUDITION_JUROR_IDS.COVERAGE);
    const full = juror.vote(base({ subject: 'dog', verb: 'run' }, { spanning: true }));
    const part = juror.vote(base({ subject: 'dog', verb: 'run' }, { spanning: false, from: 1, to: 2, n: 4 }));
    expect(isValidVote(full)).toBe(true);
    expect(isValidVote(part)).toBe(true);
    expect(full.confidence).toBeGreaterThan(part.confidence);
  });

  it('createContentHeadJuror prefers content words over auxiliaries', () => {
    const juror = createContentHeadJuror();
    expect(juror.id).toBe(AUDITION_JUROR_IDS.CONTENT_HEAD);
    const good = juror.vote(base({ subject: 'dog', verb: 'run' }));
    const aux = juror.vote(base({ subject: 'dog', verb: 'will' }));
    expect(isValidVote(good)).toBe(true);
    expect(isValidVote(aux)).toBe(true);
    expect(good.confidence).toBeGreaterThan(aux.confidence);
  });

  it('createContentHeadJuror vetoes punctuation verbs and empty verbs', () => {
    const juror = createContentHeadJuror();
    const punct = juror.vote(base({ subject: 'dog', verb: '.' }));
    const empty = juror.vote(base({ subject: 'dog', verb: null }));
    expect(punct.veto).toBe(true);
    expect(empty.veto).toBe(true);
    expect(isValidVote(punct)).toBe(true);
    expect(isValidVote(empty)).toBe(true);
  });

  it('createContentHeadJuror down-ranks function-word subjects', () => {
    const juror = createContentHeadJuror();
    const good = juror.vote(base({ subject: 'man', verb: 'fell' }));
    const adjBug = juror.vote(base({ subject: 'the', verb: 'fell' }));
    expect(good.confidence).toBeGreaterThan(adjBug.confidence);
  });

  it('isFunctionWord knows closed-class residues', () => {
    expect(isFunctionWord('will')).toBe(true);
    expect(isFunctionWord('the')).toBe(true);
    expect(isFunctionWord('chasing')).toBe(false);
  });

  it('createClauseShapeJuror returns valid vote', () => {
    const juror = createClauseShapeJuror();
    expect(juror.id).toBe(AUDITION_JUROR_IDS.CLAUSE_SHAPE);
    const vote = juror.vote(base({ subject: 'dog', verb: 'run' }));
    expect(isValidVote(vote)).toBe(true);
    expect(vote.rationale).toMatch(/subject-before-verb/);
  });

  it('createEnsembleJuror rewards higher agreement', () => {
    const juror = createEnsembleJuror();
    const once = juror.vote(base({ subject: 'dog', verb: 'run' }, { agreement: 1 }));
    const thrice = juror.vote(base({ subject: 'dog', verb: 'run' }, { agreement: 3 }));
    expect(isValidVote(once)).toBe(true);
    expect(thrice.confidence).toBeGreaterThan(once.confidence);
  });

  it('createOrderJuror prefers earlier order', () => {
    const juror = createOrderJuror();
    const early = juror.vote(base({ subject: 'dog', verb: 'run' }, { order: 0 }));
    const late = juror.vote(base({ subject: 'dog', verb: 'run' }, { order: 5 }));
    expect(isValidVote(early)).toBe(true);
    expect(early.confidence).toBeGreaterThan(late.confidence);
  });

  it('jurors return null for invalid candidate', () => {
    expect(createCoverageJuror().vote(null)).toBeNull();
    expect(createContentHeadJuror().vote({})).toBeNull();
    expect(createClauseShapeJuror().vote(null)).toBeNull();
    expect(createEnsembleJuror().vote(null)).toBeNull();
    expect(createOrderJuror().vote(null)).toBeNull();
  });
});
