/**
 * PolarisOS SCDL chrome variant families — deterministic build-time bridge
 * (Dual-State Art Pass §7, parent spec §10).
 *
 * Authors the arcane console's chrome ornaments (panel corners, divider rails,
 * connection seal, state glyph, command sigil) as SCDL-style vector intents,
 * one variant per latent-ritualism state, and lowers them into an immutable,
 * content-hashed SVG registry the browser resolves at runtime.
 *
 * Laws honored:
 *   - Variant families: every part has all seven states, and every variant in a
 *     family shares identical dimensions and anchors (parent §10.2) — a variant
 *     switch can never shift layout.
 *   - Determinism: same authoring → byte-identical SVG + hash (no timestamps,
 *     no randomness). Generated output is never hand-edited (parent §10.3).
 *   - Palette law (parent §9): obsidian + desaturated brass; cyan reserved for
 *     focus. Rest is dormant; corrupted adds an asymmetric fracture notch.
 *   - One static frame per variant. Awakening is variant-swap + restrained CSS
 *     opacity transitions (no packet-local animation; parent §10.3).
 *
 * Build/test-time only — never imported by the production browser bundle. The
 * generated registry lives in apps/client/src/generated.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- State vocabulary (parent §10.2) ----------------------------------------

export const CHROME_STATES = [
  "rest",
  "focus",
  "pending",
  "success",
  "warning",
  "corrupted",
  "disconnected",
] as const;

export type ChromeState = (typeof CHROME_STATES)[number];

/** Palette law (parent §9): brass dormant default; cyan is focus-only. */
interface StatePaint {
  color: string;
  /** Resting opacity the CSS awakening transitions up from. */
  opacity: number;
}

export const STATE_PAINT: Record<ChromeState, StatePaint> = {
  rest: { color: "#C9A96E", opacity: 0.35 },
  focus: { color: "#61D9FF", opacity: 0.95 },
  pending: { color: "#D8A84D", opacity: 0.8 },
  success: { color: "#68D391", opacity: 0.85 },
  warning: { color: "#E0A94B", opacity: 0.85 },
  corrupted: { color: "#EF5B7A", opacity: 0.9 },
  disconnected: { color: "#A57586", opacity: 0.5 },
};

// --- Chrome parts (parent §10 registry roles) -------------------------------

export const CHROME_PARTS = ["corners", "divider", "state-glyph", "seal", "sigil"] as const;
export type ChromePart = (typeof CHROME_PARTS)[number];

/** Family = `<group>/<part>`; registry key = `<group>/<state>/<part>`. */
export const CHROME_FAMILIES: ReadonlyArray<{ group: string; part: ChromePart }> = [
  { group: "arcane-panel", part: "corners" },
  { group: "arcane-panel", part: "divider" },
  { group: "arcane-panel", part: "state-glyph" },
  { group: "connection", part: "seal" },
  { group: "command-conduit", part: "sigil" },
];

export interface ChromeVariant {
  readonly key: string;
  readonly family: string;
  readonly group: string;
  readonly part: ChromePart;
  readonly state: ChromeState;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
  readonly contentHash: `scdl1:${string}`;
}

export type PolarisChromeRegistry = Readonly<Record<string, ChromeVariant>>;

