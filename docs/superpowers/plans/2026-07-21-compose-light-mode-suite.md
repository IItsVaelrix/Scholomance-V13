# Compose Full Light Mode Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Compose-owned dual dark/light DTCG theme suites with pure-white light values and chrome-density tokens, emit theme CSS bound to `data-theme`, and rebind app/CSS/kits so the sun/moon ThemeToggle flips the full suite.

**Architecture:** Author parallel `tokens/compose/themes/{dark,light}.json` with path parity. `assertThemeParity` + `applyDerivedTransforms` + `generateThemeCSS` emit `src/lib/css/generated/compose-themes.css` with `:root,[data-theme='dark']` and `[data-theme='light']` blocks (Compose vars + public aliases). Existing ThemeToggle/`useTheme` already sets `data-theme`; migration rebinds `--bg-*`, `--text-*`, `--ritual-abyss`, CZ tokens, and chrome metrics to those aliases.

**Tech Stack:** DTCG JSON, Compose token modules (`src/core/compose/tokens`), Vitest, CSS custom properties, existing ThemeToggle.

**Spec:** `docs/superpowers/specs/2026-07-21-compose-light-mode-suite-design.md`

## Global Constraints

- Light surfaces are pure white / near-white only: `#ffffff` and `#fafafa` (no cream/parchment).
- Every theme semantic path must exist in both suites (parity gate fails otherwise).
- Theme application is only via `data-theme` on `document.documentElement` (ThemeToggle / `useTheme`); no second switch.
- Public CSS variable names stay stable; bridge via aliases, do not rename consumers in bulk.
- Generated `compose-themes.css` is never hand-edited.
- Landing storm/galaxy: ornament opacity dimming only — do not recolor canvas to white paint.

## File map

| File | Responsibility |
|------|----------------|
| `tokens/compose/themes/dark.json` | Dark theme DTCG suite |
| `tokens/compose/themes/light.json` | Pure-white light DTCG suite (path-identical) |
| `src/core/compose/tokens/theme-parity.ts` | Path collection + parity assert |
| `src/core/compose/tokens/theme-transforms.ts` | Derived transform registry |
| `src/core/compose/tokens/theme-css.ts` | Dual-suite CSS emit + public aliases |
| `src/core/compose/tokens/index.ts` | Re-exports |
| `scripts/generate-compose-themes.mjs` | Write generated CSS to disk |
| `src/lib/css/generated/compose-themes.css` | Generated output |
| `src/index.css` | Import generated themes; rebind base colors to aliases |
| `src/kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css` | CZ light → Compose aliases |
| `src/pages/Read/IDE.css` | Chrome density + surface vars |
| `tests/qa/features/compose-theme-suite.test.ts` | Parity, emit, transforms, contrast samples |
| `tests/qa/ui-theme-toggle.test.jsx` | Extend: light aliases resolve after toggle |

---

### Task 1: Theme suite JSON + parity module (TDD)

**Files:**
- Create: `tokens/compose/themes/dark.json`
- Create: `tokens/compose/themes/light.json`
- Create: `src/core/compose/tokens/theme-parity.ts`
- Create: `tests/qa/features/compose-theme-suite.test.ts`
- Modify: `src/core/compose/tokens/index.ts`

**Interfaces:**
- Consumes: `DTCGDictionary`, `isDTCGToken` from `./index`
- Produces:
  - `collectTokenPaths(dict: DTCGDictionary): string[]`
  - `assertThemeParity(dark: DTCGDictionary, light: DTCGDictionary): { ok: true } | { ok: false; missingInDark: string[]; missingInLight: string[] }`

- [ ] **Step 1: Write the failing parity test**

Create `tests/qa/features/compose-theme-suite.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertThemeParity, collectTokenPaths } from '../../../src/core/compose/tokens/theme-parity';
import type { DTCGDictionary } from '../../../src/core/compose/tokens/index';

function loadTheme(name: 'dark' | 'light'): DTCGDictionary {
  const path = resolve(process.cwd(), `tokens/compose/themes/${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as DTCGDictionary;
}

