// tests/pixelbrain/lattice-grid-perception-wire.test.js
import { describe, expect, it } from 'vitest';

// generateLatticeGrid runs microprocessor AMPs (symmetry) that may require
// async/TS runtime; this test exercises the perception wiring on a prebuilt
// lattice via the exported helper path. If generateLatticeGrid is not callable
// headless, the implementer must expose the perception step as a small pure
// function applyLatticePerception(lattice, cols, rows, options) and test THAT.

import { applyLatticePerception } from '../../codex/core/pixelbrain/lattice-grid-engine.js';
// Register photonic bridge functions needed by the perception frame builder.
import { registerPhotonicBridge } from '../../codex/core/pixelbrain/photonic-bridge-registry.js';
import { buildCellSignatures, diffCellSignatures } from '../../src/lib/photonic-retina/retina-cell-index.js';
import { diffShadowField } from '../../src/lib/photonic-retina/retina-shadow-field.js';
import { assemblePerceptionFrame } from '../../src/lib/photonic-retina/retina-perception.js';
registerPhotonicBridge({ buildCellSignatures, diffCellSignatures, diffShadowField, assemblePerceptionFrame });

const cols = 2;
const rows = 1;
function lattice() {
  const cells = new Map();
  cells.set('0,0', { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' });
  return { cells };
}

describe('lattice perception wiring', () => {
  it('attaches a perception frame when enabled', async () => {
    const out = await applyLatticePerception(lattice(), cols, rows, { enabled: true, previous: null, generation: 0 });
    expect(out.perception).toBeTruthy();
    expect(out.perception.frame.cellCount).toBe(2);
    expect(out.perception.snapshot.cells.length).toBe(2);
  });

  it('leaves the lattice untouched when disabled', async () => {
    const lat = lattice();
    const out = await applyLatticePerception(lat, cols, rows, { enabled: false });
    expect(out.perception).toBeUndefined();
  });
});
