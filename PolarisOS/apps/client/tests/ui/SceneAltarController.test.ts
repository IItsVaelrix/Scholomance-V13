// @vitest-environment jsdom
/**
 * SceneAltarController tests (Task 5) — bounded Pixi portal with contract-hash
 * dedupe, text fallback on failure, forced text mode, and idempotent teardown.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createSceneAltarController,
  type SceneRendererPort,
} from "../../src/ui/SceneAltarController.js";
import type { SceneManifest } from "@polaris/contracts";
import type { UiDiagnostic } from "../../src/state/PolarisUiState.js";

const ISO = "2026-07-28T00:00:00.000Z";

function manifest(contractHash: string): SceneManifest {
  return {
    sceneId: `scene_${contractHash}`,
    roomId: "antechamber",
    roomRevision: 3,
    visualRevision: 3,
    worldId: "shrine",
    backgroundAssetKey: "bg",
    layers: [],
    hotspots: [
      { hotspotId: "h1", entityId: "brazier", label: "Brazier", command: "light brazier", region: { x: 0, y: 0, w: 8, h: 8 }, visible: true },
    ],
    textRegions: [
      { regionId: "t1", kind: "title", anchor: { x: 0, y: 0 }, width: 100, text: "Antechamber" },
      { regionId: "t2", kind: "description", anchor: { x: 0, y: 10 }, width: 100, text: "A cold room." },
    ],
    lightingState: "dim",
    ambientEffects: [],
    contractHash,
    generatedAt: ISO,
  };
}

interface FakeRenderer extends SceneRendererPort {
  calls: number;
  destroyed: number;
}

function fakeRenderer(options: { fail?: boolean; fallback?: boolean } = {}): FakeRenderer {
  const renderer: FakeRenderer = {
    calls: 0,
    destroyed: 0,
    isFallback: options.fallback === true,
    renderScene: async () => {
      renderer.calls += 1;
      if (options.fail) throw new Error("webgl lost");
      return { ok: true };
    },
    destroy: () => {
      renderer.destroyed += 1;
    },
  };
  return renderer;
}

function makeHosts() {
  const renderHost = document.createElement("div");
  const fallbackHost = document.createElement("div");
  const statusHost = document.createElement("div");
  document.body.appendChild(renderHost);
  document.body.appendChild(fallbackHost);
  document.body.appendChild(statusHost);
  return { renderHost, fallbackHost, statusHost };
}

describe("SceneAltarController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders once for a new contract hash", async () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({
      renderer,
      ...hosts,
      onDiagnostic: () => {},
    });
    await controller.render(manifest("hash-a"));
    expect(renderer.calls).toBe(1);
    expect(hosts.fallbackHost.hidden).toBe(true);
  });

  it("does not rerender the same contract hash", async () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({ renderer, ...hosts, onDiagnostic: () => {} });
    await controller.render(manifest("hash-a"));
    await controller.render(manifest("hash-a"));
    expect(renderer.calls).toBe(1);
  });

  it("renders again when the contract hash changes", async () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({ renderer, ...hosts, onDiagnostic: () => {} });
    await controller.render(manifest("hash-a"));
    await controller.render(manifest("hash-b"));
    expect(renderer.calls).toBe(2);
  });

  it("activates text fallback and emits a diagnostic when rendering rejects", async () => {
    const renderer = fakeRenderer({ fail: true });
    const hosts = makeHosts();
    const diagnostics: UiDiagnostic[] = [];
    const controller = createSceneAltarController({
      renderer,
      ...hosts,
      onDiagnostic: (d) => diagnostics.push(d),
    });
    await controller.render(manifest("hash-a"));
    expect(hosts.fallbackHost.hidden).toBe(false);
    expect(hosts.fallbackHost.textContent).toContain("Antechamber");
    expect(diagnostics.some((d) => d.code === "POLARIS_SCENE_RENDER_FAILED")).toBe(true);
  });

  it("forced text mode skips the renderer and shows the fallback", async () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({ renderer, ...hosts, onDiagnostic: () => {} });
    controller.setForcedTextMode(true);
    await controller.render(manifest("hash-a"));
    expect(renderer.calls).toBe(0);
    expect(hosts.fallbackHost.hidden).toBe(false);
    expect(hosts.fallbackHost.textContent).toContain("light brazier");
  });

  it("renders a null manifest as an empty fallback without calling the renderer", async () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({ renderer, ...hosts, onDiagnostic: () => {} });
    await controller.render(null);
    expect(renderer.calls).toBe(0);
    expect(hosts.fallbackHost.hidden).toBe(false);
  });

  it("destroy is idempotent", () => {
    const renderer = fakeRenderer();
    const hosts = makeHosts();
    const controller = createSceneAltarController({ renderer, ...hosts, onDiagnostic: () => {} });
    controller.destroy();
    controller.destroy();
    expect(renderer.destroyed).toBe(1);
  });
});
