import { useLayoutEffect, useRef, type MouseEvent } from "react";
import { fieldToRgba, toImageData } from "@/lib/grass/render.ts";
import type { RGB } from "@/lib/grass/types.ts";
import { cn } from "@/lib/utils";

type Props = {
  field: ArrayLike<number>;
  palette: RGB[];
  width: number;
  height: number;
  repeatX?: number;
  repeatY?: number;
  showGrid?: boolean;
  layerMask?: ArrayLike<number> | null;
  onHover?: ((x: number, y: number, rank: number) => void) | null;
  className?: string;
  minScale?: number;
};

export function PixelView({
  field,
  palette,
  width,
  height,
  repeatX = 1,
  repeatY = 1,
  showGrid = false,
  layerMask = null,
  onHover,
  className,
  minScale = 1,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const draw = () => {
      const availW = Math.max(32, wrap.clientWidth);
      const availH = Math.max(32, wrap.clientHeight);
      const texW = width * repeatX;
      const texH = height * repeatY;
      const scale = Math.max(minScale, Math.floor(Math.min(availW / texW, availH / texH)));
      scaleRef.current = scale;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = texW * scale;
      const cssH = texH * scale;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const rgba = fieldToRgba(field, palette, width, height, layerMask);
      const tile = document.createElement("canvas");
      tile.width = width;
      tile.height = height;
      const tctx = tile.getContext("2d");
      if (!tctx) return;
      tctx.putImageData(toImageData(rgba, width, height), 0, 0);

      for (let ty = 0; ty < repeatY; ty += 1) {
        for (let tx = 0; tx < repeatX; tx += 1) {
          ctx.drawImage(tile, tx * width * scale, ty * height * scale, width * scale, height * scale);
        }
      }

      if (showGrid && scale >= 2) {
        ctx.strokeStyle = "rgba(232,235,228,0.18)";
        ctx.lineWidth = 1;
        for (let tx = 1; tx < repeatX; tx += 1) {
          ctx.beginPath();
          ctx.moveTo(tx * width * scale + 0.5, 0);
          ctx.lineTo(tx * width * scale + 0.5, cssH);
          ctx.stroke();
        }
        for (let ty = 1; ty < repeatY; ty += 1) {
          ctx.beginPath();
          ctx.moveTo(0, ty * height * scale + 0.5);
          ctx.lineTo(cssW, ty * height * scale + 0.5);
          ctx.stroke();
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [field, palette, width, height, repeatX, repeatY, showGrid, layerMask, minScale]);

  const handleMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onHover) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = scaleRef.current;
    const px = Math.floor((e.clientX - rect.left) / scale);
    const py = Math.floor((e.clientY - rect.top) / scale);
    const x = ((px % width) + width) % width;
    const y = ((py % height) + height) % height;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    onHover(x, y, field[y * width + x] ?? 0);
  };

  return (
    <div
      ref={wrapRef}
      className={cn("flex h-full w-full items-center justify-center overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className="pixelated max-h-full max-w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => onHover?.(0, 0, -1)}
      />
    </div>
  );
}
