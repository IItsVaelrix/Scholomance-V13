import { describe, it, expect } from 'vitest';
import { forgeCharacter, forgeCharacterFromWandVector } from '../../../codex/core/pixelbrain/character-foundry.js';

function buildWandSpec(directions) {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'forge.wand.test.v1',
    archetype: 'human',
    canvas: { width: 32, height: 48 },
    seed: 7,
    bytecode: 'VW-WAND-TEST-V1',
    presentation: { gender: 'androgynous', heightClass: 'average', buildClass: 'average' },
    directions,
    body: { profile: 'character.body.human.androgynous' },
    materials: { skin: 'skin_light', hair: 'hair_brown', eyes: 'eye_brown' },
    vectorWand: {
      coordinateFormula: {
        type: 'composite',
        children: [
          {
            role: 'body',
            anchor: { x: 0.5, y: 0.5 },
            size: { w: 0.6, h: 0.8 },
            formula: {
              type: 'edge_trace',
              tracePath: [
                { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
              ],
            },
          },
        ],
      },
    },
  };
}

describe('[PixelBrain] Wand vector character route', () => {
  it('respects spec.directions instead of forcing south only', () => {
    const character = forgeCharacter(buildWandSpec(['south', 'east']));
    expect(character.vectorSource).toBe('wand');
    expect(Object.keys(character.sprites)).toEqual(['south', 'east']);
  });

  it('produces the full export chain (sprites/spritesheet/phaser/godot/pixelLotusActor)', () => {
    const character = forgeCharacterFromWandVector(
      buildWandSpec(['south', 'east', 'north', 'west']).vectorWand,
      buildWandSpec(['south', 'east', 'north', 'west']),
      {},
    );
    expect(character.sprites).toBeDefined();
    expect(character.spritesheet).toBeDefined();
    expect(character.phaserPipeline).toBeDefined();
    expect(character.godotScene).toBeDefined();
    expect(character.pixelLotusActor).toBeDefined();
    expect(character.assetPacket).toBeDefined();
  });
});
