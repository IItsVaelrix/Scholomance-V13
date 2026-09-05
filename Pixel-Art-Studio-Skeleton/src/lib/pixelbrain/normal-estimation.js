/**
 * normal-estimation.js
 * Computes a 2D normal field from a distance transform using a central difference gradient.
 */

/**
 * Computes the central-difference gradient of the distance field to estimate surface normals.
 * Returns an array of {nx, ny} vectors pointing inward-to-outward.
 * 
 * @param {Float32Array} dist - Distance field from distance transform
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {Array<{nx: number, ny: number}>} Array of normal vectors parallel to the distance field
 */
export function estimateNormals(dist, width, height) {
  const normals = new Array(width * height);
  
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (dist[i] === 0) {
        normals[i] = { nx: 0, ny: 0 };
        continue;
      }
      
      // Central difference (or forward/backward at edges)
      let dx = 0;
      let dy = 0;
      
      if (x > 0 && x < width - 1) {
        dx = (dist[i + 1] - dist[i - 1]) / 2;
      } else if (x === 0 && x < width - 1) {
        dx = dist[i + 1] - dist[i];
      } else if (x === width - 1 && x > 0) {
        dx = dist[i] - dist[i - 1];
      }
      
      if (y > 0 && y < height - 1) {
        dy = (dist[i + width] - dist[i - width]) / 2;
      } else if (y === 0 && y < height - 1) {
        dy = dist[i + width] - dist[i];
      } else if (y === height - 1 && y > 0) {
        dy = dist[i] - dist[i - width];
      }
      
      // The distance gradient points *inward* (from 0 at edge to positive inside).
      // The normal should point *inward-to-outward*, so we negate the gradient.
      let nx = -dx;
      let ny = -dy;
      
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 0.0001) {
        nx /= len;
        ny /= len;
      } else {
        nx = 0;
        ny = 0;
      }
      
      normals[i] = { nx, ny };
    }
  }
  
  return normals;
}
