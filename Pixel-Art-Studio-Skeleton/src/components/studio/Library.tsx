import { PixelView } from "@/components/studio/PixelView";
import { Button } from "@/components/ui/button";
import { hexToRgb } from "@/lib/grass/palettes.ts";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function Library() {
  const variants = useStudio((s) => s.variants);
  const library = useStudio((s) => s.library);
  const params = useStudio((s) => s.params);
  const loadResult = useStudio((s) => s.loadResult);
  const loadSaved = useStudio((s) => s.loadSaved);
  const removeSaved = useStudio((s) => s.removeSaved);

  return (
    <aside className="flex flex-col gap-5 p-4 lg:h-full lg:overflow-y-auto">
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium text-fg-muted">Variation set</h2>
          <span className="font-mono text-2xs text-fg-subtle">four siblings</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-2">
          {variants.map((v, i) => {
            const active = v.diagnostics.seed === params.seed;
            return (
              <button
                key={v.diagnostics.seed}
                type="button"
                onClick={() => loadResult(v, v.diagnostics.seed)}
                className={cn(
                  "overflow-hidden rounded-md p-1 shadow-border transition-[box-shadow] duration-150",
                  active ? "ring-1 ring-ring/80" : "hover:shadow-border-hover",
                )}
                aria-label={`Variant ${i + 1}`}
              >
                <div className="aspect-square">
                  <PixelView
                    field={v.field}
                    palette={v.rgb}
                    width={v.width}
                    height={v.height}
                    minScale={2}
                  />
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-2xs text-fg-subtle">
          Swap variants in-engine to break the grid. Same palette, nearby seeds.
        </p>
      </section>

      <section className="min-h-0 flex-1">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium text-fg-muted">Library</h2>
          <span className="font-mono text-2xs text-fg-subtle tabular-nums">
            {library.length}
          </span>
        </div>
        {library.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            Save a tile to keep it on this device. Exports stay PNG-honest — nearest-neighbor, no
            smoothing.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {library.map((tile) => (
              <li key={tile.id} className="flex items-center gap-2 rounded-md bg-bg-subtle p-1.5">
                <button
                  type="button"
                  onClick={() => loadSaved(tile)}
                  className="size-12 shrink-0 overflow-hidden rounded-xs"
                  aria-label={`Load ${tile.name}`}
                >
                  <PixelView
                    field={tile.field}
                    palette={tile.palette.map(hexToRgb)}
                    width={tile.params.width}
                    height={tile.params.height}
                    minScale={1}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => loadSaved(tile)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs text-fg">{tile.name}</span>
                  <span className="block font-mono text-2xs text-fg-subtle">
                    {tile.params.seed.toString(16)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove"
                  onClick={() => removeSaved(tile.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
