/**
 * PixelBrain registry-completeness check — Dual-State Art Pass (spec §8.2).
 *
 * Guards the glyph law (PDR §5.4): the world must stay illustrated when an
 * asset fails to load. For that to hold, every shipped PixelBrain packet must
 * keep a procedural glyph fallback. This test reads the *committed* registry
 * (the real build output, not a temp fixture) and asserts:
 *
 *   - every non-background asset key has an explicit glyph fallback
 *   - background keys fall back to the plan's backgroundGlyph (always defined)
 *   - every registry entry is hash-verified (pb1 content hash + URL)
 *   - every registry URL points at a generated packet that exists on disk
 *   - the seven world asset keys + all three room backdrops are present
 */

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { glyphFallbackForAssetKey } from "@polaris/renderer-pixi";
import {
  pixelBrainAssetRegistry,
  type PixelBrainAssetRegistry,
} from "../../apps/client/src/generated/pixelbrainAssetRegistry.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const polarisRoot = resolve(testDir, "../..");
const generatedDir = resolve(polarisRoot, "apps/client/public/assets/generated");

// Annotate with the index-signature type so generic key iteration typechecks
// (the generated literal is `as const` with only its specific keys).
const registry: PixelBrainAssetRegistry = pixelBrainAssetRegistry;
const keys = Object.keys(registry).sort();

const BACKGROUND_KEY = /^rooms\/.+\/background$/;

const WORLD_ASSET_KEYS = [
  "entities/altar",
  "entities/brazier",
  "entities/brazier_lit",
  "entities/lantern",
  "entities/sign",
  "entities/well",
  "players/marker_default",
];

const BACKGROUND_KEYS = [
  "rooms/forest_path/background",
  "rooms/moonlit_clearing/background",
  "rooms/ruined_shrine/background",
];

describe("PixelBrain registry completeness", () => {
  it("ships the seven world asset keys and all three room backdrops", () => {
    for (const key of [...WORLD_ASSET_KEYS, ...BACKGROUND_KEYS]) {
      expect(registry[key], `missing registry entry: ${key}`).toBeDefined();
    }
  });

  it("every non-background packet keeps an explicit glyph fallback", () => {
    const nonBackground = keys.filter((key) => !BACKGROUND_KEY.test(key));
    expect(nonBackground.length).toBeGreaterThan(0);
    for (const key of nonBackground) {
      const glyph = glyphFallbackForAssetKey(key);
      expect(glyph, `no glyph fallback for ${key}`).not.toBeNull();
      expect(glyph!.width).toBeGreaterThan(0);
      expect(glyph!.height).toBeGreaterThan(0);
    }
  });

  it("background keys are well-formed (they fall back to backgroundGlyph)", () => {
    const backgrounds = keys.filter((key) => BACKGROUND_KEY.test(key));
    expect(backgrounds).toEqual([...BACKGROUND_KEYS].sort());
    // Backgrounds intentionally have no dedicated glyph; the plan's
    // backgroundGlyph (always defined) is their fallback.
    for (const key of backgrounds) {
      expect(glyphFallbackForAssetKey(key)).toBeNull();
    }
  });

  it("every entry is hash-verified with an immutable pb1 URL", () => {
    for (const key of keys) {
      const entry = registry[key];
      expect(entry.expectedPacketContentHash, `${key} content hash`).toMatch(
        /^pb1:[0-9a-f]{64}$/,
      );
      expect(entry.pixelBrainUrl, `${key} url`).toMatch(
        /^\/assets\/generated\/.+\.pb1-[0-9a-f]{64}\.pixelbrain\.json$/,
      );
      // The URL embeds the same content hash it claims.
      expect(entry.pixelBrainUrl).toContain(
        entry.expectedPacketContentHash!.slice(4),
      );
    }
  });

  it("every registry URL resolves to a generated packet on disk", async () => {
    for (const key of keys) {
      const entry = registry[key];
      const relative = entry.pixelBrainUrl!.replace(/^\/assets\/generated\//, "");
      const onDisk = resolve(generatedDir, relative);
      await expect(access(onDisk), `missing packet file for ${key}`).resolves.toBeUndefined();
    }
  });
});
