import { useEffect, useMemo, useRef, useState } from "react";
import {
  countDocumentCells,
  encodeAsepriteFromDocument,
  encodePng,
  importAsepriteIntoDocument,
  importPngIntoDocument,
  compositeSnapshotToRgba,
} from "@/lib/pixelbrain/studio-authoring-facade.js";
import { CanvasStatusBar } from "./CanvasStatusBar";
import { DocumentBar } from "./DocumentBar";
import { IndexedPaletteDock } from "./IndexedPaletteDock";
import { LayerDock } from "./LayerDock";
import { NativePreview } from "./NativePreview";
import { ToolRail } from "./ToolRail";

type CanvasTabProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
  revision: number;
  onChange: () => void;
  onFault: (message: string) => void;
};

function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

type OverlayCell = { x: number; y: number; color: string | null };

type ClassicPixelCanvasProps = {
  snapshot: Record<string, unknown>;
  zoom: number;
  tool: string;
  spacePan: boolean;
  overlay?: OverlayCell[];
  onHover: (x: number | null, y: number | null) => void;
  onPaint: (x: number, y: number, erasing: boolean) => void;
  onFill: (x: number, y: number) => void;
  onPan: (dx: number, dy: number) => void;
  onStrokeEnd: () => void;
};

function PixelCanvas({
  snapshot,
  zoom,
  tool,
  spacePan,
  overlay = [],
  onHover,
  onPaint,
  onFill,
  onPan,
  onStrokeEnd,
}: ClassicPixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const painting = useRef(false);
  const panning = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const endStroke = () => {
      if (!painting.current) return;
      painting.current = false;
      panning.current = false;
      onStrokeEnd();
    };
    window.addEventListener("pointerup", endStroke);
    window.addEventListener("pointercancel", endStroke);
    return () => {
      window.removeEventListener("pointerup", endStroke);
      window.removeEventListener("pointercancel", endStroke);
    };
  }, [onStrokeEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Number(snapshot.width);
    const height = Number(snapshot.height);
    const { rgba } = compositeSnapshotToRgba(snapshot as never);
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    source.getContext("2d")?.putImageData(new ImageData(rgba, width, height), 0, 0);
    canvas.width = width * zoom;
    canvas.height = height * zoom;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const cell of overlay) {
      if (cell.color == null) {
        ctx.clearRect(cell.x * zoom, cell.y * zoom, zoom, zoom);
      } else {
        ctx.fillStyle = cell.color;
        ctx.fillRect(cell.x * zoom, cell.y * zoom, zoom, zoom);
      }
    }
  }, [snapshot, zoom, overlay]);

  const cellAt = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * Number(snapshot.width));
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * Number(snapshot.height));
    if (x < 0 || y < 0 || x >= Number(snapshot.width) || y >= Number(snapshot.height)) return null;
    return { x, y };
  };

  return (
    <div ref={stageRef} className="pbs-pixel-stage">
      <canvas
        ref={canvasRef}
        data-testid="pixel-canvas"
        className="pbs-pixel-canvas"
        aria-label="Pixel canvas"
        tabIndex={0}
        onPointerDown={(event) => {
          const cell = cellAt(event);
          if (!cell) return;
          if (spacePan || event.button === 1) {
            panning.current = true;
            last.current = { x: event.clientX, y: event.clientY };
            return;
          }
          if (tool === "fill") {
            onFill(cell.x, cell.y);
            return;
          }
          painting.current = true;
          (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
          onPaint(cell.x, cell.y, tool === "erase" || event.button === 2);
        }}
        onPointerMove={(event) => {
          const cell = cellAt(event);
          onHover(cell?.x ?? null, cell?.y ?? null);
          if (panning.current) {
            onPan(event.clientX - last.current.x, event.clientY - last.current.y);
            last.current = { x: event.clientX, y: event.clientY };
            if (stageRef.current) {
              stageRef.current.scrollLeft -= event.movementX;
              stageRef.current.scrollTop -= event.movementY;
            }
            return;
          }
          if (painting.current && cell) onPaint(cell.x, cell.y, tool === "erase" || event.buttons === 2);
        }}
        onPointerUp={() => {
          panning.current = false;
        }}
        onPointerLeave={() => onHover(null, null)}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

export function ClassicCanvas({ document: doc, revision, onChange, onFault }: CanvasTabProps) {
  const snapshot = doc.getSnapshot() as Record<string, unknown> & {
    layers: Array<{ name: string; visible?: boolean; locked?: boolean; opacity?: number; cells?: unknown[] }>;
    palette: string[];
    width: number;
    height: number;
    gridType: string;
    checksum: string;
  };
  const [cursor, setCursor] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [spacePan, setSpacePan] = useState(false);
  const [overlay, setOverlay] = useState<Array<{ x: number; y: number; color: string | null }>>([]);
  const [dockOpen, setDockOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const layers = snapshot.layers;
  const active = doc.getActiveLayerIndex();
  const cellCount = useMemo(() => countDocumentCells(snapshot), [snapshot, revision]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePan(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) doc.redo();
        else doc.undo();
        onChange();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        doc.redo();
        onChange();
        return;
      }
      if (event.key === "b" || event.key === "B") doc.setTool("paint");
      if (event.key === "e" || event.key === "E") doc.setTool("erase");
      if (event.key === "g" || event.key === "G") doc.setTool("fill");
      if (event.key === "[") doc.setZoom(Math.max(1, doc.getZoom() / 2));
      if (event.key === "]") doc.setZoom(Math.min(64, doc.getZoom() * 2));
      onChange();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [doc, onChange]);

  const commitStroke = () => {
    const cells = overlayRef.current;
    overlayRef.current = [];
    setOverlay([]);
    if (!cells.length) return;
    const erasing = cells[0]?.color == null;
    if (erasing) doc.erase(cells);
    else doc.paint(cells.map((cell) => ({ x: cell.x, y: cell.y, color: cell.color || doc.getFgColor() })));
    onChange();
  };

  return (
    <section className="pbs-editor" aria-labelledby="pbs-canvas-title">
      <header className="pbs-section-header pbs-editor-header">
        <div>
          <p>LATTICE AUTHORITY · INTEGER ZOOM</p>
          <h2 id="pbs-canvas-title">Canvas & Aseprite</h2>
        </div>
        <code>{String(snapshot.checksum)}</code>
      </header>
      <DocumentBar
        canUndo={doc.canUndo()}
        canRedo={doc.canRedo()}
        gridType={String(snapshot.gridType)}
        symmetry={doc.getGrid().symmetryAxes || []}
        onNew={() => {
          doc.newDocument();
          onChange();
        }}
        onImport={() => importRef.current?.click()}
        onUndo={() => {
          doc.undo();
          onChange();
        }}
        onRedo={() => {
          doc.redo();
          onChange();
        }}
        onGridType={(value) => {
          doc.setGridType(value);
          onChange();
        }}
        onToggleSymmetry={(axis) => {
          doc.toggleSymmetry(axis);
          onChange();
        }}
        onExportPng={() => downloadBytes(encodePng(snapshot), `pixelbrain-${snapshot.width}x${snapshot.height}.png`, "image/png")}
        onExportAseprite={() =>
          downloadBytes(
            encodeAsepriteFromDocument(snapshot),
            `pixelbrain-${snapshot.width}x${snapshot.height}.aseprite`,
            "application/octet-stream",
          )
        }
      />
      <input
        ref={importRef}
        type="file"
        accept=".png,.ase,.aseprite,image/png"
        className="sr-only"
        aria-label="Import PNG or Aseprite"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          try {
            if (file.name.endsWith(".ase") || file.name.endsWith(".aseprite")) {
              importAsepriteIntoDocument(doc, bytes);
            } else {
              importPngIntoDocument(doc, bytes);
            }
            onChange();
          } catch (error) {
            onFault((error as Error).message);
            onChange();
          }
        }}
      />
      <div className="pbs-editor-body">
        <ToolRail
          tool={doc.getTool()}
          onTool={(tool) => {
            doc.setTool(tool);
            onChange();
          }}
        />
        <div className="pbs-editor-stage">
          <PixelCanvas
            snapshot={snapshot}
            zoom={doc.getZoom()}
            tool={doc.getTool()}
            spacePan={spacePan}
            overlay={overlay}
            onHover={(x, y) => setCursor({ x, y })}
            onPaint={(x, y, erasing) => {
              const color = erasing ? null : doc.getFgColor();
              const current = overlayRef.current;
              const next = current.some((cell) => cell.x === x && cell.y === y)
                ? current
                : [...current, { x, y, color }];
              overlayRef.current = next;
              setOverlay(next);
            }}
            onFill={(x, y) => {
              try {
                doc.fill(x, y, doc.getFgColor());
                onChange();
              } catch (error) {
                onFault((error as Error).message);
                onChange();
              }
            }}
            onPan={() => undefined}
            onStrokeEnd={commitStroke}
          />
          <NativePreview snapshot={snapshot} />
        </div>
        <div className={`pbs-docks ${dockOpen ? "is-open" : ""}`}>
          <button type="button" className="pbs-dock-toggle" onClick={() => setDockOpen((value) => !value)}>
            Layers & palette
          </button>
          <LayerDock
            layers={layers}
            activeIndex={active}
            onSelect={(index) => {
              doc.setActiveLayer(index);
              onChange();
            }}
            onVisibility={(index) => {
              doc.setLayerVisibility(index, layers[index].visible === false);
              onChange();
            }}
            onLock={(index) => {
              doc.setLayerLocked(index, !layers[index].locked);
              onChange();
            }}
            onOpacity={(index, value) => {
              doc.setLayerOpacityValue(index, value);
              onChange();
            }}
            onRename={(index, name) => {
              try {
                doc.renameLayer(index, name);
                onChange();
              } catch (error) {
                onFault((error as Error).message);
              }
            }}
            onCreate={() => {
              doc.createLayer(`Layer ${layers.length}`);
              onChange();
            }}
            onDuplicate={() => {
              doc.duplicateLayer(active);
              onChange();
            }}
            onDelete={() => {
              try {
                doc.deleteLayer(active);
                onChange();
              } catch (error) {
                onFault((error as Error).message);
              }
            }}
            onReorder={(from, to) => {
              doc.reorderLayers(from, to);
              onChange();
            }}
            onFlatten={() => {
              doc.flatten();
              onChange();
            }}
          />
          <IndexedPaletteDock
            palette={snapshot.palette || []}
            fgColor={doc.getFgColor()}
            bgColor={doc.getBgColor()}
            onFg={(color) => {
              doc.setFgColor(color);
              onChange();
            }}
            onBg={(color) => {
              doc.setBgColor(color);
              onChange();
            }}
          />
        </div>
      </div>
      <CanvasStatusBar
        x={cursor.x}
        y={cursor.y}
        zoom={doc.getZoom()}
        color={doc.getFgColor()}
        width={snapshot.width}
        height={snapshot.height}
        gridType={String(snapshot.gridType)}
        layerName={layers[active]?.name || "—"}
        cellCount={cellCount}
      />
    </section>
  );
}
