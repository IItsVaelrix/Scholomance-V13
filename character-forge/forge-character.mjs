/**
 * Character forge orchestrator.
 *
 * Usage:
 *   node character-forge/forge-character.mjs         # builds the demo Battle Poet
 *   import { forgeAndRender } from './forge-character.mjs'  # build your own
 *
 * Pipeline: skeleton parts → composite proposal → forgeCharacterFromWandVector →
 * CHARACTER-SPEC-v1 JSON + fills PNG (the correct render layer).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { forgeCharacterFromWandVector } from '../codex/core/pixelbrain/character-foundry.js';
import { renderFills } from './render-fills.mjs';
import * as S from './skeleton.mjs';

export async function forgeAndRender({ id, displayName, material = 'void', materials, canvas = { width: 96, height: 96 }, buildParts }) {
  const sk = S.skeleton(canvas.width, canvas.height);
  const children = buildParts(sk, S);
  const proposedFormula = S.composeCharacter(`character.chibi.${id}`, material, children);

  const model = forgeCharacterFromWandVector(proposedFormula, { canvas, materials });

  const outDir = `generated-assets/${id}`;
  mkdirSync(outDir, { recursive: true });

  const spec = {
    contract: 'CHARACTER-SPEC-v1', id, displayName, canvas, materials,
    vectorWand: { rationale: `${displayName} chibi on the fixed skeleton rig.`, confidence: 0.9, reviewRequired: false, proposedFormula },
    vectorPaths: model.vectorPaths,
    diagnostics: model.diagnostics,
  };
  writeFileSync(`${outDir}/${id}.chibi.json`, JSON.stringify(spec, null, 2));

  const { pngPath } = await renderFills(model, `${outDir}/${id}.chibi`);
  console.log(`[${id}] roles=${model.diagnostics.roles.length} cells=${model.diagnostics.cellCount} → ${pngPath || outDir}`);
  return { model, spec, outDir };
}

// ── Demo character: Battle Poet ─────────────────────────────────────────────────
// ORDER IS FRONT-TO-BACK. The foundry shares one `seen` set across roles, so the FIRST
// part to claim a pixel wins — later parts are skipped there. List frontmost parts first:
// face details (eyes, hair) before the head, head before the robe, robe before the arms
// it tucks over, arms before the staff behind them.
export function battlePoetParts(sk, S) {
  return [
    S.sigilRing(sk.handXY[1][0] + 4, sk.crownY + 4, 5),
    S.eye(sk, 'left'),
    S.eye(sk, 'right'),
    S.nose(sk),
    S.mouth(sk),
    S.hair(sk, { teeth: 5 }),
    S.head(sk),
    S.robe(sk),
    S.limb([sk.shoulderX[0], sk.shoulderY], sk.handXY[0], { role: 'leftArm', baseWidth: 5 }),
    S.limb([sk.shoulderX[1], sk.shoulderY], sk.handXY[1], { role: 'rightArm', baseWidth: 5 }),
    S.staff(sk, { side: 1 }),
  ];
}

// Run directly → build the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  await forgeAndRender({
    id: 'BPoet1',
    displayName: 'BPoet1',
    material: 'void',
    materials: { skin: 'skin_light', hair: 'hair_void', eyes: 'eye_void_glow' },
    canvas: { width: 96, height: 96 },
    buildParts: battlePoetParts,
  });
}
