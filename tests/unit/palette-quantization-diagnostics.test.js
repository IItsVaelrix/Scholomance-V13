/**
 * Palette quantization must distinguish destroyed NOISE from destroyed SIGNAL.
 *
 * Context (DR-2026-09-02-ASSETGEN-PI): forging the VOID chestplate recolors
 * 1962/2202 cells and destroys 138 distinct colors. That number alone is
 * uninterpretable — it looked like a catastrophe until the authored 28-color
 * palette was checked, at which point 0 of the 138 casualties turned out to be
 * authored colors. Every one was amp-generated intermediate shading, which the
 * pass is *supposed* to collapse.
 *
 * So `changedCount` is not an alarm and never was. The alarm is:
 *   - destroyedAuthored  — a spec-declared exact-palette color was destroyed
 *   - destroyedSemantic  — a color carried by a semantically-marked cell
 *                          (crystalCore / crystalGlow / isMotif / motifRole)
 *                          was destroyed
 * Everything else is destroyedNoise, which is the pass working as intended.
 *
 * CORRECTION, same day: these diagnostics were described on first writing as
 * "observation only: quantization behavior must not change". That was false, and
 * every test here used a spec with `parts: []`, so nothing in the file could see
 * it. The semantic reservation moves pixels, and on the one asset with a real
 * spec — the VOID chestplate, budget saturated at 64/64 — reserving semantic
 * colors ahead of the per-material anchor sweep destroyed 8 of the 28 authored
 * colors while admitting 22 near-duplicates of them (rendered distinct colors
 * 35 -> 43, authored coverage 20/28 -> 13/28). The claim order in the amp header
 * is the fix; `budget-saturated specs` below is the test that should have existed
 * before it shipped.
 */
import { describe, it, expect } from 'vitest';
import { applyPaletteQuantization } from '../../codex/core/pixelbrain/palette-quantization-amp.js';

const cell = (color, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ x: i, y: 0, color, ...extra }));

// No material anchors -> the palette is drawn purely from observed colors,
// so the budget is the only thing deciding what survives.
const bareSpec = (paletteBudget, extra = {}) => ({
  parts: [],
  fidelity: { paletteBudget, ...extra },
});

