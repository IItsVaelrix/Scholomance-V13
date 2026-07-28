/**
 * Reducer tests (Task 3) — quarantine decoding, authoritative projection,
 * idempotent/gap sync, selection reconciliation, and command lifecycle.
 */
import { describe, it, expect } from "vitest";
import { decodeServerMessage } from "../../src/protocol/decodeServerMessage.js";
import {
  polarisReducer,
  createInitialPolarisUiState,
  type PolarisAction,
} from "../../src/state/reducer.js";
import type { PolarisUiState } from "../../src/state/PolarisUiState.js";

const ISO = "2026-07-28T00:00:00.000Z";

function envelope(sequence: number) {
  return { worldId: "shrine", roomId: "antechamber", sequence, roomRevision: 3 };
}

function roomState() {
  return {
    roomId: "antechamber",
    revision: 3,
    title: "Antechamber",
    descriptionKey: "antechamber.desc",
    exitIds: ["exit-north"],
    occupantIds: ["p1"],
    entityIds: ["lantern"],
    flags: {},
  };
}

function entityInRoom(id = "lantern") {
  return {
    entityId: id,
    entityType: "object" as const,
    definitionId: `${id}.def`,
    location: { type: "room" as const, roomId: "antechamber" },
    flags: {},
  };
}

function entityInInventory(id: string, playerId = "p1") {
  return {
    entityId: id,
    entityType: "object" as const,
    definitionId: `${id}.def`,
    location: { type: "inventory" as const, playerId },
    flags: {},
  };
}

function player() {
  return {
    playerId: "p1",
    displayName: "Seeker",
    roomId: "antechamber",
    inventoryIds: [],
    connectionState: "connected" as const,
  };
}

function manifest(hotspots: unknown[] = []) {
  return {
    sceneId: "antechamber_rev3",
    roomId: "antechamber",
    roomRevision: 3,
    visualRevision: 3,
    worldId: "shrine",
    backgroundAssetKey: "bg.antechamber",
    layers: [],
    hotspots,
    textRegions: [],
    lightingState: "dim",
    ambientEffects: [],
    contractHash: "scd64:abc",
    generatedAt: ISO,
  };
}

function roomInfo() {
  return {
    title: "Antechamber",
    description: "A cold antechamber.",
    exits: { "exit-north": { direction: "north", label: "North" } },
  };
}

function snapshotMessage(sequence: number, extra: Record<string, unknown> = {}) {
  return {
    type: "room.snapshot" as const,
    envelope: envelope(sequence),
    room: roomState(),
    entities: [entityInRoom()],
    players: [player()],
    sceneManifest: manifest(),
    roomInfo: roomInfo(),
    entityInfo: { lantern: { displayName: "Lantern", description: "Brass." } },
    ...extra,
  };
}

function apply(state: PolarisUiState, ...actions: PolarisAction[]): PolarisUiState {
  return actions.reduce(polarisReducer, state);
}

function serverMsg(message: unknown): PolarisAction {
  return { type: "server-message", message: message as never };
}

describe("quarantine decoding", () => {
  it("decodes a valid message", () => {
    const result = decodeServerMessage(JSON.stringify(snapshotMessage(5)));
    expect(result.ok).toBe(true);
  });

  it("quarantines malformed JSON without throwing", () => {
    const result = decodeServerMessage("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe("POLARIS_PROTOCOL_MALFORMED_JSON");
    }
  });

  it("quarantines a schema-invalid message without throwing", () => {
    const result = decodeServerMessage(JSON.stringify({ type: "room.snapshot", envelope: { sequence: -1 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.code).toBe("POLARIS_PROTOCOL_INVALID_MESSAGE");
    }
  });

  it("routes a protocol-error action into latestDiagnostic, never into the projection", () => {
    const before = createInitialPolarisUiState();
    const after = apply(before, {
      type: "protocol-error",
      diagnostic: { code: "POLARIS_PROTOCOL_INVALID_MESSAGE", message: "bad" },
    });
    expect(after.latestDiagnostic?.code).toBe("POLARIS_PROTOCOL_INVALID_MESSAGE");
    expect(after.room).toBeNull();
    expect(after.entities).toEqual([]);
  });
});

describe("room.snapshot", () => {
  it("replaces the authoritative projection", () => {
    const state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    expect(state.connection.phase).toBe("connected");
    expect(state.room?.roomId).toBe("antechamber");
    expect(state.entities).toHaveLength(1);
    expect(state.players).toHaveLength(1);
    expect(state.sceneManifest?.sceneId).toBe("antechamber_rev3");
    expect(state.nextExpectedSequence).toBe(5);
    expect(state.envelope?.sequence).toBe(5);
  });
});

describe("scene.patch", () => {
  it("updates scene/entities/players without clearing Chronicle or input", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(
      state,
      { type: "input", input: { kind: "draft", draft: "light " } },
      serverMsg({
        type: "domain.events",
        envelope: envelope(5),
        events: [
          {
            eventId: "ev1",
            worldId: "shrine",
            roomId: "antechamber",
            sequence: 5,
            worldRevision: 3,
            eventType: "ENTITY_ACTIVATED",
            actorId: "p1",
            payload: {},
            rulesetVersion: "1.0.0",
            occurredAt: ISO,
          },
        ],
        narrative: ["The brazier blooms with flame."],
      }),
    );
    expect(state.chronicle).toHaveLength(1);

    const patched = apply(state, serverMsg({
      type: "scene.patch",
      envelope: envelope(6),
      sceneManifest: manifest(),
      entities: [entityInRoom(), entityInInventory("ember")],
      players: [player()],
      entityInfo: { lantern: { displayName: "Lantern", description: "Brass." } },
    }));

    expect(patched.entities).toHaveLength(2);
    expect(patched.chronicle).toHaveLength(1); // preserved
    expect(patched.input.draft).toBe("light "); // preserved
  });
});

describe("domain.events sync", () => {
  const event = (sequence: number) => ({
    eventId: `ev${sequence}`,
    worldId: "shrine",
    roomId: "antechamber",
    sequence,
    worldRevision: 3,
    eventType: "ENTITY_TAKEN" as const,
    actorId: "p1",
    payload: {},
    rulesetVersion: "1.0.0",
    occurredAt: ISO,
  });

  it("appends narrative and advances the cursor", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, serverMsg({
      type: "domain.events",
      envelope: envelope(5),
      events: [event(5)],
      narrative: ["You take the lantern."],
    }));
    expect(state.chronicle).toHaveLength(1);
    expect(state.nextExpectedSequence).toBe(6);
  });

  it("is idempotent for duplicate batches", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    const batch = serverMsg({
      type: "domain.events",
      envelope: envelope(5),
      events: [event(5)],
      narrative: ["You take the lantern."],
    });
    state = apply(state, batch, batch);
    expect(state.chronicle).toHaveLength(1);
    expect(state.nextExpectedSequence).toBe(6);
  });

  it("requests resync on a sequence gap and preserves the projection", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    const roomBefore = state.room;
    state = apply(state, serverMsg({
      type: "domain.events",
      envelope: envelope(9),
      events: [event(9)],
      narrative: ["Should not apply."],
    }));
    expect(state.latestDiagnostic?.code).toBe("POLARIS_SEQUENCE_GAP");
    expect(state.room).toEqual(roomBefore); // preserved
    expect(state.chronicle).toHaveLength(0); // narrative not applied
    expect(state.nextExpectedSequence).toBe(5); // unchanged
  });
});

