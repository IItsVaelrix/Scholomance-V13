/**
 * Clause ranking scores derivations (span + head still attached), not
 * {subject, verb} strings. Production change that would make these fail:
 * findIndex(lemma) picking Please as the verb of "Please forward…".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../../../codex/core/constellation/compose-packed.js';
import { BONDS } from '../../../codex/core/constellation/compose.js';
import {
  pickResonantAnswer,
  pickResonantDerivation,
} from '../../../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const byText = (part) => records.find((r) => (r.text || '').includes(part));

describe('pickResonantDerivation uses the verb head span, not the first matching lemma', () => {
  it('picks forward, not Please, as the verb of the gate sentence', () => {
    const rec = byText('Please forward a copy');
    const tokens = rec.tokens.map((t) => t.form);
    const chart = composePacked(tokens, posMap);
    expect(chart.stable.length).toBeGreaterThan(0);
    const node = chart.stable[0];
    const answers = projectAnswers(node);
    expect(answers.length).toBeGreaterThan(1);

    const byPath = pickResonantDerivation(node, chart.field, BONDS);
    expect(byPath.answer.verb.toLowerCase()).toBe('forward');
    expect(byPath.verbHead.from).toBeGreaterThan(0);
    expect(String(byPath.verbHead.token).toLowerCase()).toBe('forward');

    const byString = pickResonantAnswer(answers, chart.field, BONDS);
    expect(byString.verb.toLowerCase()).toBe('please');
  });

  it('does not invent a subject on Today + Article when the winning path is a lift', () => {
    const rec = byText("Today's Article");
    const tokens = rec.tokens.map((t) => t.form);
    const chart = composePacked(tokens, posMap);
    expect(chart.stable.length).toBeGreaterThan(0);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(picked).toBeTruthy();
    if (picked.lift) expect(picked.answer.subject).toBe(null);
  });
});