// --- Deterministic hashing (browser-safe FNV-1a) ----------------------------

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 32 hex chars (128-bit) by folding four rotated passes — stable, no crypto.
  let out = "";
  let h = hash >>> 0;
  for (let pass = 0; pass < 4; pass++) {
    h = (Math.imul(h ^ 0x9e3779b9, 0x01000193) >>> 0);
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

// --- Vector authoring (SCDL-style intents → SVG) ----------------------------
//
// Each part authors a base geometry in a fixed viewBox. State changes only the
// paint (and, for corrupted, an extra asymmetric fracture path) — never the
// viewBox or anchors, so dimensions are identical across a family (§10.2).

interface PartGeometry {
  width: number;
  height: number;
  /** How the SVG scales inside its host (corners/divider stretch to fit). */
  preserveAspectRatio: string;
  /** SVG inner markup parameterized by paint color. */
  body: (color: string, state: ChromeState) => string;
}

function cornersGeometry(): PartGeometry {
  // Four L-brackets at the corners of a 100×100 box (scales to any panel).
  const L = 16; // bracket arm length
  const t = 3; // stroke thickness
  const bracket = (x: number, y: number, dx: number, dy: number): string => (
    `<path d="M ${x + dx * L} ${y} L ${x} ${y} L ${x} ${y + dy * L}" ` +
    `fill="none" stroke="COLOR" stroke-width="${t}" stroke-linecap="square" vector-effect="non-scaling-stroke"/>`
  );
  return {
    width: 100,
    height: 100,
    preserveAspectRatio: "none",
    body: (color) => [
      bracket(2, 2, 1, 1),
      bracket(98, 2, -1, 1),
      bracket(2, 98, 1, -1),
      bracket(98, 98, -1, -1),
    ].join("").replaceAll("COLOR", color),
  };
}

function dividerGeometry(): PartGeometry {
  // A horizontal rail with a center diamond — 100×8 (stretches horizontally).
  return {
    width: 100,
    height: 8,
    preserveAspectRatio: "none",
    body: (color) => (
      `<rect x="0" y="3" width="100" height="2" fill="COLOR" opacity="0.6"/>` +
      `<rect x="0" y="3" width="18" height="2" fill="COLOR"/>` +
      `<rect x="82" y="3" width="18" height="2" fill="COLOR"/>` +
      `<path d="M 50 0 L 54 4 L 50 8 L 46 4 Z" fill="COLOR"/>`
    ).replaceAll("COLOR", color),
  };
}

function stateGlyphGeometry(): PartGeometry {
  // A small rune: nested diamonds — 24×24.
  return {
    width: 24,
    height: 24,
    preserveAspectRatio: "xMidYMid meet",
    body: (color, state) => (
      `<path d="M 12 2 L 22 12 L 12 22 L 2 12 Z" fill="none" stroke="COLOR" stroke-width="2"/>` +
      `<path d="M 12 7 L 17 12 L 12 17 L 7 12 Z" fill="COLOR"/>` +
      (state === "corrupted"
        ? `<path d="M 12 2 L 9 12 L 14 13 L 12 22" fill="none" stroke="#07090D" stroke-width="1.5"/>`
        : "")
    ).replaceAll("COLOR", color),
  };
}

function sealGeometry(): PartGeometry {
  // Connection seal: concentric rings + keyhole — 24×24.
  return {
    width: 24,
    height: 24,
    preserveAspectRatio: "xMidYMid meet",
    body: (color, state) => (
      `<circle cx="12" cy="12" r="10" fill="none" stroke="COLOR" stroke-width="2"/>` +
      `<circle cx="12" cy="12" r="6" fill="none" stroke="COLOR" stroke-width="1.5" opacity="0.7"/>` +
      `<circle cx="12" cy="10" r="2.4" fill="COLOR"/>` +
      `<rect x="11" y="11" width="2" height="6" fill="COLOR"/>` +
      (state === "disconnected"
        ? `<path d="M 4 4 L 20 20" stroke="#07090D" stroke-width="2"/>`
        : "")
    ).replaceAll("COLOR", color),
  };
}

function sigilGeometry(): PartGeometry {
  // Command-execution sigil: a prompt chevron + caret — 24×24.
  return {
    width: 24,
    height: 24,
    preserveAspectRatio: "xMidYMid meet",
    body: (color, state) => (
      `<path d="M 5 6 L 12 12 L 5 18" fill="none" stroke="COLOR" stroke-width="2.5" stroke-linecap="square"/>` +
      `<rect x="13" y="16" width="7" height="2.5" fill="COLOR"/>` +
      (state === "pending"
        ? `<circle cx="19" cy="7" r="2" fill="COLOR"/>`
        : "")
    ).replaceAll("COLOR", color),
  };
}

const GEOMETRY: Record<ChromePart, PartGeometry> = {
  "corners": cornersGeometry(),
  "divider": dividerGeometry(),
  "state-glyph": stateGlyphGeometry(),
  "seal": sealGeometry(),
  "sigil": sigilGeometry(),
};

function renderSvg(part: ChromePart, state: ChromeState): { svg: string; width: number; height: number } {
  const geometry = GEOMETRY[part];
  const paint = STATE_PAINT[state];
  const body = geometry.body(paint.color, state);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geometry.width} ${geometry.height}" ` +
    `width="${geometry.width}" height="${geometry.height}" preserveAspectRatio="xMidYMid meet">` +
    body +
    `</svg>`;
  return { svg, width: geometry.width, height: geometry.height };
}

