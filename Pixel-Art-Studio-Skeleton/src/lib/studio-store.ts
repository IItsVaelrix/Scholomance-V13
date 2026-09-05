import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateGrass } from "@/lib/grass/engine.ts";
import { defaultParams } from "@/lib/grass/engine.ts";
import { getPalette, hexToRgb } from "@/lib/grass/palettes.ts";
import type {
  GrassParams,
  GrassResult,
  SavedTile,
  TileSize,
  ViewMode,
  LayerMode,
  WindDir,
  RGB,
} from "@/lib/grass/types.ts";

const VARIANT_OFFSETS = [0, 19, 47, 83] as const;

function withPalette(params: GrassParams, paletteId: string, colors?: RGB[]): GrassParams {
  const pal = colors ?? getPalette(paletteId).colors;
  return { ...params, paletteId, palette: pal };
}

function craft(params: GrassParams): { result: GrassResult; variants: GrassResult[] } {
  const result = generateGrass(params);
  const variants = VARIANT_OFFSETS.map((off) =>
    generateGrass({ ...params, seed: (params.seed + off) >>> 0 }),
  );
  return { result, variants };
}

const BOOT = craft(defaultParams());

function randomSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return (Date.now() ^ 0x9e3779b1) >>> 0;
}

type StudioState = {
  params: GrassParams;
  result: GrassResult | null;
  variants: GrassResult[];
  view: ViewMode;
  layer: LayerMode;
  showGrid: boolean;
  library: SavedTile[];
  hover: { x: number; y: number; rank: number } | null;
  ready: boolean;
  grow: () => void;
  recraft: () => void;
  hydrate: () => void;
  setSize: (size: TileSize) => void;
  setDensity: (v: number) => void;
  setSoil: (v: number) => void;
  setBladeScale: (v: number) => void;
  setWind: (w: WindDir) => void;
  setSeed: (seed: number) => void;
  setPaletteId: (id: string) => void;
  setSwatch: (index: number, hex: string) => void;
  setView: (v: ViewMode) => void;
  setLayer: (l: LayerMode) => void;
  toggleGrid: () => void;
  setHover: (h: StudioState["hover"]) => void;
  loadResult: (result: GrassResult, seed?: number) => void;
  saveCurrent: () => void;
  loadSaved: (tile: SavedTile) => void;
  removeSaved: (id: string) => void;
};

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      params: defaultParams(),
      result: BOOT.result,
      variants: BOOT.variants,
      view: "meadow",
      layer: "final",
      showGrid: false,
      library: [],
      hover: null,
      ready: true,

      hydrate: () => {
        const { params } = get();
        const pal = params.paletteId ? getPalette(params.paletteId) : getPalette("meadow");
        const next = withPalette(
          { ...defaultParams(), ...params, width: params.width, height: params.height },
          params.paletteId || pal.id,
          params.palette?.length === 6 ? params.palette : pal.colors,
        );
        const { result, variants } = craft(next);
        set({ params: next, result, variants, ready: true });
      },

      recraft: () => {
        const { result, variants } = craft(get().params);
        set({ result, variants });
      },

      grow: () => {
        const params = { ...get().params, seed: randomSeed() };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setSize: (size) => {
        const params = { ...get().params, width: size, height: size };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setDensity: (v) => {
        const params = { ...get().params, density: v };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setSoil: (v) => {
        const params = { ...get().params, soil: v };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setBladeScale: (v) => {
        const params = { ...get().params, bladeScale: v };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setWind: (w) => {
        const params = { ...get().params, wind: w };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setSeed: (seed) => {
        const params = { ...get().params, seed: seed >>> 0 };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      setPaletteId: (id) => {
        const pal = getPalette(id);
        const params = withPalette(get().params, id, pal.colors);
        const result = get().result;
        const variants = get().variants;
        const recolor = (r: GrassResult): GrassResult => ({
          ...r,
          palette: pal.colors.map(
            ([r0, g0, b0]) =>
              `#${[r0, g0, b0].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
          ),
          rgb: pal.colors,
        });
        set({
          params,
          result: result ? recolor(result) : result,
          variants: variants.map(recolor),
        });
      },

      setSwatch: (index, hex) => {
        const rgb = hexToRgb(hex);
        const next = get().params.palette.slice() as RGB[];
        next[index] = rgb;
        const params = { ...get().params, palette: next, paletteId: "custom" };
        const hexes = next.map(
          ([r0, g0, b0]) =>
            `#${[r0, g0, b0].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`,
        );
        const recolor = (r: GrassResult): GrassResult => ({
          ...r,
          palette: hexes,
          rgb: next,
        });
        set({
          params,
          result: get().result ? recolor(get().result!) : get().result,
          variants: get().variants.map(recolor),
        });
      },

      setView: (view) => set({ view }),
      setLayer: (layer) => set({ layer }),
      toggleGrid: () => set({ showGrid: !get().showGrid }),
      setHover: (hover) => set({ hover }),

      loadResult: (result, seed) => {
        const params = seed !== undefined ? { ...get().params, seed } : get().params;
        set({ result, params });
      },

      saveCurrent: () => {
        const { result, params, library } = get();
        if (!result) return;
        const tile: SavedTile = {
          id: `${params.seed.toString(16)}-${Date.now().toString(36)}`,
          name: `${params.paletteId} · ${params.width}`,
          savedAt: Date.now(),
          params: { ...params },
          field: Array.from(result.field),
          palette: result.palette,
        };
        set({ library: [tile, ...library].slice(0, 48) });
      },

      loadSaved: (tile) => {
        const params = { ...tile.params };
        const { result, variants } = craft(params);
        set({ params, result, variants });
      },

      removeSaved: (id) => set({ library: get().library.filter((t) => t.id !== id) }),
    }),
    {
      name: "sward-studio",
      skipHydration: true,
      partialize: (s) => ({ params: s.params, library: s.library, view: s.view }),
    },
  ),
);
