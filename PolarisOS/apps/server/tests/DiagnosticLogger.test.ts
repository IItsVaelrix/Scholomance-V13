/**
 * DiagnosticLogger unit tests (PDR §22 Observability).
 *
 * Verifies the structured record contract: every emission carries ts/level/
 * event/fields, the §22 diagnostic fields pass through untouched, levels are
 * assigned per event severity, and a failing sink can never crash the caller.
 */
import { describe, it, expect } from "vitest";
import {
  DiagnosticLogger,
  nullDiagnosticSink,
  type DiagnosticRecord,
} from "../src/DiagnosticLogger.js";

function capture() {
  const records: DiagnosticRecord[] = [];
  const logger = new DiagnosticLogger((r) => records.push(r), {
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });
  return { records, logger };
}

describe("DiagnosticLogger", () => {
  it("emits a structured record with ts/level/event/fields", () => {
    const { records, logger } = capture();
    logger.commandReceived({ commandId: "c1", playerId: "alice", roomId: "shrine" });

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.ts).toBe("2026-07-28T12:00:00.000Z");
    expect(r.event).toBe("command.received");
    expect(r.level).toBe("info");
    expect(r.fields.commandId).toBe("c1");
    expect(r.fields.playerId).toBe("alice");
    expect(r.fields.roomId).toBe("shrine");
  });

  it("preserves the full §22 diagnostic field set", () => {
    const { records, logger } = capture();
    logger.commandAccepted({
      requestId: "req_1",
      commandId: "c1",
      playerId: "alice",
      worldId: "vale",
      roomId: "shrine",
      roomRevision: 4,
      eventSequence: 7,
      rulesetVersion: "mvp-1",
    });

    const f = records[0].fields;
    expect(f.requestId).toBe("req_1");
    expect(f.commandId).toBe("c1");
    expect(f.playerId).toBe("alice");
    expect(f.worldId).toBe("vale");
    expect(f.roomId).toBe("shrine");
    expect(f.roomRevision).toBe(4);
    expect(f.eventSequence).toBe(7);
    expect(f.rulesetVersion).toBe("mvp-1");
  });

  it("assigns warn/error levels per event severity", () => {
    const { records, logger } = capture();
    logger.commandRefused({ commandId: "c", refusal: "TARGET_NOT_FOUND" });
    logger.transactionFailed({ commandId: "c", reason: "DB_ERROR" });
    logger.revisionConflict({ commandId: "c" });
    logger.protocolViolation({ code: "INVALID_MESSAGE" });
    logger.rateLimited({ playerId: "alice" });

    expect(records.map((r) => r.level)).toEqual([
      "warn",
      "error",
      "warn",
      "warn",
      "warn",
    ]);
  });

  it("covers every §22 required event via a convenience helper", () => {
    const { records, logger } = capture();
    logger.connectionOpened({ playerId: "a" });
    logger.connectionClosed({ playerId: "a" });
    logger.commandReceived({});
    logger.commandAccepted({});
    logger.commandRefused({});
    logger.transactionFailed({});
    logger.revisionConflict({});
    logger.resyncRequested({});
    logger.snapshotLoaded({});
    logger.eventReplayCompleted({});
    logger.sceneManifestGenerated({});

    expect(records.map((r) => r.event)).toEqual([
      "connection.opened",
      "connection.closed",
      "command.received",
      "command.accepted",
      "command.refused",
      "transaction.failed",
      "revision.conflict",
      "resync.requested",
      "snapshot.loaded",
      "event.replay.completed",
      "scene.manifest.generated",
    ]);
  });

  it("never throws when the sink throws (observability cannot crash the loop)", () => {
    const logger = new DiagnosticLogger(() => {
      throw new Error("sink down");
    });
    expect(() => logger.commandReceived({ commandId: "c" })).not.toThrow();
  });

  it("does not alias field objects between records", () => {
    const { records, logger } = capture();
    const fields = { commandId: "c1" };
    logger.commandReceived(fields);
    fields.commandId = "c2";
    logger.commandReceived(fields);
    expect(records[0].fields.commandId).toBe("c1");
    expect(records[1].fields.commandId).toBe("c2");
  });

  it("nullDiagnosticSink is a quiet no-op", () => {
    const logger = new DiagnosticLogger(nullDiagnosticSink);
    expect(() => logger.commandReceived({})).not.toThrow();
  });
});
