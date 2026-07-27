/**
 * Polaris OS Client — Milestone 3 realtime client.
 *
 * Connects over WebSocket, identifies, joins a room, renders the authoritative
 * room.snapshot, then applies incremental domain.events + scene.patch updates.
 *
 * Synchronization protocol (PDR §17.4 missed-update handling):
 *   - The first room.snapshot sets our authoritative baseline + nextExpected seq.
 *   - Each domain event must arrive at exactly nextExpected; a gap triggers a
 *     state.resync.request and a fresh snapshot replaces local state.
 *
 * PixiJS illustration arrives in Milestone 5; until then the scene manifest is
 * rendered as accessible fallback text (PDR §16.3). The client never mutates
 * world state — it only requests actions and renders authoritative projections.
 */

import { PixiSceneRenderer } from "@polaris/renderer-pixi";
import type { SceneManifest } from "@polaris/contracts";
import { pixelBrainAssetRegistry } from "./generated/pixelbrainAssetRegistry.js";

interface RevisionEnvelope {
  worldId: string;
  roomId: string;
  sequence: number;
  roomRevision: number;
}

interface RoomInfo {
  title: string;
  description: string;
  exits: Record<string, { direction: string; label: string }>;
}

interface EntityView {
  entityId: string;
  entityType: string;
  definitionId: string;
  location: { type: string; roomId?: string; playerId?: string };
}

interface PlayerView {
  playerId: string;
  displayName: string;
  roomId: string;
  inventoryIds: string[];
  connectionState: string;
}

interface ServerMessage {
  type: string;
  envelope?: RevisionEnvelope;
  room?: { roomId: string; title: string; occupantIds: string[]; entityIds: string[] } | null;
  entities?: EntityView[];
  players?: PlayerView[];
  sceneManifest?: SceneManifest | null;
  events?: Array<{ sequence: number; eventType: string; payload: unknown }>;
  narrative?: string[];
  commandId?: string;
  refusal?: string;
  alternatives?: Array<{ entityId: string; label: string }>;
  roomInfo?: RoomInfo;
  entityInfo?: Record<string, { displayName: string; description: string }>;
  code?: string;
  message?: string;
  playerId?: string;
}

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const scene = document.getElementById("scene")!;
const roomTitle = document.getElementById("room-title")!;
const roomDesc = document.getElementById("room-desc")!;
const playersEl = document.getElementById("players")!;
const entitiesEl = document.getElementById("entities")!;
const inventoryEl = document.getElementById("inventory")!;
const narrative = document.getElementById("narrative")!;
const input = document.getElementById("command-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn")!;
const statusEl = document.getElementById("status")!;

// ─── Client state ──────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const ROOM_ID = params.get("room") ?? "ruined_shrine";
const WS_URL = params.get("ws") ?? `ws://${window.location.hostname}:3100/ws`;

// Stable identity across reconnects (per browser tab).
const PLAYER_ID =
  sessionStorage.getItem("polaris_player_id") ??
  `player_${Math.random().toString(36).slice(2, 8)}`;
sessionStorage.setItem("polaris_player_id", PLAYER_ID);

let ws: WebSocket | null = null;
let synced = false;
let nextExpected = 0;
let lastSnapshot: ServerMessage | null = null;
let cmdCounter = 0;

// ─── Illustrated renderer (Milestone 5) ────────────────────────────────────────
//
// The scene manifest is projected by the pure buildScenePlan and drawn by PixiJS.
// If WebGL is unavailable the renderer degrades to accessible text (PDR §5.4).
// A `?mode=text` query param forces text mode for review / low-power devices.
const FORCE_TEXT = params.get("mode") === "text";
const pixelBrainDiagnostics: Array<{
  bytecode: string;
  code: string;
  severity: string;
}> = [];
const renderer = new PixiSceneRenderer({
  container: scene,
  assetBaseUrl: params.get("assets") ?? "/assets",
  assetRegistry: pixelBrainAssetRegistry,
  fallbackMode: FORCE_TEXT,
  onCommand: (command) => sendCommand(command),
  onDiagnostic: ({ bytecode, code, severity }) => {
    pixelBrainDiagnostics.push({ bytecode, code, severity });
    if (pixelBrainDiagnostics.length > 100) pixelBrainDiagnostics.shift();
  },
});
// Kick off lazy PixiJS init; the first snapshot will render once ready.
void renderer.init();

// ─── Rendering ─────────────────────────────────────────────────────────────────

function setStatus(text: string, cls = ""): void {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function appendNarrative(text: string, cls = ""): void {
  const p = document.createElement("p");
  p.textContent = text;
  if (cls) p.className = cls;
  narrative.appendChild(p);
  narrative.scrollTop = narrative.scrollHeight;
}

function renderList(el: HTMLElement, items: string[], youMarker?: string): void {
  el.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "—";
    li.style.color = "#555";
    el.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    if (youMarker && item.includes(youMarker)) li.className = "you";
    el.appendChild(li);
  }
}

function renderSnapshot(msg: ServerMessage): void {
  lastSnapshot = msg;
  const info = msg.roomInfo;
  roomTitle.textContent = info?.title ?? msg.room?.roomId ?? "Unknown";
  roomDesc.textContent = info?.description ?? "";

  renderPanels(msg);

  if (msg.sceneManifest) renderScene(msg.sceneManifest);
}

