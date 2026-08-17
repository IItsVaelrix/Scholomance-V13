/**
 * Coverage census ranks UNKNOWN mass. It does not read gold values.
 */
import { describe, expect, it } from 'vitest';

import {
  censusUnknownMass,
  paretoCuts,
} from '../../../../codex/core/constellation/semantic-particles/coverage-census.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';

describe('UNKNOWN-mass census', () => {
  it('puts high-frequency unknown keys first and reports Pareto cuts', () => {
    const records = [{
      tokens: [
        { form: 'qzxqzx' }, { form: 'qzxqzx' }, { form: 'cat' },
      ],
    }];
    const posMap = new Map([['qzxqzx', ['n', 'v']], ['cat', ['n', 'v']]]);
    const atomsFor = (form, index, map) => {
      const tags = map.get(String(form).toLowerCase()) || [];
      const typeOf = { n: 'N', v: 'V' };
      return tags.map((tag) => ({ token: form, type: typeOf[tag] || 'N', from: index, to: index }));
    };
    const census = censusUnknownMass(records, posMap, EXPERIMENTAL_FEATURE_PROVIDER, atomsFor);
    expect(census.ambiguousTokens).toBe(3);
    expect(census.keys[0].lemma).toBe('qzxqzx');
    expect(paretoCuts(census, [1])[0].unknownMass).toBeGreaterThan(0);
  });
});
