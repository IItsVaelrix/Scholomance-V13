export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function imageToCellGrid(imageData, options = {}) {
  const {
    width: srcWidth,
    height: srcHeight,
    transparentAlpha = 16,
    alphaThreshold = 128,
    partId = 'raster_import',
    material = 'source',
  } = options;

  const targetWidth = options.targetWidth || srcWidth;
  const targetHeight = options.targetHeight || srcHeight;

  const scaleX = targetWidth / srcWidth;
  const scaleY = targetHeight / srcHeight;

  // Use buckets to tally colors for Mode Downscaling
  const buckets = new Map();

  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      const idx = (y * srcWidth + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      const a = imageData.data[idx + 3];

      if (a < transparentAlpha) continue;

      const tx = Math.floor(x * scaleX);
      const ty = Math.floor(y * scaleY);
      const key = `${tx},${ty}`;

      if (!buckets.has(key)) {
        buckets.set(key, { colors: new Map(), alphas: [] });
      }
      
      const bucket = buckets.get(key);
      const hex = rgbToHex(r, g, b);
      bucket.colors.set(hex, (bucket.colors.get(hex) || 0) + 1);
      bucket.alphas.push(a);
    }
  }

  const coordinates = [];
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const key = `${tx},${ty}`;
      if (buckets.has(key)) {
        const bucket = buckets.get(key);
        
        // Compute average alpha for thresholding
        let sumA = 0;
        for (const a of bucket.alphas) sumA += a;
        const avgA = Math.round(sumA / bucket.alphas.length);
        
        // Alpha Thresholding for absolute sharpness
        if (avgA < alphaThreshold) continue;

        // Find the most frequent color in this bucket (Mode)
        let bestColor = null;
        let maxCount = -1;
        for (const [hex, count] of bucket.colors.entries()) {
          if (count > maxCount) {
            maxCount = count;
            bestColor = hex;
          }
        }

        coordinates.push({
          x: tx,
          y: ty,
          snappedX: tx,
          snappedY: ty,
          color: bestColor,
          alpha: avgA,
          partId,
          material,
          source: 'image-scan',
        });
      }
    }
  }

  return Object.freeze({
    width: targetWidth,
    height: targetHeight,
    coordinates: Object.freeze(coordinates),
  });
}
