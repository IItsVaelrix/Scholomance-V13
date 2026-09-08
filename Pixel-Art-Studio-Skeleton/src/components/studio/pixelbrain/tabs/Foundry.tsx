import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Library, Sprout } from "lucide-react";
import {
  generateStudioGrass,
  getStudioGrassDefaults,
  getStudioGrassPalettes,
} from "@/lib/pixelbrain/studio-facade.js";

const WIND_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TILE_SIZES = [16, 24, 32, 48, 64];
const LIBRARY_KEY = "pixelbrain.sward.library.v1";

type GrassResult = {
  width: number;
  height: number;
  field: ArrayLike<number>;
  ground: ArrayLike<number>;
  blades: ArrayLike<number>;
  palette: string[];
  diagnostics: {
    accepted: boolean;
    attempts: number;
    tuftCount: number;
    fillCount: number;
    fractions: Record<number, number>;
    seed: number;
  };
};

type GrassParams = {
  width: number;
  height: number;
  seed: number;
  density: number;
  wind: string;
  soil: number;
  bladeScale: number;
  paletteId: string;
  palette: number[][];
};

function resultLayer(result: GrassResult, layer: string) {
  return layer === "ground" ? result.ground : layer === "blades" ? result.blades : result.field;
}

function drawResult(
  canvas: HTMLCanvasElement | null,
  result: GrassResult,
  repeat: number,
  layer: string,
) {
  if (!canvas) return;
  const field = resultLayer(result, layer);
  canvas.width = result.width * repeat;
  canvas.height = result.height * repeat;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let tileY = 0; tileY < repeat; tileY += 1) {
    for (let tileX = 0; tileX < repeat; tileX += 1) {
      for (let y = 0; y < result.height; y += 1) {
        for (let x = 0; x < result.width; x += 1) {
          const rank = field[y * result.width + x] ?? -1;
          if (rank < 0) continue;
          context.fillStyle = result.palette[rank] ?? "#000000";
          context.fillRect(tileX * result.width + x, tileY * result.height + y, 1, 1);
        }
      }
    }
  }
}

function GrassCanvas({
  result,
  repeat = 1,
  layer = "final",
  label,
  compact = false,
}: {
  result: GrassResult;
  repeat?: number;
  layer?: string;
  label: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => drawResult(ref.current, result, repeat, layer), [result, repeat, layer]);
  return <canvas ref={ref} className={compact ? "is-compact" : ""} aria-label={label} role="img" />;
}

function readLibrary(): Array<{ id: string; name: string; width: number }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

type FoundryProps = {
  onUseInCanvas?: (result: GrassResult, mode: "layer" | "document") => void;
};

