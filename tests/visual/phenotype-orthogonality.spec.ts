import { test, expect } from "@playwright/test";
import sharp from "sharp";

import { quantizeLuminance } from "../../src/core/phenotype/quantize/luminance.ts";
import { quantizeChromaticity } from "../../src/core/phenotype/quantize/chromaticity.ts";
import { quantizeStacking } from "../../src/core/phenotype/quantize/stacking.ts";
import { quantizeSize } from "../../src/core/phenotype/quantize/size.ts";
import { quantizeShape } from "../../src/core/phenotype/quantize/shape.ts";
import {
  clippedRegionArea,
  countInkPixels,
  quantizeDensity,
} from "../../src/core/phenotype/quantize/density.ts";
import { LIVE_AXES, AXIS_SLOTS } from "../../src/core/phenotype/isolation.ts";
import { vectorToBlocks } from "../../src/core/phenotype/vector.ts";
import { parseCssColor } from "../../src/core/phenotype/color.ts";

const PROFILE = "A1B2C3";

const PALETTE = [
  { name: "ember", hue: 40 },
  { name: "verdant", hue: 140 },
  { name: "abyss", hue: 260 },
];

/** Baseline: every axis sits mid-tier, well clear of a boundary. */
const BASELINE = {
  bg: "#000000",
  fg: "#ff0000",
  w: 200,
  h: 100,
  radius: 0,
  z: 0,
  ink: 0.2,
  clip: "none",
};

/**
 * One mutation per axis. Each moves ONLY that axis's physical inputs and is
 * large enough to cross a tier boundary with room to spare.
 */
const MUTATIONS: Record<string, Record<string, string | number>> = {
  // Same hue family, far lower contrast against black: high -> fail.
  luminance: { fg: "#2a0d00" },
  // base -> overlay.
  stacking: { z: 100 },
  // panel -> surface (area ratio well past 0.3 at 1280x720).
  size: { w: 900, h: 700 },
  // ember (hue 40.0) -> verdant (hue 136.0). ISOLUMINANT BY CONSTRUCTION:
  // #009400 has relative luminance 0.2118 against #ff0000's 0.2126 (L* 53.15
  // vs 53.23), so this mutation must NOT move the luminance block. Any other
  // blue/violet is a trap — #3a1fd6, for instance, has luminance 0.067 and
  // would report a false `chromaticity -> luminance` coupling.
  chromaticity: { fg: "#009400" },
  // rect -> pill.
  shape: { radius: 50 },
  // 0.2 -> 0.9: measured -> packed.
  density: { ink: 0.9 },
};

function buildUrl(overrides: Record<string, string | number>): string {
  const params = { ...BASELINE, ...overrides };
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return `/__immune/phenotype?${query}`;
}

/** Decompile the rendered target into a MeasurementVector. Pixels and computed styles only. */
async function measure(page: import("@playwright/test").Page) {
  const target = page.locator("#phenotype-target");
  await target.waitFor({ state: "visible" });

  const styles = await target.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const ink = el.querySelector("#phenotype-ink");
    const inkCs = ink ? getComputedStyle(ink) : null;
    return {
      background: cs.backgroundColor,
      foreground: inkCs ? inkCs.backgroundColor : cs.color,
      zIndex: cs.zIndex,
      borderRadiusPx: parseFloat(cs.borderTopLeftRadius) || 0,
      clipPath: cs.clipPath,
      width: rect.width,
      height: rect.height,
      viewportArea: window.innerWidth * window.innerHeight,
    };
  });

  // Density: rasterize the element, count pixels differing from the background.
  const png = await target.screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const background = parseCssColor(styles.background);

  let density = null;
  if (background && styles.clipPath.trim() === "none") {
    const inkPixels = countInkPixels(data, info.channels, background);
    const area = clippedRegionArea({
      width: styles.width,
      height: styles.height,
      borderRadiusPx: styles.borderRadiusPx,
    });
    density = quantizeDensity(inkPixels, area);
  }
  // A clip-path silhouette has no closed-form clipped area, so density is
  // UNMEASURED rather than approximated. Never substitute a default.

  return {
    luminance: quantizeLuminance(styles.foreground, styles.background),
    stacking: quantizeStacking(styles.zIndex),
    size: quantizeSize(styles.width * styles.height, styles.viewportArea),
    chromaticity: quantizeChromaticity(styles.foreground, PALETTE),
    shape: quantizeShape({
      width: styles.width,
      height: styles.height,
      borderRadiusPx: styles.borderRadiusPx,
      clipPath: styles.clipPath,
    }),
    density,
  };
}

