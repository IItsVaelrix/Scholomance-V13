import { describe, expect, it } from 'vitest';
import {
  compareBallisticSignatures,
  createBallisticSignature,
  scoreSenseBallistics,
} from '../../../codex/core/lexical-analysis/semanticBallistics.js';

describe('semantic ballistics', () => {
  it('scores compatible sense signatures with deterministic QBIT trace buckets', () => {
    const input = [{
      synsetId: 'tool',
      lemma: 'saw',
      pos: 'noun',
      definition: 'a tool used to cut wood',
      examples: [],
    }];
    const first = scoreSenseBallistics('cut wood with the saw', input);
    const second = scoreSenseBallistics('cut wood with the saw', input);

    expect(first).toEqual(second);
    expect(first.senses[0].semanticScore).toBeGreaterThan(0.5);
    expect(first.senses[0].bucketIds).toHaveLength(4);
    expect(first.embedding).toMatchObject({
      kind: 'phonosemantic_mock',
      version: 'tq-js-v1',
      dimensions: 256,
    });
  });

  it('refuses comparison when embedding metadata differs or is unknown', () => {
    const context = createBallisticSignature('cut wood');
    const wrongDimensions = { ...createBallisticSignature('a cutting tool'), dimensions: 128 };
    const mismatch = compareBallisticSignatures(context, wrongDimensions);

    expect(mismatch).toEqual(expect.objectContaining({
      degradation: expect.objectContaining({ code: 'embedding_metadata_mismatch' }),
    }));
    expect(mismatch).not.toHaveProperty('semanticScore');

    const unknown = compareBallisticSignatures(
      context,
      { ...createBallisticSignature('a cutting tool'), version: 'unknown' },
    );
    expect(unknown.degradation.code).toBe('embedding_metadata_mismatch');
  });
});
