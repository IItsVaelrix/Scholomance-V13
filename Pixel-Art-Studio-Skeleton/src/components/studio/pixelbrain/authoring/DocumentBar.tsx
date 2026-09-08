import { Code2, Download, FolderOpen, Grid3x3, Redo2, SquareDashedMousePointer, Undo2 } from "lucide-react";

type DocumentBarProps = {
  compact?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  gridType?: string;
  symmetry?: string[];
  onNew: () => void;
  onImport: () => void;
  onScdl?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onGridType?: (value: string) => void;
  onToggleSymmetry?: (axis: string) => void;
  onExportPng: () => void;
  onExportAseprite: () => void;
};

const GRID_TYPES = ["rectangular", "isometric", "hexagonal", "circular", "fibonacci"];

export function DocumentBar({
  compact = false,
  canUndo,
  canRedo,
  gridType,
  symmetry = [],
  onNew,
  onImport,
  onScdl,
  onUndo,
  onRedo,
  onGridType,
  onToggleSymmetry,
  onExportPng,
  onExportAseprite,
}: DocumentBarProps) {
  return (
    <div className="pbs-document-bar" role="toolbar" aria-label="Document commands">
      <button type="button" className="pbs-button" onClick={onNew}>
        New
      </button>
      <button type="button" className="pbs-button" onClick={onImport}>
        <FolderOpen size={14} aria-hidden="true" />
        Import
      </button>
      {onScdl ? (
        <button type="button" className="pbs-button" onClick={onScdl}>
          <Code2 size={14} aria-hidden="true" />
          SCDL
        </button>
      ) : null}
      {!compact ? (
        <>
          <button type="button" className="pbs-button" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 size={14} aria-hidden="true" />
            Undo
          </button>
          <button type="button" className="pbs-button" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 size={14} aria-hidden="true" />
            Redo
          </button>
          <label className="pbs-bar-field">
            <Grid3x3 size={14} aria-hidden="true" />
            <span className="sr-only">Construction grid</span>
            <select aria-label="Construction grid" value={gridType} onChange={(event) => onGridType?.(event.target.value)}>
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
              onClick={() => onToggleSymmetry?.(axis)}
            >
              <SquareDashedMousePointer size={14} aria-hidden="true" />
              {axis === "vertical" ? "Mirror V" : axis === "horizontal" ? "Mirror H" : "Mirror D"}
            </button>
          ))}
        </>
      ) : null}
      <span className="pbs-bar-spacer" />
      <button type="button" className="pbs-button" onClick={onExportPng}>
        <Download size={14} aria-hidden="true" />
        PNG
      </button>
      <button type="button" className="pbs-button" onClick={onExportAseprite}>
        <Download size={14} aria-hidden="true" />
        Aseprite
      </button>
    </div>
  );
}
