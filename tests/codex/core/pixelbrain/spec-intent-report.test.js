/**
 * spec-intent-report — the authored-vs-effective surface the 2026-09-03 UX audit
 * says did not exist (DR-2026-09-03-PIXELBRAIN-UX, MAJOR #6: "What you author is
 * not reliably what you get, and nothing in the pipeline surfaces that gap back
 * to the author").
 *
 * The two properties that make this safe to mount inside the foundry are asserted
 * here, not just claimed in the header comment:
 *   1. it reports. Every divergence class has a case that fires and a case that
 *      stays silent, so a passing suite means the detector works, not that it
 *      never triggers.
 *   2. it cannot change anything. Inputs are deep-frozen before every call, so a
 *      mutation would throw instead of silently reaching a packet; and the
 *      aggregate is byte-identical run to run.
 */
import { describe, expect, it } from 'vitest';

import {
  SPEC_INTENT_REPORT_VERSION,
  collectAnchorSubstitutions,
  collectFidelityClamps,
  collectOutlineIntent,
  collectSpecIntent,
  collectUnrenderedParts,
  formatSpecIntent,
} from '../../../../codex/core/pixelbrain/spec-intent-report.js';
import { normalizeItemSpec } from '../../../../codex/core/pixelbrain/item-spec.js';

const GOLD = '#A58A2D';       // void_gold.body
const GOLD_FROST = '#CEB65A'; // void_gold.frost

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const part = (id, extra = {}) => ({ id, fill: { material: 'void_gold', anchor: 'body' }, ...extra });
const cell = (x, y, color, partId) => ({ x, y, color, partId });

// A 3x3 block: every cell except (1,1) is on the border.
const SILHOUETTE = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }] };

describe('fidelity clamps — silent numeric coercion', () => {
  it('names a bevel strength the foundry clamped, with authored and effective values', () => {
    // The exact defect from the audit: the flagship spec authors 1.1 "stronger
    // bevels" and renders at exactly 1.0.
    const raw = deepFreeze({ fidelity: { bevelStrength: 1.1 } });
    const normalized = deepFreeze({ fidelity: { bevelStrength: 1 } });
    const [clamp] = collectFidelityClamps(raw, normalized);

    expect(clamp.field).toBe('bevelStrength');
    expect(clamp.authored).toBe(1.1);
    expect(clamp.effective).toBe(1);
    expect(clamp.declaredRange).toEqual([0, 1]);
    expect(clamp.cause).toBe('above-declared-max');
  });

  it('stays silent when the authored value is already in range', () => {
    expect(collectFidelityClamps(
      deepFreeze({ fidelity: { bevelStrength: 0.8, rimContrast: 1 } }),
      deepFreeze({ fidelity: { bevelStrength: 0.8, rimContrast: 1 } }),
    )).toEqual([]);
  });

  it('catches a palette budget rounded as well as one clamped', () => {
    const clamps = collectFidelityClamps(
      deepFreeze({ fidelity: { paletteBudget: 7, rimContrast: 0.5 } }),
      deepFreeze({ fidelity: { paletteBudget: 8, rimContrast: 0.5 } }),
    );
    expect(clamps).toHaveLength(1);
    expect(clamps[0].cause).toBe('below-declared-min');
  });

  it('is real against normalizeItemSpec, not just against a hand-built spec', () => {
    // The asymmetry this module exists for: normalizeItemSpec throws for a
    // missing required field and silently coerces an out-of-range one.
    const raw = { fidelity: { bevelStrength: 1.1 } };
    const clamps = collectFidelityClamps(raw, { fidelity: normalizeItemSpecFidelity(raw) });
    expect(clamps.map((c) => c.field)).toEqual(['bevelStrength']);
  });
});

function normalizeItemSpecFidelity(raw) {
  // Same coercion path the foundry uses, reached without building a whole spec.
  const spec = normalizeItemSpec({
    contract: 'ITEM-SPEC-v1',
    id: 'intent.probe.v1',
    class: 'weapon',
    archetype: 'dirk',
    canvas: { width: 8, height: 8 },
    seed: 3,
    bytecode: 'VW-VOID-RARE-HARMONIC',
    parts: [{ id: 'blade', profile: 'blade.straight', params: { cx: 4, span: [0, 7] }, fill: { material: 'void_gold' } }],
    fidelity: { qualityTarget: 'pro_polished', ...raw.fidelity },
  });
  return spec.fidelity;
}

