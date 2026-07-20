import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'path';
import { characterToSVG } from '../../../codex/core/pixelbrain/character-to-svg.js';
import { forgeCharacter } from '../../../codex/core/pixelbrain/character-foundry.js';

// Minimal character fills — matches applyCharacterFills() output shape.
// A 3-cell "body" region: two interior cells + one outline cell.
const MOCK_FILLS = {
  coordinates: [
    { x: 1, y: 1, partId: 'body', color: '#aaaaaa', isRim: false },
    { x: 1, y: 2, partId: 'body', color: '#aaaaaa', isRim: false },
    { x: 1, y: 3, partId: 'body', color: '#1a1a20', isRim: true  },
  ],
  palette: ['#1a1a20', '#aaaaaa'],
  partColors: { body: '#aaaaaa' },
  diagnostics: { totalCells: 3, uniqueColors: 2, rimCells: 1 },
};

const MOCK_SPEC = {
  contract: 'CHARACTER-SPEC-v1',
  canvas: { width: 4, height: 6 },
  combatProfile: { school: 'VOID' },
};

describe('characterToSVG', () => {
  it('returns a non-empty string starting with <svg', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    expect(typeof svg).toBe('string');
    expect(svg.trimStart()).toMatch(/^<svg/);
  });

  it('viewBox uses canvas cell dimensions (scale-independent)', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, { scale: 1 });
    expect(svg).toContain('viewBox="0 0 4 6"');
  });

  it('viewBox uses cell dimensions regardless of scale — pixel size is width/height only', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, { scale: 8 });
    // Cell dims are 4×6 (from MOCK_SPEC.canvas). At scale=8, viewBox stays 4×6.
    expect(svg).toContain('viewBox="0 0 4 6"');
    // But rendered pixel size scales correctly.
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="48"');
  });

  it('width and height attributes match canvas × scale', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, { scale: 4 });
    expect(svg).toContain('width="16"');
    expect(svg).toContain('height="24"');
  });

  it('root element has pb-character class', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    expect(svg).toContain('pb-character');
  });

  it('root element has school class from combatProfile.school', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    expect(svg).toContain('school-void');
  });

  it('contains a fill path for the body part', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    expect(svg).toContain('pb-part-body');
  });

  it('contains an outline path with stroke attribute', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    expect(svg).toContain('pb-outline');
    expect(svg).toContain('stroke=');
  });

  it('twoTone=false omits the pb-shading group', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, { twoTone: false });
    expect(svg).not.toContain('pb-shading');
  });

  it('emits SVG filter shaders by default and can disable them', () => {
    const shaderFills = {
      ...MOCK_FILLS,
      coordinates: [
        { x: 1, y: 1, partId: 'halo', color: '#dff6ff', isRim: false },
        { x: 3, y: 1, partId: 'halo', color: '#dff6ff', isRim: false },
        { x: 2, y: 3, partId: 'body', color: '#1a1a20', isRim: true },
      ],
    };

    const svg = characterToSVG(shaderFills, MOCK_SPEC, { smooth: false });
    const noShaders = characterToSVG(shaderFills, MOCK_SPEC, { smooth: false, shaderEffects: false });

    expect(svg).toContain('id="pb-shader-ice-glow"');
    expect(svg).toContain('id="pb-shader-ink-shadow"');
    expect(svg).toContain('filter="url(#pb-shader-ice-glow)"');
    expect(noShaders).not.toContain('pb-shader-ice-glow');
    expect(noShaders).not.toContain('filter="url(#pb-shader-ice-glow)"');
  });

  it('renders disconnected cells in one part as separate SVG paths', () => {
    const disconnectedFills = {
      ...MOCK_FILLS,
      coordinates: [
        { x: 1, y: 1, partId: 'halo', color: '#dff6ff', isRim: false },
        { x: 4, y: 1, partId: 'halo', color: '#dff6ff', isRim: false },
      ],
    };

    const svg = characterToSVG(disconnectedFills, MOCK_SPEC, { smooth: false, shaderEffects: false });
    const haloPaths = svg.match(/class="pb-part-halo"/g) || [];
    expect(haloPaths).toHaveLength(2);
  });

  it('is deterministic — same input → same output 50 times', () => {
    const first = characterToSVG(MOCK_FILLS, MOCK_SPEC, {});
    for (let i = 0; i < 49; i++) {
      expect(characterToSVG(MOCK_FILLS, MOCK_SPEC, {})).toBe(first);
    }
  });

  it('handles missing canvas on spec — defaults to 32×48 viewBox at scale 1', () => {
    const specNoCanvas = { contract: 'CHARACTER-SPEC-v1', combatProfile: { school: 'SONIC' } };
    const svg = characterToSVG(MOCK_FILLS, specNoCanvas, { scale: 1 });
    expect(svg).toContain('viewBox="0 0 32 48"');
  });

  it('handles empty coordinates without throwing', () => {
    const emptyFills = { ...MOCK_FILLS, coordinates: [] };
    expect(() => characterToSVG(emptyFills, MOCK_SPEC, {})).not.toThrow();
  });

  it('stroke-width is in cell units — 1.5px stroke at scale 8 emits stroke-width ~0.1875', () => {
    const svg = characterToSVG(MOCK_FILLS, MOCK_SPEC, { scale: 8, smooth: false, shaderEffects: false });
    expect(svg).toContain('stroke-width="0.1875"');
  });

  it('renders accessory and detail profile classes through illustrated forge output', () => {
    const result = forgeCharacter({
      contract: 'CHARACTER-SPEC-v1',
      id: 'svg-accessory-detail-test',
      class: 'character',
      archetype: 'human',
      canvas: { width: 32, height: 48, gridSize: 1 },
      seed: 1,
      bytecode: 'SVG-ACCESSORY-DETAIL-TEST',
      presentation: { gender: 'feminine', heightClass: 'average', buildClass: 'slender' },
      directions: ['south'],
      materials: { skin: 'skin_light', hair: 'hair_void', eyes: 'eye_blue' },
      body: { profile: 'character.body.human.feminine' },
      face: [
        { id: 'leftEye', profile: 'character.face.eye.almond', attach: { parent: 'body', at: 'face.eyeLeft' } },
        { id: 'rightEye', profile: 'character.face.eye.almond', attach: { parent: 'body', at: 'face.eyeRight' } },
      ],
      hair: { profile: 'character.hair.longStraight', params: { color: 'hair_void' } },
      clothing: [{ id: 'top', profile: 'character.clothing.top.beginnerRobe' }],
      accessories: [
        { id: 'halo', profile: 'character.accessory.halo.ice', params: { color: '#dff6ff' } },
        { id: 'wings', profile: 'character.accessory.wings.snow', params: { color: '#f4fbff' } },
      ],
      details: [
        { id: 'robeTrim', profile: 'character.detail.robeTrim.snow', params: { color: '#e9fbff' } },
        { id: 'eyeGlow', profile: 'character.detail.eyeGlow', params: { color: '#42d9ff' } },
      ],
      combatProfile: { school: 'PSYCHIC' },
    }, { renderer: 'illustrated', scale: 4 });

    expect(result.svg).toContain('pb-part-halo');
    expect(result.svg).toContain('pb-part-wings');
    expect(result.svg).toContain('pb-part-robeTrim');
    expect(result.svg).toContain('pb-part-eyeGlow');
    expect(result.svg).toContain('#42d9ff');
    expect(result.svg).toContain('school-psychic');
  });
});

