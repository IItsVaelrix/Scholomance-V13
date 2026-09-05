import { RANK_LABELS } from "@/lib/grass/types.ts";
import type { RGB } from "@/lib/grass/types.ts";
import { rgbToHex } from "@/lib/grass/palettes.ts";

export function Histogram({
  fractions,
  palette,
}: {
  fractions: Record<number, number>;
  palette: RGB[];
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {RANK_LABELS.map((label, i) => {
        const pct = Math.round((fractions[i] ?? 0) * 1000) / 10;
        const hex = rgbToHex(palette[i] ?? [0, 0, 0]);
        return (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex h-10 items-end rounded-xs bg-bg-subtle">
              <div
                className="w-full rounded-xs"
                style={{ height: `${Math.max(4, Math.min(100, pct * 2))}%`, background: hex }}
              />
            </div>
            <div className="truncate font-mono text-2xs text-fg-subtle tabular-nums">
              {pct.toFixed(1)}
            </div>
            <div className="truncate text-2xs text-fg-muted">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
