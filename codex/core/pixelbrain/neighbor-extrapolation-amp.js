const NEIGHBOR_OFFSETS_8 = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
]);

function getMostFrequentColor(neighbors) {
  const counts = new Map();
  let max = 0;
  let dom = null;
  for (const n of neighbors) {
    if (!n.color) continue;
    const c = (counts.get(n.color) || 0) + 1;
    counts.set(n.color, c);
    if (c > max) { max = c; dom = n.color; }
  }
  return dom;
}

export function extrapolateNeighbors(fills, spec = {}) {
  const {
    iterations = 1,
    maxCanvasWidth = fills.width,
    maxCanvasHeight = fills.height,
  } = spec;

  let coordinates = [...fills.coordinates];

  // For neighbor cleanup / smoothing:
  // Smooth isolated noisy cells while preserving lines/cracks
  for (let i = 0; i < iterations; i++) {
    const map = new Map(coordinates.map(c => [`${c.x},${c.y}`, c]));
    const nextCoords = [];
    let changed = 0;

    for (const cell of coordinates) {
      const neighbors = [];
      for (const [dx, dy] of NEIGHBOR_OFFSETS_8) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const n = map.get(`${x},${y}`);
        if (n) neighbors.push(n);
      }

      // Find how many neighbors share this exact color
      const sameColorCount = neighbors.filter(n => n.color === cell.color).length;
      
      // If cell is an isolated island of its color (0 or 1 neighbors), and has enough total neighbors,
      // it is likely noise. Replace it with the local dominant color.
      if (sameColorCount < 2 && neighbors.length >= 4) {
        const domColor = getMostFrequentColor(neighbors);
        if (domColor && domColor !== cell.color) {
          nextCoords.push({ ...cell, color: domColor });
          changed++;
          continue;
        }
      }
      nextCoords.push(cell);
    }
    coordinates = nextCoords;
    if (changed === 0) break; // stable state reached
  }

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(coordinates),
  });
}
