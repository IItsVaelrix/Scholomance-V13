import { useEffect, useRef } from "react";
import { compositeSnapshotToRgba } from "@/lib/pixelbrain/studio-authoring-facade.js";
import {
  ZOOM_LADDER,
  cellToScreen,
  fitViewport,
  rasterLine,
  screenToCell,
  stepZoom,
} from "@/lib/pixelbrain/canvas-interaction.js";
import type { StatusCursor } from "./CanvasStatusBar";

export type CanvasViewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type OverlayCell = {
  x: number;
  y: number;
  color?: string | null;
};

export type CanvasCandidate = {
  cells: OverlayCell[];
  visible: boolean;
  mode: "overlay" | "generated-layer";
} | null;

export type GhostLayer = {
  cells: Array<{ x: number; y: number; color?: string | null; role?: string; label?: string }>;
  visible: boolean;
  opacity: number;
  ampId: string;
  ampName: string;
  style?: "translucent" | "pulse" | "outline";
} | null;

export type GestureMode = "foreground" | "background" | "erase";

type ThemeColors = {
  bg: string;
  elevated: string;
  subtle: string;
  fg: string;
  muted: string;
  accent: string;
  line: string;
};

const TOOL_LABELS: Record<string, string> = {
  paint: "Pencil",
  erase: "Eraser",
  fill: "Fill",
  pick: "Picker",
  picker: "Picker",
  eyedropper: "Picker",
};

type PixelCanvasProps = {
  snapshot: Record<string, unknown>;
  viewport: CanvasViewport;
  tool: string;
  fgColor: string;
  bgColor: string;
  locked?: boolean;
  spacePan?: boolean;
  gridVisible?: boolean;
  guides?: readonly OverlayCell[];
  candidate?: CanvasCandidate;
  ghostLayer?: GhostLayer;
  layerName?: string;
  onViewportChange: (viewport: CanvasViewport) => void;
  onGesture: (cells: Array<{ x: number; y: number }>, mode: GestureMode) => void;
  onFill: (x: number, y: number) => void;
  onPick?: (x: number, y: number, hex: string) => void;
  onCursor?: (cursor: StatusCursor) => void;
  onFeedback?: (message: string) => void;
};

type SourceCache = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

const FALLBACK_THEME: ThemeColors = {
  bg: "#0c0e0b",
  elevated: "#141712",
  subtle: "#1a1e17",
  fg: "#e8ebe4",
  muted: "#8b9184",
  accent: "#9cba7a",
  line: "#3d4538",
};

function readTheme(element: HTMLElement | null): ThemeColors {
  if (!element) return FALLBACK_THEME;
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: token("--color-bg", FALLBACK_THEME.bg),
    elevated: token("--color-bg-elevated", FALLBACK_THEME.elevated),
    subtle: token("--color-bg-subtle", FALLBACK_THEME.subtle),
    fg: token("--color-fg", FALLBACK_THEME.fg),
    muted: token("--color-fg-muted", FALLBACK_THEME.muted),
    accent: token("--color-accent", FALLBACK_THEME.accent),
    line: token("--pbs-line-strong", FALLBACK_THEME.line),
  };
}

