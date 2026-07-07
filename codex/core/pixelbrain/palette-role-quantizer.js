function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function colorDistance(c1, c2) {
  return Math.sqrt((c1.r-c2.r)**2 + (c1.g-c2.g)**2 + (c1.b-c2.b)**2);
}

export function quantizeToRoles(coordinates, spec = {}) {
  const { rolePrefix = 'c', maxColors = 16 } = spec;

  // Extract unique colors
  const uniqueColors = new Map();
  for (const c of coordinates) {
    if (!c.color) continue;
    if (!uniqueColors.has(c.color)) {
      uniqueColors.set(c.color, hexToRgb(c.color));
    }
  }

  const uniqueRgbList = Array.from(uniqueColors.values());
  
  // Initialize k-means centroids (randomly pick maxColors from unique colors)
  let centroids = [];
  const shuffled = [...uniqueRgbList].sort(() => 0.5 - Math.random());
  centroids = shuffled.slice(0, Math.min(maxColors, shuffled.length));

  // K-means iterations
  const iterations = 10;
  let clusters = [];
  for (let i = 0; i < iterations; i++) {
    clusters = centroids.map(() => []);
    
    // Assign to closest centroid
    for (const rgb of uniqueRgbList) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = colorDistance(rgb, centroids[j]);
        if (d < minDist) {
          minDist = d;
          closestIdx = j;
        }
      }
      clusters[closestIdx].push(rgb);
    }
    
    // Update centroids
    let changed = false;
    for (let j = 0; j < centroids.length; j++) {
      if (clusters[j].length === 0) continue;
      let sumR = 0, sumG = 0, sumB = 0;
      for (const rgb of clusters[j]) {
        sumR += rgb.r; sumG += rgb.g; sumB += rgb.b;
      }
      const newCentroid = {
        r: Math.round(sumR / clusters[j].length),
        g: Math.round(sumG / clusters[j].length),
        b: Math.round(sumB / clusters[j].length)
      };
      if (colorDistance(centroids[j], newCentroid) > 0) changed = true;
      centroids[j] = newCentroid;
    }
    if (!changed) break;
  }

  const paletteHexes = centroids.map(c => '#' + [c.r, c.g, c.b].map(x => x.toString(16).padStart(2, '0')).join(''));

  const paletteMap = new Map();
  let roleCounter = 0;
  for (const hex of paletteHexes) {
    if (!paletteMap.has(hex)) {
      paletteMap.set(hex, `${rolePrefix}${String(roleCounter++).padStart(3, '0')}`);
    }
  }

  const updatedCoordinates = coordinates.map(cell => {
    if (!cell.color) return cell;
    const cRgb = hexToRgb(cell.color);
    
    let closest = centroids[0];
    let closestHex = paletteHexes[0];
    let minD = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = colorDistance(cRgb, centroids[i]);
      if (d < minD) {
        minD = d;
        closest = centroids[i];
        closestHex = paletteHexes[i];
      }
    }

    return {
      ...cell,
      color: closestHex,
      roleName: paletteMap.get(closestHex)
    };
  });

  const palette = {};
  for (const [color, role] of paletteMap.entries()) {
    palette[role] = color;
  }

  return Object.freeze({
    coordinates: Object.freeze(updatedCoordinates),
    palette: Object.freeze(palette)
  });
}