describe('anchor substitutions — a material that has no such anchor', () => {
  it('reports the declared anchor, the one actually used, and what exists', () => {
    const spec = deepFreeze({ parts: [part('blade', { fill: { material: 'void_gold', anchor: 'shimmer' } })] });
    const [entry] = collectAnchorSubstitutions(spec);

    expect(entry.partId).toBe('blade');
    expect(entry.slot).toBe('fill');
    expect(entry.declaredAnchor).toBe('shimmer');
    expect(entry.effectiveAnchor).toBe('body');
    expect(entry.availableAnchors).toEqual(
      ['body', 'deep', 'frost', 'shadow', 'spectral', 'void', 'whiteCore'].sort(),
    );
  });

  it('does not report an anchor the material really has', () => {
    expect(collectAnchorSubstitutions(
      deepFreeze({ parts: [part('blade', { fill: { material: 'void_gold', anchor: 'frost' } })] }),
    )).toEqual([]);
  });

  it('scans every material-bearing slot, not just fill', () => {
    const spec = deepFreeze({
      parts: [part('blade', {
        trim: { material: 'void_gold', anchor: 'nope' },
        outline: { material: 'void_gold', anchor: 'nope' },
        motif: { core: { material: 'void_gold', anchor: 'nope' }, glow: { material: 'void_gold', anchor: 'nope' } },
      })],
    });
    expect(collectAnchorSubstitutions(spec).map((e) => e.slot))
      .toEqual(['trim', 'outline', 'motif.core', 'motif.glow']);
  });
});

describe('outline intent — declared outlines that cannot reach the silhouette', () => {
  it('flags a part that owns no border cell at all', () => {
    const spec = deepFreeze({ parts: [part('core', { outline: { material: 'void_gold' } })] });
    const fills = deepFreeze({ coordinates: [cell(1, 1, GOLD, 'core')] }); // interior only
    const report = collectOutlineIntent({ spec, fills, silhouette: SILHOUETTE });

    expect(report.borderCells).toBe(8);
    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toMatchObject({
      partId: 'core',
      material: 'void_gold',
      borderCells: 0,
      status: 'declared-outline-never-on-border',
    });
  });

  it('flags a part on the border whose cells are none of the material colors', () => {
    const spec = deepFreeze({ parts: [part('badge', { outline: { material: 'void_gold' } })] });
    const fills = deepFreeze({ coordinates: [cell(0, 0, '#123456', 'badge')] });
    const [entry] = collectOutlineIntent({ spec, fills, silhouette: SILHOUETTE }).divergences;

    expect(entry.status).toBe('declared-material-absent-from-own-border-cells');
    expect(entry.distinctBorderColors).toEqual(['#123456']);
    expect(entry.materialColorsPresent).toBe(0);
  });

  it('stays silent when the declared material really is on the border', () => {
    const spec = deepFreeze({ parts: [part('trim', { outline: { material: 'void_gold' } })] });
    const fills = deepFreeze({ coordinates: [cell(0, 0, GOLD_FROST, 'trim'), cell(2, 2, GOLD, 'trim')] });
    const report = collectOutlineIntent({ spec, fills, silhouette: SILHOUETTE });

    expect(report.divergences).toEqual([]);
    expect(report.ownership[0]).toMatchObject({ partId: 'trim', borderCells: 2, shareOfBorder: 0.25 });
  });

  it('reports ownership even when nothing diverges', () => {
    const spec = deepFreeze({ parts: [part('a'), part('b')] });
    const fills = deepFreeze({ coordinates: [cell(0, 0, GOLD, 'a'), cell(1, 0, GOLD, 'a'), cell(2, 0, GOLD, 'b')] });
    const report = collectOutlineIntent({ spec, fills, silhouette: SILHOUETTE });

    expect(report.partsOwningBorder).toBe(2);
    // Sorted by border cells owned, descending: the report answers "who actually
    // draws this silhouette", which is the question an author gets wrong.
    expect(report.ownership.map((o) => o.partId)).toEqual(['a', 'b']);
    expect(report.ownership[0].shareOfBorder).toBeCloseTo(0.667, 3);
  });

  it('tolerates a missing silhouette', () => {
    const report = collectOutlineIntent({ spec: deepFreeze({ parts: [part('a')] }), fills: deepFreeze({ coordinates: [] }) });
    expect(report.borderCells).toBe(0);
    expect(report.divergences).toEqual([]);
  });
});