describe('palette quantization diagnostics — noise vs signal', () => {
  it('reports destroyed amp shading as noise, not as an alarm', () => {
    // Three near-identical amp intermediates collapse onto one survivor.
    const coords = [
      ...cell('#900000', 50),
      ...cell('#900001', 50),
      ...cell('#900002', 50),
    ];
    const { diagnostics } = applyPaletteQuantization(coords, bareSpec(1));

    expect(diagnostics.destroyedTotal).toBe(2);
    expect(diagnostics.destroyedAuthored).toBe(0);
    expect(diagnostics.destroyedSemantic).toBe(0);
    expect(diagnostics.destroyedNoise).toBe(2);
    expect(diagnostics.alarm).toBe(false);
  });

  it('raises the alarm when an underfunded budget destroys an authored color', () => {
    // Authored colors are now seated ahead of everything but `required`, so a
    // single authored color can no longer be cut by the budget — which is the
    // fix, not a lost test. It CAN still be cut by a budget smaller than the
    // authored palette itself, and the alarm must keep firing there: reporting
    // would be worthless if promotion made it permanently silent.
    const spec = bareSpec(1, { exactPalette: ['#900002', '#900000'] });
    const coords = [...cell('#900000', 50), ...cell('#900002', 50)];
    const { diagnostics } = applyPaletteQuantization(coords, spec);

    expect(diagnostics.authoredTotal).toBe(2);
    expect(diagnostics.destroyedAuthored).toBe(1);
    expect(diagnostics.alarm).toBe(true);

    // One slot more and both authored colors are honoured.
    const funded = applyPaletteQuantization(coords, bareSpec(2, { exactPalette: ['#900002', '#900000'] }));
    expect(funded.diagnostics.destroyedAuthored).toBe(0);
    expect(funded.diagnostics.authoredSeated).toBe(2);
    expect(funded.diagnostics.alarm).toBe(false);
  });

  it('also reads the authored palette from metadata.editorPalette.colors', () => {
    const spec = {
      parts: [],
      fidelity: { paletteBudget: 1 },
      metadata: { editorPalette: { colors: ['#900002', '#900000'] } },
    };
    const coords = [...cell('#900000', 50), ...cell('#900002', 50)];
    const { diagnostics } = applyPaletteQuantization(coords, spec);

    expect(diagnostics.authoredPaletteDeclared).toBe(true);
    expect(diagnostics.authoredTotal).toBe(2);
    expect(diagnostics.destroyedAuthored).toBe(1);
    expect(diagnostics.alarm).toBe(true);
  });

  it('is case-insensitive when matching authored colors', () => {
    const spec = bareSpec(1, { exactPalette: ['#900002'] });
    const coords = [...cell('#900000', 50), ...cell('#900002', 50)];
    const lower = bareSpec(1, { exactPalette: ['#900002'.toLowerCase()] });

    expect(applyPaletteQuantization(coords, spec).diagnostics.destroyedAuthored)
      .toBe(applyPaletteQuantization(coords, lower).diagnostics.destroyedAuthored);
  });

  it('reserves a semantically-marked color the budget would otherwise delete', () => {
    // The crystal highlight case: 3 cells against 500, so every frequency- or
    // hex-ordered policy deletes it. crystal-core-amp assigns this color itself,
    // so `target.anchor` does not protect it — only the semantic tier does.
    const coords = [
      ...cell('#100000', 500),
      ...cell('#900002', 3, { crystalCore: 'white-core' }),
    ];
    const { coordinates, diagnostics } = applyPaletteQuantization(coords, bareSpec(1));

    expect(diagnostics.destroyedSemantic).toBe(0);
    expect(diagnostics.alarm).toBe(false);
    // The highlight keeps its identity; the bulk body color is what collapses.
    expect(coordinates.filter((c) => c.crystalCore).every((c) => c.color === '#900002')).toBe(true);
  });

  it.each(['crystalCore', 'crystalGlow', 'motifRole'])(
    'reserves colors marked by %s',
    (marker) => {
      const coords = [
        ...cell('#100000', 500),
        ...cell('#900002', 3, { [marker]: 'x' }),
      ];
      const { diagnostics } = applyPaletteQuantization(coords, bareSpec(1));
      expect(diagnostics.destroyedSemantic).toBe(0);
    },
  );

  it('reserves isMotif cells when the flag is true', () => {
    const coords = [
      ...cell('#100000', 500),
      ...cell('#900002', 3, { isMotif: true }),
    ];
    const { diagnostics } = applyPaletteQuantization(coords, bareSpec(1));
    expect(diagnostics.destroyedSemantic).toBe(0);
  });

  it('still reports destroyedSemantic when reservation itself is overrun', () => {
    // Two semantic colors, one slot. Reservation cannot save both, and the
    // diagnostic must keep telling the truth about the one that dies.
    const coords = [
      ...cell('#100000', 500),
      ...cell('#900002', 3, { crystalCore: 'a' }),
      ...cell('#A00003', 3, { crystalGlow: 'b' }),
    ];
    const { diagnostics } = applyPaletteQuantization(coords, bareSpec(1));

    expect(diagnostics.destroyedSemantic).toBe(1);
    expect(diagnostics.alarm).toBe(true);
  });

  it('does not reserve on isMotif false', () => {
    const coords = [
      ...cell('#100000', 500),
      ...cell('#900002', 3, { isMotif: false }),
    ];
    const { diagnostics } = applyPaletteQuantization(coords, bareSpec(1));
    expect(diagnostics.destroyedSemantic).toBe(0);
    expect(diagnostics.destroyedNoise).toBe(1);
  });

  it('counts unused budget slots', () => {
    const coords = [...cell('#900000', 10), ...cell('#900001', 10)];
    const { diagnostics } = applyPaletteQuantization(coords, bareSpec(64));

    expect(diagnostics.uniqueColors).toBe(2);
    expect(diagnostics.slotsUnused).toBe(62);
  });

  it('leaves unmarked artwork to hex order — reservation needs a marker', () => {
    const coords = [...cell('#900000', 50), ...cell('#900002', 50)];
    const { coordinates } = applyPaletteQuantization(coords, bareSpec(1));

    // Budget 1, hex-earliest wins: everything collapses onto #900000. This is
    // the narrow case the old name called "observation only" — with no markers
    // and no material anchors there is simply nothing for the tiers to promote.
    expect(new Set(coordinates.map((c) => c.color))).toEqual(new Set(['#900000']));
    expect(coordinates).toHaveLength(100);
  });

  it('emits null palette-provenance fields when no budget is set', () => {
    const coords = [...cell('#900000', 10)];
    const { diagnostics } = applyPaletteQuantization(coords, { parts: [] });

    expect(diagnostics.budget).toBeNull();
    expect(diagnostics.alarm).toBe(false);
    expect(diagnostics.destroyedTotal).toBe(0);
    expect(diagnostics.slotsUnused).toBeNull();
    expect(diagnostics.paletteSlotsUsed).toBeNull();
    expect(diagnostics.authoredSeated).toBeNull();
  });
});

