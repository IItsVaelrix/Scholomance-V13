import type { RGB } from "./types.ts";

export function toImageData(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const img = new ImageData(width, height);
  img.data.set(rgba);
  return img;
}

export function fieldToRgba(
  field: ArrayLike<number>,
  palette: RGB[],
  width: number,
  height: number,
  layerMask?: ArrayLike<number> | null,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const rank = field[i] ?? 0;
    const hidden = layerMask && layerMask[i]! < 0;
    const [r, g, b] = hidden ? [0, 0, 0] : (palette[rank] ?? palette[0]!);
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = hidden ? 0 : 255;
  }
  return rgba;
}

export function blitScaled(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  scale: number,
  repeatX = 1,
  repeatY = 1,
): void {
  const tile = document.createElement("canvas");
  tile.width = srcW;
  tile.height = srcH;
  const tctx = tile.getContext("2d");
  if (!tctx) return;
  tctx.putImageData(toImageData(rgba, srcW, srcH), 0, 0);

  const dw = srcW * repeatX * scale;
  const dh = srcH * repeatY * scale;
  ctx.imageSmoothingEnabled = false;
  (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality =
    "low";
  ctx.clearRect(0, 0, dw, dh);
  for (let ty = 0; ty < repeatY; ty += 1) {
    for (let tx = 0; tx < repeatX; tx += 1) {
      ctx.drawImage(tile, tx * srcW * scale, ty * srcH * scale, srcW * scale, srcH * scale);
    }
  }
}

export function makeTileCanvas(
  field: ArrayLike<number>,
  palette: RGB[],
  width: number,
  height: number,
  scale: number,
  repeatX = 1,
  repeatY = 1,
  layerMask?: ArrayLike<number> | null,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * repeatX * scale;
  canvas.height = height * repeatY * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rgba = fieldToRgba(field, palette, width, height, layerMask);
  blitScaled(ctx, rgba, width, height, scale, repeatX, repeatY);
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}
