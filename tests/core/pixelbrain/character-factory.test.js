import { describe, it, expect } from 'vitest';
import { forgeCharacter } from '../../../codex/core/pixelbrain/character-foundry.js';
import {
  buildCharacterRouteDefinition,
  validateCharacterDirection,
  stampCharacterCellOwnership,
  characterPartIds,
} from '../../../codex/core/pixelbrain/character-factory.js';
import { validateRequiredOutputs } from '../../../codex/core/pixelbrain/seam-contract.js';

function buildScholarSpec() {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'scholar.human.female.v1',
    class: 'character',
    archetype: 'human',
    canvas: { width: 32, height: 48, gridSize: 1 },
    seed: 604782,
    bytecode: 'VW-SCHOLAR-COMMON-RESONANT',
    presentation: { gender: 'feminine', heightClass: 'average', buildClass: 'slender' },
    directions: ['south', 'east', 'north', 'west'],
    materials: { skin: 'skin_light', hair: 'hair_brown', eyes: 'eye_brown' },
    body: {
      profile: 'character.body.human.feminine',
      params: { heightClass: 'average', buildClass: 'slender' },
    },
    face: [
      { id: 'leftEye', profile: 'character.face.eye.almond', attach: { parent: 'body', at: 'face.eyeLeft' } },
      { id: 'rightEye', profile: 'character.face.eye.almond', attach: { parent: 'body', at: 'face.eyeRight' } },
      { id: 'nose', profile: 'character.face.nose.small', attach: { parent: 'body', at: 'face.nose' } },
      { id: 'mouth', profile: 'character.face.mouth.small', attach: { parent: 'body', at: 'face.mouth' } },
    ],
    hair: {
      profile: 'character.hair.longStraight',
      params: { color: 'hair_brown' },
      attach: { parent: 'body', at: 'headTop' },
    },
    clothing: [
      { id: 'bottom', profile: 'character.clothing.bottom.beginnerSkirt' },
      { id: 'top', profile: 'character.clothing.top.beginnerRobe' },
      { id: 'shoes', profile: 'character.clothing.shoes.beginnerBoots' },
    ],
  };
}

describe('character-factory: seam-contract route for the compose pipeline', () => {
  it('buildCharacterRouteDefinition requires every declared part to stamp cells', () => {
    const character = forgeCharacter(buildScholarSpec());
    const route = buildCharacterRouteDefinition(character.spec, 'south');

    expect(route.name).toBe('character.compose.v1');
    const selectors = route.requiredOutputs.map((r) => r.selector);
    // Body always required; declared face/hair/clothing parts too.
    expect(selectors).toContain('body');
    expect(selectors).toContain('hair');
    expect(selectors).toContain('top');
    expect(selectors).toContain('leftEye');
    for (const req of route.requiredOutputs) {
      expect(req.kind).toBe('partCells');
      expect(req.fatal).toBe(true);
    }
  });

  it('characterPartIds is direction-aware: face features drop out facing north', () => {
    const character = forgeCharacter(buildScholarSpec());
    const south = characterPartIds(character.spec, 'south');
    const north = characterPartIds(character.spec, 'north');

    expect(south).toContain('leftEye');
    expect(north).not.toContain('leftEye');
    // Body + hair + clothing render in every direction.
    for (const id of ['body', 'hair', 'top']) {
      expect(south).toContain(id);
      expect(north).toContain(id);
    }
  });

  it('a valid character forges with a passing route diagnostic on every direction', () => {
    const character = forgeCharacter(buildScholarSpec());
    const route = character.diagnostics.route;

    expect(route).toBeTruthy();
    expect(route.route).toBe('character.compose.v1');
    expect(route.ok).toBe(true);
    expect(route.failures).toEqual([]);
    // Every rendered direction validated and passed.
    for (const dir of character.diagnostics.directions) {
      expect(route.directions[dir].ok).toBe(true);
    }
  });

  it('validateCharacterDirection passes against a real direction lattice', () => {
    const character = forgeCharacter(buildScholarSpec());
    const route = buildCharacterRouteDefinition(character.spec, 'south');
    const southFills = character.fills.south.coordinates;

    const diag = validateCharacterDirection(route, character.spec, southFills);
    expect(diag.ok).toBe(true);
    expect(diag.failures).toEqual([]);
    // The body part actually stamped cells (the contract is not vacuously passing).
    const bodyCells = southFills.filter((c) => c.partId === 'body').length;
    expect(bodyCells).toBeGreaterThan(0);
  });

  it('fails loud when a required part stamps no cells', () => {
    const character = forgeCharacter(buildScholarSpec());
    const route = buildCharacterRouteDefinition(character.spec, 'south');

    // A lattice with cells but none owned by 'body' must trip the contract.
    const diag = validateCharacterDirection(route, character.spec, [
      { x: 1, y: 1, partId: 'hair' },
      { x: 2, y: 2, partId: 'top' },
    ]);
    expect(diag.ok).toBe(false);
    const bodyFailure = diag.failures.find((f) => f.selector === 'body');
    expect(bodyFailure).toBeTruthy();
    expect(bodyFailure.code).toBe('PB_ROUTE_REQUIRED_OUTPUT_EMPTY');
  });

  it('stampCharacterCellOwnership aligns bare composer cells to the validator dialect', () => {
    const partOf = new Map([['3,4', 'hair'], ['5,6', 'top']]);
    const stamped = stampCharacterCellOwnership(
      [{ x: 3, y: 4 }, { x: 5, y: 6 }, { x: 9, y: 9 }],
      partOf
    );
    expect(stamped).toEqual([
      { x: 3, y: 4, partId: 'hair' },
      { x: 5, y: 6, partId: 'top' },
      { x: 9, y: 9, partId: 'body' }, // unowned defaults to body
    ]);

    // And the shared seam-contract validator can now count them by part.
    const diag = validateRequiredOutputs(
      [{ id: 'hair-cells', kind: 'partCells', selector: 'hair', minCells: 1, fatal: true }],
      { cells: stamped, parts: [{ id: 'hair' }] }
    );
    expect(diag.ok).toBe(true);
  });

  it('seam walk is clean: no PB_ROUTE_SEAM_VIOLATION for a full spec', () => {
    const character = forgeCharacter(buildScholarSpec());
    const route = buildCharacterRouteDefinition(character.spec, 'south');
    const diag = validateCharacterDirection(route, character.spec, character.fills.south.coordinates);
    expect(diag.failures.find((f) => f.code === 'PB_ROUTE_SEAM_VIOLATION')).toBeUndefined();
    expect(diag.failures.find((f) => f.code === 'PB_ROUTE_REQUIRED_OUTPUT_UNOWNED')).toBeUndefined();
  });
});
