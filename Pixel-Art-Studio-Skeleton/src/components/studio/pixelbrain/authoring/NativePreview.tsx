import { useEffect, useRef } from "react";
import { compositeSnapshotToRgba } from "@/lib/pixelbrain/studio-authoring-facade.js";

type NativePreviewProps = {
  snapshot: Record<string, unknown>;
  compact?: boolean;
};

function draw(canvas: HTMLCanvasElement | null, snapshot: Record<string, unknown>, scale: number) {
  if (!canvas) return;
  const { width, height, rgba } = compositeSnapshotToRgba(snapshot as never);
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return;
  sourceCtx.putImageData(new ImageData(rgba, width, height), 0, 0);
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
}

export function NativePreview({ snapshot, compact }: NativePreviewProps) {
  const nativeRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    draw(nativeRef.current, snapshot, 1);
    draw(iconRef.current, snapshot, 1);
  }, [snapshot]);
  return (
    <div className={compact ? "pbs-native-preview is-compact" : "pbs-native-preview"}>
      <figure>
        <canvas ref={iconRef} className="is-icon" width={32} height={32} aria-label="Icon-size preview" />
        <figcaption>32px</figcaption>
      </figure>
      <figure>
        <canvas ref={nativeRef} aria-label="Native-size preview" />
        <figcaption>native</figcaption>
      </figure>
    </div>
  );
}
