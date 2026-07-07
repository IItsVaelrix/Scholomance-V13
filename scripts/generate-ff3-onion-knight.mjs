#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forgeCharacter } from '../codex/core/pixelbrain/character-foundry.js';
import {
  exportFoundryToAsepriteBinary,
} from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';

const OUT_DIR = resolve('output/foundry/ff3-onion-knight');
const DIRECTIONS = ['south', 'east', 'north', 'west'];
const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;

function buildSpec() {
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: 'ff3.onion.knight.classic.v1',
    class: 'character',
    archetype: 'human',
    canvas: { width: FRAME_WIDTH, height: FRAME_HEIGHT, gridSize: 1 },
    seed: 0xFF3C,
    bytecode: 'VW-FF3-ONION-KNIGHT-CLASSIC',
    presentation: {
      gender: 'androgynous',
      heightClass: 'average',
      buildClass: 'average',
    },
    directions: DIRECTIONS,
    materials: {
      skin: 'skin_apricot_signal',
      hair: 'hair_brown',
      eyes: 'eye_brown',
    },
    body: {
      profile: 'character.body.human.androgynous',
      params: { compact: 0.95 },
    },
    face: [
      { id: 'leftEye',  profile: 'character.face.eye.humanSoft',  params: { iris: 'eye_brown' }, attach: { parent: 'body', at: 'face.eyeLeft' } },
      { id: 'rightEye', profile: 'character.face.eye.humanSoft',  params: { iris: 'eye_brown' }, attach: { parent: 'body', at: 'face.eyeRight' } },
      { id: 'nose',     profile: 'character.face.nose.small',     attach: { parent: 'body', at: 'face.nose' } },
      { id: 'mouth',    profile: 'character.face.mouth.humanSoft', attach: { parent: 'body', at: 'face.mouth' } },
    ],
    hair: {
      profile: 'character.hair.short',
      params: { color: 'hair_brown' },
      attach: { parent: 'body', at: 'headTop' },
    },
    clothing: [
      { id: 'top',    profile: 'character.clothing.top.beginnerTunic', params: { color: 'cloth_green', trim: 'trim_leather' } },
      { id: 'bottom', profile: 'character.clothing.bottom.beginnerPants', params: { color: 'cloth_brown' } },
      { id: 'shoes',  profile: 'character.clothing.shoes.beginnerBoots', params: { color: 'leather_brown' } },
    ],
    accessories: [
      { id: 'helmet', profile: 'character.accessory.starVisor', params: { color: 'metal_iron', trim: 'trim_leather' } },
    ],
    details: [
      { id: 'belt', profile: 'character.detail.hairShine', params: { color: 'trim_leather' } },
    ],
  };
}

function buildSheetCoordinates(character) {
  const coordinates = [];
  DIRECTIONS.forEach((direction, frameIndex) => {
    const xOffset = frameIndex * FRAME_WIDTH;
    const fills = character.fills?.[direction] || character;
    const coords = fills.coordinates || fills.cells || [];
    for (const coord of coords) {
      coordinates.push({
        ...coord,
        x: (coord.x || coord[0] || 0) + xOffset,
        y: coord.y || coord[1] || 0,
        sourceX: coord.x || coord[0] || 0,
        sourceY: coord.y || coord[1] || 0,
        direction,
        partId: coord.partId || coord[3] || 'body',
        slot: direction,
        source: 'pixelbrain-ff3',
      });
    }
  });
  return coordinates;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const spec = buildSpec();
  console.log('Forging FF3-style Onion Knight sprite...');
  const character = forgeCharacter(spec);
  const coordinates = buildSheetCoordinates(character);

  const foundryBundle = {
    spec: {
      ...spec,
      id: `${spec.id}.aseprite-sheet`,
      canvas: { width: FRAME_WIDTH * DIRECTIONS.length, height: FRAME_HEIGHT, gridSize: 1 },
      directions: ['sheet'],
      hash: character.specHash || 'ff3-classic',
    },
    canvas: { width: FRAME_WIDTH * DIRECTIONS.length, height: FRAME_HEIGHT, gridSize: 1 },
    coordinates,
  };

  const asepriteBinary = exportFoundryToAsepriteBinary(foundryBundle, { 
    id: foundryBundle.spec.id, 
    layerBy: 'part', 
    duration: 100 
  });

  const baseName = 'ff3-onion-knight';
  writeFileSync(resolve(OUT_DIR, `${baseName}.aseprite`), asepriteBinary);
  writeFileSync(resolve(OUT_DIR, `${baseName}.spec.json`), JSON.stringify(spec, null, 2) + '\n');
  
  // Try to save spritesheet if available
  if (character.spritesheet) {
    writeFileSync(resolve(OUT_DIR, `${baseName}.spritesheet.png`), character.spritesheet);
  }

  console.log(JSON.stringify({
    outDir: OUT_DIR,
    file: `${baseName}.aseprite`,
    specHash: character.specHash || 'generated',
    diagnostics: character.diagnostics || { message: 'FF3 classic sprite forged' },
    note: 'Brand new sprite in classic Final Fantasy 3 (NES/early pixel) style using PixelBrain human body + tunic + helmet.',
  }, null, 2));
}

main();
