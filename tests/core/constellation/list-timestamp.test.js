/**
 * LIST (NUM → NUM) — the preregistered atlas intervention.
 *
 * Production change that would make these fail: a generic NUM+NUM adjacency
 * bond; typing bare cardinals as DATE/CLOCK; admitting DATE as a root;
 * or touching the inversion constructions.
 *
 * The atlas sole-cause bag is not numbered items. Every adjacent DATE+CLOCK
 * pair in EWT train+dev is gold `list` (175/175), left-headed. The
 * list-dependent span is almost always CLOCK+AM/PM (gold nmod:unmarked).
 * That is why this is a date+clock list, not "two numbers may compose."
 */
import { describe, expect, it } from 'vitest';

import { atomsFor } from '../../../codex/core/constellation/compose.js';
import { composePacked, headsOf } from '../../../codex/core/constellation/compose-packed.js';
import { OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';
import {
  constructionByBond,
  CONSTRUCTION_STATUS,
} from '../../../codex/core/constellation/grimoire/index.js';
import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { scoreRecord } from '../../../codex/research/parser-failure-atlas/collect-failures.js';
import { plateOf } from '../../../codex/research/parser-failure-atlas/atlas-schema.js';

const empty = new Map();
const typesOf = (token, index = 1) => atomsFor(token, index, empty).map((a) => a.type);
const cell = (chart, from, to, type) => chart.molecules.find(
  (m) => m.type === type && m.from === from && m.to === to,
);

const TIMESTAMP = `# sent_id = email-enronsent09_01-0005
# text = 07/30/2001 05:17 PM
1	07/30/2001	07/30/2001	NUM	CD	_	0	root	0:root	_
2	05:17	05:17	NUM	CD	_	1	list	1:list	_
3	PM	p.m.	NOUN	NN	_	2	nmod:unmarked	2:nmod:unmarked	_
`;

const CLOCK_ONLY = `# sent_id = email-enronsent01_02-0002
# text = 26/09/2000 14:14
1	26/09/2000	26/09/2000	NUM	CD	_	0	root	0:root	_
2	14:14	14:14	NUM	CD	_	1	list	1:list	_
`;

const INVERTED = `# sent_id = ewt-0001
# text = From the AP comes this story :
1	From	from	ADP	IN	_	3	case	3:case	_
2	the	the	DET	DT	_	3	det	3:det	_
3	AP	AP	PROPN	NNP	_	4	obl	4:obl	_
4	comes	come	VERB	VBZ	_	0	root	0:root	_
5	this	this	DET	DT	_	6	det	3:det	_
6	story	story	NOUN	NN	_	4	nsubj	4:nsubj	_
7	:	:	PUNCT	:	_	4	punct	4:punct	_
`;

describe('numeral atoms — why list, not two NUMs', () => {
  it('types a slash-date as DATE and a colon-clock as CLOCK', () => {
    expect(typesOf('07/30/2001')).toContain('DATE');
    expect(typesOf('05:17')).toContain('CLOCK');
    expect(typesOf('03:13:58')).toContain('CLOCK');
    expect(typesOf('07/30/2001')).not.toContain('NUM');
    expect(typesOf('05:17')).not.toContain('NUM');
  });

  it('does not type bare cardinals, years, or scores as DATE or CLOCK', () => {
    for (const token of ['3', '5', '2001', '747', '400', '12', '30']) {
      const types = typesOf(token);
      expect(types, token).not.toContain('DATE');
      expect(types, token).not.toContain('CLOCK');
      expect(types, token).not.toContain('NUM');
    }
  });

  it('emits MERIDIAN for AM/PM without removing the copula reading of am', () => {
    expect(typesOf('PM')).toContain('MERIDIAN');
    expect(typesOf('AM')).toContain('MERIDIAN');
    expect(typesOf('am', 1)).toContain('MERIDIAN');
    expect(typesOf('am', 1)).toContain('COP');
  });
});

describe('date-clock list construction', () => {
  it('registers DATE+CLOCK → DATE as grammar list, first item heads', () => {
    const law = constructionByBond('DATE', 'CLOCK', 'DATE');
    expect(law).toBeTruthy();
    expect(law.status).toBe(CONSTRUCTION_STATUS.GRAMMAR);
    expect(law.relation).toBe('list');
    expect(law.head).toBe(0);
    expect(law.family).toBe('list');
  });

  it('composes date + clock as a DATE headed by the date', () => {
    const chart = composePacked(['26/09/2000', '14:14'], empty);
    const list = cell(chart, 0, 1, 'DATE');
    expect(list).toBeTruthy();
    expect([...headsOf(list)]).toEqual(['26/09/2000']);
  });

  it('lets the clock absorb AM/PM so the gold list-dependent span exists', () => {
    const chart = composePacked(['07/30/2001', '05:17', 'PM'], empty);
    const clock = cell(chart, 1, 2, 'CLOCK');
    expect(clock).toBeTruthy();
    expect([...headsOf(clock)]).toEqual(['05:17']);
  });

  it('builds the full timestamp as spanning DATE and does not admit it as a root', () => {
    const chart = composePacked(['07/30/2001', '05:17', 'PM'], empty);
    const stamp = cell(chart, 0, 2, 'DATE');
    expect(stamp).toBeTruthy();
    expect([...headsOf(stamp)]).toEqual(['07/30/2001']);
    expect(chart.spanning.some((m) => m.type === 'DATE')).toBe(true);
    expect(chart.stable).toEqual([]);
  });

  it('refuses to compose two bare cardinals or a numeric compound', () => {
    const cardinals = composePacked(['3', '5'], empty);
    expect(cardinals.molecules.filter((m) => m.from !== m.to)).toEqual([]);

    const compound = composePacked(['747', '400'], empty);
    expect(compound.molecules.filter((m) => m.from !== m.to)).toEqual([]);
  });
});

describe('atlas frontier and the inversion anchor', () => {
  it('clears list (NUM → NUM) on a gold date+clock+meridian timestamp', () => {
    const [record] = parseConllu(TIMESTAMP);
    const row = scoreRecord(record, empty, { split: 'train' });
    const labels = (row.diagnosis.categories || []).map((c) => c.label);
    expect(labels).not.toContain('list (NUM -> NUM)');
    expect(row.diagnosis.outcome).not.toBe(OUTCOME.PARSED);
    expect(row.chart.spanning.some((m) => m.type === 'DATE')).toBe(true);
  });

  it('clears list (NUM → NUM) on a gold date+clock without a meridian', () => {
    const [record] = parseConllu(CLOCK_ONLY);
    const row = scoreRecord(record, empty, { split: 'train' });
    const labels = (row.diagnosis.categories || []).map((c) => c.label);
    expect(labels).not.toContain('list (NUM -> NUM)');
  });

  it('leaves From the AP comes this story as CONTAINMENT_MISS or contained', () => {
    const [record] = parseConllu(INVERTED);
    const posMap = new Map([['ap', ['n']], ['comes', ['v']], ['story', ['n']]]);
    const row = scoreRecord(record, posMap, { split: 'dev' });
    const inversion = constructionByBond('INV', 'VP', 'S');
    expect(inversion.family).toBe('inversion');
    expect(row.diagnosis.overGenerated).toBe(false);
    const plate = plateOf(row);
    expect(plate === null || plate === 'CONTAINMENT_MISS').toBe(true);
    expect(plate).not.toBe('OVERGENERATED');
    expect(plate).not.toBe('GRAMMAR');
  });
});
