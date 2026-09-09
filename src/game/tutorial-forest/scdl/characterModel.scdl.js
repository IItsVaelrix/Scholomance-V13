import { CHARACTER_CANVAS, sampleCharacterSkeleton } from './characterSkeleton.js';
import { composeFaceFeatures } from '../../../../codex/core/pixelbrain/character-face-composer.js';
import '../../../../codex/core/pixelbrain/character-face-profiles.js';
export const CHARACTER_PALETTE = Object.freeze({ ink: '#10141E', clothDeep: '#202337', cloth: '#343B59', clothLight: '#536384', clothEdge: '#8191AE', indigoDeep: '#24253F', indigo: '#414168', indigoLight: '#67658D', steelDeep: '#293441', steel: '#566475', steelLight: '#9DAFAE', skinDeep: '#623E35', skin: '#A16E54', skinLight: '#C99570', skinHigh: '#E3B78C', hair: '#27232A', hairLight: '#51434B', leather: '#352A2B', leatherLight: '#665048', goldDeep: '#766044', gold: '#B49B65', goldLight: '#DDCC92', energyDeep: '#22565B', energy: '#59AAA5', energyLight: '#C0E7D3' });
/** Shape sections resolve from named joint anchors, never from finished pixels. */
export function buildCharacterSource(options = {}) {
  const pose = sampleCharacterSkeleton(options); const j = pose.joints; const c = CHARACTER_PALETTE;
  const lines = ['SCDL 2', 'ASSET lotus_wanderer', `CANVAS WIDTH ${CHARACTER_CANVAS.width} HEIGHT ${CHARACTER_CANVAS.height}`, 'BUDGET INSTRUCTIONS 20000 GENERATED_SHAPES 500 RASTER_CELLS 65536 RECURSION_DEPTH 16'];
  let order = 0;
  const at = (joint, dx = 0, dy = 0) => ({ x: j[joint].x + dx, y: j[joint].y + dy });
  const polygon = (id, points, color, outline = false) => {
    lines.push(`SHAPE $${id} (PATH DATA "M ${points.map(p => `${Math.round(p.x)} ${Math.round(p.y)}`).join(' L ')} Z")`);
    if (outline) lines.push(`SHAPE $${id}__outline (OUTLINE $${id} WIDTH (PX 1))`);
    lines.push(`LAYER ${id} ORDER ${order++} { PAINT $${id} FILL ${color} RASTER CENTER ${outline ? `PAINT $${id}__outline FILL ${c.ink} RASTER CENTER` : ''} }`);
  };
  const shape = (id, joint, points, color, outline = false) => polygon(id, points.map(([dx, dy]) => at(joint, dx * pose.sign, dy)), color, outline);
  const segment = (id, a, b, topWidth, bottomWidth, color, highlight = null) => {
    const p = j[a]; const q = j[b]; const dx = q.x - p.x; const dy = q.y - p.y; const length = Math.hypot(dx, dy) || 1; const nx = dy / length; const ny = -dx / length;
    const edge = (point, width) => ({ x: point.x + nx * width, y: point.y + ny * width });
    polygon(id, [edge(p, -topWidth), edge(p, topWidth), edge(q, bottomWidth), edge(q, -bottomWidth)], color, true);
    if (highlight) polygon(`${id}_light`, [edge(p, -topWidth + 1), edge(p, -topWidth / 3), edge(q, -bottomWidth / 3), edge(q, -bottomWidth + 1)], highlight);
  };
  // Complete trousered pelvis, thighs, knees, calves and feet under the coat.
  for (const side of ['L', 'R']) {
    segment(`thigh_${side}`, `torso.hip${side}`, `legs.knee${side}`, 4.5, 3, side === 'L' ? c.cloth : c.clothDeep, side === 'L' ? c.clothLight : c.cloth);
    segment(`calf_${side}`, `legs.knee${side}`, `legs.ankle${side}`, 3, 2, c.leather, c.leatherLight);
    shape(`knee_${side}`, `legs.knee${side}`, [[-3,-3],[2,-3],[3,0],[1,4],[-2,3]], c.steelDeep, true);
    shape(`knee_rim_${side}`, `legs.knee${side}`, [[-2,-2],[2,-2],[1,0],[-2,0]], c.steel);
    shape(`boot_${side}`, `legs.ankle${side}`, [[-2,-5],[2,-5],[3,0],[5,2],[5,4],[-3,4],[-3,1]], c.leather, true);
    shape(`boot_toe_${side}`, `legs.ankle${side}`, [[-2,1],[2,0],[4,2],[4,3],[-2,3]], c.steel);
  }
  shape('pelvis', 'torso.pelvis', [[-8,-7],[8,-7],[9,0],[6,7],[1,6],[0,2],[-2,6],[-7,6],[-9,0]], c.clothDeep, true);
  // Coat tails leave central leg separation readable; fabric sways with gait inertia.
  const tailSway = pose.motion === 'walk' ? Math.sin(pose.phase * Math.PI * 2) * 2.0 : 0;
  shape('coat_far_tail', 'torso.pelvis', [[-9,-8],[0,-8],[-2 + tailSway,18],[-8 + tailSway,24],[-12 + tailSway,21]], c.indigoDeep, true);
  shape('coat_near_tail', 'torso.pelvis', [[1,-8],[9,-8],[12 + tailSway,21],[7 + tailSway,25],[3 + tailSway,19]], c.indigo, true);
  shape('tail_highlight', 'torso.pelvis', [[7,-5],[9,1],[10 + tailSway,19],[7 + tailSway,22],[7,9]], c.indigoLight);
  // Deltoid -> elbow -> wrist chains remain visibly connected beneath sleeves.
  for (const side of ['L', 'R']) {
    segment(`upper_arm_${side}`, `torso.shoulder${side}`, `arms.elbow${side}`, 4.5, 3, c.cloth, c.clothLight);
    segment(`forearm_${side}`, `arms.elbow${side}`, `arms.wrist${side}`, 3.2, 2, c.leather, c.leatherLight);
    shape(`cuff_${side}`, `arms.wrist${side}`, [[-3,-6],[2,-6],[3,-2],[-2,0]], c.steel, true);
    segment(`hand_${side}`, `arms.wrist${side}`, `hands.palm${side}`, 1.8, 2.1, c.skin, c.skinLight);
    shape(`fingers_${side}`, `hands.palm${side}`, [[-2,-1],[2,-1],[2,3],[1,5],[-2,4]], c.skin, true);
    shape(`thumb_${side}`, `hands.palm${side}`, [[-2,-2],[-3,0],[-2,2],[0,1]], c.skinLight);
  }
  polygon('torso', [at('neck.base',-3,-2), at('neck.base',3,-2), at('torso.shoulderR',2,-1), at('torso.sternum',10,0), at('torso.waist',7,0), at('torso.pelvis',8,-2), at('torso.pelvis',-8,-2), at('torso.waist',-7,0), at('torso.sternum',-10,0), at('torso.shoulderL',-2,-1)], c.indigo, true);
  shape('ribcage_light', 'torso.sternum', [[-7,-5],[-2,-7],[-1,9],[-5,10],[-8,2]], c.indigoLight);
  shape('ribcage_shadow', 'torso.sternum', [[3,-7],[9,-3],[8,5],[5,10],[2,9]], c.indigoDeep);
  shape('sternum_placket', 'torso.sternum', [[-2,-9],[2,-9],[2,17],[-2,17]], c.leather);
  shape('belt', 'torso.waist', [[-8,-1],[8,-1],[9,3],[-8,3]], c.leather, true);
  shape('buckle', 'torso.waist', [[-2,-1],[3,-1],[3,3],[-2,3]], c.gold);
  shape('buckle_inset', 'torso.waist', [[0,0],[2,0],[2,2],[0,2]], c.ink);
  shape('pouch', 'torso.pelvis', [[-10,-5],[-5,-4],[-5,5],[-10,6],[-12,2]], c.leatherLight, true);
  shape('pouch_clasp', 'torso.pelvis', [[-9,-3],[-7,-3],[-7,0],[-9,0]], c.gold);
  for (const side of ['L','R']) {
    shape(`pauldron_${side}`, `torso.shoulder${side}`, [[-4,-2],[1,-4],[5,-1],[6,5],[2,7],[-4,4]], side === 'L' ? c.steel : c.steelDeep, true);
    shape(`pauldron_edge_${side}`, `torso.shoulder${side}`, [[-3,-2],[1,-3],[4,-1],[3,0],[-3,0]], c.steelLight);
  }
  shape('neck', 'neck.base', [[-3,-6],[3,-6],[3,2],[0,5],[-3,2]], c.skinDeep, true);
  shape('collar', 'neck.base', [[-6,-1],[-3,0],[0,4],[3,0],[6,-1],[7,4],[2,9],[-1,7],[-6,5]], c.clothDeep, true);
  shape('collar_edge', 'neck.base', [[-6,0],[-3,2],[0,6],[-1,7],[-6,3]], c.gold);
  // Anatomical skull, jaw taper, ears, face plane, brow and a swept hair section.
  shape('skull', 'head.center', [[-4,-6],[3,-6],[5,-3],[5,2],[3,6],[0,7],[-3,5],[-5,1],[-5,-3]], pose.back ? c.hair : c.skin, true);
  if (!pose.back) {
    shape('temple_light', 'head.center', [[-3,-3],[0,-4],[1,0],[0,4],[-2,4],[-3,1]], c.skinLight);
    shape('jaw_shadow', 'head.center', [[2,1],[4,0],[3,4],[1,6],[-2,5],[0,4]], c.skinDeep);
    shape('ear', 'head.center', [[-5,0],[-6,0],[-6,3],[-4,4]], c.skinLight);
    // The existing face composer resolves profiles in a local face chart; translate
    // that chart to the head joint. Its 32x48 limit never clips the 64x112 body.
    const faceSkeleton = { face: {} };
    for (const [key, joint] of [['eyeLeft','face.eyeLeft'],['eyeRight','face.eyeRight'],['nose','face.nose'],['mouth','face.mouth']]) faceSkeleton.face[key] = { x: 12 + j[joint].x - j['head.center'].x, y: 12 + j[joint].y - j['head.center'].y };
    const face = composeFaceFeatures({ silhouette: { canvas: { width: 32, height: 48 } }, direction: pose.profile ? (pose.sign < 0 ? 'west' : 'east') : 'south', skeleton: faceSkeleton, spec: { face: [
      { id: 'leftEye', profile: 'character.face.eye.narrow', attach: { at: 'face.eyeLeft' }, params: { cx: 0 } },
      { id: 'rightEye', profile: 'character.face.eye.narrow', attach: { at: 'face.eyeRight' }, params: { cx: 0 } },
      { id: 'nose', profile: 'character.face.nose.small', attach: { at: 'face.nose' } },
    ] } });
    face.cells.forEach((cell, index) => { const point = { x: j['head.center'].x + cell.x - 12, y: j['head.center'].y + cell.y - 12 }; polygon(`face_${index}`, [point,{x:point.x+1,y:point.y},{x:point.x+1,y:point.y+1},{x:point.x,y:point.y+1}], face.partOf.get(`${cell.x},${cell.y}`) === 'nose' ? c.skinHigh : c.ink); });
    shape('mouth', 'face.mouth', [[-1,0],[1,0],[1,1],[-1,1]], c.skinDeep);
  }
  shape('hair_crown', 'head.center', [[-5,-4],[-3,-7],[1,-8],[5,-5],[5,-2],[2,-3],[-1,-4],[-4,-1],[-5,2]], c.hair, true);
  shape('hair_plane', 'head.center', [[-3,-5],[0,-7],[3,-5],[1,-5],[-2,-3]], c.hairLight);
  if (pose.back) shape('back_hair', 'head.center', [[-4,-2],[4,-2],[4,4],[1,6],[-3,4]], c.hairLight);
  // Staff is rigidly attached to the right grip. Distinct faceted lotus, no orb art.
  // An equipped weapon overlay replaces this signature staff, so skip drawing it here.
  if (!options.equipped?.weapon) {
    shape('staff', 'hands.palmR', [[1,-40],[3,-40],[3,48],[1,49]], c.leather, true);
    shape('staff_edge', 'hands.palmR', [[1,-37],[2,-37],[2,45],[1,45]], c.goldDeep);
    shape('staff_collar', 'hands.palmR', [[-1,-30],[5,-30],[5,-25],[-1,-25]], c.gold, true);
    shape('lotus_housing', 'hands.palmR', [[2,-44],[8,-37],[6,-31],[2,-27],[-4,-31],[-5,-37]], c.steelDeep, true);
    shape('lotus_left', 'hands.palmR', [[-4,-38],[1,-35],[2,-29],[-2,-31]], c.energy);
    shape('lotus_right', 'hands.palmR', [[7,-38],[3,-34],[2,-29],[6,-32]], c.energyDeep);
    shape('lotus_crystal', 'hands.palmR', [[2,-43],[5,-36],[2,-30],[-1,-36]], c.energy, true);
    shape('lotus_glint', 'hands.palmR', [[2,-41],[3,-36],[2,-33],[1,-36]], c.energyLight);
    shape('grip_fingers', 'hands.palmR', [[0,-2],[4,-2],[4,0],[1,1]], c.skinLight, true);
  }
  const core = at('torso.sternum', 0, -2);
  const wandProposal = { name: 'lotus_wanderer_signature', role: 'sigil_stroke', coordinateFormula: { type: 'edge_trace', step: 1, tracePath: [{x:core.x,y:core.y-2},{x:core.x+2,y:core.y},{x:core.x,y:core.y+3},{x:core.x-2,y:core.y},{x:core.x,y:core.y-2}] } };
  return { source: lines.join('\n'), wandProposal, pose };
}
export const LOTUS_WANDERER_SCDL_V2 = buildCharacterSource().source;
