import { describe, expect, it } from 'vitest';
import { forgeCharacter } from '../../../codex/core/pixelbrain/character-foundry.js';

function buildJrpgSpec(overrides = {}) {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'test.jrpg.humanoid.v1',
    archetype: 'human',
    canvas: { width: 48, height: 80, gridSize: 1 },
    seed: 42,
    bytecode: 'VW-JRPG-HUMANOID-V1',
    presentation: {
      gender: 'androgynous',
      heightClass: 'average',
      buildClass: 'average',
    },
    directions: ['south', 'east', 'north', 'west'],
    materials: {
      skin: 'skin_medium',
      hair: 'hair_brown',
      eyes: 'eye_brown',
    },
    body: {
      profile: 'character.body.human.jrpg',
    },
    ...overrides,
  };
}

describe('tall JRPG humanoid profile', () => {
  it('uses the tall figure box and exposes animation-ready joints', () => {
    const character = forgeCharacter(buildJrpgSpec());
    const skeleton = character.construction.south;
    const bodyBase = character.silhouette.south.anchors.get('body');
    const height = bodyBase.y - skeleton.head.top.y;
    const headHeight = skeleton.head.chin.y - skeleton.head.top.y;

    expect(character.canvas).toMatchObject({ width: 48, height: 80 });
    expect(height).toBeGreaterThanOrEqual(70);
    expect(headHeight / height).toBeLessThan(0.3);
    expect(skeleton.torso.shoulderL.x).toBeLessThan(skeleton.torso.shoulderR.x);
    expect(skeleton.legs.kneeL.y).toBeLessThan(skeleton.legs.ankleL.y);
    expect(skeleton.legs.kneeR.y).toBeLessThan(skeleton.legs.ankleR.y);
  });

  it('renders four distinct directional pixel-art views without changing the canon', () => {
    const character = forgeCharacter(buildJrpgSpec());

    expect(Object.keys(character.sprites)).toEqual(['south', 'east', 'north', 'west']);
    expect(character.spritesheet).toBeInstanceOf(Uint8Array);
    for (const direction of Object.keys(character.sprites)) {
      expect(character.fills[direction].coordinates.length).toBeGreaterThan(150);
      expect(character.diagnostics.paletteSizes[direction]).toBeLessThanOrEqual(32);
    }
  });

  it('supports tall and short variants without changing the profile identity', () => {
    const average = forgeCharacter(buildJrpgSpec());
    const tall = forgeCharacter(buildJrpgSpec({
      id: 'test.jrpg.humanoid.tall.v1',
      presentation: { gender: 'androgynous', heightClass: 'tall', buildClass: 'average' },
    }));
    const short = forgeCharacter(buildJrpgSpec({
      id: 'test.jrpg.humanoid.short.v1',
      presentation: { gender: 'androgynous', heightClass: 'short', buildClass: 'average' },
    }));

    expect(tall.silhouette.south.cells).not.toEqual(average.silhouette.south.cells);
    expect(short.silhouette.south.cells).not.toEqual(average.silhouette.south.cells);
    expect(tall.spec.body.profile).toBe('character.body.human.jrpg');
    expect(short.spec.body.profile).toBe('character.body.human.jrpg');
  });

  it('centers legacy clothing layers on the tall body canvas', () => {
    const character = forgeCharacter(buildJrpgSpec({
      clothing: [
        { id: 'top', profile: 'character.clothing.top.starboundJacket' },
      ],
    }));
    const topCells = character.silhouette.south.cells.filter((cell) => (
      character.silhouette.south.partOf.get(`${cell.x},${cell.y}`) === 'top'
    ));
    const minX = Math.min(...topCells.map(cell => cell.x));
    const maxX = Math.max(...topCells.map(cell => cell.x));

    expect(Math.round((minX + maxX) / 2)).toBe(24);
    expect(maxX - minX + 1).toBeGreaterThan(12);
  });

  it('defaults JRPG humanoids to the production tall canvas', () => {
    const spec = buildJrpgSpec();
    delete spec.canvas;

    const character = forgeCharacter(spec);

    expect(character.canvas).toMatchObject({ width: 48, height: 80 });
  });
});
