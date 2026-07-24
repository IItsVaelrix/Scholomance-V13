import { describe, it, expect } from 'vitest';
import {
  INPUT_SENTINEL,
  METRIC_TEMPLATES,
  MEASURABLE_VERB_CLASS,
  WEAK_VERBS,
  STRONG_VERBS,
  VARIETY_MAP,
  OBJECT_CLASS_ORDER,
  OBJECT_CLASS_KEYWORDS,
  CLASS_STRONG_VERB,
} from '../../src/lib/career/amplify/data/verb-classes';

describe('amplify curated data', () => {
  it('uses U+241F as the input sentinel', () => {
    expect(INPUT_SENTINEL).toBe('␟');
    expect(INPUT_SENTINEL.length).toBe(1);
  });

  it('gives every metric template exactly one slot per sentinel', () => {
    for (const [name, template] of Object.entries(METRIC_TEMPLATES)) {
      const sentinels = template.clause.split(INPUT_SENTINEL).length - 1;
      expect(sentinels, `template ${name} sentinel count`).toBeGreaterThan(0);
      expect(template.slots.length, `template ${name} slot count`).toBe(sentinels);
      for (const slot of template.slots) {
        expect(slot.placeholder.length).toBeGreaterThan(0);
        expect(slot.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it('maps every measurable verb to a defined metric template', () => {
    for (const [verb, metricClass] of Object.entries(MEASURABLE_VERB_CLASS)) {
      expect(verb).toBe(verb.toLowerCase());
      expect(METRIC_TEMPLATES[metricClass], `verb ${verb}`).toBeDefined();
    }
  });

  it('keeps weak and strong verb sets lowercase and disjoint', () => {
    for (const verb of WEAK_VERBS) expect(verb).toBe(verb.toLowerCase());
    for (const verb of STRONG_VERBS) {
      expect(verb).toBe(verb.toLowerCase());
      expect(WEAK_VERBS.has(verb), `${verb} in both sets`).toBe(false);
    }
    expect(WEAK_VERBS.has('responsible')).toBe(false);
  });

  it('offers variety only for verbs it recognises as strong', () => {
    for (const [verb, alternatives] of Object.entries(VARIETY_MAP)) {
      expect(STRONG_VERBS.has(verb), `variety key ${verb}`).toBe(true);
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(alt[0]).toBe(alt[0].toUpperCase());
        expect(alt.toLowerCase()).not.toBe(verb);
      }
    }
  });

  it('defines keywords and a strong verb for every object class', () => {
    for (const cls of OBJECT_CLASS_ORDER) {
      expect(OBJECT_CLASS_KEYWORDS[cls].length).toBeGreaterThan(0);
      expect(CLASS_STRONG_VERB[cls]).toBeTruthy();
      for (const keyword of OBJECT_CLASS_KEYWORDS[cls]) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });
});
