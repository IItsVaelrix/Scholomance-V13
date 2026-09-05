/**
 * shield-volume-amp.js
 * Template pre-processor: Owns curved face shading, center plane, side shadows, and rim cast shadows.
 */

export function applyShieldVolumeTemplate(template, silhouette, spec) {
  if (spec.class !== 'armor' || spec.archetype !== 'kite_shield') return template;

  const updatedCoords = [...template.coordinates];
  const coordMap = new Map();
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  const faceIdxs = [];

  updatedCoords.forEach((c, idx) => {
    coordMap.set(`${c.x},${c.y}`, idx);
    const partId = silhouette.partOf.get(`${c.x},${c.y}`);
    if (partId === 'face' || partId === 'inner_face') {
      faceIdxs.push(idx);
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
  });

  if (faceIdxs.length === 0) return template;

  const cx = (minX + maxX) / 2;
  const height = Math.max(1, maxY - minY);
  const maxDx = Math.max(1, (maxX - minX) / 2);

  const rimCastSet = new Set();
  faceIdxs.forEach(idx => {
    const c = updatedCoords[idx];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nk = `${c.x + dx},${c.y + dy}`;
      const nPartId = silhouette.partOf.get(nk);
      if (nPartId === 'rim' || nPartId === 'trim') {
        rimCastSet.add(idx);
        // Add a deeper 2-pixel cast shadow on the top and left to respect directional light
        if (dx === -1 || dy === -1) {
          const nnk = `${c.x - dx},${c.y - dy}`;
          const nnIdx = coordMap.get(nnk);
          if (nnIdx !== undefined && silhouette.partOf.get(nnk) === 'face') rimCastSet.add(nnIdx);
        }
      }
    }
  });

  faceIdxs.forEach(idx => {
    const c = updatedCoords[idx];
    const dx = Math.abs(c.x - cx);
    const xRatio = dx / maxDx;
    const yRatio = (c.y - minY) / height;

    let slotMod = 0;

    // Curved face shading (darker side panels, brighter center plane)
    if (xRatio > 0.7) slotMod -= 2;
    else if (xRatio > 0.4) slotMod -= 1;
    else slotMod += 1;

    // Bottom shadow
    if (yRatio > 0.8) slotMod -= 2;
    else if (yRatio > 0.6) slotMod -= 1;

    // Top highlight
    if (yRatio < 0.15) slotMod += 1;

    // Rim cast shadow
    if (rimCastSet.has(idx)) slotMod -= 2;

    // Apply volumetric normal bending
    let nx = c.nx || 0;
    let ny = c.ny || 0;
    if (c.x < cx) nx -= 0.5;
    if (c.x > cx) nx += 0.5;
    if (yRatio > 0.8) ny += 0.5;
    if (yRatio < 0.2) ny -= 0.5;

    updatedCoords[idx] = { ...c, slot: Math.max(0, c.slot + slotMod), nx, ny };
  });

  return { ...template, coordinates: updatedCoords };
}