describe('applyCharacterFills → characterToSVG shape contract', () => {
  it('applyCharacterFills output carries isRim (not isOutline) to match the AMP engine contract', () => {
    // This test imports applyCharacterFills indirectly through forgeCharacter.
    // It validates the coordinate shape that characterToSVG() reads.
    const result = forgeCharacter({
      contract: 'CHARACTER-SPEC-v1',
      id: 'contract-shape-test',
      class: 'character',
      archetype: 'human',
      canvas: { width: 32, height: 48, gridSize: 1 },
      seed: 42,
      bytecode: 'VW-SCHOLAR-COMMON-RESONANT',
      presentation: { gender: 'feminine', heightClass: 'average', buildClass: 'average' },
      directions: ['south'],
      materials: { skin: 'skin_light', hair: 'hair_brown', eyes: 'eye_brown' },
      body: { profile: 'character.body.human.androgynous' },
      face: [
        { id: 'leftEye',  profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeLeft' } },
        { id: 'rightEye', profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeRight' } },
      ],
      hair: { profile: 'character.hair.short' },
      clothing: [{ id: 'top', profile: 'character.clothing.top.beginnerRobe' }],
      combatProfile: { school: 'VOID' },
    }, { renderer: 'illustrated', scale: 1 });

    // result.fills['south'] is the applyCharacterFills() output
    const fills = result.fills['south'];
    expect(fills).toHaveProperty('coordinates');
    expect(fills.coordinates.length).toBeGreaterThan(0);

    // Every coordinate must have isRim (not isOutline)
    const sample = fills.coordinates[0];
    expect(sample).toHaveProperty('isRim');
    expect(sample).not.toHaveProperty('isOutline');

    // Must have partId, x, y, color
    expect(sample).toHaveProperty('partId');
    expect(sample).toHaveProperty('x');
    expect(sample).toHaveProperty('y');
    expect(sample).toHaveProperty('color');

    // At least one rim cell and one non-rim cell must exist
    const rimCells    = fills.coordinates.filter(c => c.isRim === true);
    const fillCells   = fills.coordinates.filter(c => c.isRim === false);
    expect(rimCells.length).toBeGreaterThan(0);
    expect(fillCells.length).toBeGreaterThan(0);
  });
});

describe('golden SVG snapshot — npc.void.v1', () => {
  const GOLDEN_SPEC = {
    contract: 'CHARACTER-SPEC-v1',
    id: 'npc.void.v1',
    class: 'character',
    archetype: 'human',
    canvas: { width: 32, height: 48, gridSize: 1 },
    seed: 86,
    bytecode: 'VW-SCHOLAR-COMMON-RESONANT',
    presentation: { gender: 'feminine', heightClass: 'average', buildClass: 'average' },
    directions: ['south'],
    materials: { skin: 'skin_voidborne', hair: 'hair_void', eyes: 'eye_void_glow' },
    body: { profile: 'character.body.human.androgynous' },
    face: [
      { id: 'leftEye',  profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeLeft' } },
      { id: 'rightEye', profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeRight' } },
      { id: 'nose',     profile: 'character.face.nose.small', attach: { parent: 'body', at: 'face.nose' } },
      { id: 'mouth',    profile: 'character.face.mouth.small', attach: { parent: 'body', at: 'face.mouth' } },
    ],
    hair: { profile: 'character.hair.short', params: { color: 'hair_void' }, attach: { parent: 'body', at: 'headTop' } },
    clothing: [
      { id: 'bottom', profile: 'character.clothing.bottom.beginnerPants' },
      { id: 'top',    profile: 'character.clothing.top.beginnerRobe' },
      { id: 'shoes',  profile: 'character.clothing.shoes.beginnerBoots' },
    ],
    combatProfile: { school: 'VOID' },
  };

  it('forged SVG matches committed golden output byte-for-byte', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const goldenPath = join(__dirname, 'golden', 'npc-void-illustrated.svg');
    const golden = readFileSync(goldenPath, 'utf8');

    const result = forgeCharacter(GOLDEN_SPEC, { renderer: 'illustrated', scale: 1, smooth: false });
    const svg = result.svg ?? result;
    expect(svg).toBe(golden);
  });

  it('golden SVG has expected structure — fills, shading, outline, school class', () => {
    const result = forgeCharacter(GOLDEN_SPEC, { renderer: 'illustrated', scale: 1, smooth: false });
    const svg = result.svg ?? result;

    expect(svg).toContain('pb-character');
    expect(svg).toContain('school-void');
    expect(svg).toContain('pb-fills');
    expect(svg).toContain('pb-shading');
    expect(svg).toContain('pb-outlines');
    expect(svg).toContain('pb-outline');
    expect(svg).toContain('pb-part-body');
    expect(svg).toContain('viewBox="0 0 32 48"');
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="48"');
  });
});
