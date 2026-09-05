import type { RGB } from "./types.ts";

export type PaletteDef = {
  id: string;
  name: string;
  note: string;
  colors: RGB[];
};

/**
 * Six ranks, dark shadow → sparse tip. Tight families so the tile reads as
 * one material (grass), not a rainbow. Tips stay in-family — never neon lime.
 */
export const PALETTES: PaletteDef[] = [
  {
    id: "meadow",
    name: "Meadow",
    note: "Balanced field",
    colors: [
      [18, 38, 16],
      [32, 58, 26],
      [46, 78, 34],
      [54, 96, 38],
      [86, 140, 52],
      [176, 204, 92],
    ],
  },
  {
    id: "deep",
    name: "Understory",
    note: "Mossy shade",
    colors: [
      [10, 24, 14],
      [20, 42, 24],
      [32, 60, 36],
      [42, 78, 46],
      [64, 112, 62],
      [148, 186, 96],
    ],
  },
  {
    id: "lawn",
    name: "Lawn",
    note: "Even, tended",
    colors: [
      [22, 48, 18],
      [38, 72, 28],
      [52, 96, 36],
      [62, 116, 42],
      [96, 156, 54],
      [188, 216, 88],
    ],
  },
  {
    id: "spring",
    name: "Spring",
    note: "Fresh growth",
    colors: [
      [20, 44, 16],
      [36, 70, 26],
      [54, 96, 34],
      [70, 122, 40],
      [112, 168, 56],
      [206, 226, 110],
    ],
  },
  {
    id: "marsh",
    name: "Marsh",
    note: "Cool, wet",
    colors: [
      [16, 32, 26],
      [26, 50, 40],
      [38, 70, 54],
      [48, 88, 64],
      [72, 124, 88],
      [164, 198, 148],
    ],
  },
  {
    id: "prairie",
    name: "Prairie",
    note: "Dry, sun-bleached",
    colors: [
      [36, 34, 16],
      [54, 52, 22],
      [74, 78, 30],
      [90, 98, 36],
      [122, 132, 48],
      [196, 186, 96],
    ],
  },
  {
    id: "dusk",
    name: "Dusk",
    note: "Low, cool light",
    colors: [
      [14, 22, 18],
      [24, 38, 30],
      [36, 54, 42],
      [48, 70, 52],
      [70, 98, 70],
      [150, 168, 108],
    ],
  },
  {
    id: "worn",
    name: "Worn path",
    note: "Earth showing through",
    colors: [
      [42, 32, 18],
      [58, 50, 24],
      [52, 72, 30],
      [70, 92, 36],
      [102, 128, 48],
      [186, 178, 92],
    ],
  },
];

export const DEFAULT_PALETTE_ID = "meadow";

export function getPalette(id: string): PaletteDef {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  const v = Number.parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