export function Foundry({ onUseInCanvas }: FoundryProps = {}) {
  const palettes = useMemo(() => getStudioGrassPalettes(), []);
  const [params, setParams] = useState<GrassParams>(() => getStudioGrassDefaults() as GrassParams);
  const [result, setResult] = useState<GrassResult>(
    () => generateStudioGrass(getStudioGrassDefaults()) as unknown as GrassResult,
  );
  const [variants, setVariants] = useState<GrassResult[]>([]);
  const [repeat, setRepeat] = useState(1);
  const [layer, setLayer] = useState("final");
  const [library, setLibrary] = useState(readLibrary);
  const [notice, setNotice] = useState("Form first · colour second · deterministic seed");
  const [analysis, setAnalysis] = useState("No intake loaded. Grow a field or import a PNG to inspect duplicates.");

  const update = <K extends keyof GrassParams>(key: K, value: GrassParams[K]) =>
    setParams((current) => ({ ...current, [key]: value }));
  const palette =
    palettes.find((entry: { id: string }) => entry.id === params.paletteId) ?? palettes[0];

  const grow = () => {
    const nextParams = { ...params, palette: palette.colors };
    const next = generateStudioGrass(nextParams) as unknown as GrassResult;
    setParams(nextParams);
    setResult(next);
    setVariants(
      [0, 1, 2, 3].map(
        (offset) =>
          generateStudioGrass({
            ...nextParams,
            seed: (Number(nextParams.seed) + offset) >>> 0,
          }) as unknown as GrassResult,
      ),
    );
    setNotice(`Accepted seed ${next.diagnostics.seed} in ${next.diagnostics.attempts} attempt(s).`);
  };

  const saveLocal = () => {
    const entry = {
      id: `sward-${params.seed}-${result.width}x${result.height}`,
      name: `Sward ${Number(params.seed).toString(16).toUpperCase()}`,
      width: result.width,
    };
    const next = [entry, ...library.filter((item) => item.id !== entry.id)].slice(0, 20);
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
      setLibrary(next);
      setNotice(`Saved ${entry.name} to the browser-local library.`);
    } catch {
      setNotice("Browser-local storage is unavailable; export the PNG to keep this field.");
    }
  };

  const exportPng = () => {
    const canvas = document.createElement("canvas");
    drawResult(canvas, result, repeat, layer);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sward-${params.seed}-${result.width}x${result.height}-r${repeat}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  return (
    <section className="pbs-panel pbs-foundry" aria-labelledby="pbs-foundry-title">
      <header className="pbs-section-header">
        <div>
          <p>SWARD GENERATOR · LITERAL ENGINE PORT</p>
          <h2 id="pbs-foundry-title">Grass Foundry</h2>
        </div>
        <code data-testid="grass-dimensions">
          {result.width}×{result.height} · seed {String(params.seed)}
        </code>
      </header>
      <div className="pbs-foundry-grid">
        <aside className="pbs-plane pbs-controls">
          <label>
            <span>Tile size</span>
            <select
              value={String(params.width)}
              onChange={(event) => {
                const size = Number(event.target.value);
                setParams((current) => ({ ...current, width: size, height: size }));
              }}
            >
              {TILE_SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Seed</span>
            <input
              type="number"
              value={String(params.seed)}
              onChange={(event) => update("seed", Number(event.target.value) >>> 0)}
            />
          </label>
          {(
            [
              ["density", "Density"],
              ["soil", "Soil"],
              ["bladeScale", "Blade scale"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span>
                {label} · {params[key].toFixed(2)}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={params[key]}
                onChange={(event) => update(key, Number(event.target.value))}
              />
            </label>
          ))}
          <label>
            <span>Wind</span>
            <select
              value={String(params.wind)}
              onChange={(event) => update("wind", event.target.value)}
            >
              {WIND_DIRECTIONS.map((wind) => (
                <option key={wind}>{wind}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Intake PNG</span>
            <input
              type="file"
              accept="image/png"
              aria-label="Foundry intake PNG"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const bytes = new Uint8Array(await file.arrayBuffer());
                setAnalysis(`Intake ${file.name} · ${bytes.length} bytes · formula ${params.paletteId}`);
              }}
            />
          </label>
          <label>
            <span>Biome palette</span>
            <select
              value={String(params.paletteId)}
              onChange={(event) => update("paletteId", event.target.value)}
            >
              {palettes.map((entry: { id: string; name: string; note: string }) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.note}
                </option>
              ))}
            </select>
          </label>
          <div className="pbs-swatches" aria-label="Palette ranks">
            {palette.colors.map((rgb: number[], index: number) => (
              <span
                key={index}
                style={{ background: `rgb(${rgb.join(",")})` }}
                title={`Rank ${index}`}
              />
            ))}
          </div>
          <button type="button" className="pbs-button is-primary" onClick={grow}>
            <Sprout size={16} />
            Grow deterministic variants
          </button>
        </aside>

        <div className="pbs-plane pbs-preview">
          <div className="pbs-viewbar" aria-label="Grass preview controls">
            {[1, 2, 8].map((count) => (
              <button
                key={count}
                type="button"
                className={repeat === count ? "is-active" : ""}
                onClick={() => setRepeat(count)}
              >
                {count === 1 ? "Tile" : `${count}× repeat`}
              </button>
            ))}
            {["final", "ground", "blades"].map((name) => (
              <button
                key={name}
                type="button"
                className={layer === name ? "is-active" : ""}
                onClick={() => setLayer(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="pbs-canvas-stage">
            <GrassCanvas
              result={result}
              repeat={repeat}
              layer={layer}
              label={`${repeat} by ${repeat} seamless grass ${layer} preview`}
            />
          </div>
          <div className="pbs-variants">
            {variants.map((variant, index) => (
              <button
                type="button"
                key={variant.diagnostics.seed}
                onClick={() => {
                  setResult(variant);
                  update("seed", variant.diagnostics.seed);
                }}
                aria-label={`Use variant seed ${variant.diagnostics.seed}`}
              >
                <GrassCanvas compact result={variant} label={`Grass variant ${index + 1}`} />
                <span>{variant.diagnostics.seed}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="pbs-plane pbs-evidence">
          <h3>Field diagnostics</h3>
          <dl className="pbs-receipt">
            <div>
              <dt>Accepted</dt>
              <dd>{result.diagnostics.accepted ? "YES" : "BEST FIELD"}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{result.diagnostics.attempts}</dd>
            </div>
            <div>
              <dt>Tufts</dt>
              <dd>{result.diagnostics.tuftCount}</dd>
            </div>
            <div>
              <dt>Scatter</dt>
              <dd>{result.diagnostics.fillCount}</dd>
            </div>
          </dl>
          <div className="pbs-histogram">
            {result.palette.map((color, rank) => (
              <div key={color}>
                <span
                  style={{
                    height: `${Math.max(4, (result.diagnostics.fractions[rank] || 0) * 100)}%`,
                    background: color,
                  }}
                />
                <small>{((result.diagnostics.fractions[rank] || 0) * 100).toFixed(1)}</small>
              </div>
            ))}
          </div>
          <div className="pbs-actions">
            <button className="pbs-button" type="button" onClick={saveLocal}>
              <Library size={15} />
              Keep local
            </button>
            <button className="pbs-button" type="button" onClick={exportPng}>
              <Download size={15} />
              Export PNG
            </button>
            {onUseInCanvas ? (
              <>
                <button className="pbs-button is-primary" type="button" onClick={() => onUseInCanvas(result, "layer")}>
                  Use in Canvas
                </button>
                <button className="pbs-button" type="button" onClick={() => onUseInCanvas(result, "document")}>
                  New Canvas from field
                </button>
              </>
            ) : null}
          </div>
          <p className="pbs-status" role="status" aria-live="polite">
            {notice}
          </p>
          <p className="pbs-note">
            {analysis} Duplicate versus library:{" "}
            {library.some((item) => item.id.includes(String(params.seed))) ? "MATCH" : "NONE"}
          </p>
          <details>
            <summary>Local library · {library.length}</summary>
            {library.map((item) => (
              <p key={item.id}>
                {item.name} · {item.width}px
              </p>
            ))}
          </details>
        </aside>
      </div>
    </section>
  );
}
