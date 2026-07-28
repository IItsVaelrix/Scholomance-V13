/**
 * Selector tests (Task 3) — visual-state resolution, entity/inventory views,
 * and SCDL attachment-key resolution.
 */
import { describe, it, expect } from "vitest";
import {
  selectConsoleState,
  selectComponentState,
  selectVisibleEntities,
  selectInventory,
  selectAttachmentKey,
} from "../../src/state/selectors.js";
import { createInitialPolarisUiState } from "../../src/state/PolarisUiState.js";
import type { PolarisUiState, PolarisVisualState } from "../../src/state/PolarisUiState.js";

const ALL_STATES: PolarisVisualState[] = [
  "rest",
  "focus",
  "pending",
  "success",
  "warning",
  "corrupted",
  "disconnected",
];

function stateWith(patch: Partial<PolarisUiState>): PolarisUiState {
  return { ...createInitialPolarisUiState(), ...patch };
}

describe("selectConsoleState", () => {
  it("returns rest for a fresh state", () => {
    expect(selectConsoleState(createInitialPolarisUiState())).toBe("rest");
  });

  it("returns disconnected when the connection is down", () => {
    const state = stateWith({ connection: { phase: "disconnected", worldId: null } });
    expect(selectConsoleState(state)).toBe("disconnected");
  });

  it("returns corrupted on an error diagnostic", () => {
    const state = stateWith({
      latestDiagnostic: { code: "X", severity: "error", message: "boom" },
    });
    expect(selectConsoleState(state)).toBe("corrupted");
  });

  it("returns warning on a warning diagnostic", () => {
    const state = stateWith({
      latestDiagnostic: { code: "X", severity: "warning", message: "hm" },
    });
    expect(selectConsoleState(state)).toBe("warning");
  });

  it("returns pending while a command is outstanding", () => {
    const state = stateWith({
      pendingCommand: { commandId: "c", rawInput: "x", submittedAt: 0, phase: "pending" },
    });
    expect(selectConsoleState(state)).toBe("pending");
  });

  it("returns success after a success chronicle entry", () => {
    const state = stateWith({
      chronicle: [{ id: "1", kind: "success", text: "done", sequence: null }],
    });
    expect(selectConsoleState(state)).toBe("success");
  });

  it("always returns a member of the visual-state vocabulary", () => {
    expect(ALL_STATES).toContain(selectConsoleState(createInitialPolarisUiState()));
  });
});

describe("selectComponentState", () => {
  it("command shows pending then rest", () => {
    const pending = stateWith({
      pendingCommand: { commandId: "c", rawInput: "x", submittedAt: 0, phase: "pending" },
    });
    expect(selectComponentState("command", pending)).toBe("pending");
    expect(selectComponentState("command", createInitialPolarisUiState())).toBe("rest");
  });

  it("every component resolves to a valid visual state", () => {
    for (const component of ["shell", "scene", "chronicle", "command", "telemetry"] as const) {
      expect(ALL_STATES).toContain(selectComponentState(component, createInitialPolarisUiState()));
    }
  });

  it("disconnected propagates to components", () => {
    const state = stateWith({ connection: { phase: "disconnected", worldId: null } });
    expect(selectComponentState("telemetry", state)).toBe("disconnected");
    expect(selectComponentState("command", state)).toBe("disconnected");
  });
});

describe("entity views", () => {
  const base = stateWith({
    room: {
      roomId: "r",
      revision: 1,
      title: "R",
      descriptionKey: "k",
      exitIds: [],
      occupantIds: ["p1"],
      entityIds: ["lantern"],
      flags: {},
    },
    entities: [
      {
        entityId: "lantern",
        entityType: "object",
        definitionId: "d",
        location: { type: "room", roomId: "r" },
        flags: {},
      },
      {
        entityId: "key",
        entityType: "object",
        definitionId: "d",
        location: { type: "inventory", playerId: "p1" },
        flags: {},
      },
    ],
    entityInfo: {
      lantern: {
        displayName: "Lantern",
        description: "Brass.",
        illustration: { interactable: true, hotspotCommand: "light lantern" },
      },
    },
  });

  it("selectVisibleEntities returns only room entities with display info", () => {
    const visible = selectVisibleEntities(base);
    expect(visible).toHaveLength(1);
    expect(visible[0].displayName).toBe("Lantern");
    expect(visible[0].interactable).toBe(true);
    expect(visible[0].hotspotCommand).toBe("light lantern");
  });

  it("selectInventory returns only that player's carried entities", () => {
    const inv = selectInventory(base, "p1");
    expect(inv).toHaveLength(1);
    expect(inv[0].entityId).toBe("key");
    expect(inv[0].displayName).toBe("key"); // falls back to id when no info
  });
});

describe("selectAttachmentKey", () => {
  const registry = {
    "arcane-panel/rest/corners": {},
    "arcane-panel/focus/corners": {},
    "connection/rest/seal": {},
  };

  it("selects the exact-state key when present", () => {
    expect(selectAttachmentKey("arcane-panel/corners", "focus", registry)).toBe(
      "arcane-panel/focus/corners",
    );
  });

  it("falls back to rest when the exact state is absent", () => {
    expect(selectAttachmentKey("arcane-panel/corners", "corrupted", registry)).toBe(
      "arcane-panel/rest/corners",
    );
    expect(selectAttachmentKey("connection/seal", "disconnected", registry)).toBe(
      "connection/rest/seal",
    );
  });

  it("returns null when the family is entirely absent", () => {
    expect(selectAttachmentKey("command-conduit/sigil", "pending", registry)).toBeNull();
  });
});
