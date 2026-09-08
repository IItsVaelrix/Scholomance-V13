import * as Dialog from "@radix-ui/react-dialog";
import { Code2, X } from "lucide-react";
import { useState } from "react";

type ScdlDiagnostic = {
  severity: string;
  code: string;
  message: string;
  line: number;
  col: number;
};

type ScdlIngestionResult = {
  ok: boolean;
  assetId: string | null;
  diagnostics: readonly ScdlDiagnostic[];
};

type ScdlIngestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompile: (source: string) => ScdlIngestionResult;
};

const TEMPLATES: Record<string, { label: string; source: string }> = {
  v2_starter: {
    label: "SCDL v2 Starter",
    source: `SCDL 2
ASSET starter_v2
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 256 GENERATED_SHAPES 4 RASTER_CELLS 256

CONST $bg COLOR #1a1a24
CONST $ink COLOR #55ccff
CONST $glow COLOR #ffffff

SHAPE $frame (RECT AT (VEC2 (PX 2) (PX 2)) SIZE (VEC2 (PX 12) (PX 12)))
SHAPE $core (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
SHAPE $spark (PIXEL AT (VEC2 (PX 8) (PX 8)))

LAYER background ORDER 0 {
  PAINT $frame FILL $bg RASTER MIDPOINT
}

LAYER glyph ORDER 10 {
  PAINT $core FILL $ink RASTER MIDPOINT
  PAINT $spark FILL $glow RASTER CENTER
}`,
  },
  v2_void_sigil: {
    label: "SCDL v2 Void Sigil",
    source: `SCDL 2
ASSET void_sigil
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 20 RASTER_CELLS 2048

CONST $center VEC2 (VEC2 (PX 16) (PX 16))
CONST $ring_radius PX (PX 12)
CONST $ring_th PX (PX 2)

SHAPE $portal_ring (RING CENTER $center RADIUS $ring_radius THICKNESS $ring_th)
SHAPE $core_star (STAR CENTER $center POINTS 4 INNER_RADIUS (PX 4) OUTER_RADIUS (PX 9))
SHAPE $rune_box (RECT CENTER $center SIZE (VEC2 (PX 14) (PX 14)))
SHAPE $sigil_cut (SUBTRACT $portal_ring $rune_box)
SHAPE $sigil_edge (OUTLINE $sigil_cut WIDTH (PX 1))

MASK $void_clip (TO_MASK $portal_ring)

ANCHOR $origin_anchor ON $portal_ring AT (ANCHOR_OF $portal_ring CENTER)
ASSERT (INSIDE $center $portal_ring)

LAYER backdrop ORDER 0 BLEND REPLACE OPACITY 1.0 {
  PAINT $portal_ring FILL #1A0B2E RASTER MIDPOINT
}

LAYER glyphs ORDER 10 BLEND OVER OPACITY 0.8 {
  PAINT $core_star FILL #9B5DE5 RASTER CENTER CLIP_TO $void_clip
  PAINT $sigil_edge FILL #F15BB5 RASTER BRESENHAM
}`,
  },
  v1_legacy: {
    label: "SCDL v1 Legacy",
    source: `asset new_sprite canvas 16x16
palette {
  ink = #dce4d2
  glow = #9cba7a
}
part body material source {
  rect 4 4 8 8 ink
}
part focal material source {
  cell 8 8 glow
}`,
  },
};

export function ScdlIngestionDialog({ open, onOpenChange, onCompile }: ScdlIngestionDialogProps) {
  const [source, setSource] = useState(TEMPLATES.v2_starter.source);
  const [diagnostics, setDiagnostics] = useState<readonly ScdlDiagnostic[]>([]);

  const compile = () => {
    const result = onCompile(source);
    setDiagnostics(result.diagnostics);
    if (result.ok) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pbs-scdl-overlay" />
        <Dialog.Content className="pbs-scdl-dialog">
          <header className="pbs-scdl-dialog-header">
            <span className="pbs-scdl-glyph" aria-hidden="true">
              <Code2 size={18} />
            </span>
            <div>
              <Dialog.Title>Ingest SCDL</Dialog.Title>
              <Dialog.Description>Compile construction law into editable Canvas layers (supports SCDL 1 and SCDL 2).</Dialog.Description>
            </div>
            <Dialog.Close className="pbs-icon-button" aria-label="Close SCDL ingestion">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <form
            className="pbs-scdl-form"
            onSubmit={(event) => {
              event.preventDefault();
              compile();
            }}
          >
            <div className="pbs-scdl-source">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                <span>SCDL source</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {Object.entries(TEMPLATES).map(([key, tpl]) => (
                    <button
                      key={key}
                      type="button"
                      className="pbs-button"
                      style={{ padding: "2px 8px", fontSize: "0.72rem", height: "26px", minHeight: "26px" }}
                      onClick={() => {
                        setSource(tpl.source);
                        setDiagnostics([]);
                      }}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            <div className="pbs-scdl-diagnostics" role="status" aria-live="polite">
              {diagnostics.length ? (
                <ol>
                  {diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.code}:${diagnostic.line}:${diagnostic.col}:${index}`}>
                      <code>{diagnostic.code}</code>
                      <span>
                        line {diagnostic.line}, col {diagnostic.col} · {diagnostic.message}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Static SCDL compiles locally. The active document changes only after a valid compile.</p>
              )}
            </div>
            <footer className="pbs-scdl-actions">
              <Dialog.Close className="pbs-button" type="button">
                Cancel
              </Dialog.Close>
              <button className="pbs-button is-primary" type="submit">
                Compile to Canvas
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
