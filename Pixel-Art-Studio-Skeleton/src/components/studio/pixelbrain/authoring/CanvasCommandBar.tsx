import { Grid3x3, Minus, Plus, Redo2, SquareDashedMousePointer, Undo2 } from "lucide-react";

const GRID_TYPES = ["rectangular", "isometric", "hexagonal", "circular", "fibonacci"];

const TOOL_HINTS: Record<string, string> = {
  paint: "Primary paints foreground. Secondary paints background.",
  erase: "Erases cells on the active layer.",
  fill: "Fills connected cells with the foreground color.",
  pick: "Samples the visible composite into foreground.",
};

type CanvasCommandBarProps = {
  tool: string;
  zoom: number;
  gridVisible: boolean;
  gridType: string;
  symmetry: string[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onNative: () => void;
  onToggleGrid: () => void;
  onGridType: (value: string) => void;
  onToggleSymmetry: (axis: string) => void;
};

export function CanvasCommandBar({
  tool,
  zoom,
  gridVisible,
  gridType,
  symmetry,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFit,
  onNative,
  onToggleGrid,
  onGridType,
  onToggleSymmetry,
}: CanvasCommandBarProps) {
  const hint = TOOL_HINTS[tool] || TOOL_HINTS.paint;
  const zoomLabel = Number.isInteger(zoom) ? `${zoom}×` : `${zoom}×`;

  return (
    <div className="pbs-command-bar" role="toolbar" aria-label="Canvas commands" data-testid="canvas-command-bar">
      <button type="button" className="pbs-button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo">
        <Undo2 size={14} aria-hidden="true" />
        Undo
      </button>
      <button type="button" className="pbs-button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo">
        <Redo2 size={14} aria-hidden="true" />
        Redo
      </button>
      <button type="button" className="pbs-icon-button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="pbs-command-zoom">{zoomLabel}</span>
      <button type="button" className="pbs-icon-button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
        <Plus size={14} aria-hidden="true" />
      </button>
      <button type="button" className="pbs-button" onClick={onNative} title="Native scale (1)">
        1×
      </button>
      <button type="button" className="pbs-button" onClick={onFit} title="Fit canvas (2)">
        Fit
      </button>
      <button
        type="button"
        className={gridVisible ? "pbs-button is-active" : "pbs-button"}
        aria-pressed={gridVisible}
        title="Toggle pixel grid"
        onClick={onToggleGrid}
      >
        Grid
      </button>
      <label className="pbs-bar-field">
        <Grid3x3 size={14} aria-hidden="true" />
        <span className="sr-only">Construction grid</span>
        <select aria-label="Construction grid" value={gridType} onChange={(event) => onGridType(event.target.value)}>
          {GRID_TYPES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {["vertical", "horizontal", "diagonal"].map((axis) => (
        <button
          key={axis}
          type="button"
          className={symmetry.includes(axis) ? "pbs-button is-active" : "pbs-button"}
          aria-pressed={symmetry.includes(axis)}
          title={`Toggle ${axis} symmetry`}
          onClick={() => onToggleSymmetry(axis)}
        >
          <SquareDashedMousePointer size={14} aria-hidden="true" />
          {axis === "vertical" ? "Mirror V" : axis === "horizontal" ? "Mirror H" : "Mirror D"}
        </button>
      ))}
      <p className="pbs-command-hint">{hint}</p>
    </div>
  );
}
