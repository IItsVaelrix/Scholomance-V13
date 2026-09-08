import { forwardRef, useImperativeHandle, useState } from "react";

export type StatusCursor = {
  x: number | null;
  y: number | null;
  color: string | null;
  blocked?: boolean;
};

export type CanvasStatusBarHandle = {
  setCursor: (cursor: StatusCursor) => void;
};

type CanvasStatusBarProps = {
  x: number | null;
  y: number | null;
  zoom: number;
  color: string;
  width: number;
  height: number;
  gridType: string;
  layerName: string;
  cellCount: number;
  tool?: string;
  symmetry?: string;
  pendingAssist?: string;
  ghostLabel?: string;
  feedback?: string;
};

const TOOL_LABELS: Record<string, string> = {
  paint: "Pencil",
  erase: "Eraser",
  fill: "Fill",
  pick: "Picker",
  picker: "Picker",
  eyedropper: "Picker",
};

export const CanvasStatusBar = forwardRef<CanvasStatusBarHandle, CanvasStatusBarProps>(
  function CanvasStatusBar(
    {
      x,
      y,
      zoom,
      color,
      width,
      height,
      gridType,
      layerName,
      cellCount,
      tool,
      symmetry,
      pendingAssist,
      ghostLabel,
      feedback,
    },
    ref,
  ) {
    const [cursor, setCursor] = useState<StatusCursor | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        setCursor(next) {
          setCursor((previous) => {
            if (
              previous &&
              previous.x === next.x &&
              previous.y === next.y &&
              previous.color === next.color &&
              previous.blocked === next.blocked
            ) {
              return previous;
            }
            return next;
          });
        },
      }),
      [],
    );

    const cursorX = cursor ? cursor.x : x;
    const cursorY = cursor ? cursor.y : y;
    const sampled = cursor?.color || color;
    const toolLabel = tool ? TOOL_LABELS[tool] || tool : null;
    const symmetryLabel = symmetry && symmetry.length ? symmetry : "none";
    const pendingLabel = pendingAssist ?? "none";

    return (
      <div className="pbs-status-bar" data-testid="canvas-status" aria-label="Canvas status">
        {toolLabel ? <span>{toolLabel}</span> : null}
        <span>
          x/y {cursorX == null ? "—" : cursorX}/{cursorY == null ? "—" : cursorY}
        </span>
        <span>{zoom}×</span>
        <span>
          <i style={{ background: sampled }} />
          {sampled}
        </span>
        <span>
          {width}×{height}
        </span>
        <span>{gridType}</span>
        <span>{layerName}</span>
        <span>{cellCount} cells</span>
        {tool ? <span>symmetry {symmetryLabel}</span> : null}
        {tool ? <span>pending {pendingLabel}</span> : null}
        {ghostLabel ? <span data-testid="canvas-status-ghost">ghost {ghostLabel}</span> : null}
        <span aria-live="polite">{feedback || ""}</span>
      </div>
    );
  },
);
