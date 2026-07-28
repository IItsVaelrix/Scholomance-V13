/**
 * ServerMessageSchema contract tests (Task 3).
 *
 * Every declared server message must validate against the discriminated union,
 * and authoritative payloads must be typed (not z.unknown()).
 */
import { describe, it, expect } from "vitest";
import {
  ServerMessageSchema,
  type ServerMessage,
} from "@polaris/contracts";

const ISO = "2026-07-28T00:00:00.000Z";

const envelope = {
  worldId: "shrine",
  roomId: "antechamber",
  sequence: 7,
  roomRevision: 3,
};

const room = {
  roomId: "antechamber",
  revision: 3,
  title: "Antechamber",
  descriptionKey: "antechamber.desc",
  exitIds: ["exit-north"],
  occupantIds: ["p1"],
  entityIds: ["lantern"],
  flags: {},
};

const entity = {
  entityId: "lantern",
  entityType: "object" as const,
  definitionId: "lantern.def",
  location: { type: "room" as const, roomId: "antechamber" },
  flags: {},
};

const player = {
  playerId: "p1",
  displayName: "Seeker",
  roomId: "antechamber",
  inventoryIds: [],
  connectionState: "connected" as const,
};

const sceneManifest = {
  sceneId: "antechamber_rev3",
  roomId: "antechamber",
  roomRevision: 3,
  visualRevision: 3,
  worldId: "shrine",
  backgroundAssetKey: "bg.antechamber",
  layers: [],
  hotspots: [],
  textRegions: [],
  lightingState: "dim",
  ambientEffects: [],
  contractHash: "scd64:abc",
  generatedAt: ISO,
};

const domainEvent = {
  eventId: "ev1",
  worldId: "shrine",
  roomId: "antechamber",
  sequence: 7,
  worldRevision: 3,
  eventType: "ENTITY_TAKEN" as const,
  actorId: "p1",
  payload: { entityId: "lantern" },
  rulesetVersion: "1.0.0",
  occurredAt: ISO,
};

function validFixture(type: ServerMessage["type"]): unknown {
  switch (type) {
    case "connection.ready":
      return { type, playerId: "p1", worldId: "shrine", serverTime: ISO };
    case "room.snapshot":
      return {
        type,
        envelope,
        room,
        entities: [entity],
        players: [player],
        sceneManifest,
        roomInfo: {
          title: "Antechamber",
          description: "A cold antechamber.",
          exits: { "exit-north": { direction: "north", label: "North" } },
        },
        entityInfo: { lantern: { displayName: "Lantern", description: "Brass." } },
      };
    case "command.accepted":
      return { type, commandId: "cmd_1", envelope };
    case "command.refused":
      return { type, commandId: "cmd_1", refusal: "UNKNOWN_VERB" };
    case "domain.events":
      return { type, envelope, events: [domainEvent], narrative: ["You take it."] };
    case "scene.patch":
      return {
        type,
        envelope,
        sceneManifest,
        entities: [entity],
        players: [player],
        entityInfo: { lantern: { displayName: "Lantern", description: "Brass." } },
      };
    case "state.resync.required":
      return { type, envelope, reason: "SEQUENCE_GAP" };
    case "server.error":
      return { type, code: "INTERNAL", message: "boom" };
  }
}

describe("ServerMessageSchema", () => {
  const types = [
    "connection.ready",
    "room.snapshot",
    "command.accepted",
    "command.refused",
    "domain.events",
    "scene.patch",
    "state.resync.required",
    "server.error",
  ] as const;

  for (const type of types) {
    it(`accepts a valid ${type} message`, () => {
      expect(ServerMessageSchema.safeParse(validFixture(type)).success).toBe(true);
    });
  }

  it("rejects a room.snapshot with an invalid envelope (negative sequence)", () => {
    expect(
      ServerMessageSchema.safeParse({
        type: "room.snapshot",
        envelope: { sequence: -1 },
      }).success,
    ).toBe(false);
  });

  it("rejects a room.snapshot whose authoritative entity payload is malformed", () => {
    const bad = {
      ...(validFixture("room.snapshot") as Record<string, unknown>),
      entities: [{ entityId: "lantern" }], // missing entityType/definition/location/flags
    };
    expect(ServerMessageSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(ServerMessageSchema.safeParse({ type: "bogus.event" }).success).toBe(false);
  });

  it("rejects a domain.events message with a malformed event", () => {
    const bad = {
      type: "domain.events",
      envelope,
      events: [{ eventId: "ev1" }], // missing required event fields
    };
    expect(ServerMessageSchema.safeParse(bad).success).toBe(false);
  });
});
