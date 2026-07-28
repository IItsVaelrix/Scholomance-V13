/**
 * PolarisConsoleView — bind PolarisUiState to the mounted semantic shell
 * (Task 4). Framework-free DOM projection. The server stays authoritative:
 * buttons dispatch commands; nothing here mutates world state.
 */

import { mountDomPlan, type DomPlanNode, type MountedPolarisConsole } from "./mountDomPlan.js";
import {
  createChromeOrnamentController,
} from "./chromeOrnaments.js";
import { polarisChromeRegistry } from "../generated/polaris-chrome.registry.js";
import {
  selectComponentState,
  selectVisibleEntities,
  type ConsoleComponent,
} from "../state/selectors.js";
import type { PolarisUiState } from "../state/PolarisUiState.js";

export interface SceneAltarHosts {
  altar: HTMLElement;
  renderHost: HTMLElement;
  fallbackHost: HTMLElement;
  statusHost: HTMLElement;
}

export interface PolarisConsoleView {
  render(state: PolarisUiState): void;
  readonly mounted: MountedPolarisConsole;
  readonly sceneAltarHosts: SceneAltarHosts;
}

function clear(el: Element | undefined): void {
  if (el) el.textContent = "";
}

function setText(el: Element | undefined, text: string): void {
  if (el) el.textContent = text;
}