/**
 * A null axis encodes as the shared unmeasured sentinel, and two sentinels
 * compare equal — so an axis that silently stopped measuring would look
 * "not coupled" with everything and pass the matrix while measuring nothing.
 * The matrix must therefore prove it measured before it proves independence.
 */
function assertFullyMeasured(
  vector: Record<string, string | null>,
  label: string,
): void {
  for (const axis of LIVE_AXES) {
    expect(
      vector[axis],
      `${label}: axis "${axis}" was unmeasurable, so this run proves nothing about coupling`,
    ).not.toBeNull();
  }
}

test.describe("Phenotype orthogonality matrix (spec §3.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("baseline measures every live axis — no nulls to hide behind", async ({ page }) => {
    await page.goto(buildUrl({}));
    const vector = await measure(page);
    for (const axis of LIVE_AXES) {
      expect(vector[axis], `axis ${axis} must be measurable at baseline`).not.toBeNull();
    }
  });

  test("each mutation actually moves its own axis", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baseline = await measure(page);

    for (const axis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[axis]));
      const mutated = await measure(page);
      expect(
        mutated[axis],
        `mutation for ${axis} made its own axis unmeasurable instead of moving it`,
      ).not.toBeNull();
      expect(
        mutated[axis],
        `mutation for ${axis} did not change its own term — the fixture is inert`,
      ).not.toBe(baseline[axis]);
    }
  });

  test("30 directed checks: mutating A never changes B's block", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baselineVector = await measure(page);
    assertFullyMeasured(baselineVector, "baseline");
    const baselineBlocks = vectorToBlocks(baselineVector, PROFILE);

    const coupled = [];
    let checks = 0;

    for (const mutatedAxis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[mutatedAxis]));
      const mutatedVector = await measure(page);
      assertFullyMeasured(mutatedVector, `mutation:${mutatedAxis}`);
      const blocks = vectorToBlocks(mutatedVector, PROFILE);

      for (const observedAxis of LIVE_AXES) {
        if (observedAxis === mutatedAxis) continue;
        checks += 1;

        const slot = AXIS_SLOTS[observedAxis];
        if (blocks[slot] !== baselineBlocks[slot]) {
          coupled.push(`${mutatedAxis} -> ${observedAxis}`);
        }
      }
    }

    // n * (n - 1) directed pairs, NOT C(n, 2). Direction matters: "mutate shape,
    // assert density unchanged" tests the density denominator, while "mutate
    // density, assert shape unchanged" tests whether the shape quantizer reads
    // painted extent. Different failure modes.
    expect(checks).toBe(LIVE_AXES.length * (LIVE_AXES.length - 1));
    expect(checks).toBe(30);

    // A coupled pair forces a redesign of the axes — never an amendment to this
    // assertion (spec §9).
    expect(coupled, `coupled axis pairs: ${coupled.join(", ")}`).toEqual([]);
  });

  test("slot 0 never moves under any evidence mutation", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baselineBlocks = vectorToBlocks(await measure(page), PROFILE);

    for (const axis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[axis]));
      const blocks = vectorToBlocks(await measure(page), PROFILE);
      expect(blocks[0], `slot 0 moved when mutating ${axis}`).toBe(baselineBlocks[0]);
    }
  });

  test("a clip-path leaves density unmeasured rather than approximated", async ({ page }) => {
    await page.goto(buildUrl({ clip: "notch" }));
    const vector = await measure(page);
    expect(vector.shape).toBe("notched");
    expect(vector.density).toBeNull();
  });
});
