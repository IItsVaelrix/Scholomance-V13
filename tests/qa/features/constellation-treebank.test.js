import { describe, it, expect } from 'vitest';
import { parseConllu, goldAnswer, goldPosMap } from '../../../codex/core/constellation/treebank.js';

/**
 * A real EWT sentence. The subject is token 6 and the root is token 4 —
 * `projectAnswer` reads the subject positionally from `parts[0]`, so this is
 * the shape that coverage-only measurement cannot see going wrong.
 */
const INVERTED = `# sent_id = ewt-0001
# text = From the AP comes this story :
1\tFrom\tfrom\tADP\tIN\t_\t3\tcase\t3:case\t_
2\tthe\tthe\tDET\tDT\t_\t3\tdet\t3:det\t_
3\tAP\tAP\tPROPN\tNNP\t_\t4\tobl\t4:obl\t_
4\tcomes\tcome\tVERB\tVBZ\t_\t0\troot\t0:root\t_
5\tthis\tthis\tDET\tDT\t_\t6\tdet\t6:det\t_
6\tstory\tstory\tNOUN\tNN\t_\t4\tnsubj\t4:nsubj\t_
7\t:\t:\tPUNCT\t:\t_\t4\tpunct\t4:punct\t_
`;

/** A range line and an empty node. Neither is a token. */
const RANGE_AND_EMPTY = `# sent_id = ewt-0002
# text = I don't know
1\tI\tI\tPRON\tPRP\t_\t4\tnsubj\t4:nsubj\t_
2-3\tdon't\t_\t_\t_\t_\t_\t_\t_\t_
2\tdo\tdo\tAUX\tVBP\t_\t4\taux\t4:aux\t_
3\tn't\tnot\tPART\tRB\t_\t4\tadvmod\t4:advmod\t_
4\tknow\tknow\tVERB\tVB\t_\t0\troot\t0:root\t_
4.1\t_\t_\t_\t_\t_\t_\t_\t4:orphan\t_
`;

/** Web text roots on a noun. There is no verb, and inventing one would lie. */
const NOMINAL_ROOT = `# sent_id = ewt-0003
# text = Great food !
1\tGreat\tgreat\tADJ\tJJ\t_\t2\tamod\t2:amod\t_
2\tfood\tfood\tNOUN\tNN\t_\t0\troot\t0:root\t_
3\t!\t!\tPUNCT\t.\t_\t2\tpunct\t2:punct\t_
`;

describe('parseConllu', () => {
  it('reads sent_id, text and tokens from a sentence block', () => {
    const [r] = parseConllu(INVERTED);
    expect(r.sentId).toBe('ewt-0001');
    expect(r.text).toBe('From the AP comes this story :');
    expect(r.tokens).toHaveLength(7);
    expect(r.tokens[3]).toMatchObject({ id: 4, form: 'comes', upos: 'VERB', head: 0, deprel: 'root' });
  });

  it('skips range lines and empty nodes, which are not tokens', () => {
    const [r] = parseConllu(RANGE_AND_EMPTY);
    expect(r.tokens.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(r.tokens.map((t) => t.form)).toEqual(['I', 'do', "n't", 'know']);
  });

  it('separates sentences on blank lines', () => {
    const records = parseConllu(`${INVERTED}\n${NOMINAL_ROOT}`);
    expect(records).toHaveLength(2);
    expect(records[1].sentId).toBe('ewt-0003');
  });
});

describe('goldAnswer', () => {
  it('reads the subject from the nsubj edge, not from position', () => {
    const [r] = parseConllu(INVERTED);
    expect(goldAnswer(r)).toEqual({ subject: 'story', verb: 'comes' });
  });

  it('carries a non-verbal root rather than dropping it', () => {
    const [r] = parseConllu(NOMINAL_ROOT);
    expect(goldAnswer(r)).toEqual({ subject: null, verb: 'food' });
  });

  it('returns nulls when there is no root', () => {
    expect(goldAnswer({ tokens: [] })).toEqual({ subject: null, verb: null });
  });
});

describe('goldPosMap', () => {
  it('maps only the four lexical UPOS values', () => {
    const [r] = parseConllu(INVERTED);
    const map = goldPosMap(r);
    expect(map.get('ap')).toEqual(['n']);
    expect(map.get('comes')).toEqual(['v']);
    expect(map.get('story')).toEqual(['n']);
    expect(map.get('the')).toEqual([]);
    expect(map.get('from')).toEqual([]);
  });

  it('unions tags when a form appears twice with different UPOS', () => {
    const record = {
      tokens: [
        { id: 1, form: 'run', lemma: 'run', upos: 'VERB', head: 0, deprel: 'root' },
        { id: 2, form: 'run', lemma: 'run', upos: 'NOUN', head: 1, deprel: 'obj' },
      ],
    };
    expect(goldPosMap(record).get('run').sort()).toEqual(['n', 'v']);
  });
});
