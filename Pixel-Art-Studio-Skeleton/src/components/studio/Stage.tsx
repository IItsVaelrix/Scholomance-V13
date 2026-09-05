import { Histogram } from "@/components/studio/Histogram";
import { PixelView } from "@/components/studio/PixelView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RANK_LABELS, type ViewMode } from "@/lib/grass/types.ts";
import { rgbToHex } from "@/lib/grass/palettes.ts";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";
import { Grid3x3 } from "lucide-react";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "tile", label: "Tile" },
  { id: "quad", label: "2×2" },
  { id: "meadow", label: "Meadow" },
  { id: "layers", label: "Form" },
];

export function Stage() {
  const result = useStudio((s) => s.result);
  const view = useStudio((s) => s.view);
  const layer = useStudio((s) => s.layer);
  const showGrid = useStudio((s) => s.showGrid);
  const hover = useStudio((s) => s.hover);
  const setView = useStudio((s) => s.setView);
  const setLayer = useStudio((s) => s.setLayer);
  const toggleGrid = useStudio((s) => s.toggleGrid);
  const setHover = useStudio((s) => s.setHover);

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-muted">
        Growing a field…
      </div>
    );
  }

  const repeats = view === "meadow" ? 8 : view === "quad" ? 2 : 1;
  const handleHover = (x: number, y: number, rank: number) => {
    if (rank < 0) setHover(null);
    else setHover({ x, y, rank });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md bg-bg-subtle p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={cn(
                "h-8 rounded-sm px-3 text-xs font-medium transition-colors duration-150",
                view === v.id ? "bg-bg-elevated text-fg shadow-border" : "text-fg-muted hover:text-fg",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button
          variant={showGrid ? "secondary" : "ghost"}
          size="sm"
          onClick={toggleGrid}
          aria-pressed={showGrid}
          className="ml-auto"
        >
          <Grid3x3 />
          Seams
        </Button>
        <Badge>
          {result.width}×{result.height}
        </Badge>
        <Badge>{result.diagnostics.attempts} pass</Badge>
      </div>

      <div className="relative min-h-64 flex-1 overflow-hidden rounded-xl bg-bg-elevated shadow-border sm:min-h-96">
        <div className={cn("absolute inset-0", view === "layers" ? "hidden" : "block")}>
          <div className="h-full w-full p-3 sm:p-5">
            <PixelView
              field={
                layer === "ground"
                  ? result.ground
                  : layer === "blades"
                    ? result.blades
                    : result.field
              }
              layerMask={layer === "blades" ? result.blades : null}
              palette={result.rgb}
              width={result.width}
              height={result.height}
              repeatX={repeats}
              repeatY={repeats}
              showGrid={showGrid && repeats > 1}
              onHover={handleHover}
              className={layer === "blades" ? "checker rounded-lg" : ""}
            />
          </div>
        </div>

        {view === "layers" ? (
          <div className="grid h-full grid-cols-1 gap-3 p-3 sm:grid-cols-3 sm:p-4">
            {(
              [
                ["ground", "Height", result.ground, null],
                ["blades", "Clumps", result.blades, result.blades],
                ["final", "Color", result.field, null],
              ] as const
            ).map(([id, label, field, mask]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayer(id)}
                className={cn(
                  "flex min-h-40 flex-col overflow-hidden rounded-lg p-2 text-left shadow-border",
                  layer === id ? "bg-bg-subtle" : "bg-bg",
                )}
              >
                <span className="mb-2 px-1 text-2xs font-medium tracking-wide text-fg-muted uppercase">
                  {label}
                </span>
                <div className="min-h-0 flex-1">
                  <PixelView
                    field={field}
                    layerMask={mask}
                    palette={result.rgb}
                    width={result.width}
                    height={result.height}
                    className={id === "blades" ? "checker" : ""}
                  />
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-xl bg-bg-elevated p-3 shadow-border sm:grid-cols-[1fr_auto] sm:items-center">
        <Histogram fractions={result.diagnostics.fractions} palette={result.rgb} />
        <div className="min-w-40 font-mono text-2xs text-fg-muted tabular-nums">
          {hover ? (
            <p>
              {hover.x.toString().padStart(2, "0")},{hover.y.toString().padStart(2, "0")}
              <span className="mx-2 text-fg-subtle">·</span>
              {RANK_LABELS[hover.rank] ?? "empty"}
              <span className="mx-2 text-fg-subtle">·</span>
              {rgbToHex(result.rgb[hover.rank] ?? [0, 0, 0])}
            </p>
          ) : (
            <p className="text-fg-subtle">Hover a pixel</p>
          )}
          <p className="mt-1 text-fg-subtle">
            {result.diagnostics.tuftCount} tufts · seed {result.diagnostics.seed.toString(16)}
          </p>
        </div>
      </div>
    </div>
  );
}