function buildSource(snapshot: Record<string, unknown>): SourceCache | null {
  const width = Number(snapshot.width);
  const height = Number(snapshot.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const { rgba } = compositeSnapshotToRgba(snapshot as never);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return { canvas, ctx, width, height };
}

function localPoint(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function isPickerTool(tool: string) {
  return tool === "pick" || tool === "picker" || tool === "eyedropper";
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function isShortcutBlocked(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("dialog")) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  return false;
}

function sameViewport(a: CanvasViewport, b: CanvasViewport) {
  return a.panX === b.panX && a.panY === b.panY && a.zoom === b.zoom;
}

function fillCheckerCell(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  view: CanvasViewport,
  originX: number,
  originY: number,
  theme: ThemeColors,
) {
  const check = Math.max(view.zoom * 8, 8);
  const col = Math.floor((screen.x - originX) / check);
  const row = Math.floor((screen.y - originY) / check);
  ctx.fillStyle = (row + col) % 2 === 0 ? theme.elevated : theme.subtle;
  ctx.fillRect(screen.x, screen.y, view.zoom, view.zoom);
}

const EMPTY_CELLS: OverlayCell[] = [];

function paintOverlayCell(
  ctx: CanvasRenderingContext2D,
  cell: OverlayCell,
  view: CanvasViewport,
  originX: number,
  originY: number,
  theme: ThemeColors,
) {
  const screen = cellToScreen(cell, view);
  if (cell.color == null) {
    fillCheckerCell(ctx, screen, view, originX, originY, theme);
  } else {
    ctx.fillStyle = cell.color;
    ctx.fillRect(screen.x, screen.y, view.zoom, view.zoom);
  }
}

export function PixelCanvas({
  snapshot,
  viewport,
  tool,
  fgColor,
  bgColor,
  locked = false,
  spacePan = false,
  gridVisible = true,
  guides = EMPTY_CELLS,
  candidate = null,
  ghostLayer = null,
  layerName = "—",
  onViewportChange,
  onGesture,
  onFill,
  onPick,
  onCursor,
  onFeedback,
}: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  const viewportRef = useRef(viewport);
  const toolRef = useRef(tool);
  const fgRef = useRef(fgColor);
  const bgRef = useRef(bgColor);
  const lockedRef = useRef(locked);
  const spacePanRef = useRef(spacePan);
  const gridVisibleRef = useRef(gridVisible);
  const guidesRef = useRef(guides);
  const candidateRef = useRef(candidate);
  const ghostLayerRef = useRef(ghostLayer);
  const onViewportChangeRef = useRef(onViewportChange);
  const onGestureRef = useRef(onGesture);
  const onFillRef = useRef(onFill);
  const onPickRef = useRef(onPick);
  const onCursorRef = useRef(onCursor);
  const onFeedbackRef = useRef(onFeedback);
  const sourceRef = useRef<SourceCache | null>(null);
  const themeRef = useRef<ThemeColors>(FALLBACK_THEME);
  const cssSizeRef = useRef({ width: 0, height: 0 });
  const fittedRef = useRef(false);
  const lastDocRef = useRef({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const paintingRef = useRef(false);
  const panningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const lastAcceptedAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const shiftGestureRef = useRef(false);
  const pointerButtonRef = useRef(0);
  const gestureModeRef = useRef<GestureMode>("foreground");
  const gestureCellsRef = useRef(new Map<string, { x: number; y: number }>());
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorStatusRef = useRef<StatusCursor | null>(null);

  snapshotRef.current = snapshot;
  if (!panningRef.current) viewportRef.current = viewport;
  toolRef.current = tool;
  fgRef.current = fgColor;
  bgRef.current = bgColor;
  lockedRef.current = locked;
  spacePanRef.current = spacePan;
  gridVisibleRef.current = gridVisible;
  guidesRef.current = guides;
  candidateRef.current = candidate;
  ghostLayerRef.current = ghostLayer;
  onViewportChangeRef.current = onViewportChange;
  onGestureRef.current = onGesture;
  onFillRef.current = onFill;
  onPickRef.current = onPick;
  onCursorRef.current = onCursor;
  onFeedbackRef.current = onFeedback;

  const invalidate = () => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  };

  const applyViewport = (next: CanvasViewport) => {
    if (sameViewport(viewportRef.current, next)) {
      invalidate();
      return;
    }
    viewportRef.current = next;
    onViewportChangeRef.current(next);
    invalidate();
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = cssSizeRef.current.width || canvas.clientWidth;
    const cssH = cssSizeRef.current.height || canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const theme = themeRef.current;
    const view = viewportRef.current;
    const snap = snapshotRef.current;
    const docW = Number(snap.width);
    const docH = Number(snap.height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    if (!Number.isFinite(docW) || !Number.isFinite(docH) || docW < 1 || docH < 1) return;

    const originX = view.panX;
    const originY = view.panY;
    const destW = docW * view.zoom;
    const destH = docH * view.zoom;

    ctx.save();
    ctx.beginPath();
    ctx.rect(originX, originY, destW, destH);
    ctx.clip();
    const check = Math.max(view.zoom * 8, 8);
    for (let y = originY, row = 0; y < originY + destH; y += check, row += 1) {
      for (let x = originX, col = 0; x < originX + destW; x += check, col += 1) {
        ctx.fillStyle = (row + col) % 2 === 0 ? theme.elevated : theme.subtle;
        ctx.fillRect(x, y, check, check);
      }
    }
    ctx.restore();

    const source = sourceRef.current;
    if (source) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source.canvas, 0, 0, docW, docH, originX, originY, destW, destH);
    }

    if (paintingRef.current) {
      for (const cell of gestureCellsRef.current.values()) {
        paintOverlayCell(
          ctx,
          {
            ...cell,
            color:
              gestureModeRef.current === "erase"
                ? null
                : gestureModeRef.current === "background"
                  ? bgRef.current
                  : fgRef.current,
          },
          view,
          originX,
          originY,
          theme,
        );
      }
    } else {
      const candidate = candidateRef.current;
      if (candidate?.visible && candidate.mode === "generated-layer") {
        for (const cell of candidate.cells) {
          paintOverlayCell(ctx, cell, view, originX, originY, theme);
        }
      }
    }

    for (const cell of guidesRef.current) {
      const screen = cellToScreen(cell, view);
      ctx.fillStyle = cell.color || theme.accent;
      ctx.fillRect(screen.x, screen.y, view.zoom, view.zoom);
    }

    if (!paintingRef.current) {
      const candidate = candidateRef.current;
      if (candidate?.visible && candidate.mode === "overlay") {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = Math.max(1, Math.min(2, view.zoom / 4));
        for (const cell of candidate.cells) {
          const screen = cellToScreen(cell, view);
          ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(view.zoom - 1, 1), Math.max(view.zoom - 1, 1));
        }
      }
    }

    const ghost = ghostLayerRef.current;
    if (ghost?.visible && ghost.cells.length > 0) {
      ctx.save();
      const alpha = typeof ghost.opacity === "number" ? Math.max(0.05, Math.min(1, ghost.opacity)) : 0.55;
      ctx.globalAlpha = alpha;

      if (ghost.style === "outline") {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = Math.max(1, Math.min(2, view.zoom / 4));
        for (const cell of ghost.cells) {
          const screen = cellToScreen(cell, view);
          ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(view.zoom - 1, 1), Math.max(view.zoom - 1, 1));
        }
      } else {
        for (const cell of ghost.cells) {
          if (cell.color == null) continue;
          const screen = cellToScreen(cell, view);
          ctx.fillStyle = cell.color;
          ctx.fillRect(screen.x, screen.y, view.zoom, view.zoom);

          // Subtle hint marker when zoomed in
          if (view.zoom >= 6) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(view.zoom - 1, 1), Math.max(view.zoom - 1, 1));
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }

    if (gridVisibleRef.current && view.zoom >= 4) {
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= docW; x += 1) {
        const px = originX + x * view.zoom;
        ctx.moveTo(px, originY);
        ctx.lineTo(px, originY + destH);
      }
      for (let y = 0; y <= docH; y += 1) {
        const py = originY + y * view.zoom;
        ctx.moveTo(originX, py);
        ctx.lineTo(originX + destW, py);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(originX + 0.5, originY + 0.5, destW, destH);

    const cursor = cursorRef.current;
    if (cursor) {
      const screen = cellToScreen(cursor, view);
      ctx.strokeStyle = lockedRef.current ? theme.muted : theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x + 0.5, screen.y + 0.5, Math.max(view.zoom - 1, 1), Math.max(view.zoom - 1, 1));
    }
  };

  const syncBackingStore = (cssW: number, cssH: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);
    if (canvas.width !== nextW) canvas.width = nextW;
    if (canvas.height !== nextH) canvas.height = nextH;
  };

  const fitIfNeeded = (cssW: number, cssH: number, docW: number, docH: number, force: boolean) => {
    if (cssW < 1 || cssH < 1 || docW < 1 || docH < 1) return;
    const sizeChanged = lastDocRef.current.width !== docW || lastDocRef.current.height !== docH;
    if (!force && fittedRef.current && !sizeChanged) return;
    fittedRef.current = true;
    lastDocRef.current = { width: docW, height: docH };
    applyViewport(fitViewport({ width: docW, height: docH }, { width: cssW, height: cssH }, ZOOM_LADDER, 32));
  };

  const sampleHex = (x: number, y: number) => {
    const source = sourceRef.current;
    if (!source) return null;
    const pixel = source.ctx.getImageData(x, y, 1, 1).data;
    if (pixel[3] > 0) {
      return rgbToHex(pixel[0], pixel[1], pixel[2]);
    }
    const ghost = ghostLayerRef.current;
    if (ghost?.visible) {
      const found = ghost.cells.find((c) => c.x === x && c.y === y);
      if (found?.color) return found.color;
    }
    return rgbToHex(pixel[0], pixel[1], pixel[2]);
  };

  const emitCursor = (cell: { x: number; y: number } | null) => {
    const next: StatusCursor = {
      x: cell?.x ?? null,
      y: cell?.y ?? null,
      color: cell ? sampleHex(cell.x, cell.y) : null,
      blocked: lockedRef.current,
    };
    const previous = lastCursorStatusRef.current;
    if (
      previous &&
      previous.x === next.x &&
      previous.y === next.y &&
      previous.color === next.color &&
      previous.blocked === next.blocked
    ) {
      return;
    }
    lastCursorStatusRef.current = next;
    onCursorRef.current?.(next);
  };

  const setCursorCell = (cell: { x: number; y: number } | null) => {
    const prev = cursorRef.current;
    if (prev?.x !== cell?.x || prev?.y !== cell?.y) {
      cursorRef.current = cell;
      invalidate();
    }
    emitCursor(cell);
  };

  const addGestureCells = (cells: Array<{ x: number; y: number }>, replace = false) => {
    const bounds = { width: Number(snapshotRef.current.width), height: Number(snapshotRef.current.height) };
    if (replace) gestureCellsRef.current = new Map();
    let added = false;
    for (const cell of cells) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= bounds.width || cell.y >= bounds.height) continue;
      const key = `${cell.x},${cell.y}`;
      if (gestureCellsRef.current.has(key)) continue;
      gestureCellsRef.current.set(key, { x: cell.x, y: cell.y });
      added = true;
    }
    if (added || replace) invalidate();
  };

  const releasePointer = () => {
    if (pointerIdRef.current == null) return;
    const pointerId = pointerIdRef.current;
    pointerIdRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  };

  const finishPointer = (commit: boolean) => {
    const wasPainting = paintingRef.current;
    paintingRef.current = false;
    panningRef.current = false;
    shiftGestureRef.current = false;
    releasePointer();
    if (!wasPainting) return;
    const cells = [...gestureCellsRef.current.values()];
    const mode = gestureModeRef.current;
    gestureCellsRef.current = new Map();
    lastCellRef.current = null;
    if (commit && cells.length) {
      lastAcceptedAnchorRef.current = cells[cells.length - 1];
      onGestureRef.current(cells, mode);
    }
    invalidate();
  };

  useEffect(() => {
    sourceRef.current = buildSource(snapshot);
    invalidate();
  }, [snapshot]);

  useEffect(() => {
    const docW = Number(snapshot.width);
    const docH = Number(snapshot.height);
    if (fittedRef.current) {
      fitIfNeeded(cssSizeRef.current.width, cssSizeRef.current.height, docW, docH, false);
    }
    invalidate();
  }, [snapshot.width, snapshot.height, viewport, gridVisible, fgColor, bgColor, guides, candidate, ghostLayer, locked]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    themeRef.current = readTheme(stage);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cssW = entry.contentRect.width;
      const cssH = entry.contentRect.height;
      if (cssW < 1 || cssH < 1) return;
      cssSizeRef.current = { width: cssW, height: cssH };
      syncBackingStore(cssW, cssH);
      const snap = snapshotRef.current;
      fitIfNeeded(cssW, cssH, Number(snap.width), Number(snap.height), !fittedRef.current);
      invalidate();
    });
    observer.observe(stage);
    const cssW = stage.clientWidth;
    const cssH = stage.clientHeight;
    if (cssW >= 1 && cssH >= 1) {
      cssSizeRef.current = { width: cssW, height: cssH };
      syncBackingStore(cssW, cssH);
      fitIfNeeded(cssW, cssH, Number(snapshotRef.current.width), Number(snapshotRef.current.height), !fittedRef.current);
      invalidate();
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) return;
      const point = localPoint(event, canvas);
      const direction = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0;
      if (!direction) return;
      applyViewport(stepZoom(viewportRef.current, point, direction));
    };

    const onKey = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return;
      if (event.key === "Escape") {
        if (!paintingRef.current) return;
        event.preventDefault();
        finishPointer(false);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const css = cssSizeRef.current;
      const center = { x: css.width / 2, y: css.height / 2 };
      const snap = snapshotRef.current;
      const docW = Number(snap.width);
      const docH = Number(snap.height);
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyViewport(stepZoom(viewportRef.current, center, 1));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyViewport(stepZoom(viewportRef.current, center, -1));
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        applyViewport({
          zoom: 1,
          panX: (css.width - docW) / 2,
          panY: (css.height - docH) / 2,
        });
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        applyViewport(fitViewport({ width: docW, height: docH }, { width: css.width, height: css.height }, ZOOM_LADDER, 32));
      }
    };

    const cancelTransient = () => finishPointer(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancelTransient();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", cancelTransient);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", cancelTransient);
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      paintingRef.current = false;
      panningRef.current = false;
      if (pointerIdRef.current != null && canvas.hasPointerCapture(pointerIdRef.current)) {
        canvas.releasePointerCapture(pointerIdRef.current);
      }
      pointerIdRef.current = null;
    };
  }, []);

  const hitCell = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const point = localPoint(event, canvas);
    return screenToCell(point, viewportRef.current, {
      width: Number(snapshotRef.current.width),
      height: Number(snapshotRef.current.height),
    });
  };

  const capturePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointerIdRef.current = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  };

  const toolLabel = TOOL_LABELS[tool] || tool;
  const description = `${Number(snapshot.width)}×${Number(snapshot.height)}, ${viewport.zoom}×, ${toolLabel}, ${layerName}`;

  return (
    <div
      ref={stageRef}
      className="pbs-pixel-stage pbs-pixel-stage--pro"
      data-testid="canvas-viewport"
      data-renderer="invalidation"
      data-pan-x={viewport.panX}
      data-pan-y={viewport.panY}
      data-zoom={viewport.zoom}
    >
      <p id="pbs-canvas-description" className="sr-only">
        {description}
      </p>
      <canvas
        ref={canvasRef}
        data-testid="pixel-canvas"
        data-renderer="invalidation"
        data-pan-x={viewport.panX}
        data-pan-y={viewport.panY}
        data-zoom={viewport.zoom}
        className="pbs-pixel-canvas pbs-pixel-canvas--pro"
        aria-label="Pixel canvas"
        aria-describedby="pbs-canvas-description"
        tabIndex={0}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.focus();
          pointerButtonRef.current = event.button;
          if (spacePanRef.current || event.button === 1) {
            event.preventDefault();
            panningRef.current = true;
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
            capturePointer(event);
            return;
          }
          if (event.button !== 0 && event.button !== 2) return;
          event.preventDefault();
          const cell = hitCell(event);
          if (!cell) return;
          if (toolRef.current === "fill") {
            if (lockedRef.current) {
              onFeedbackRef.current?.("Layer is locked");
              return;
            }
            onFeedbackRef.current?.("");
            onFillRef.current(cell.x, cell.y);
            return;
          }
          if (isPickerTool(toolRef.current)) {
            const hex = sampleHex(cell.x, cell.y);
            if (hex) onPickRef.current?.(cell.x, cell.y, hex);
            return;
          }
          if (lockedRef.current) {
            onFeedbackRef.current?.("Layer is locked");
            return;
          }
          onFeedbackRef.current?.("");
          paintingRef.current = true;
          gestureModeRef.current = toolRef.current === "erase" ? "erase" : event.button === 2 ? "background" : "foreground";
          gestureCellsRef.current = new Map();
          shiftGestureRef.current = event.shiftKey && (toolRef.current === "paint" || toolRef.current === "erase");
          lastCellRef.current = cell;
          if (shiftGestureRef.current && lastAcceptedAnchorRef.current) {
            addGestureCells(rasterLine(lastAcceptedAnchorRef.current, cell), true);
          } else {
            addGestureCells([cell]);
          }
          capturePointer(event);
        }}
        onPointerMove={(event) => {
          const cell = hitCell(event);
          setCursorCell(cell);
          if (panningRef.current) {
            const dx = event.clientX - lastPointerRef.current.x;
            const dy = event.clientY - lastPointerRef.current.y;
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
            applyViewport({
              ...viewportRef.current,
              panX: viewportRef.current.panX + dx,
              panY: viewportRef.current.panY + dy,
            });
            return;
          }
          if (!paintingRef.current || !cell) return;
          if (shiftGestureRef.current && lastAcceptedAnchorRef.current) {
            addGestureCells(rasterLine(lastAcceptedAnchorRef.current, cell), true);
            lastCellRef.current = cell;
            return;
          }
          const from = lastCellRef.current || cell;
          addGestureCells(rasterLine(from, cell));
          lastCellRef.current = cell;
        }}
        onPointerUp={() => finishPointer(true)}
        onPointerCancel={() => finishPointer(pointerButtonRef.current === 2)}
        onLostPointerCapture={() => {
          if (paintingRef.current) finishPointer(true);
          else panningRef.current = false;
        }}
        onPointerLeave={() => {
          if (pointerIdRef.current != null) return;
          setCursorCell(null);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (paintingRef.current) finishPointer(true);
        }}
      />
    </div>
  );
}
