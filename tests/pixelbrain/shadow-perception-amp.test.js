import { describe, expect, it } from 'vitest';
import {
  SHADOW_SCALARS,
  runShadowPerceptionAmp,
} from '../../codex/core/pixelbrain/shadow-perception-amp.js';

const cols = 2;
const rows = 2;

describe('runShadowPerceptionAmp', () => {
  it('emits a dense row-major shadow field with edge and pocket scalars', () => {
    const coordinates = [
      { col: 0, row: 0, color: '#445566', colorIntensity: { role: 'black_anchor' } }, // pocket
      { col: 1, row: 0, color: '#ffffff', colorIntensity: { role: 'white_core' } },    // protected
      { col: 0, row: 1, color: '#223344' }, // edge (via vectorField)
    ];
    const vectorField = [{ x: 0, y: 1, role: 'edge-flow' }];
    const { shadowField } = runShadowPerceptionAmp({ coordinates, vectorField, cols, rows });

    expect(shadowField).toBeInstanceOf(Float64Array);
    expect(shadowField.length).toBe(4);
    expect(shadowField[0]).toBe(SHADOW_SCALARS.POCKET); // (0,0)
    expect(shadowField[1]).toBe(SHADOW_SCALARS.NONE);   // (1,0) protected
    expect(shadowField[2]).toBe(SHADOW_SCALARS.EDGE);   // (0,1) edge-flow
    expect(shadowField[3]).toBe(SHADOW_SCALARS.NONE);   // (1,1) empty
  });

  it('is deterministic for identical input', () => {
    const args = { coordinates: [{ col: 0, row: 0, color: '#445566', colorIntensity: { role: 'cold_chroma' } }], vectorField: [], cols, rows };
    expect(Array.from(runShadowPerceptionAmp(args).shadowField))
      .toEqual(Array.from(runShadowPerceptionAmp(args).shadowField));
  });
});
