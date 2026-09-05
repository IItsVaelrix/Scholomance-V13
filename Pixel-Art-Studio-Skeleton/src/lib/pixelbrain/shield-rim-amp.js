/**
 * shield-rim-amp.js
 * Template pre-processor: Owns outer border, gold/bronze frame, rim thickness, corner highlights, bottom shadow.
 */

export function applyShieldRimTemplate(template, silhouette, spec) {
  if (spec.class !== 'armor' || spec.archetype !== 'kite_shield') return template;
  
  const rimPart = spec.parts.find(p => p.id === 'rim' || p.id === 'trim');
  if (!rimPart) return template;

  const updatedCoords = [...template.coordinates];
  const coordMap = new Map();
  let minY = Infinity, maxY = -Infinity;
  
  updatedCoords.forEach((c, idx) => {
    coordMap.set(`${c.x},${c.y}`, idx);
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  });

  const rimThickness = rimPart.params?.thickness || 2;
  
  // Erode the face to generate the rim programmatically
  for (let t = 0; t < rimThickness; t++) {
    const rimIdxs = [];
    updatedCoords.forEach((c, idx) => {
      const partId = silhouette.partOf.get(`${c.x},${c.y}`);
      if (partId === 'face' || partId === 'inner_face') {
        let isEdge = false;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nk = `${c.x + dx},${c.y + dy}`;
          const nPartId = silhouette.partOf.get(nk);
          if (!nPartId || nPartId === rimPart.id) {
            isEdge = true;
          }
        }
        if (isEdge) rimIdxs.push(idx);
      }
    });

    rimIdxs.forEach(idx => {
      const c = updatedCoords[idx];
      silhouette.partOf.set(`${c.x},${c.y}`, rimPart.id);
      
      let slotMod = 0;
      
      // Top-left corner highlight
      if (c.nx < -0.3 && c.ny < -0.3) slotMod += 2;
      // Bottom-right shadow
      else if (c.nx > 0.3 && c.ny > 0.3) slotMod -= 1;
      
      // Inner rim edge shadow (only on the innermost layer of the rim)
      if (t === 0) slotMod -= 1;

      updatedCoords[idx] = { ...c, slot: Math.max(0, c.slot + slotMod) };
    });
  }

  return { ...template, coordinates: updatedCoords };
}
