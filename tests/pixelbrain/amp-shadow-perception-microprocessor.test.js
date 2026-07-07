import { describe, expect, it } from 'vitest';
import { verseIRMicroprocessors } from '../../codex/core/microprocessors/index.js';
import { SHADOW_SCALARS } from '../../codex/core/pixelbrain/shadow-perception-amp.js';

describe('amp.shadow-perception microprocessor', () => {
  it('runs the shadow-perception amp through the registry', async () => {
    const result = await verseIRMicroprocessors.execute('amp.shadow-perception', {
      coordinates: [{ col: 1, row: 0, color: '#223344', colorIntensity: { role: 'cold_chroma' } }],
      vectorField: [],
      cols: 2,
      rows: 1,
    });
    expect(Array.from(result.shadowField)).toEqual([SHADOW_SCALARS.NONE, SHADOW_SCALARS.POCKET]);
  });
});
