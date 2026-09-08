import { Eraser, PaintBucket, Pencil, Pipette, Scan } from "lucide-react";

type ToolRailProps = {
  tool: string;
  onTool: (tool: string) => void;
};

const TOOLS = [
  { id: "paint", label: "Pencil", shortcut: "B", Icon: Pencil },
  { id: "erase", label: "Eraser", shortcut: "E", Icon: Eraser },
  { id: "fill", label: "Fill", shortcut: "G", Icon: PaintBucket },
  { id: "pick", label: "Picker", shortcut: "I", Icon: Pipette },
];

export function ToolRail({ tool, onTool }: ToolRailProps) {
  return (
    <div className="pbs-tool-rail" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(({ id, label, shortcut, Icon }) => (
        <button
          key={id}
          type="button"
          className={tool === id ? "is-active" : ""}
          aria-pressed={tool === id}
          aria-label={`${label} (${shortcut})`}
          title={`${label} (${shortcut})`}
          onClick={() => onTool(id)}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          <kbd>{shortcut}</kbd>
        </button>
      ))}
      <p className="pbs-tool-hint">
        <Scan size={14} aria-hidden="true" />
        Space-drag pans
      </p>
    </div>
  );
}
