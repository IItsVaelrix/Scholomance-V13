import { describe, expect, it } from 'vitest';
import {
  MATERIAL_PALETTES,
  MATERIAL_OPTIONS,
  resolveMaterialId,
  transmuteMaterialColor,
  hexToRgb,
  luminanceFromRgb,
} from '../../../codex/core/pixelbrain/material-registry.js';
import { enhanceSquaresForRender } from '../../../codex/core/pixelbrain/square-sharpness-contrast-amp.js';

const GEMSTONES = ['diamond', 'sapphire', 'ruby', 'emerald', 'amethyst', 'onyx'];
const METALS = ['gold', 'silver', 'bronze', 'black_steel'];
const ANCHOR_KEYS = ['void', 'shadow', 'deep', 'body', 'frost', 'spectral', 'whiteCore'];

describe('Material Registry — gemstones and metals', () => {
  it.each(GEMSTONES)('registers gemstone %s with a full anchor ramp', (id) => {
    const definition = MATERIAL_PALETTES[id];
    expect(definition).toBeDefined();
    expect(definition.category).toBe('gemstone');
    for (const key of ANCHOR_KEYS) {
      expect(definition.anchors[key], `${id}.anchors.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(definition.rules.preserveAlpha).toBe(true);
    expect(definition.rules.preserveShape).toBe(true);
  });

  it.each(METALS)('registers metal %s with a full anchor ramp', (id) => {
    const definition = MATERIAL_PALETTES[id];
    expect(definition).toBeDefined();
    expect(definition.category).toBe('metal');
    for (const key of ANCHOR_KEYS) {
      expect(definition.anchors[key], `${id}.anchors.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it.each([...GEMSTONES, ...METALS])('anchor ramp for %s ascends in luminance', (id) => {
    const { anchors } = MATERIAL_PALETTES[id];
    const lumas = ANCHOR_KEYS.map((key) => luminanceFromRgb(hexToRgb(anchors[key])));
    for (let i = 1; i < lumas.length; i += 1) {
      expect(lumas[i], `${id}: ${ANCHOR_KEYS[i]} should be at least as bright as ${ANCHOR_KEYS[i - 1]}`)
        .toBeGreaterThanOrEqual(lumas[i - 1]);
    }
  });

  it('resolves gemstone and metal ids without falling back to source', () => {
    expect(resolveMaterialId('sapphire')).toBe('sapphire');
    expect(resolveMaterialId('black_steel')).toBe('black_steel');
  });

  it('resolves snow as a production terrain material', () => {
    expect(resolveMaterialId('snow')).toBe('snow');
    expect(MATERIAL_PALETTES.snow.anchors.whiteCore).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('tags every material with a category, surfaced through MATERIAL_OPTIONS', () => {
    for (const [id, definition] of Object.entries(MATERIAL_PALETTES)) {
      expect(definition.category, `${id} must declare a category`).toBeTruthy();
    }
    const sapphireOption = MATERIAL_OPTIONS.find((option) => option.value === 'sapphire');
    expect(sapphireOption).toMatchObject({ label: 'Sapphire', category: 'gemstone' });
  });

  it('transmutes midtones to the sapphire body anchor', () => {
    // #808080 luma 0.5 sits in the body band [0.34, 0.52)
    expect(transmuteMaterialColor('#808080', 'sapphire')).toBe(MATERIAL_PALETTES.sapphire.anchors.body);
  });

  it('transmutes highlights to the diamond white core', () => {
    expect(transmuteMaterialColor('#F2F2F2', 'diamond')).toBe(MATERIAL_PALETTES.diamond.anchors.whiteCore);
  });
});

describe('Square Sharpness Contrast AMP — gemstone/metal edge anchors', () => {
  it('resolves gemstone materials instead of falling back to source', () => {
    const output = enhanceSquaresForRender(
      [{ x: 1, y: 1, color: MATERIAL_PALETTES.sapphire.anchors.body, emphasis: 0.5 }],
      { material: 'sapphire' },
    );
    expect(output[0].squareAmpMaterial).toBe('sapphire');
    expect(output[0].squareAmpClass).toContain('edge');
  });

  it('mixes silhouette edges toward the registry shadow anchor', () => {
    // Isolated cell: every cardinal neighbor is missing, so it takes the edge
    // path — mixRgb(body, shadow, edgeContrast 0.42).
    const [out] = enhanceSquaresForRender(
      [{ x: 1, y: 1, color: '#0F52BA', emphasis: 0.5 }],
      { material: 'sapphire' },
    );
    expect(out.color).not.toBe('#0F52BA');
    const rgb = hexToRgb(out.color);
    const body = hexToRgb('#0F52BA');
    const shadow = hexToRgb(MATERIAL_PALETTES.sapphire.anchors.shadow);
    expect(rgb.b).toBeLessThan(body.b);
    expect(rgb.b).toBeGreaterThan(shadow.b);
  });

  it('keeps existing flame materials byte-identical through the derived anchors', () => {
    const coordinates = [
      { x: 1, y: 1, color: '#0EA5E9', emphasis: 0.5 },
      { x: 2, y: 1, color: '#F8FCFF', emphasis: 0.5 },
    ];
    const output = enhanceSquaresForRender(coordinates, { material: 'icy_fire' });
    expect(output[0].squareAmpMaterial).toBe('icy_fire');
    // icy_fire edge anchors must still come out exactly as before the registry
    // derivation: edge=void #02070A, shadow #06131C, body #0EA5E9.
    const [edgeCell] = enhanceSquaresForRender(
      [{ x: 5, y: 5, color: '#0EA5E9', emphasis: 0.5 }],
      { material: 'icy_fire' },
    );
    // mix(#0EA5E9, #06131C, 0.42) → r:14+(6-14)*.42, g:165+(19-165)*.42, b:233+(28-233)*.42
    expect(edgeCell.color).toBe('#0B6893');
  });
});
