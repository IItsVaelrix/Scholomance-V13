import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/**
 * Timestamp list. EWT gold `list` on NUM→NUM is date+clock juxtaposition,
 * not numbered items and not arbitrary NUM adjacency.
 *
 * Adjacent DATE+CLOCK on train+dev is gold `list` 175/175, left-headed.
 * Adjacent NUM NUM that is `compound` is right-headed (122) and has
 * different orthography — a NUM+NUM bond would smash those together.
 *
 * The list-dependent gold span is almost always CLOCK+AM/PM
 * (nmod:unmarked). Clock-meridian is not the list relation; without it
 * the list-dependent subtree has no chart cell, and DATE+CLOCK alone
 * cannot drop promisedUnblock. Same pair shape as adj coordination.
 */
export const LIST = [
  defineConstruction({
    id: 'clock-meridian',
    family: 'list',
    left: 'CLOCK', right: 'MERIDIAN', result: 'CLOCK', head: 0,
    status: S.GRAMMAR,
    relation: 'nmod:unmarked',
    construction: 'clock-meridian',
    roles: { left: 'clock', right: 'meridian' },
    note: '05:17 PM — meridian depends on the clock; not a list item',
    flags: ['ud-aligned', 'timestamp'],
  }),
  defineConstruction({
    id: 'date-clock-list',
    family: 'list',
    left: 'DATE', right: 'CLOCK', result: 'DATE', head: 0,
    status: S.GRAMMAR,
    relation: 'list',
    construction: 'date-clock-timestamp',
    roles: { left: 'date', right: 'clock' },
    note: '07/30/2001 05:17 — first numeral heads, matching UD list',
    flags: ['ud-aligned', 'timestamp'],
  }),
];
