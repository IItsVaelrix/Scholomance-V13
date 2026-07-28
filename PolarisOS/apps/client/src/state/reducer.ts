/**
 * Polaris UI reducer — folds validated server messages + local UI actions into
 * one immutable PolarisUiState (Task 3). Pure: no browser APIs, no mutation.
 *
 * Sync semantics mirror the proven Milestone 3 client (PDR §17.4):
 *   - room.snapshot sets the authoritative baseline and nextExpectedSequence.
 *   - domain.events advance per-event; a stale batch is idempotent, a gap
 *     raises a resync diagnostic and preserves the last valid projection.
 */

import type { ServerMessage, EntityState, SceneManifest, RoomInfo } from "@polaris/contracts";
import {
  createInitialPolarisUiState,
  type PolarisUiState,
  type AvailableAction,
  type ChronicleEntry,
  type ChronicleKind,
  type ConnectionPhase,
} from "./PolarisUiState.js";

export type NavigationMode = "keyboard" | "pointer" | "controller";

export type InputUpdate =
  | { kind: "draft"; draft: string }
  | { kind: "history"; index: number | null }
  | { kind: "submit"; commandId: string; rawInput: string; submittedAt: number };

export type PolarisAction =
  | { type: "server-message"; message: ServerMessage }
  | { type: "protocol-error"; diagnostic: { code: string; message: string } }
  | { type: "connection"; phase: ConnectionPhase; worldId?: string | null }
  | { type: "input"; input: InputUpdate }
  | { type: "selection"; entityId: string | null }
  | { type: "command-timeout"; commandId: string }
  | { type: "navigation-mode"; mode: NavigationMode };

let chronicleCounter = 0;
function chronicleId(prefix: string): string {
  chronicleCounter += 1;
  return `chr:${prefix}:${chronicleCounter}`;
}

function entry(kind: ChronicleKind, text: string, sequence: number | null): ChronicleEntry {
  return { id: chronicleId(kind), kind, text, sequence };
}

function deriveAvailableActions(
  roomInfo: RoomInfo | null,
  sceneManifest: SceneManifest | null,
): AvailableAction[] {
  const actions: AvailableAction[] = [];
  if (roomInfo) {
    for (const [exitId, exit] of Object.entries(roomInfo.exits)) {
      actions.push({
        id: `exit:${exitId}`,
        label: exit.label,
        command: exit.direction,
        source: "exit",
      });
    }
  }
  if (sceneManifest) {
    for (const hotspot of sceneManifest.hotspots) {
      if (!hotspot.visible) continue;
      actions.push({
        id: `hotspot:${hotspot.hotspotId}`,
        label: hotspot.label,
        command: hotspot.command,
        source: "hotspot",
      });
    }
  }
  return actions;
}

/** Clear the selection only when the selected entity is no longer visible. */
function reconcileSelection(
  selectedEntityId: string | null,
  entities: readonly EntityState[],
): string | null {
  if (selectedEntityId === null) return null;
  return entities.some((e) => e.entityId === selectedEntityId) ? selectedEntityId : null;
}

function applyRoomSnapshot(state: PolarisUiState, message: Extract<ServerMessage, { type: "room.snapshot" }>): PolarisUiState {
  const entities = message.entities;
  return {
    ...state,
    connection: { ...state.connection, phase: "connected", worldId: message.envelope.worldId },
    envelope: message.envelope,
    room: message.room,
    roomInfo: message.roomInfo ?? null,
    entities,
    players: message.players,
    entityInfo: message.entityInfo ?? {},
    sceneManifest: message.sceneManifest,
    selectedEntityId: reconcileSelection(state.selectedEntityId, entities),
    availableActions: deriveAvailableActions(message.roomInfo ?? null, message.sceneManifest),
    nextExpectedSequence: message.envelope.sequence,
  };
}

function applyScenePatch(state: PolarisUiState, message: Extract<ServerMessage, { type: "scene.patch" }>): PolarisUiState {
  const entities = message.entities;
  const entityInfo = message.entityInfo ?? state.entityInfo;
  const sceneManifest = message.sceneManifest;
  return {
    ...state,
    envelope: message.envelope,
    entities,
    players: message.players,
    entityInfo,
    sceneManifest,
    selectedEntityId: reconcileSelection(state.selectedEntityId, entities),
    availableActions: deriveAvailableActions(state.roomInfo, sceneManifest),
    // Chronicle, input, and pending command are deliberately preserved.
  };
}

