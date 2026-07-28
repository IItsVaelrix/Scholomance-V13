/**
 * Polaris OS Client — Stateful Lattice Console bootstrap (Task 4).
 *
 * Thin wiring only: import styles, mount the generated semantic plan, fold
 * validated server messages into PolarisUiState via the reducer, and render
 * through PolarisConsoleView. All rendering lives in src/ui; the Pixi world
 * scene is re-housed into the Scene Altar in Task 5, and the transport /
 * command / navigation controllers are extracted in Task 7.
 *
 * The server remains authoritative — this client only requests actions and
 * renders authoritative projections.
 */

import "./generated/polaris-console.tokens.css";
import "./styles/polaris-console.css";
import { PixiSceneRenderer } from "@polaris/renderer-pixi";
import { polarisConsoleDomPlan } from "./generated/polaris-console.dom-plan.js";
import { pixelBrainAssetRegistry } from "./generated/pixelbrainAssetRegistry.js";
import type { DomPlanNode } from "./ui/mountDomPlan.js";
import { createPolarisConsoleView } from "./ui/PolarisConsoleView.js";
import { createSceneAltarController } from "./ui/SceneAltarController.js";
import {
  createInitialPolarisUiState,
  type PolarisUiState,
} from "./state/PolarisUiState.js";
import { polarisReducer, type PolarisAction } from "./state/reducer.js";
import { decodeServerMessage } from "./protocol/decodeServerMessage.js";

const params = new URLSearchParams(window.location.search);
const ROOM_ID = params.get("room") ?? "ruined_shrine";
const WS_URL = params.get("ws") ?? `ws://${window.location.hostname}:3100/ws`;
const FORCE_TEXT = params.get("mode") === "text";

// Stable identity across reconnects (per browser tab).
const PLAYER_ID =
  sessionStorage.getItem("polaris_player_id") ??
  `player_${Math.random().toString(36).slice(2, 8)}`;
sessionStorage.setItem("polaris_player_id", PLAYER_ID);

// ─── Mount the semantic shell ──────────────────────────────────────────────────

const appTarget = document.getElementById("app") ?? document.body;
const view = createPolarisConsoleView(
  document,
  appTarget,
  polarisConsoleDomPlan as unknown as DomPlanNode,
);

let state: PolarisUiState = createInitialPolarisUiState();

function dispatch(action: PolarisAction): void {
  state = polarisReducer(state, action);
  view.render(state);
  void sceneController.render(state.sceneManifest);
  maybeRequestResync();
}

// Initial paint.
view.render(state);

// ─── Scene Altar: bounded Pixi portal with text fallback (Task 5) ──────────────

const sceneRenderer = new PixiSceneRenderer({
  container: view.sceneAltarHosts.renderHost,
  assetBaseUrl: params.get("assets") ?? "/assets",
  assetRegistry: pixelBrainAssetRegistry,
  fallbackMode: FORCE_TEXT,
  onCommand: (command) => submitCommand(command),
  onDiagnostic: ({ code, severity }) => {
    dispatch({
      type: "protocol-error",
      diagnostic: { code: `POLARIS_PIXELBRAIN_${code}`, message: severity },
    });
  },
});

const sceneController = createSceneAltarController({
  renderer: sceneRenderer,
  renderHost: view.sceneAltarHosts.renderHost,
  fallbackHost: view.sceneAltarHosts.fallbackHost,
  statusHost: view.sceneAltarHosts.statusHost,
  onDiagnostic: (diagnostic) => {
    dispatch({ type: "protocol-error", diagnostic });
  },
});

if (FORCE_TEXT) sceneController.setForcedTextMode(true);
void sceneRenderer.init();

// ─── Command submission ────────────────────────────────────────────────────────

let cmdCounter = 0;
let resyncRequestedForGap = false;

function submitCommand(rawInput: string): void {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) return;
  if (state.connection.phase === "disconnected") return;

  cmdCounter += 1;
  const commandId = `cmd_${cmdCounter}_${Date.now().toString(36)}`;
  dispatch({
    type: "input",
    input: { kind: "submit", commandId, rawInput: trimmed, submittedAt: Date.now() },
  });

  send({
    type: "command.submit",
    commandId,
    playerId: PLAYER_ID,
    roomId: state.envelope?.roomId ?? ROOM_ID,
    expectedRevision: state.envelope?.roomRevision ?? 0,
    rawInput: trimmed,
  });
}

function maybeRequestResync(): void {
  if (state.latestDiagnostic?.code === "POLARIS_SEQUENCE_GAP" && !resyncRequestedForGap) {
    resyncRequestedForGap = true;
    send({
      type: "state.resync.request",
      playerId: PLAYER_ID,
      roomId: state.envelope?.roomId ?? ROOM_ID,
      lastSequence: Math.max(0, (state.nextExpectedSequence ?? 1) - 1),
    });
  }
  if (state.latestDiagnostic?.code !== "POLARIS_SEQUENCE_GAP") {
    resyncRequestedForGap = false;
  }
}

// ─── Transport (inline for Task 4; extracted into PolarisTransport in Task 7) ──

let ws: WebSocket | null = null;

function send(message: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function connect(): void {
  dispatch({ type: "connection", phase: "connecting" });
  ws = new WebSocket(WS_URL);

  ws.onopen = () => send({ type: "connection.identify", playerId: PLAYER_ID });

  ws.onmessage = (event) => {
    const decoded = decodeServerMessage(String(event.data));
    if (!decoded.ok) {
      dispatch({ type: "protocol-error", diagnostic: decoded.diagnostic });
      return;
    }
    const message = decoded.message;
    dispatch({ type: "server-message", message });
    if (message.type === "connection.ready") {
      send({ type: "room.join", playerId: PLAYER_ID, roomId: ROOM_ID });
    }
  };

  ws.onclose = () => {
    dispatch({ type: "connection", phase: "disconnected" });
  };
  ws.onerror = () => {
    dispatch({ type: "connection", phase: "disconnected" });
  };
}

// ─── Interaction wiring (delegated; buttons are re-rendered each state) ────────

view.mounted.root.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLButtonElement) {
    const command = target.getAttribute("data-command");
    if (command && !target.disabled) submitCommand(command);
  }
});

const commandInput = view.mounted.byId.get("polaris-command-input") as HTMLInputElement | undefined;
commandInput?.addEventListener("input", () => {
  state = polarisReducer(state, {
    type: "input",
    input: { kind: "draft", draft: commandInput.value },
  });
});

const conduit = view.mounted.byId.get("polaris-command-conduit");
conduit?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitCommand(commandInput?.value ?? "");
});

// ─── Teardown ──────────────────────────────────────────────────────────────────

window.addEventListener("beforeunload", () => {
  sceneController.destroy();
  ws?.close();
});

connect();
