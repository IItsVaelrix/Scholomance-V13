import { hashString } from './shared.js';

export const VECTOR_AMP_ID = 'pixelbrain.vector-amp';
export const VECTOR_AMP_VERSION = '1.0.0';

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function buildVectorAmpPayload(input = {}) {
  const { coordinates = [], intensityRatings = {}, canvas = null } = input;
  const inputCoordinates = intensityRatings.outputCoordinates || coordinates;
  
  const coordinateMap = new Map();
  inputCoordinates.forEach((coord) => {
    if (!coord) return;
    const x = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
    const y = Math.round(toFiniteNumber(coord.snappedY ?? coord.y, 0));
    coordinateMap.set(`${x},${y}`, coord);
  });

  const vectorField = [];
  let edgeNormalCount = 0;
  let centerlineCount = 0;
  
  let sumX = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  
  inputCoordinates.forEach(coord => {
      const x = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
      sumX += x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
  });
  const avgX = inputCoordinates.length > 0 ? sumX / inputCoordinates.length : 0;

  inputCoordinates.forEach((coord) => {
    const x = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
    const y = Math.round(toFiniteNumber(coord.snappedY ?? coord.y, 0));
    
    const hasLeft = coordinateMap.has(`${x - 1},${y}`);
    const hasRight = coordinateMap.has(`${x + 1},${y}`);
    const hasUp = coordinateMap.has(`${x},${y - 1}`);
    const hasDown = coordinateMap.has(`${x},${y + 1}`);

    const isEdge = !hasLeft || !hasRight || !hasUp || !hasDown;
    const isIsolated = !hasLeft && !hasRight && !hasUp && !hasDown;
    
    let normalX = 0;
    let normalY = 0;
    if (isEdge) {
        if (!hasLeft) normalX -= 1;
        if (!hasRight) normalX += 1;
        if (!hasUp) normalY -= 1;
        if (!hasDown) normalY += 1;
    }
    
    if (isEdge) edgeNormalCount++;
    
    const isCenterline = Math.abs(x - avgX) <= 1;
    if (isCenterline) centerlineCount++;
    
    let role = 'body-flow';
    if (isIsolated) role = 'spark-drift';
    else if (isEdge) role = 'edge-flow';
    else if (isCenterline) role = 'centerline';

    const direction = {
      x: isIsolated ? (hashString(`${x},${y}`) % 2 === 0 ? 0.1 : -0.1) : (x < avgX ? -0.05 : 0.05),
      y: isIsolated ? -0.5 : -1.0 // Upward flow dominant
    };

    vectorField.push({
      x,
      y,
      direction,
      normal: { x: normalX, y: normalY },
      role,
      confidence: isEdge || isCenterline ? 0.9 : 0.6
    });
  });

  return Object.freeze({
    amp: VECTOR_AMP_ID,
    version: VECTOR_AMP_VERSION,
    vectorField,
    diagnostics: Object.freeze({
      coordinateCount: inputCoordinates.length,
    }),
    metadata: Object.freeze({
      dominantDirection: { x: 0, y: -1 },
      edgeNormalCount,
      centerlineConfidence: centerlineCount > 0 ? 0.85 : 0.1,
      flowConfidence: 0.90
    })
  });
}