function applyDomainEvents(state: PolarisUiState, message: Extract<ServerMessage, { type: "domain.events" }>): PolarisUiState {
  const events = message.events;
  const narrative = message.narrative ?? [];
  const expected = state.nextExpectedSequence;

  // Idempotency: a batch whose newest event is already behind the cursor was
  // applied before — ignore it wholesale (no double narration).
  if (events.length > 0 && expected !== null) {
    const maxSeq = events.reduce((m, e) => Math.max(m, e.sequence), -1);
    if (maxSeq < expected) {
      return state;
    }
  }

  // Per-event gap detection (PDR §17.4). On a gap, preserve the projection and
  // surface a resync diagnostic; the transport performs the actual request.
  let nextExpected = expected;
  if (nextExpected !== null) {
    for (const event of events) {
      if (event.sequence > nextExpected) {
        return {
          ...state,
          latestDiagnostic: {
            code: "POLARIS_SEQUENCE_GAP",
            severity: "warning",
            message: `sequence gap: expected ${nextExpected}, got ${event.sequence}`,
          },
        };
      }
      if (event.sequence === nextExpected) {
        nextExpected = event.sequence + 1;
      }
    }
  }

  const seq = message.envelope.sequence;
  const newEntries = narrative.map((line) => entry("narration", line, seq));

  return {
    ...state,
    envelope: message.envelope,
    nextExpectedSequence: nextExpected,
    chronicle: newEntries.length > 0 ? [...state.chronicle, ...newEntries] : state.chronicle,
  };
}

function applyCommandAccepted(state: PolarisUiState, message: Extract<ServerMessage, { type: "command.accepted" }>): PolarisUiState {
  const pending = state.pendingCommand;
  if (!pending || pending.commandId !== message.commandId) return state;
  return {
    ...state,
    pendingCommand: null,
    chronicle: [...state.chronicle, entry("success", `✓ ${pending.rawInput}`, message.envelope.sequence)],
  };
}

function applyCommandRefused(state: PolarisUiState, message: Extract<ServerMessage, { type: "command.refused" }>): PolarisUiState {
  const pending = state.pendingCommand;
  if (!pending || pending.commandId !== message.commandId) return state;
  let text = `✗ ${message.refusal}`;
  if (message.alternatives && message.alternatives.length > 0) {
    text += ` — did you mean: ${message.alternatives.map((a) => a.label).join(", ")}?`;
  }
  return {
    ...state,
    pendingCommand: null,
    latestDiagnostic: { code: "POLARIS_COMMAND_REFUSED", severity: "warning", message: message.refusal },
    chronicle: [...state.chronicle, entry("error", text, null)],
  };
}

function applyInput(state: PolarisUiState, update: InputUpdate): PolarisUiState {
  switch (update.kind) {
    case "draft":
      return { ...state, input: { ...state.input, draft: update.draft } };
    case "history":
      return { ...state, input: { ...state.input, historyIndex: update.index } };
    case "submit": {
      const history = [update.rawInput, ...state.input.history.filter((h) => h !== update.rawInput)];
      return {
        ...state,
        pendingCommand: {
          commandId: update.commandId,
          rawInput: update.rawInput,
          submittedAt: update.submittedAt,
          phase: "pending",
        },
        input: { draft: "", history, historyIndex: null },
        chronicle: [...state.chronicle, entry("command", update.rawInput, null)],
      };
    }
  }
}

export function polarisReducer(state: PolarisUiState, action: PolarisAction): PolarisUiState {
  switch (action.type) {
    case "server-message": {
      const message = action.message;
      switch (message.type) {
        case "connection.ready":
          return {
            ...state,
            connection: { phase: "connected", worldId: message.worldId },
          };
        case "room.snapshot":
          return applyRoomSnapshot(state, message);
        case "scene.patch":
          return applyScenePatch(state, message);
        case "domain.events":
          return applyDomainEvents(state, message);
        case "command.accepted":
          return applyCommandAccepted(state, message);
        case "command.refused":
          return applyCommandRefused(state, message);
        case "state.resync.required":
          return {
            ...state,
            latestDiagnostic: {
              code: "POLARIS_RESYNC_REQUIRED",
              severity: "warning",
              message: message.reason ?? "server requested resync",
            },
          };
        case "server.error":
          return {
            ...state,
            latestDiagnostic: { code: message.code, severity: "error", message: message.message },
            chronicle: [...state.chronicle, entry("error", `[server error: ${message.code}] ${message.message}`, null)],
          };
      }
      return state;
    }

    case "protocol-error":
      return {
        ...state,
        latestDiagnostic: {
          code: action.diagnostic.code,
          severity: "warning",
          message: action.diagnostic.message,
        },
      };

    case "connection":
      return {
        ...state,
        connection: {
          phase: action.phase,
          worldId: action.worldId !== undefined ? action.worldId : state.connection.worldId,
        },
      };

    case "input":
      return applyInput(state, action.input);

    case "selection":
      return { ...state, selectedEntityId: action.entityId };

    case "command-timeout": {
      const pending = state.pendingCommand;
      if (!pending || pending.commandId !== action.commandId) return state;
      if (pending.phase === "timed-out") return state;
      return { ...state, pendingCommand: { ...pending, phase: "timed-out" } };
    }

    case "navigation-mode":
      return { ...state, navigationMode: action.mode };
  }
}

export { createInitialPolarisUiState };
