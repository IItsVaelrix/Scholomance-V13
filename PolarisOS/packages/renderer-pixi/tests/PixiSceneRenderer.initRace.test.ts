// @vitest-environment jsdom
/**
 * PixiSceneRenderer init-race regression test (Dual-State Art Pass).
 *
 * Bug: main.ts calls `void renderer.init()` (async — Pixi import + app.init)
 * and, independently, renderScene() on the first scene manifest. If the
 * manifest arrived before init completed, renderScene observed `app === null`,
 * took the text-fallback branch, and the controller claimed the contract hash —
 * so the illustrated scene never rendered until an unrelated mutation forced a
 * fresh contract. The canvas stayed blank on first load.
 *
 * Fix: renderScene awaits the memoized init promise (init completion), so it
 * never sees a half-initialized renderer.
 *
 * This test mocks pixi.js with an Application whose init() is deliberately
 * delayed, then calls renderScene WHILE init is still pending. It asserts the
 * scene COMMITS through the Pixi path (a root is added to the stage) rather
 * than silently falling back to a blank canvas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SceneManifest, SceneLayer } from "@polaris/contracts";

// --- Delayed-init pixi.js mock ----------------------------------------------

let initDelayMs = 20;
let stageChildCount = 0;

class FakeDisplay {
  children: unknown[] = [];
  x = 0; y = 0; alpha = 1; visible = true; zIndex = 0;
  blendMode = ""; width = 10; height = 10; tint = 0xffffff;
  eventMode = ""; cursor = "";
  anchor = { set: () => {} };
  scale = { set: () => {} };
  addChild(c: unknown) { this.children.push(c); }
  removeChild(c: unknown) { this.children = this.children.filter((x) => x !== c); }
  on() { return this; }
  destroy() {}
}
class FakeContainer extends FakeDisplay {}
class FakeGraphics extends FakeDisplay {
  rect() { return this; }
  circle() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  closePath() { return this; }
  fill() { return this; }
  stroke() { return this; }
}
class FakeSprite extends FakeDisplay {
  constructor(_texture?: unknown) { super(); }
}
class FakeText extends FakeDisplay {
  constructor(_opts?: unknown) { super(); }
}
class FakeTexture {
  constructor(_opts?: unknown) {}
  destroy() {}
}
class FakeBufferImageSource {
  constructor(_opts?: unknown) {}
}
class FakeStage extends FakeDisplay {
  addChild(c: unknown) { super.addChild(c); stageChildCount = this.children.length; }
  removeChild(c: unknown) { super.removeChild(c); stageChildCount = this.children.length; }
}
class FakeApplication {
  stage = new FakeStage();
  canvas: HTMLCanvasElement;
  ticker = { add: () => {}, remove: () => {} };
  constructor() {
    this.canvas = document.createElement("canvas");
  }
  async init(_opts: unknown) {
    await new Promise((resolve) => setTimeout(resolve, initDelayMs));
  }
  destroy() {}
}

vi.mock("pixi.js", () => ({
  Application: FakeApplication,
  Container: FakeContainer,
  Graphics: FakeGraphics,
  Sprite: FakeSprite,
  Text: FakeText,
  Texture: FakeTexture,
  BufferImageSource: FakeBufferImageSource,
}));

// Import AFTER the mock is registered.
import { PixiSceneRenderer } from "@polaris/renderer-pixi";

// --- Manifest factory -------------------------------------------------------

function layer(
  overrides: Partial<SceneLayer> & Pick<SceneLayer, "layerId" | "layerType">,
): SceneLayer {
  return {
    assetKey: null,
    position: { x: 0, y: 0 },
    zIndex: 10,
    visible: true,
    flags: {},
    ...overrides,
  };
}

function makeManifest(): SceneManifest {
  return {
    sceneId: "ruined_shrine_rev0",
    roomId: "ruined_shrine",
    roomRevision: 0,
    visualRevision: 0,
    worldId: "codex_vale_mvp",
    backgroundAssetKey: "rooms/ruined_shrine/background",
    layers: [
      layer({ layerId: "bg", layerType: "background", zIndex: 0 }),
      layer({
        layerId: "brazier",
        layerType: "prop",
        assetKey: "entities/brazier",
        position: { x: 400, y: 280 },
      }),
    ],
    hotspots: [],
    textRegions: [],
    lightingState: "ambient_moonlight",
    ambientEffects: ["dust_motes"],
    contractHash: "abc123def4567890",
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// --- Test -------------------------------------------------------------------

describe("PixiSceneRenderer init race", () => {
  beforeEach(() => {
    stageChildCount = 0;
    initDelayMs = 20;
  });

  it("commits the illustrated scene even when renderScene races init()", async () => {
    const container = document.createElement("div");
    const renderer = new PixiSceneRenderer({
      container,
      assetRegistry: {},
      atmosphere: false, // isolate the init race from atmosphere work
    });

    // Kick off init but do NOT await it (mirrors main.ts `void renderer.init()`).
    void renderer.init();

    // Immediately render the first manifest while init is still pending.
    const outcome = await renderer.renderScene(makeManifest());

    expect(outcome.status).toBe("COMMITTED");
    expect(renderer.isFallback).toBe(false);
    // The scene root was installed on the stage (not a blank fallback canvas).
    expect(stageChildCount).toBeGreaterThan(0);
    renderer.destroy();
  });

  it("memoizes init() so concurrent callers share one initialization", async () => {
    const container = document.createElement("div");
    const renderer = new PixiSceneRenderer({ container, assetRegistry: {} });
    const a = renderer.init();
    const b = renderer.init();
    expect(a).toBe(b);
    await a;
    renderer.destroy();
  });
});