describe('Compose theme suite parity', () => {
  it('dark and light suites expose identical token paths', () => {
    const dark = loadTheme('dark');
    const light = loadTheme('light');
    const result = assertThemeParity(dark, light);
    expect(result).toEqual({ ok: true });
    expect(collectTokenPaths(dark).length).toBeGreaterThan(20);
  });

  it('light surfaces are pure white / near-white only', () => {
    const light = loadTheme('light');
    const surfaces = [
      light.color.surface.bg.$value,
      light.color.surface['bg-soft'].$value,
      light.color.surface.default.$value,
      light.color.surface.elevated.$value,
      light.color.surface.canvas.$value,
    ];
    for (const value of surfaces) {
      expect(['#ffffff', '#fafafa']).toContain(String(value).toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-theme-suite.test.ts`
Expected: FAIL (cannot find module / files)

- [ ] **Step 3: Implement parity helper**

Create `src/core/compose/tokens/theme-parity.ts`:

```ts
import { isDTCGToken, type DTCGDictionary, type DTCGTokenGroup } from './index';

export function collectTokenPaths(dict: DTCGDictionary): string[] {
  const paths: string[] = [];

  function walk(group: DTCGTokenGroup, prefix: string): void {
    for (const [key, value] of Object.entries(group)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isDTCGToken(value)) {
        paths.push(path);
      } else {
        walk(value as DTCGTokenGroup, path);
      }
    }
  }

  for (const [category, group] of Object.entries(dict)) {
    walk(group, category);
  }

  return paths.sort();
}

export function assertThemeParity(
  dark: DTCGDictionary,
  light: DTCGDictionary,
): { ok: true } | { ok: false; missingInDark: string[]; missingInLight: string[] } {
  const darkPaths = new Set(collectTokenPaths(dark));
  const lightPaths = new Set(collectTokenPaths(light));
  const missingInLight = [...darkPaths].filter((p) => !lightPaths.has(p));
  const missingInDark = [...lightPaths].filter((p) => !darkPaths.has(p));
  if (missingInDark.length || missingInLight.length) {
    return { ok: false, missingInDark, missingInLight };
  }
  return { ok: true };
}
```

Export from `src/core/compose/tokens/index.ts`:

```ts
export { collectTokenPaths, assertThemeParity } from './theme-parity';
```

- [ ] **Step 4: Author theme JSON suites**

Create `tokens/compose/themes/dark.json` and `tokens/compose/themes/light.json` with **identical paths**. Minimum required tree:

```json
{
  "color": {
    "surface": {
      "bg": { "$value": "#090916", "$type": "color", "$description": "App void background" },
      "bg-soft": { "$value": "#0d0d20", "$type": "color", "$description": "Soft deep background" },
      "default": { "$value": "#131328", "$type": "color", "$description": "Default surface" },
      "elevated": { "$value": "#1c1c38", "$type": "color", "$description": "Elevated surface" },
      "canvas": { "$value": "#090916", "$type": "color", "$description": "Editor/canvas abyss" }
    },
    "text": {
      "primary": { "$value": "#ede8d4", "$type": "color" },
      "secondary": { "$value": "#cdc5a8", "$type": "color" },
      "tertiary": { "$value": "#a89d80", "$type": "color" },
      "muted": { "$value": "#7a6f55", "$type": "color" },
      "inverse": { "$value": "#ffffff", "$type": "color" }
    },
    "border": {
      "subtle": { "$value": "rgba(100, 90, 160, 0.20)", "$type": "color" },
      "soft": { "$value": "rgba(100, 90, 160, 0.32)", "$type": "color" },
      "bold": { "$value": "rgba(100, 90, 160, 0.50)", "$type": "color" },
      "strong": { "$value": "hsla(43, 48%, 48%, 0.35)", "$type": "color" }
    },
    "accent": {
      "primary": { "$value": "#3b82f6", "$type": "color" },
      "success": { "$value": "#22c55e", "$type": "color" },
      "warning": { "$value": "#f59e0b", "$type": "color" },
      "danger": { "$value": "#ef4444", "$type": "color" }
    },
    "glow": {
      "accent-opacity": { "$value": 0.3, "$type": "opacity" },
      "focus-opacity": { "$value": 0.35, "$type": "opacity" }
    }
  },
  "shadow": {
    "sm": { "$value": "0 1px 2px rgba(0,0,0,0.35)", "$type": "shadow" },
    "md": { "$value": "0 4px 6px rgba(0,0,0,0.45)", "$type": "shadow" },
    "lg": { "$value": "0 10px 15px rgba(0,0,0,0.55)", "$type": "shadow" },
    "panel": { "$value": "0 24px 80px rgba(0,0,0,0.56)", "$type": "shadow" }
  },
  "layout": {
    "chrome": {
      "pad": { "$value": "12px", "$type": "dimension" },
      "topbar-height": { "$value": "48px", "$type": "dimension" },
      "panel-gap": { "$value": "8px", "$type": "dimension" },
      "radius": { "$value": "8px", "$type": "borderRadius" },
      "ornament-opacity": { "$value": 1, "$type": "opacity" }
    }
  },
  "scrollbar": {
    "thumb": {
      "default": { "$value": "rgba(255,255,255,0.08)", "$type": "color" },
      "hover": { "$value": "rgba(255,255,255,0.15)", "$type": "color" }
    },
    "track": {
      "default": { "$value": "transparent", "$type": "color" }
    }
  },
  "derived": {
    "glow-accent": {
      "$value": "{color.accent.primary}",
      "$type": "color",
      "$extensions": { "compose.transform": "glow-from-accent" }
    },
    "focus-ring-color": {
      "$value": "{color.accent.primary}",
      "$type": "color",
      "$extensions": { "compose.transform": "focus-ring" }
    }
  }
}
```

For **light.json**, same paths with:

- All `color.surface.*` → `#ffffff` or `#fafafa` only (`bg`/`canvas`/`default` = `#ffffff`; `bg-soft`/`elevated` = `#fafafa`)
- Text: primary `#0f172a`, secondary `#334155`, tertiary `#64748b`, muted `#94a3b8`, inverse `#ffffff`
- Borders: cool gray (`rgba(15,23,42,0.08/0.12/0.18)`), strong uses accent-friendly gray
- Accents: slightly darker hues for WCAG on white (e.g. primary `#2563eb`)
- Glow opacities: `0.12` / `0.2`
- Shadows: soft gray low-alpha (e.g. `0 4px 6px rgba(15,23,42,0.08)`)
- Layout chrome: pad `16px`, topbar-height `56px`, panel-gap `12px`, radius `12px`, ornament-opacity `0`
- Scrollbar thumb: `rgba(15,23,42,0.18)` / hover `0.28`; track `#ffffff`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/qa/features/compose-theme-suite.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tokens/compose/themes/dark.json tokens/compose/themes/light.json \
  src/core/compose/tokens/theme-parity.ts src/core/compose/tokens/index.ts \
  tests/qa/features/compose-theme-suite.test.ts
git commit -m "$(cat <<'EOF'
feat(compose): add dual theme DTCG suites with path parity

EOF
)"
```

---

### Task 2: Derived transforms + theme CSS emitter (TDD)

**Files:**
- Create: `src/core/compose/tokens/theme-transforms.ts`
- Create: `src/core/compose/tokens/theme-css.ts`
- Modify: `src/core/compose/tokens/index.ts`
- Modify: `tests/qa/features/compose-theme-suite.test.ts`

**Interfaces:**
- Consumes: `TokenResolver`, `generateCSS` patterns, `assertThemeParity`
- Produces:
  - `applyDerivedTransforms(suite: DTCGDictionary): DTCGDictionary`
  - `PUBLIC_THEME_ALIASES: Record<string, string>` mapping public var → compose var
  - `generateThemeCSS(dark: DTCGDictionary, light: DTCGDictionary): string`

- [ ] **Step 1: Append failing emit/transform tests**

Add to `tests/qa/features/compose-theme-suite.test.ts`:

```ts
import { applyDerivedTransforms } from '../../../src/core/compose/tokens/theme-transforms';
import { generateThemeCSS, PUBLIC_THEME_ALIASES } from '../../../src/core/compose/tokens/theme-css';

describe('Compose theme transforms and CSS emit', () => {
  it('applies glow-from-accent using suite glow opacity', () => {
    const light = applyDerivedTransforms(loadTheme('light'));
    const glow = light.derived['glow-accent'].$value as string;
    expect(glow).toMatch(/rgba?\(|hsla?\(|#/);
    expect(String(light.color.glow['accent-opacity'].$value)).toBe('0.12');
  });

  it('emits dark and light data-theme blocks with public aliases', () => {
    const css = generateThemeCSS(loadTheme('dark'), loadTheme('light'));
    expect(css).toContain(":root,\n[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
    expect(css).toContain('--compose-color-surface-bg:');
    expect(css).toContain('--bg-void: var(--compose-color-surface-bg)');
    expect(css).toContain('--ritual-abyss: var(--compose-color-surface-canvas)');
    expect(css).toContain('--compose-layout-chrome-ornament-opacity:');
    expect(PUBLIC_THEME_ALIASES['--bg-void']).toBe('--compose-color-surface-bg');
  });

  it('light block sets surface bg to #ffffff', () => {
    const css = generateThemeCSS(loadTheme('dark'), loadTheme('light'));
    const lightBlock = css.split("[data-theme='light']")[1];
    expect(lightBlock).toMatch(/--compose-color-surface-bg:\s*#ffffff/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/qa/features/compose-theme-suite.test.ts`
Expected: FAIL (missing modules)

- [ ] **Step 3: Implement transforms**

Create `src/core/compose/tokens/theme-transforms.ts`:

```ts
import { isDTCGToken, type DTCGDictionary, type DTCGToken, type DTCGTokenGroup } from './index';
import { TokenResolver } from './index';

function cloneDict(dict: DTCGDictionary): DTCGDictionary {
  return JSON.parse(JSON.stringify(dict)) as DTCGDictionary;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function applyDerivedTransforms(suite: DTCGDictionary): DTCGDictionary {
  const next = cloneDict(suite);
  const resolver = new TokenResolver(next);

  function walk(group: DTCGTokenGroup): void {
    for (const [key, value] of Object.entries(group)) {
      if (isDTCGToken(value)) {
        const transform = value.$extensions?.['compose.transform'];
        if (transform === 'glow-from-accent' || transform === 'focus-ring') {
          const baseRef = typeof value.$value === 'string' ? value.$value : '{color.accent.primary}';
          const base = String(resolver.resolve(baseRef.startsWith('{') ? baseRef : `{${baseRef}}`));
          const opacityPath =
            transform === 'glow-from-accent'
              ? '{color.glow.accent-opacity}'
              : '{color.glow.focus-opacity}';
          const opacity = Number(resolver.resolve(opacityPath));
          const rgb = hexToRgb(base);
          if (rgb) {
            (group[key] as DTCGToken).$value = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
          }
        }
      } else {
        walk(value as DTCGTokenGroup);
      }
    }
  }

  for (const group of Object.values(next)) {
    walk(group);
  }
  return next;
}
```

- [ ] **Step 4: Implement theme CSS emitter**

Create `src/core/compose/tokens/theme-css.ts`:

```ts
import { generateCSS } from './style-dictionary';
import { applyDerivedTransforms } from './theme-transforms';
import { assertThemeParity } from './theme-parity';
import type { DTCGDictionary } from './index';

/** Public CSS vars → Compose semantic vars (stable names). */
export const PUBLIC_THEME_ALIASES: Record<string, string> = {
  '--bg-void': '--compose-color-surface-bg',
  '--bg-deep': '--compose-color-surface-bg-soft',
  '--bg-surface': '--compose-color-surface-default',
  '--bg-elevated': '--compose-color-surface-elevated',
  '--ritual-abyss': '--compose-color-surface-canvas',
  '--text-primary': '--compose-color-text-primary',
  '--text-secondary': '--compose-color-text-secondary',
  '--text-tertiary': '--compose-color-text-tertiary',
  '--text-muted': '--compose-color-text-muted',
  '--border-subtle': '--compose-color-border-subtle',
  '--border-soft': '--compose-color-border-soft',
  '--border-bold': '--compose-color-border-bold',
  '--border-glow': '--compose-color-border-strong',
};

function stripRootWrapper(css: string): string {
  return css.replace(/^:root\s*\{\n?/, '').replace(/\n?\}\s*$/, '');
}

function aliasBlock(): string {
  return Object.entries(PUBLIC_THEME_ALIASES)
    .map(([pub, compose]) => `  ${pub}: var(${compose});`)
    .join('\n');
}

export function generateThemeCSS(dark: DTCGDictionary, light: DTCGDictionary): string {
  const parity = assertThemeParity(dark, light);
  if (!parity.ok) {
    throw new Error(
      `Theme parity failed. missingInDark=${parity.missingInDark.join(',')} missingInLight=${parity.missingInLight.join(',')}`,
    );
  }

  const darkResolved = applyDerivedTransforms(dark);
  const lightResolved = applyDerivedTransforms(light);
  const darkBody = stripRootWrapper(generateCSS(darkResolved));
  const lightBody = stripRootWrapper(generateCSS(lightResolved));
  const aliases = aliasBlock();

  return [
    "/* AUTO-GENERATED by scripts/generate-compose-themes.mjs — do not edit */",
    `:root,`,
    `[data-theme='dark'] {`,
    `  color-scheme: dark;`,
    darkBody,
    aliases,
    `}`,
    ``,
    `[data-theme='light'] {`,
    `  color-scheme: light;`,
    lightBody,
    aliases,
    `}`,
    ``,
  ].join('\n');
}
```

Export new symbols from `index.ts`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run tests/qa/features/compose-theme-suite.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/compose/tokens/theme-transforms.ts src/core/compose/tokens/theme-css.ts \
  src/core/compose/tokens/index.ts tests/qa/features/compose-theme-suite.test.ts
git commit -m "$(cat <<'EOF'
feat(compose): emit dual-theme CSS with public aliases

EOF
)"
```

---

### Task 3: Generate script + wire into app CSS

**Files:**
- Create: `scripts/generate-compose-themes.mjs`
- Create: `src/lib/css/generated/compose-themes.css` (via script)
- Modify: `package.json` (add script; optionally prepend to `build`)
- Modify: `src/index.css` (import + stop hardcoding theme surfaces)

**Interfaces:**
- Consumes: `generateThemeCSS` (via dynamic import of built TS **or** duplicate thin JSON→CSS in mjs using the same logic)
- Preferred: Vitest-friendly TS module; script uses `node --experimental-strip-types` or `tsx` if already in repo — check `package.json` for `tsx` / `ts-node`. If none, implement `scripts/lib/compose-theme-css.mjs` that mirrors `generateThemeCSS` by importing compiled path, OR run generation from a small vitest/node entry.

**Practical approach for this repo (JS-first server):** put a pure JS emitter at `scripts/lib/compose-theme-css.mjs` that:

1. Reads both JSON files
2. Implements the same parity + CSS walk + aliases (keep in sync with `theme-css.ts` — unit test asserts script output matches `generateThemeCSS`)

- [ ] **Step 1: Add test that generated file matches emitter**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateThemeCSS } from '../../../src/core/compose/tokens/theme-css';

it('checked-in compose-themes.css matches generateThemeCSS output', () => {
  const dark = loadTheme('dark');
  const light = loadTheme('light');
  const expected = generateThemeCSS(dark, light);
  const path = resolve(process.cwd(), 'src/lib/css/generated/compose-themes.css');
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8').trim()).toBe(expected.trim());
});
```

- [ ] **Step 2: Run — expect FAIL** (file missing / mismatch)

- [ ] **Step 3: Create generator script**

`scripts/generate-compose-themes.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'src/lib/css/generated/compose-themes.css');

// Import TS emitter through Vitest-compatible path: prefer spawning
// `npx vitest run` helper OR use dynamic import of a .mjs mirror.
// Canonical: write CSS by importing from src via vite-node if available.
import { createRequire } from 'node:module';

async function main() {
  const { generateThemeCSS } = await import(
    pathToFileURL(resolve(root, 'scripts/lib/compose-theme-css.mjs')).href
  );
  const dark = JSON.parse(readFileSync(resolve(root, 'tokens/compose/themes/dark.json'), 'utf8'));
  const light = JSON.parse(readFileSync(resolve(root, 'tokens/compose/themes/light.json'), 'utf8'));
  const css = generateThemeCSS(dark, light);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, css, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Create `scripts/lib/compose-theme-css.mjs` as a JS port of `theme-parity` + `theme-transforms` + `theme-css` (same PUBLIC_THEME_ALIASES keys/values and selector strings). Keep the Vitest suite as source of truth for TypeScript API; add one test:

```ts
it('mjs emitter matches TS generateThemeCSS', async () => {
  const mjs = await import('../../../scripts/lib/compose-theme-css.mjs');
  const dark = loadTheme('dark');
  const light = loadTheme('light');
  expect(mjs.generateThemeCSS(dark, light).trim()).toBe(generateThemeCSS(dark, light).trim());
});
```

Add to `package.json` scripts:

```json
"generate:compose-themes": "node scripts/generate-compose-themes.mjs"
```

Prepend `npm run generate:compose-themes &&` to the existing `build` script (or to `verify:css-tokens` chain if that is the gate — match how `generate-school-styles` is wired).

- [ ] **Step 4: Run generator + tests**

```bash
npm run generate:compose-themes
npx vitest run tests/qa/features/compose-theme-suite.test.ts
```

Expected: PASS; file written

- [ ] **Step 5: Import in `src/index.css` and rebind base colors**

At top of `src/index.css` (after school-styles import):

```css
@import './lib/css/generated/compose-themes.css';
```

In the `/* === BASE COLORS - UNIFIED SYSTEM === */` `:root` block, **replace literal assignments** for bridged tokens with comments that ownership moved to compose-themes, e.g. remove:

```css
--bg-void: #090916;
--bg-deep: #0d0d20;
--bg-surface: #131328;
--bg-elevated: #1c1c38;
--text-primary: #ede8d4;
--text-secondary: #cdc5a8;
--text-tertiary: #a89d80;
--text-muted: #7a6f55;
--border-subtle: ...;
--border-soft: ...;
--border-bold: ...;
--border-glow: ...;
```

Those now come from `compose-themes.css` aliases. Keep void-arena and school-gradient tokens that are not in the suite.

Ensure `body` / app shell backgrounds use `var(--bg-void)` / `var(--bg-surface)` (already true in many places — fix any remaining `#090916` literals in `index.css` nav chrome that should follow theme).

Add light chrome density consumers on html/body if needed:

```css
html {
  --chrome-pad: var(--compose-layout-chrome-pad);
  --chrome-topbar-height: var(--compose-layout-topbar-height);
  --chrome-panel-gap: var(--compose-layout-panel-gap);
  --chrome-radius: var(--compose-layout-radius-chrome);
  --chrome-ornament-opacity: var(--compose-layout-chrome-ornament-opacity);
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-compose-themes.mjs scripts/lib/compose-theme-css.mjs \
  src/lib/css/generated/compose-themes.css package.json src/index.css \
  tests/qa/features/compose-theme-suite.test.ts
git commit -m "$(cat <<'EOF'
feat(compose): generate and import dual-theme CSS suites

EOF
)"
```

---

### Task 4: Channel Zero + IDE chrome bind to Compose light

**Files:**
- Modify: `src/kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css`
- Modify: `src/pages/Read/IDE.css` (top shell / topbar / status metrics)
- Modify: `tests/qa/features/compose-theme-suite.test.ts` (optional CSS contract snippets)

**Interfaces:**
- Consumes: `--compose-color-surface-*`, `--compose-layout-chrome-*`, `--bg-*`, `--text-*`, `--ritual-abyss`
- Produces: CZ + IDE follow ThemeToggle without cream palette

- [ ] **Step 1: Write failing contract test for CZ light**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('channel-zero light theme aliases Compose surfaces (no cream hsl(42…))', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css'),
    'utf8',
  );
  const lightIdx = css.indexOf("[data-theme='light']");
  expect(lightIdx).toBeGreaterThan(-1);
  const lightBlock = css.slice(lightIdx, lightIdx + 800);
  expect(lightBlock).not.toMatch(/hsl\(42\s/);
  expect(lightBlock).toMatch(/--cz-bg:\s*var\(--compose-color-surface-bg|--bg-void\)/);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Replace CZ `[data-theme='light']` block**

```css
[data-theme='light'] {
  color-scheme: light;

  --cz-bg: var(--compose-color-surface-bg);
  --cz-bg-soft: var(--compose-color-surface-bg-soft);
  --cz-surface: var(--compose-color-surface-default);
  --cz-surface-2: var(--compose-color-surface-elevated);
  --cz-surface-glass: color-mix(in srgb, var(--compose-color-surface-default) 82%, transparent);
  --cz-border: var(--compose-color-border-soft);
  --cz-border-strong: var(--compose-color-border-bold);

  --cz-text: var(--compose-color-text-primary);
  --cz-text-muted: var(--compose-color-text-secondary);
  --cz-text-dim: var(--compose-color-text-muted);

  --cz-shadow-soft: var(--compose-shadow-md);
  --cz-shadow-panel: var(--compose-shadow-panel);
  --cz-glow-violet: var(--compose-derived-glow-accent);
  --cz-glow-cyan: var(--compose-derived-glow-accent);
  --cz-glow-amber: var(--compose-derived-glow-accent);
}
```

Keep dark CZ block as-is or optionally alias dark to Compose dark later (YAGNI — only required if literals diverge).

- [ ] **Step 4: Bind IDE chrome density**

In `src/pages/Read/IDE.css`, on `.ide-shell` / topbar / status bar containers:

```css
.ide-chrome-topbar,
.ide-topbar {
  min-height: var(--compose-layout-chrome-topbar-height, 48px);
  padding-inline: var(--compose-layout-chrome-pad, 12px);
  border-radius: 0;
}

.ide-shell {
  gap: var(--compose-layout-chrome-panel-gap, 8px);
  background: var(--ritual-abyss, var(--compose-color-surface-canvas));
}

.ide-ornament,
.grim-harmonic-seam,
.ide-vignette {
  opacity: var(--compose-layout-chrome-ornament-opacity, 1);
}
```

Use the actual class names present in `IDE.css` / `ComposeReadChrome` (grep `ide-topbar`, `grim-harmonic-seam` and attach density vars there). Replace hard-coded `#0c0a1e` / `#05060d` panel backgrounds that should be surfaces with `var(--bg-surface)` / `var(--bg-elevated)` where safe.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/qa/features/compose-theme-suite.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/kits/channel-zero-ui-kit/tokens/channel-zero.tokens.css \
  src/pages/Read/IDE.css tests/qa/features/compose-theme-suite.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): bind Channel Zero and IDE chrome to Compose light suite

EOF
)"
```

---

### Task 5: ThemeToggle integration proof + nav/scrollbar light

**Files:**
- Modify: `tests/qa/ui-theme-toggle.test.jsx`
- Modify: `src/index.css` (scrollbar + nav rail under light via Compose vars)
- Modify: `src/components/Navigation/Navigation.css` or nav rules in `index.css` if separate

**Interfaces:**
- Consumes: ThemeToggle, `PUBLIC_THEME_ALIASES`, generated CSS (jsdom may not load CSS — assert `data-theme` + document that visual check is manual/smoke; for jsdom, inject a minimal style tag mirroring aliases OR assert attribute only and keep CSS contract in compose-theme-suite)

- [ ] **Step 1: Extend theme toggle test**

```jsx
it('sets data-theme light so Compose light suite can apply', () => {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark');
});
```

- [ ] **Step 2: Point global scrollbars at Compose tokens**

In `src/index.css`:

```css
html {
  scrollbar-width: thin;
  scrollbar-color: var(--compose-scrollbar-thumb-default) var(--compose-scrollbar-track-default);
}

::-webkit-scrollbar-thumb {
  background: var(--compose-scrollbar-thumb-default);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--compose-scrollbar-thumb-hover);
}
```

Ensure nav `.rail-link` / theme-toggle light rules use `var(--text-primary)` / `var(--bg-elevated)` instead of one-off colors where possible.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/qa/ui-theme-toggle.test.jsx tests/qa/features/compose-theme-suite.test.ts
```

Expected: PASS

- [ ] **Step 4: Manual smoke checklist (document in commit body)**

1. App load → dark default.
2. Click sun → pure white surfaces, darker text, airier topbar, ornaments faded.
3. Navigate Read + open Oracle → panels follow white suite.
4. Click moon → dark restored.
5. Refresh → persisted theme.

- [ ] **Step 5: Commit**

```bash
git add tests/qa/ui-theme-toggle.test.jsx src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): wire scrollbars and ThemeToggle proof to Compose themes

EOF
)"
```

---

### Task 6: Contrast sample + verify hook + README note

**Files:**
- Modify: `tests/qa/features/compose-theme-suite.test.ts`
- Modify: `scripts/verify-css-tokens.js` (add optional check that `compose-themes.css` exists and contains both theme selectors)
- Modify: `src/core/compose/README.md` (short “Theme suites” section)

- [ ] **Step 1: Add relative-luminance contrast helper test**

```ts
function luminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  const ch = [m[1], m[2], m[3]].map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

it('light primary text on surface.bg meets 4.5:1', () => {
  const light = loadTheme('light');
  const ratio = contrast(
    String(light.color.text.primary.$value),
    String(light.color.surface.bg.$value),
  );
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 2: Extend `verify-css-tokens.js`**

After existing checks, read `src/lib/css/generated/compose-themes.css` and fail if missing `[data-theme='light']` or `--compose-color-surface-bg`.

- [ ] **Step 3: README blurb**

Document theme JSON paths, `npm run generate:compose-themes`, and ThemeToggle binding.

- [ ] **Step 4: Run full related suite**

```bash
npm run generate:compose-themes
npm run verify:css-tokens
npx vitest run tests/qa/features/compose-theme-suite.test.ts tests/qa/ui-theme-toggle.test.jsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add tests/qa/features/compose-theme-suite.test.ts scripts/verify-css-tokens.js \
  src/core/compose/README.md src/lib/css/generated/compose-themes.css
git commit -m "$(cat <<'EOF'
test(compose): enforce light contrast and theme CSS verify gate

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Dual DTCG suites | 1 |
| Path parity gate | 1 |
| Pure white surfaces | 1 |
| Derived transforms | 2 |
| Theme CSS + public aliases | 2–3 |
| ThemeToggle / `data-theme` binding | 3, 5 |
| Layout density tokens | 1, 4 |
| App-wide rebind (index, IDE, CZ) | 3–5 |
| Scrollbar theme | 1, 5 |
| No hand-edit generated CSS | 3, 6 |
| Contrast sample | 6 |
| Storm/galaxy not white-painted | Global constraint (no task recolors canvas) |

## Plan self-review notes

- Alias map locked in `PUBLIC_THEME_ALIASES` (Task 2); expand only with parity + tests.
- MJS emitter mirrors TS — Task 3 includes equality test to prevent drift.
- Full literal sweep of every CSS file is YAGNI for v1; Tasks 3–5 cover the high-traffic shells. Remaining dark literals are follow-ups once suites land.