describe('unrendered parts', () => {
  it('lists parts that own zero cells, sorted', () => {
    const spec = deepFreeze({ parts: [part('zed'), part('ghost'), part('blade')] });
    const fills = deepFreeze({ coordinates: [cell(0, 0, GOLD, 'blade')] });
    expect(collectUnrenderedParts(spec, fills)).toEqual([{ partId: 'ghost' }, { partId: 'zed' }]);
  });
});

describe('collectSpecIntent', () => {
  const inputs = () => ({
    rawSpec: { id: 'asset.v1', fidelity: { bevelStrength: 1.1 }, parts: [] },
    spec: { id: 'asset.v1', fidelity: { bevelStrength: 1 }, parts: [part('core', { outline: { material: 'void_gold' } })] },
    fills: { coordinates: [cell(1, 1, GOLD, 'core')] },
    silhouette: SILHOUETTE,
  });

  it('adds every class up into attentionCount and marks clean only at zero', () => {
    const report = collectSpecIntent(inputs());
    expect(report.version).toBe(SPEC_INTENT_REPORT_VERSION);
    expect(report.assetId).toBe('asset.v1');
    expect(report.attentionCount).toBe(2); // 1 clamp + 1 outline divergence
    expect(report.clean).toBe(false);
    expect(formatSpecIntent(report).split('\n')).toHaveLength(2);
  });

  it('is clean for an asset that asks for nothing impossible', () => {
    const report = collectSpecIntent({
      rawSpec: { fidelity: { bevelStrength: 0.9 } },
      spec: { fidelity: { bevelStrength: 0.9 }, parts: [part('trim', { outline: { material: 'void_gold' } })] },
      fills: { coordinates: [cell(0, 0, GOLD, 'trim')] },
      silhouette: SILHOUETTE,
    });
    expect(report.clean).toBe(true);
    expect(report.attentionCount).toBe(0);
    expect(formatSpecIntent(report)).toBe('');
  });

  it('is deterministic and never mutates its inputs', () => {
    const a = inputs();
    const b = inputs();
    deepFreeze(a);
    deepFreeze(b);
    const snapshot = JSON.stringify(b);

    const first = collectSpecIntent(a);
    const second = collectSpecIntent(b);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(b)).toBe(snapshot);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.outline.ownership)).toBe(true);
  });

  it('survives the shapes real callers hand it: nothing, nulls, junk', () => {
    expect(collectSpecIntent({}).clean).toBe(true);
    expect(collectSpecIntent({ rawSpec: null, spec: null, fills: null, silhouette: null }).clean).toBe(true);
    const junk = collectSpecIntent({
      rawSpec: { fidelity: { bevelStrength: 'wide' } },
      spec: { parts: [null, 'nope', { id: 'x', fill: { material: 'not_a_material', anchor: 'body' } }] },
      fills: { coordinates: [null, 7, cell(0, 0, null, 'x')] },
      silhouette: SILHOUETTE,
    });
    expect(junk.clean).toBe(false);
    expect(junk.clamps).toEqual([]);
  });
});

describe('formatSpecIntent', () => {
  it('writes one plain-English line per divergence, with the indent asked for', () => {
    const report = collectSpecIntent({
      rawSpec: { fidelity: { bevelStrength: 1.1 } },
      spec: {
        parts: [
          part('core', { outline: { material: 'void_gold' } }),
          part('ghost'),
          part('blade', { trim: { material: 'void_gold', anchor: 'shimmer' } }),
        ],
      },
      fills: { coordinates: [cell(1, 1, GOLD, 'core')] },
      silhouette: SILHOUETTE,
    });
    const lines = formatSpecIntent(report, { indent: '' }).split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('fidelity.bevelStrength: authored 1.1, foundry used 1');
    expect(lines[1]).toContain("blade.trim: anchor 'shimmer'");
    expect(lines[2]).toContain('core.outline');
    expect(lines[3]).toContain("part 'ghost' authored with no rendered cells");
    // Actionable without a decoder ring: the message carries the numbers, not a code.
    expect(lines.join('')).not.toMatch(/PB-ERR|SCDL-/);
  });
});