// A row of cells on its own line, so a test can follow one color's fate without
// counting cells. `cell()` above packs everything onto y=0.
const row = (color, y, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ x: i, y, color, ...extra }));

describe('budget-saturated specs — the case every test above was missing', () => {
  // Real specs, i.e. ones with parts. `void_gold` offers all seven ANCHOR_ORDER
  // anchors, so the blanket sweep competes for slots with everything else —
  // which is the situation the VOID chestplate is actually in (63 of 64 slots).
  // Every pre-existing test here used `parts: []`, where required and available
  // are both empty and no tier ordering can be observed at all.
  const spec = (budget, extra = {}) => ({
    parts: [{ id: 'body', fill: { material: 'void_gold', anchor: 'body' } }],
    fidelity: { paletteBudget: budget, ...extra },
  });

  it('seats the authored palette ahead of the blanket per-material sweep', () => {
    const authored = '#FFF6D0'; // void_gold.whiteCore — offered, never named
    const coords = [...row('#100B02', 0, 60), ...row(authored, 1, 40)];

    const declared = applyPaletteQuantization(coords, spec(2, { exactPalette: [authored] }));
    expect(declared.diagnostics.paletteSlotsUsed).toBe(2);
    expect(declared.diagnostics.palette).toContain(authored);
    expect(declared.diagnostics.destroyedAuthored).toBe(0);
    expect(declared.coordinates.filter((c) => c.y === 1).every((c) => c.color === authored)).toBe(true);

    // Same asset, same budget, palette never declared: the sweep evicts it. This
    // is what makes the assertion above a real protection and not a tautology —
    // the mechanism only helps an author who states intent, and says so either way.
    const undeclared = applyPaletteQuantization(coords, spec(2));
    expect(undeclared.diagnostics.palette).not.toContain(authored);
    expect(undeclared.coordinates.filter((c) => c.y === 1).every((c) => c.color === authored)).toBe(false);
  });

  it('does not spend a slot on a semantic color that duplicates a seated one', () => {
    // The eviction this file shipped with: #6A31BB is one to four units per
    // channel from the authored #6B35B8 (squared RGB distance 26). Reserving it
    // as its own color both wastes the slot and steals #6B35B8's cells, because
    // nearest-color prefers the closer copy.
    const coords = [
      ...row('#100B02', 0, 60),
      ...row('#6B35B8', 1, 6),
      ...row('#6A31BB', 2, 3, { crystalCore: 'white-core' }),
      ...row('#900002', 3, 3, { crystalGlow: 'edge' }),
    ];
    const { coordinates, diagnostics } = applyPaletteQuantization(
      coords,
      spec(3, { exactPalette: ['#6B35B8'] }),
    );

    expect(diagnostics.semanticColorCandidates).toBe(2);
    expect(diagnostics.semanticSuppressed).toBe(1);
    // The near-duplicate collapses onto the color it was drifting from...
    expect(coordinates.filter((c) => c.y === 2).every((c) => c.color === '#6B35B8')).toBe(true);
    // ...and the genuinely distinct crystal color keeps the slot it earned.
    expect(coordinates.filter((c) => c.y === 3).every((c) => c.color === '#900002')).toBe(true);
    expect(diagnostics.palette).not.toContain('#6A31BB');
  });

  it('counts a merge onto an authored partner as the pass working, not as a loss', () => {
    // destroyedSemantic must mean "a marked cell lost an identity nothing else
    // carried", not "an amp painted a crystal a few units off its design color".
    // Without this distinction the flagship asset alarms on every forge.
    const coords = [...row('#6B35B8', 0, 6), ...row('#6A31BB', 1, 3, { crystalCore: 'white-core' })];
    // Budget 2: one slot for the spec's named anchor, one for the authored color
    // the crystal was meant to be. At budget 1 the authored color is the thing
    // that dies, and that is a genuine alarm (covered above).
    const { diagnostics } = applyPaletteQuantization(coords, spec(2, { exactPalette: ['#6B35B8'] }));

    expect(diagnostics.destroyedSemantic).toBe(0);
    expect(diagnostics.destroyedSemanticMerged).toBe(1);
    expect(diagnostics.destroyedAuthored).toBe(0);
    expect(diagnostics.alarm).toBe(false);
  });
});