/**
 * Re-project the side panels (Here / Present / Inventory) from authoritative
 * entity + player state. Called on the initial snapshot AND on every scene.patch
 * (which now carries refreshed entities/players), so the panels track world
 * mutations live — e.g. the lantern moves into inventory the moment it is taken
 * (Milestone 5 scenario step 6). The client never mutates; it only projects.
 */
function renderPanels(msg: ServerMessage): void {
  // "Here" = entities physically in the room (not those carried in inventory).
  const hereEntities = (msg.entities ?? []).filter((e) => e.location?.type === "room");
  const entityNames = hereEntities.map(
    (e) => msg.entityInfo?.[e.entityId]?.displayName ?? e.definitionId,
  );
  renderList(entitiesEl, entityNames);

  const playerNames = (msg.players ?? []).map((p) =>
    p.playerId === PLAYER_ID ? `${p.displayName} (you)` : p.displayName,
  );
  renderList(playersEl, playerNames, "(you)");

  const me = (msg.players ?? []).find((p) => p.playerId === PLAYER_ID);
  const invNames = (me?.inventoryIds ?? []).map(
    (id) => msg.entityInfo?.[id]?.displayName ?? id,
  );
  renderList(inventoryEl, invNames);
}

function renderScene(manifest: SceneManifest): void {
  // Delegate to the illustrated renderer (Milestone 5). It projects the manifest
  // via the deterministic buildScenePlan and draws it with PixiJS — or, if WebGL
  // is unavailable / text mode is forced, as accessible fallback text (PDR §5.4).
  // Hotspot clicks are routed back through sendCommand via the renderer config.
  void renderer.renderScene(manifest);
}

// ─── Sync protocol ─────────────────────────────────────────────────────────────

function requestResync(reason: string): void {
  appendNarrative(`[resync: ${reason}]`, "sys");
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "state.resync.request",
        playerId: PLAYER_ID,
        roomId: ROOM_ID,
        lastSequence: Math.max(0, nextExpected - 1),
      }),
    );
  }
}

function handleDomainEvents(msg: ServerMessage): void {
  // Render projected prose (flavor) regardless of sync state.
  for (const line of msg.narrative ?? []) appendNarrative(line);

  if (!synced) return; // baseline snapshot will supersede pre-sync events

  const events = msg.events ?? [];
  for (const event of events) {
    if (event.sequence < nextExpected) continue; // already applied (idempotent)
    if (event.sequence > nextExpected) {
      // Gap — pause and resynchronize (PDR §17.4).
      requestResync(`gap: expected ${nextExpected}, got ${event.sequence}`);
      return;
    }
    nextExpected = event.sequence + 1;
  }
}

function handleMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "connection.ready":
      setStatus(`connected ✓ as ${PLAYER_ID}`, "ok");
      ws!.send(JSON.stringify({ type: "room.join", playerId: PLAYER_ID, roomId: ROOM_ID }));
      break;

    case "room.snapshot":
      synced = true;
      nextExpected = msg.envelope?.sequence ?? 0;
      renderSnapshot(msg);
      break;

    case "domain.events":
      handleDomainEvents(msg);
      break;

    case "scene.patch":
      if (msg.sceneManifest) renderScene(msg.sceneManifest);
      // scene.patch now carries refreshed entities/players — re-project panels.
      if (msg.entities || msg.players) {
        lastSnapshot = { ...lastSnapshot, ...msg };
        renderPanels(msg);
      }
      break;

    case "command.accepted":
      // Authoritative confirmation; state arrives via domain.events / snapshot.
      break;

    case "command.refused": {
      let text = `✗ ${msg.refusal ?? "refused"}`;
      if (msg.alternatives && msg.alternatives.length > 0) {
        text += " — did you mean: " + msg.alternatives.map((a) => a.label).join(", ") + "?";
      }
      appendNarrative(text, "refusal");
      break;
    }

    case "server.error":
      appendNarrative(`[server error: ${msg.code} ${msg.message ?? ""}]`, "sys");
      break;
  }
}

// ─── Connection lifecycle ──────────────────────────────────────────────────────

function connect(): void {
  setStatus("connecting...");
  synced = false;
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "connection.identify", playerId: PLAYER_ID }));
  };

  ws.onmessage = (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }
    handleMessage(msg);
  };

  ws.onclose = () => {
    setStatus("disconnected — reconnecting...", "err");
    setTimeout(connect, 2000);
  };

  ws.onerror = () => setStatus("connection error", "err");
}

function sendCommand(rawText?: string): void {
  const fromInput = rawText === undefined;
  const text = (rawText ?? input.value).trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  cmdCounter += 1;
  ws.send(
    JSON.stringify({
      type: "command.submit",
      commandId: `cmd_${PLAYER_ID}_${cmdCounter}_${Date.now().toString(36)}`,
      playerId: PLAYER_ID,
      roomId: ROOM_ID,
      expectedRevision: lastSnapshot?.envelope?.roomRevision ?? 0,
      rawInput: text,
    }),
  );

  appendNarrative(`> ${text}`, "cmd");
  if (fromInput) input.value = "";
}

sendBtn.addEventListener("click", () => sendCommand());
input.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") sendCommand();
});

connect();
