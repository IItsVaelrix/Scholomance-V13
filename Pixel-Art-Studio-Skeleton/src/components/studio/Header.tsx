import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCanvas, makeTileCanvas } from "@/lib/grass/render.ts";
import type { RGB } from "@/lib/grass/types.ts";
import { useStudio } from "@/lib/studio-store";
import { ChevronDown, Copy, Download, Dices, FolderPlus } from "lucide-react";
import { toast } from "sonner";

export function Header() {
  const params = useStudio((s) => s.params);
  const result = useStudio((s) => s.result);
  const view = useStudio((s) => s.view);
  const variants = useStudio((s) => s.variants);
  const grow = useStudio((s) => s.grow);
  const saveCurrent = useStudio((s) => s.saveCurrent);
  const setSeed = useStudio((s) => s.setSeed);
  const [seedDraft, setSeedDraft] = useState(String(params.seed));
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeedDraft(String(params.seed));
  }, [params.seed]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const commitSeed = () => {
    const n = Number(seedDraft);
    if (Number.isFinite(n) && (n >>> 0) !== params.seed) setSeed(n >>> 0);
    else setSeedDraft(String(params.seed));
  };

  const savePng = (
    field: ArrayLike<number>,
    rgb: RGB[],
    width: number,
    height: number,
    scale: number,
    repeatX: number,
    repeatY: number,
    filename: string,
  ) => {
    if (!result) return;
    const canvas = makeTileCanvas(field, rgb, width, height, scale, repeatX, repeatY);
    downloadCanvas(canvas, filename);
    toast("PNG ready — save the file if the browser opened it in a tab");
    setOpen(false);
  };

  const exportTile = (scale: number) => {
    if (!result) return;
    const name = `sward-${params.seed.toString(16)}-${result.width}${scale === 1 ? "" : `-${scale}x`}.png`;
    savePng(result.field, result.rgb, result.width, result.height, scale, 1, 1, name);
  };

  const exportView = () => {
    if (!result) return;
    const repeats = view === "meadow" ? 8 : view === "quad" ? 2 : 1;
    const scale = repeats === 1 ? 8 : repeats === 2 ? 6 : 3;
    const name = `sward-${params.seed.toString(16)}-${result.width}-x${repeats}-${scale}x.png`;
    savePng(result.field, result.rgb, result.width, result.height, scale, repeats, repeats, name);
  };

  const exportSheet = () => {
    if (!result || variants.length === 0) return;
    const cols = 2;
    const rows = 2;
    const scale = 8;
    const tw = result.width * scale;
    const th = result.height * scale;
    const sheet = document.createElement("canvas");
    sheet.width = tw * cols;
    sheet.height = th * rows;
    const ctx = sheet.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    variants.slice(0, 4).forEach((v, i) => {
      const tile = makeTileCanvas(v.field, v.rgb, v.width, v.height, scale, 1, 1);
      const x = (i % cols) * tw;
      const y = Math.floor(i / cols) * th;
      ctx.drawImage(tile, x, y);
    });
    downloadCanvas(sheet, `sward-${params.seed.toString(16)}-set.png`);
    toast("PNG ready — save the file if the browser opened it in a tab");
    setOpen(false);
  };

  const copySeed = async () => {
    try {
      await navigator.clipboard.writeText(String(params.seed));
      toast("Seed copied");
    } catch {
      toast("Could not copy");
    }
  };

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="font-display text-2xl font-medium tracking-tight italic text-fg">Sward</h1>
        <p className="hidden text-sm text-fg-muted sm:block">Pixel grass, grown not painted</p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="hidden items-center gap-2 sm:flex">
          <span className="text-2xs text-fg-subtle">Seed</span>
          <Input
            value={seedDraft}
            inputMode="numeric"
            onChange={(e) => setSeedDraft(e.target.value)}
            onBlur={commitSeed}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSeed();
            }}
            className="h-11 w-28 font-mono text-xs tabular-nums"
          />
        </label>
        <Button variant="outline" size="icon" onClick={copySeed} aria-label="Copy seed">
          <Copy />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Keep in library"
          onClick={() => {
            saveCurrent();
            toast("Saved to library");
          }}
        >
          <FolderPlus />
        </Button>
        <div className="relative" ref={menuRef}>
          <Button variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Download />
            Export
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
          {open ? (
            <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md bg-bg-elevated py-1 shadow-border">
              <button
                type="button"
                className="flex w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-bg-subtle"
                onClick={() => exportTile(1)}
              >
                Tile · native
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-bg-subtle"
                onClick={() => exportTile(8)}
              >
                Tile · 8×
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-bg-subtle"
                onClick={exportView}
              >
                Current view
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-bg-subtle"
                onClick={exportSheet}
              >
                Four-variant sheet
              </button>
            </div>
          ) : null}
        </div>
        <Button onClick={grow}>
          <Dices />
          Grow
        </Button>
      </div>
    </header>
  );
}
