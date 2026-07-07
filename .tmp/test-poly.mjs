function fillPolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const n = points.length;
  const minY = Math.floor(Math.min(...points.map((p) => p.y)));
  const maxY = Math.ceil(Math.max(...points.map((p) => p.y)));

  const filled = new Set();

  for (let y = minY; y <= maxY; y++) {
    const intersections = [];

    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];

      const isMaxY = (y === maxY);
      const crosses =
        (a.y <= y && b.y > y) ||
        (b.y <= y && a.y > y) ||
        (isMaxY && ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) && a.y !== b.y);

      if (!crosses) continue;

      const t = (y - a.y) / (b.y - a.y);
      intersections.push(a.x + t * (b.x - a.x));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const startX = Math.ceil(intersections[i]);
      const endX = Math.floor(intersections[i + 1]);
      for (let x = startX; x <= endX; x++) {
        filled.add(`${x},${y}`);
      }
    }
  }

  return Array.from(filled);
}

const square = [
  { x: 0, y: 0 }, { x: 3, y: 0 },
  { x: 3, y: 3 }, { x: 0, y: 3 },
];
console.log(fillPolygon(square).length);
