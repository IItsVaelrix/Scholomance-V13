/**
 * Pure selectors over PolarisUiState (Task 3).
 *
 * Visual-state selectors collapse the normalized state into one of the seven
 * latent-ritualism states. Attachment resolution is exact-state → rest → null.
 */

import type { EntityState } from "@polaris/contracts";
import type { PolarisUiState, PolarisVisualState } from "./PolarisUiState.js";

export interface EntityView {
  entityId: string;
  displayName: string;
  description: string;
  interactable: boolean;
  hotspotCommand: string | null;
}

function toEntityView(state: PolarisUiState, entity: EntityState): EntityView {
  const info = state.entityInfo[entity.entityId];
  return {
    entityId: entity.entityId,
    displayName: info?.displayName ?? entity.entityId,
    description: info?.description ?? "",
    interactable: info?.illustration?.interactable ?? false,
    hotspotCommand: info?.illustration?.hotspotCommand ?? null,
  };
}

/** Entities physically present in the current room (excludes inventories). */
export function selectVisibleEntities(state: PolarisUiState): readonly EntityView[] {
  const roomId = state.room?.roomId;
  return state.entities
    .filter(
      (e) => e.location.type === "room" && (roomId === undefined || e.location.roomId === roomId),
    )
    .map((e) => toEntityView(state, e));
}

/** Entities carried by a given player. */
export function selectInventory(state: PolarisUiState, playerId: string): readonly EntityView[] {
  return state.entities
    .filter((e) => e.location.type === "inventory" && e.location.playerId === playerId)
    .map((e) => toEntityView(state, e));
}

function lastChronicleKind(state: PolarisUiState): string | null {
  return state.chronicle.length > 0 ? state.chronicle[state.chronicle.length - 1].kind : null;
}

/** Global console visual state, resolved by descending severity. */
export function selectConsoleState(state: PolarisUiState): PolarisVisualState {
  if (state.connection.phase === "disconnected") return "disconnected";
  if (state.latestDiagnostic?.severity === "error") return "corrupted";
  if (state.latestDiagnostic?.severity === "warning") return "warning";
  if (state.pendingCommand) return state.pendingCommand.phase === "timed-out" ? "warning" : "pending";
  if (lastChronicleKind(state) === "success") return "success";
  return "rest";
}

export type ConsoleComponent = "shell" | "scene" | "chronicle" | "command" | "telemetry";

export function selectComponentState(
  component: ConsoleComponent,
  state: PolarisUiState,
): PolarisVisualState {
  const disconnected = state.connection.phase === "disconnected";

  switch (component) {
    case "shell":
      return selectConsoleState(state);

    case "command": {
      if (disconnected) return "disconnected";
      if (state.pendingCommand) return state.pendingCommand.phase === "timed-out" ? "warning" : "pending";
      if (state.latestDiagnostic?.code === "POLARIS_COMMAND_REFUSED") return "corrupted";
      if (lastChronicleKind(state) === "success") return "success";
      return "rest";
    }

    case "chronicle": {
      if (disconnected) return "disconnected";
      if (state.latestDiagnostic?.severity === "error") return "corrupted";
      if (state.latestDiagnostic?.severity === "warning") return "warning";
      return "rest";
    }

    case "scene": {
      if (disconnected) return "disconnected";
      if (state.sceneManifest === null && state.room !== null) return "warning";
      return "rest";
    }

    case "telemetry":
      return disconnected ? "disconnected" : "rest";
  }
}

/**
 * Resolve an SCDL attachment key from the immutable registry.
 * Family is `<group>/<part>`; the registry key is `<group>/<state>/<part>`.
 * Resolution order: exact state, then `rest`, then null.
 */
export function selectAttachmentKey(
  family: string,
  state: PolarisVisualState,
  registry: Readonly<Record<string, unknown>>,
): string | null {
  const slash = family.indexOf("/");
  if (slash < 0) return null;
  const group = family.slice(0, slash);
  const part = family.slice(slash + 1);

  const exact = `${group}/${state}/${part}`;
  if (exact in registry) return exact;
  const rest = `${group}/rest/${part}`;
  if (rest in registry) return rest;
  return null;
}
