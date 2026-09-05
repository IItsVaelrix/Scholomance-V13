export function segmentImage(fills, spec = {}) {
  const { minRegionSize = 5 } = spec;
  const coordinates = [...fills.coordinates];
  const grid = new Map(coordinates.map((c, i) => [`${c.x},${c.y}`, i]));
  const visited = new Set();
  const regions = [];

  // Connected-component clustering via BFS
  for (let i = 0; i < coordinates.length; i++) {
    if (visited.has(i)) continue;
    
    const startCell = coordinates[i];
    const color = startCell.color;
    const queue = [startCell];
    const region = [];
    
    visited.add(i);

    let head = 0;
    while (head < queue.length) {
      const cell = queue[head++];
      region.push(cell);

      const neighbors = [
        [cell.x - 1, cell.y],
        [cell.x + 1, cell.y],
        [cell.x, cell.y - 1],
        [cell.x, cell.y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        const nIndex = grid.get(`${nx},${ny}`);
        if (nIndex !== undefined && !visited.has(nIndex)) {
          if (coordinates[nIndex].color === color) {
            visited.add(nIndex);
            queue.push(coordinates[nIndex]);
          }
        }
      }
    }
    regions.push(region);
  }

  // Sort regions by size descending. 
  // The largest region is typically the mortar/background.
  regions.sort((a, b) => b.length - a.length);

  const processedCoordinates = [];
  let slabCounter = 0;

  for (let r = 0; r < regions.length; r++) {
    const region = regions[r];
    let partId = 'cracks'; // very small disconnected chunks
    
    if (r === 0) {
      partId = 'mortar'; // largest region
    } else if (region.length >= minRegionSize) {
      partId = `slab_${slabCounter++}`; // chunky connected slabs
    }

    for (const cell of region) {
      processedCoordinates.push({
        ...cell,
        partId
      });
    }
  }

  return Object.freeze({
    ...fills,
    coordinates: Object.freeze(processedCoordinates),
  });
}