describe("selection reconciliation", () => {
  it("keeps the selection while the entity is visible", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, { type: "selection", entityId: "lantern" });
    state = apply(state, serverMsg(snapshotMessage(6)));
    expect(state.selectedEntityId).toBe("lantern");
  });

  it("clears the selection when the entity is no longer visible", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, { type: "selection", entityId: "ghost" });
    state = apply(state, serverMsg(snapshotMessage(6)));
    expect(state.selectedEntityId).toBeNull();
  });
});

describe("command lifecycle", () => {
  it("submit sets pending, records history, and echoes to the Chronicle", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, {
      type: "input",
      input: { kind: "submit", commandId: "cmd_1", rawInput: "take lantern", submittedAt: 1000 },
    });
    expect(state.pendingCommand?.commandId).toBe("cmd_1");
    expect(state.pendingCommand?.phase).toBe("pending");
    expect(state.input.history[0]).toBe("take lantern");
    expect(state.input.draft).toBe("");
    expect(state.chronicle.some((c) => c.kind === "command")).toBe(true);
  });

  it("matching accepted clears pending with a success entry", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, {
      type: "input",
      input: { kind: "submit", commandId: "cmd_1", rawInput: "take lantern", submittedAt: 1000 },
    });
    state = apply(state, serverMsg({ type: "command.accepted", commandId: "cmd_1", envelope: envelope(6) }));
    expect(state.pendingCommand).toBeNull();
    expect(state.chronicle[state.chronicle.length - 1].kind).toBe("success");
  });

  it("matching refused clears pending with a corrupted/error entry", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, {
      type: "input",
      input: { kind: "submit", commandId: "cmd_1", rawInput: "eat lantern", submittedAt: 1000 },
    });
    state = apply(state, serverMsg({ type: "command.refused", commandId: "cmd_1", refusal: "NOT_EDIBLE" }));
    expect(state.pendingCommand).toBeNull();
    expect(state.chronicle[state.chronicle.length - 1].kind).toBe("error");
    expect(state.latestDiagnostic?.code).toBe("POLARIS_COMMAND_REFUSED");
  });

  it("an unrelated command response does not clear pending", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, {
      type: "input",
      input: { kind: "submit", commandId: "cmd_1", rawInput: "take lantern", submittedAt: 1000 },
    });
    state = apply(state, serverMsg({ type: "command.accepted", commandId: "cmd_OTHER", envelope: envelope(6) }));
    expect(state.pendingCommand?.commandId).toBe("cmd_1");
  });

  it("timeout flips phase to timed-out and exposes retry", () => {
    let state = apply(createInitialPolarisUiState(), serverMsg(snapshotMessage(5)));
    state = apply(state, {
      type: "input",
      input: { kind: "submit", commandId: "cmd_1", rawInput: "take lantern", submittedAt: 1000 },
    });
    state = apply(state, { type: "command-timeout", commandId: "cmd_1" });
    expect(state.pendingCommand?.phase).toBe("timed-out");
  });
});

describe("available actions", () => {
  it("derives from exits and visible hotspots only", () => {
    const state = apply(
      createInitialPolarisUiState(),
      serverMsg(snapshotMessage(5, {
        sceneManifest: manifest([
          { hotspotId: "h1", entityId: "brazier", label: "Brazier", command: "light brazier", region: { x: 0, y: 0, w: 10, h: 10 }, visible: true },
          { hotspotId: "h2", entityId: "rune", label: "Rune", command: "read rune", region: { x: 0, y: 0, w: 10, h: 10 }, visible: false },
        ]),
      })),
    );
    const commands = state.availableActions.map((a) => a.command);
    expect(commands).toContain("north"); // exit
    expect(commands).toContain("light brazier"); // visible hotspot
    expect(commands).not.toContain("read rune"); // hidden hotspot
    const sources = state.availableActions.map((a) => a.source);
    expect(sources).toContain("exit");
    expect(sources).toContain("hotspot");
  });
});
