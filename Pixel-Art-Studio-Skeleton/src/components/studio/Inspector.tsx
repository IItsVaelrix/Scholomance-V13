import { PALETTES, rgbToHex } from "@/lib/grass/palettes.ts";
import { RANK_LABELS, type TileSize } from "@/lib/grass/types.ts";
import { useStudio } from "@/lib/studio-store";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const SIZES: TileSize[] = [16, 24, 32, 48, 64];

function FieldLabel({
  title,
  value,
}: {
  title: string;
  value?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-xs font-medium text-fg-muted">{title}</span>
      {value ? (
        <span className="font-mono text-2xs text-fg-subtle tabular-nums">{value}</span>
      ) : null}
    </div>
  );
}

export function Inspector() {
  const params = useStudio((s) => s.params);
  const setSize = useStudio((s) => s.setSize);
  const setDensity = useStudio((s) => s.setDensity);
  const setSoil = useStudio((s) => s.setSoil);
  const setBladeScale = useStudio((s) => s.setBladeScale);
  const setWind = useStudio((s) => s.setWind);
  const setPaletteId = useStudio((s) => s.setPaletteId);
  const setSwatch = useStudio((s) => s.setSwatch);

  return (
    <aside className="flex flex-col gap-6 p-4 lg:h-full lg:overflow-y-auto">
      <section>
        <FieldLabel title="Tile" value={`${params.width}×${params.height}`} />
        <div className="grid grid-cols-5 gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn(
                "h-11 rounded-sm font-mono text-xs tabular-nums transition-colors duration-150",
                params.width === s
                  ? "bg-primary text-primary-fg"
                  : "bg-bg-subtle text-fg-muted hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <FieldLabel title="Density" value={Math.round(params.density * 100) + "%"} />
        <Slider
          min={0.15}
          max={0.95}
          step={0.01}
          value={[params.density]}
          onValueChange={([v]) => setDensity(v ?? 0.5)}
        />
      </section>

      <section>
        <FieldLabel title="Blade length" value={Math.round(params.bladeScale * 100) + "%"} />
        <Slider
          min={0.15}
          max={1}
          step={0.01}
          value={[params.bladeScale]}
          onValueChange={([v]) => setBladeScale(v ?? 0.5)}
        />
      </section>

      <section>
        <FieldLabel title="Bare earth" value={Math.round(params.soil * 100) + "%"} />
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[params.soil]}
          onValueChange={([v]) => setSoil(v ?? 0.3)}
        />
      </section>

      <section>
        <FieldLabel title="Wind" value={params.wind} />
        <div className="grid w-36 grid-cols-3 gap-1">
          {(["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"] as const).map((dir) =>
            dir === null ? (
              <div
                key="calm"
                className="flex size-11 items-center justify-center rounded-sm bg-bg-subtle"
              >
                <span className="size-1.5 rounded-full bg-fg-subtle" />
              </div>
            ) : (
              <button
                key={dir}
                type="button"
                onClick={() => setWind(dir)}
                aria-label={`Wind ${dir}`}
                className={cn(
                  "flex size-11 items-center justify-center rounded-sm font-mono text-2xs transition-colors duration-150",
                  params.wind === dir
                    ? "bg-primary text-primary-fg"
                    : "bg-bg-subtle text-fg-muted hover:text-fg",
                )}
              >
                {dir}
              </button>
            ),
          )}
        </div>
        <p className="mt-2 text-2xs text-fg-subtle">
          Light and lean {params.wind}. Blades grow against gravity; tiles are not rotation-safe.
        </p>
      </section>

      <section>
        <FieldLabel title="Palette" value={params.paletteId} />
        <div className="grid grid-cols-1 gap-1">
          {PALETTES.map((pal) => (
            <button
              key={pal.id}
              type="button"
              onClick={() => setPaletteId(pal.id)}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150",
                params.paletteId === pal.id ? "bg-bg-subtle" : "hover:bg-bg-subtle/60",
              )}
            >
              <span className="flex h-5 overflow-hidden rounded-xs shadow-border">
                {pal.colors.map((c, i) => (
                  <span
                    key={i}
                    className="h-5 w-3.5"
                    style={{ background: rgbToHex(c) }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-fg">{pal.name}</span>
                <span className="block text-2xs text-fg-subtle">{pal.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <FieldLabel title="Ranks" />
        <div className="grid grid-cols-6 gap-1">
          {RANK_LABELS.map((label, i) => {
            const hex = rgbToHex(params.palette[i] ?? [0, 0, 0]);
            return (
              <label key={label} className="flex cursor-pointer flex-col items-center gap-1">
                <span className="relative block h-8 w-full overflow-hidden rounded-xs shadow-border">
                  <span className="block h-full w-full" style={{ background: hex }} />
                  <input
                    type="color"
                    value={hex}
                    aria-label={label}
                    onChange={(e) => setSwatch(i, e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </span>
                <span className="text-2xs text-fg-subtle">{label}</span>
              </label>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
