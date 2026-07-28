/**
 * SceneAltarController — contain the authoritative Pixi world scene inside the
 * Scene Altar with an explicit text fallback (Task 5).
 *
 * The controller is renderer-agnostic (SceneRendererPort) so it is testable
 * without WebGL. It dedupes by deterministic contractHash, falls back to
 * ordinary DOM text when illustration fails or is forced off, and reports
 * status + diagnostics. It never mutates world state; hotspot commands are
 * surfaced through the fallback and the renderer's own command callback.
 */

import type { SceneManifest } from "@polaris/contracts";
import type { UiDiagnostic } from "../state/PolarisUiState.js";

export interface SceneRendererPort {
  renderScene(manifest: SceneManifest): Promise<unknown>;
  readonly isFallback: boolean;
  destroy(): void;
}

export interface SceneAltarControllerOptions {
  renderer: SceneRendererPort;
  renderHost: HTMLElement;
  fallbackHost: HTMLElement;
  statusHost: HTMLElement;
  onDiagnostic(diagnostic: UiDiagnostic): void;
}

export interface SceneAltarController {
  render(manifest: SceneManifest | null): Promise<void>;
  setForcedTextMode(enabled: boolean): void;
  destroy(): void;
}

export function createSceneAltarController(
  options: SceneAltarControllerOptions,
): SceneAltarController {
  const { renderer, renderHost, fallbackHost, statusHost, onDiagnostic } = options;

  let lastContractHash: string | null = null;
  let forcedTextMode = renderer.isFallback;
  let destroyed = false;

  function setStatus(text: string): void {
    statusHost.textContent = text;
  }

  function showFallback(): void {
    fallbackHost.hidden = false;
    renderHost.hidden = true;
  }

  function showIllustrated(): void {
    fallbackHost.hidden = true;
    renderHost.hidden = false;
  }

  function renderTextFallback(manifest: SceneManifest | null): void {
    fallbackHost.textContent = "";
    if (!manifest) {
      const p = document.createElement("p");
      p.setAttribute("data-region-kind", "description");
      p.textContent = "The scene has not yet taken shape.";
      fallbackHost.appendChild(p);
      showFallback();
      return;
    }

    for (const region of manifest.textRegions) {
      const el = document.createElement(region.kind === "title" ? "h3" : "p");
      el.setAttribute("data-region-kind", region.kind);
      el.textContent = region.text;
      fallbackHost.appendChild(el);
    }

    const visibleHotspots = manifest.hotspots.filter((h) => h.visible);
    if (visibleHotspots.length > 0) {
      const ul = document.createElement("ul");
      for (const hotspot of visibleHotspots) {
        const li = document.createElement("li");
        li.textContent = `${hotspot.label} — ${hotspot.command}`;
        ul.appendChild(li);
      }
      fallbackHost.appendChild(ul);
    }

    showFallback();
  }

  async function render(manifest: SceneManifest | null): Promise<void> {
    if (destroyed) return;

    if (manifest === null) {
      lastContractHash = null;
      renderTextFallback(null);
      setStatus("no scene");
      return;
    }

    // Dedupe on the deterministic contract hash. A contract is a pure projection
    // of room state, so an unchanged hash never needs a rerender — this also
    // prevents a failing render from looping through its own diagnostic dispatch.
    if (manifest.contractHash === lastContractHash) {
      return;
    }

    if (forcedTextMode) {
      lastContractHash = manifest.contractHash;
      renderTextFallback(manifest);
      setStatus("text mode");
      return;
    }

    // Claim the hash before awaiting so a rejection does not retry the same
    // contract on the follow-up state dispatch.
    lastContractHash = manifest.contractHash;
    try {
      await renderer.renderScene(manifest);
      showIllustrated();
      setStatus(`scene ${manifest.contractHash}`);
    } catch (err) {
      renderTextFallback(manifest);
      setStatus("illustration unavailable — text fallback");
      onDiagnostic({
        code: "POLARIS_SCENE_RENDER_FAILED",
        severity: "warning",
        message: err instanceof Error ? err.message : "scene render failed",
      });
    }
  }

  function setForcedTextMode(enabled: boolean): void {
    forcedTextMode = enabled;
    if (enabled) {
      // Re-project the fallback on the next render of the current contract.
      lastContractHash = null;
      renderHost.hidden = true;
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    renderer.destroy();
  }

  return { render, setForcedTextMode, destroy };
}
