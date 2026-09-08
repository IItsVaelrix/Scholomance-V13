import { useState, type ReactNode } from "react";

type CanvasInspectorProps = {
  layers: ReactNode;
  palette: ReactNode;
  ghost?: ReactNode;
  assist: ReactNode;
  preview: ReactNode;
};

export function CanvasInspector({ layers, palette, ghost, assist, preview }: CanvasInspectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <aside
      className={open ? "pbs-inspector is-open" : "pbs-inspector"}
      data-testid="canvas-inspector"
      aria-label="Canvas inspector"
    >
      <button
        type="button"
        className="pbs-inspector-toggle"
        aria-expanded={open}
        aria-controls="pbs-inspector-panels"
        onClick={() => setOpen((value) => !value)}
      >
        Inspector
      </button>
      <div id="pbs-inspector-panels" className="pbs-inspector-panels">
        {layers}
        {palette}
        {ghost}
        {assist}
        {preview}
      </div>
    </aside>
  );
}
