/**
 * Scholo-Chibi Face Profiles
 * Square Enix style chibi faces warped with Scholomance aesthetics.
 * Large expressive eyes, specular shine, tiny mouths, arcane sigils.
 */
import { registerPartProfile } from './part-profile-library.js';

const roundInt = (n) => Math.round(Number(n) || 0);

registerPartProfile('scholo-chibi.eye.large', (params = {}, options = {}) => {
  const isLeft = String(options.side || 'left') === 'left';
  const cx = roundInt(params.cx ?? (isLeft ? -3 : 3));
  const cy = roundInt(params.cy ?? -1);
  const iris = params.iris || '#4A90E2';
  const sclera = params.sclera || '#F8F4E8';
  const shine = params.shine || '#FFFFFF';
  const cells = [];

  for (let dx = -2; dx <= 1; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      if (Math.abs(dx) + Math.abs(dy) < 3) {
        cells.push({ x: cx + dx, y: cy + dy, color: sclera });
      }
    }
  }

  cells.push({ x: cx - 1, y: cy, color: iris });
  cells.push({ x: cx, y: cy, color: iris });
  cells.push({ x: cx - 1, y: cy + 1, color: iris });
  cells.push({ x: cx, y: cy + 1, color: iris });
  cells.push({ x: cx, y: cy - 1, color: shine });
  cells.push({ x: cx + 1, y: cy, color: shine });

  return {
    cells,
    anchors: { base: { x: cx, y: cy }, center: { x: cx - 0.5, y: cy + 0.5 } },
  };
});

registerPartProfile('scholo-chibi.eye.void', (params = {}, options = {}) => {
  const base = registerPartProfile.get('scholo-chibi.eye.large')(params, options);
  const voidColor = '#3A2A6E';
  base.cells = base.cells.map(cell =>
    cell.color && cell.color !== '#FFFFFF' ? { ...cell, color: voidColor } : cell
  );
  return base;
});

registerPartProfile('scholo-chibi.eye.crystal', (params = {}, options = {}) => {
  const base = registerPartProfile.get('scholo-chibi.eye.large')(params, options);
  const crystal = params.crystal || '#A8E6FF';
  base.cells = base.cells.map(cell =>
    cell.color && ['#4A90E2', '#3A2A6E'].includes(cell.color) ? { ...cell, color: crystal } : cell
  );
  return base;
});

registerPartProfile('scholo-chibi.mouth.tiny', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 4);
  return {
    cells: [{ x: cx, y: cy, color: '#3A2A2A' }],
    anchors: { base: { x: cx, y: cy } },
  };
});

registerPartProfile('scholo-chibi.blush.arcane', (params = {}, options = {}) => {
  const isLeft = String(options.side || 'left') === 'left';
  const cx = roundInt(params.cx ?? (isLeft ? -4 : 4));
  const cy = roundInt(params.cy ?? 2);
  const glow = params.glow || '#FF9ED2';
  return {
    cells: [
      { x: cx - 1, y: cy, color: glow, alpha: 0.6 },
      { x: cx, y: cy, color: glow, alpha: 0.6 },
    ],
    anchors: { base: { x: cx, y: cy } },
  };
});

export const SCHOLO_CHIBI_FACE_PROFILES = [
  'scholo-chibi.eye.large',
  'scholo-chibi.eye.void',
  'scholo-chibi.eye.crystal',
  'scholo-chibi.mouth.tiny',
  'scholo-chibi.blush.arcane',
];
