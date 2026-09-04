import { getPartProfile } from './part-profile-library.js';
import { createCharacterSkeleton } from './character-construction-skeleton.js';

export function composeCharacterSilhouette(spec, { direction = 'south' } = {}) {
  const canvas = spec.canvas || { width: 32, height: 48 };
  const cells = [];
  const partOf = new Map();
  const colorOf = new Map();
  const seen = new Set();
  const partReports = [];
  const anchors = new Map();

  let bodyResult = null;
  let bodyAnchors = {};

  // Layer 0: Body base
  const bodyPart = spec.body;
  if (bodyPart && bodyPart.profile) {
    try {
      const profileFn = getPartProfile(bodyPart.profile);
      const params = { ...(bodyPart.params || {}), heightClass: spec.presentation?.heightClass, buildClass: spec.presentation?.buildClass };
      bodyResult = profileFn(params, { canvas, direction, width: canvas.width, height: canvas.height });
      bodyAnchors = bodyResult.anchors || {};

      for (const c of bodyResult.cells) {
        if (c.x < 0 || c.x >= canvas.width || c.y < 0 || c.y >= canvas.height) continue;
        const key = `${c.x},${c.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ x: c.x, y: c.y });
        }
        partOf.set(key, 'body');
      }

      for (const [name, point] of Object.entries(bodyAnchors)) {
        anchors.set(`body::${name}`, point);
        if (name === 'base') anchors.set('body', point);
      }

      partReports.push({
        id: 'body',
        profile: bodyPart.profile,
        aabb: computeAABB(bodyResult.cells),
      });
    } catch (e) {
      throw new Error(`character-silhouette-composer: body profile "${bodyPart.profile}" failed: ${e.message}`);
    }
  }

  const skeleton = createCharacterSkeleton(bodyResult, direction);

  // Layer 1: Face features
  if (Array.isArray(spec.face) && direction !== 'north') {
    for (const facePart of spec.face) {
      if (!facePart.profile) continue;

      const isEastWest = direction === 'east' || direction === 'west';
      if (isEastWest) {
        if (facePart.id === 'leftEye' && direction === 'east') continue;
        if (facePart.id === 'rightEye' && direction === 'west') continue;
      }

      let anchorPoint = null;
      if (facePart.attach && skeleton) {
        const at = facePart.attach.at || '';
        const parts = at.split('.');
        if (parts.length === 2) {
          const region = skeleton[parts[0]];
          if (region) {
            const p = region[parts[1]];
            if (p) anchorPoint = p;
          }
        }
      }
      if (!anchorPoint) continue;

      try {
        const profileFn = getPartProfile(facePart.profile);
        const side = facePart.id === 'leftEye' || facePart.id === 'leftEar' ? 'left'
          : facePart.id === 'rightEye' || facePart.id === 'rightEar' ? 'right'
            : 'center';

        const result = profileFn(facePart.params || {}, { canvas, side, direction });

        for (const c of result.cells) {
          const gx = c.x + anchorPoint.x;
          const gy = c.y + anchorPoint.y;
          if (gx < 0 || gx >= canvas.width || gy < 0 || gy >= canvas.height) continue;
          const key = `${gx},${gy}`;
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ x: gx, y: gy });
          }
          partOf.set(key, facePart.id);
          if (c.color) colorOf.set(key, c.color);
        }

        partReports.push({
          id: facePart.id,
          profile: facePart.profile,
          aabb: computeAABB(result.cells.map(c => ({ x: c.x + anchorPoint.x, y: c.y + anchorPoint.y }))),
        });
      } catch (e) {
        throw new Error(`character-silhouette-composer: face profile "${facePart.profile}" failed: ${e.message}`);
      }
    }
  }

  // Layer 2: Hair
  if (spec.hair && spec.hair.profile) {
    try {
      const profileFn = getPartProfile(spec.hair.profile);
      const headTopAnchor = skeleton?.head?.top || (bodyAnchors.headTop || bodyAnchors.tip || { x: 16, y: 2 });

      const result = profileFn({
        ...(spec.hair.params || {}),
        cx: headTopAnchor.x,
        topY: headTopAnchor.y,
        headHalfW: 5,
        tailLength: spec.hair.params?.tailLength || 6,
        volume: spec.hair.params?.volume || 0.5,
      }, { canvas, direction });

      for (const c of result.cells) {
        if (c.x < 0 || c.x >= canvas.width || c.y < 0 || c.y >= canvas.height) continue;
        const key = `${c.x},${c.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ x: c.x, y: c.y });
        }
        partOf.set(key, 'hair');
        if (c.color) colorOf.set(key, c.color);
      }

      partReports.push({
        id: 'hair',
        profile: spec.hair.profile,
        aabb: computeAABB(result.cells),
      });
    } catch (e) {
      throw new Error(`character-silhouette-composer: hair profile "${spec.hair.profile}" failed: ${e.message}`);
    }
  }

  // Layer 3-5: Clothing
  if (Array.isArray(spec.clothing)) {
    const bodyAnchorsMap = bodyAnchors || {};
    const centerX = Math.round(canvas.width / 2);
    const shoulderY = bodyAnchorsMap.shoulderL?.y || 12;
    const waistY = bodyAnchorsMap.waist?.y || 24;
    const legBot = bodyAnchorsMap.ankleL?.y || 40;
    const footBot = bodyAnchorsMap.ankleL ? bodyAnchorsMap.ankleL.y + 3 : 44;
    const shoulderHalfW = bodyAnchorsMap.shoulderL && bodyAnchorsMap.shoulderR
      ? Math.max(1, Math.round((bodyAnchorsMap.shoulderR.x - bodyAnchorsMap.shoulderL.x) / 2))
      : 7;
    const legGap = 2;
    const legHalfW = 2;

    for (const clothingPart of spec.clothing) {
      if (!clothingPart.profile) continue;

      try {
        const profileFn = getPartProfile(clothingPart.profile);
        const result = profileFn({
          cx: centerX,
          shoulderY,
          waistY,
          legBot,
          footBot,
          shoulderHalfW,
          legGap,
          legHalfW,
          ...(clothingPart.params || {}),
        }, { canvas, direction });

        for (const c of result.cells) {
          if (c.x < 0 || c.x >= canvas.width || c.y < 0 || c.y >= canvas.height) continue;
          const key = `${c.x},${c.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ x: c.x, y: c.y });
          }
          partOf.set(key, clothingPart.id);
          if (c.color) colorOf.set(key, c.color);
        }

        partReports.push({
          id: clothingPart.id,
          profile: clothingPart.profile,
          aabb: computeAABB(result.cells),
        });
      } catch (e) {
        throw new Error(`character-silhouette-composer: clothing profile "${clothingPart.profile}" failed: ${e.message}`);
      }
    }
  }

  function applyProfileLayer(parts, layerName) {
    if (!Array.isArray(parts)) return;
    for (const part of parts) {
      if (!part.profile) continue;
      try {
        const profileFn = getPartProfile(part.profile);
        const result = profileFn({
          cx: Math.round(canvas.width / 2),
          cy: 16,
          shoulderY: bodyAnchors.shoulderL?.y || 12,
          waistY: bodyAnchors.waist?.y || 24,
          hemY: (bodyAnchors.ankleL?.y || 40) - 5,
          topY: skeleton?.head?.top?.y || bodyAnchors.headTop?.y || 2,
          ...(part.params || {}),
        }, { canvas, direction, skeleton, bodyAnchors });

        for (const c of result.cells || []) {
          if (c.x < 0 || c.x >= canvas.width || c.y < 0 || c.y >= canvas.height) continue;
          const key = `${c.x},${c.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            cells.push({ x: c.x, y: c.y });
          }
          partOf.set(key, part.id);
          if (c.color) colorOf.set(key, c.color);
        }

        partReports.push({
          id: part.id,
          profile: part.profile,
          layer: layerName,
          aabb: computeAABB(result.cells),
        });
      } catch (e) {
        throw new Error(`character-silhouette-composer: ${layerName} profile "${part.profile}" failed: ${e.message}`);
      }
    }
  }

  // Layer 6: Accessories and layer 7: detail overlays. These may overwrite
  // part ownership for existing occupied cells so SVG classes can animate them.
  applyProfileLayer(spec.accessories, 'accessory');
  applyProfileLayer(spec.details, 'detail');

  return Object.freeze({
    cells: Object.freeze(cells),
    partOf,
    colorOf,
    anchors,
    skeleton,
    parts: Object.freeze(partReports),
    direction,
  });
}

function computeAABB(cells) {
  if (!cells || cells.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