export function createPolarisConsoleView(
  document: Document,
  target: HTMLElement,
  plan: DomPlanNode,
): PolarisConsoleView {
  const mounted = mountDomPlan(document, target, plan);
  const byId = mounted.byId;

  // Decorative SCDL chrome: resolves variant SVGs into the aria-hidden
  // attachment hosts from each panel's data-state (Dual-State Art Pass §7).
  const chrome = createChromeOrnamentController(
    mounted.attachmentHosts,
    polarisChromeRegistry,
  );

  const shell = byId.get("polaris-console");
  const headerTitle = byId.get("polaris-system-header.title");
  const headerLocation = byId.get("polaris-system-header.location");
  const exitsEl = byId.get("polaris-bearing-rail.exits");
  const nearbyEl = byId.get("polaris-bearing-rail.nearby");
  const actionsEl = byId.get("polaris-bearing-rail.actions");
  const chroniclePanel = byId.get("polaris-chronicle");
  const chronicleLog = byId.get("polaris-chronicle-log");
  const conduit = byId.get("polaris-command-conduit");
  const commandInput = byId.get("polaris-command-input") as HTMLInputElement | undefined;
  const commandHints = byId.get("polaris-command-hints");
  const sceneAltar = byId.get("polaris-scene-altar");
  const telemetryRail = byId.get("polaris-telemetry-rail");
  const telemetrySelected = byId.get("polaris-telemetry-rail.selected");
  const telemetrySession = byId.get("polaris-telemetry-rail.session");

  let renderedChronicleCount = 0;

  // Scene Altar hosts: the Pixi portal mounts into the render host; an explicit
  // text fallback sibling is created here so the controller can reveal it when
  // illustration is unavailable (Task 5).
  const altar = byId.get("polaris-scene-altar");
  const renderHost = byId.get("polaris-scene-altar.host");
  const statusHost = byId.get("polaris-scene-altar.status");
  const fallbackHost = document.createElement("div");
  fallbackHost.className = "polaris-scene-fallback";
  fallbackHost.setAttribute("data-region", "fallback");
  fallbackHost.hidden = true;
  if (altar) altar.appendChild(fallbackHost);

  const sceneAltarHosts: SceneAltarHosts = {
    altar: altar ?? target,
    renderHost: renderHost ?? fallbackHost,
    fallbackHost,
    statusHost: statusHost ?? fallbackHost,
  };

  function setComponentState(el: Element | undefined, component: ConsoleComponent, state: PolarisUiState): void {
    if (el) el.setAttribute("data-state", selectComponentState(component, state));
  }

  function makeActionButton(label: string, command: string, disabled: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("data-command", command);
    button.disabled = disabled;
    return button;
  }

  function renderBearingRail(state: PolarisUiState): void {
    const disconnected = state.connection.phase === "disconnected";

    clear(exitsEl);
    clear(actionsEl);
    for (const action of state.availableActions) {
      const button = makeActionButton(action.label, action.command, disconnected);
      if (action.source === "exit") {
        exitsEl?.appendChild(button);
      } else {
        actionsEl?.appendChild(button);
      }
    }

    clear(nearbyEl);
    for (const view of selectVisibleEntities(state)) {
      const button = makeActionButton(view.displayName, `examine ${view.entityId}`, disconnected);
      button.setAttribute("data-entity-id", view.entityId);
      nearbyEl?.appendChild(button);
    }
  }

  function renderChronicle(state: PolarisUiState): void {
    if (!chronicleLog) return;
    const entries = state.chronicle;
    // Guard against a shrinking log (e.g. resync): rebuild from scratch.
    if (entries.length < renderedChronicleCount) {
      clear(chronicleLog);
      renderedChronicleCount = 0;
    }
    for (let i = renderedChronicleCount; i < entries.length; i += 1) {
      const entry = entries[i];
      const li = document.createElement("li");
      li.setAttribute("data-kind", entry.kind);
      li.textContent = entry.text;
      chronicleLog.appendChild(li);
    }
    renderedChronicleCount = entries.length;
  }

  function renderTelemetry(state: PolarisUiState): void {
    if (telemetrySelected) {
      clear(telemetrySelected);
      const dl = document.createElement("dl");
      const selected = state.selectedEntityId
        ? selectVisibleEntities(state).find((v) => v.entityId === state.selectedEntityId) ??
          state.entities.find((e) => e.entityId === state.selectedEntityId)
        : undefined;
      const rows: Array<[string, string]> = selected
        ? [
            ["Name", "displayName" in selected ? selected.displayName : selected.entityId],
            ["Description", "description" in selected ? String(selected.description ?? "") : ""],
          ]
        : [["Selected", "none"]];
      for (const [label, value] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      telemetrySelected.appendChild(dl);
    }

    if (telemetrySession) {
      clear(telemetrySession);
      const dl = document.createElement("dl");
      const rows: Array<[string, string]> = [
        ["World", state.connection.worldId ?? "—"],
        ["Room", state.room?.roomId ?? "—"],
        ["Sequence", state.envelope ? String(state.envelope.sequence) : "—"],
        ["Connection", state.connection.phase],
      ];
      for (const [label, value] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      telemetrySession.appendChild(dl);
    }
  }

  function renderCommand(state: PolarisUiState): void {
    const disconnected = state.connection.phase === "disconnected";
    if (commandInput) {
      // Never clobber a value the user is actively typing.
      if (document.activeElement !== commandInput) {
        commandInput.value = state.input.draft;
      }
      commandInput.disabled = disconnected;
    }
    clear(commandHints);
    for (const action of state.availableActions) {
      const button = makeActionButton(action.command, action.command, disconnected);
      commandHints?.appendChild(button);
    }
  }

  function render(state: PolarisUiState): void {
    setText(headerTitle, state.connection.worldId ?? "—");
    setText(headerLocation, state.roomInfo?.title ?? state.room?.title ?? "—");

    setComponentState(shell, "shell", state);
    setComponentState(sceneAltar, "scene", state);
    setComponentState(chroniclePanel, "chronicle", state);
    setComponentState(conduit, "command", state);
    setComponentState(telemetryRail, "telemetry", state);

    renderBearingRail(state);
    renderChronicle(state);
    renderTelemetry(state);
    renderCommand(state);

    // Resolve chrome ornaments after data-state is set on every panel.
    chrome.update();
  }

  return { render, mounted, sceneAltarHosts };
}