// --- Registry construction --------------------------------------------------

export function familyKey(group: string, part: ChromePart): string {
  return `${group}/${part}`;
}

export function variantKey(group: string, state: ChromeState, part: ChromePart): string {
  return `${group}/${state}/${part}`;
}

/**
 * Author the full chrome registry: every family × every state. Deterministic —
 * identical output (and hashes) on every run.
 */
export function buildPolarisChromeRegistry(): PolarisChromeRegistry {
  const registry: Record<string, ChromeVariant> = {};
  for (const { group, part } of CHROME_FAMILIES) {
    for (const state of CHROME_STATES) {
      const { svg, width, height } = renderSvg(part, state);
      const key = variantKey(group, state, part);
      const contentHash = `scdl1:${fnv1aHex(`${key}\u0000${svg}`)}` as `scdl1:${string}`;
      registry[key] = {
        key,
        family: familyKey(group, part),
        group,
        part,
        state,
        width,
        height,
        svg,
        contentHash,
      };
    }
  }
  return registry;
}

// --- Codegen ----------------------------------------------------------------

const BANNER =
  "/* AUTO-GENERATED by scripts/build-polaris-chrome.ts — do not hand-edit. */\n";

export function chromeRegistrySource(registry: PolarisChromeRegistry): string {
  const sortedKeys = Object.keys(registry).sort();
  const entries = sortedKeys.map((key) => {
    const v = registry[key];
    return (
      `  ${JSON.stringify(key)}: {\n` +
      `    key: ${JSON.stringify(v.key)},\n` +
      `    family: ${JSON.stringify(v.family)},\n` +
      `    group: ${JSON.stringify(v.group)},\n` +
      `    part: ${JSON.stringify(v.part)},\n` +
      `    state: ${JSON.stringify(v.state)},\n` +
      `    width: ${v.width},\n` +
      `    height: ${v.height},\n` +
      `    contentHash: ${JSON.stringify(v.contentHash)},\n` +
      `    svg: ${JSON.stringify(v.svg)},\n` +
      `  }`
    );
  });
  return (
    `${BANNER}` +
    `export interface PolarisChromeVariant {\n` +
    `  readonly key: string;\n` +
    `  readonly family: string;\n` +
    `  readonly group: string;\n` +
    `  readonly part: string;\n` +
    `  readonly state: string;\n` +
    `  readonly width: number;\n` +
    `  readonly height: number;\n` +
    `  readonly contentHash: \`scdl1:\${string}\`;\n` +
    `  readonly svg: string;\n` +
    `}\n\n` +
    `export type PolarisChromeRegistry = Readonly<Record<string, PolarisChromeVariant>>;\n\n` +
    `export const polarisChromeRegistry: PolarisChromeRegistry = {\n${entries.join(",\n")}\n};\n`
  );
}

export interface BuildPolarisChromeOptions {
  registryFile: string;
}

export interface BuildPolarisChromeResult {
  registry: PolarisChromeRegistry;
  variantCount: number;
  files: readonly string[];
}

export function buildPolarisChrome(options: BuildPolarisChromeOptions): BuildPolarisChromeResult {
  const registry = buildPolarisChromeRegistry();
  const source = chromeRegistrySource(registry);
  mkdirSync(dirname(options.registryFile), { recursive: true });
  writeFileSync(options.registryFile, source, "utf8");
  return {
    registry,
    variantCount: Object.keys(registry).length,
    files: [options.registryFile],
  };
}

// --- CLI entrypoint (npm run polaris:build-chrome) --------------------------

function resolveRepoRoot(): string {
  try {
    if (import.meta.url.startsWith("file:")) {
      return resolve(dirname(fileURLToPath(import.meta.url)), "..");
    }
  } catch {
    // fall through
  }
  return process.cwd();
}

let isDirectRun: boolean;
try {
  isDirectRun =
    !!process.argv[1] &&
    import.meta.url.startsWith("file:") &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url);
} catch {
  isDirectRun = false;
}

if (isDirectRun) {
  const root = resolveRepoRoot();
  const result = buildPolarisChrome({
    registryFile: resolve(root, "apps/client/src/generated/polaris-chrome.registry.ts"),
  });
  console.log(`polaris-chrome: wrote ${result.variantCount} chrome variants → ${result.files[0]}`);
}
