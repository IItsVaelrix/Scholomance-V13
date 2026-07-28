/**
 * PolarisUiState — the single stable client projection (Task 3).
 *
 * The protocol adapter folds validated server messages into this shape. It is
 * pure data: no DOM, no WebSocket, no Pixi. The server remains authoritative;
 * this state never optimistically mutates room/player/entity/scene truth.
 */

import type {
  RevisionEnvelope,
  RoomState,
  EntityState,
  PlayerState,
  SceneManifest,
  RoomInfo,
  EntityInfo,
} from "@polaris/contracts";

export type PolarisVisualState =
  | "rest"
  | "focus"
  | "pending"
  | "success"
  | "warning"
  | "corrupted"
  | "disconnected";

export interface PendingCommand {
  commandId: string;
  rawInput: string;
  submittedAt: number;
  phase: "pending" | "timed-out";
}

export type ChronicleKind =
  | "narration"
  | "command"
  | "success"
  | "warning"
  | "error"
  | "system";

export interface ChronicleEntry {
  id: string;
  kind: ChronicleKind;
  text: string;
  sequence: number | null;
}

export interface AvailableAction {
  id: string;
  label: string;
  command: string;
  source: "exit" | "hotspot";
}

export interface UiDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export type ConnectionPhase = "connecting" | "connected" | "disconnected";

export interface PolarisUiState {
  connection: { phase: ConnectionPhase; worldId: string | null };
  envelope: RevisionEnvelope | null;
  room: RoomState | null;
  roomInfo: RoomInfo | null;
  entities: readonly EntityState[];
  players: readonly PlayerState[];
  entityInfo: Readonly<Record<string, EntityInfo>>;
  sceneManifest: SceneManifest | null;
  selectedEntityId: string | null;
  chronicle: readonly ChronicleEntry[];
  availableActions: readonly AvailableAction[];
  pendingCommand: PendingCommand | null;
  latestDiagnostic: UiDiagnostic | null;
  nextExpectedSequence: number | null;
  input: { draft: string; history: readonly string[]; historyIndex: number | null };
  navigationMode: "keyboard" | "pointer" | "controller";
}

export function createInitialPolarisUiState(): PolarisUiState {
  return {
    connection: { phase: "connecting", worldId: null },
    envelope: null,
    room: null,
    roomInfo: null,
    entities: [],
    players: [],
    entityInfo: {},
    sceneManifest: null,
    selectedEntityId: null,
    chronicle: [],
    availableActions: [],
    pendingCommand: null,
    latestDiagnostic: null,
    nextExpectedSequence: null,
    input: { draft: "", history: [], historyIndex: null },
    navigationMode: "keyboard",
  };
}
