/**
 * DiagnosticLogger — structured observability for the GameServer (PDR §22).
 *
 * PDR §22 requires that every meaningful server transition emit a STRUCTURED
 * record carrying a fixed set of diagnostic fields, and that "no diagnostic
 * path should depend solely on unstructured log sentences." This logger is the
 * single emission point for those records.
 *
 * Required diagnostic fields (§22):
 *   requestId, commandId, playerId, worldId, roomId, roomRevision,
 *   eventSequence, rulesetVersion
 *
 * Required log events (§22):
 *   connection opened / closed, command received / accepted / refused,
 *   transaction failed, revision conflict, resynchronization requested,
 *   snapshot loaded, event replay completed, scene manifest generated.
 *
 * DESIGN:
 *   - Application-layer glue. NO domain or infrastructure imports.
 *   - The logger never throws and never blocks the request path: a failing sink
 *     is swallowed so observability can never crash the simulation (PDR §13.3).
 *   - The sink is injectable so tests can capture records deterministically and
 *     production can forward to stdout, a file, or a telemetry pipeline.
 */

/** The closed set of structured events the server emits (PDR §22). */
export type DiagnosticEvent =
  | "connection.opened"
  | "connection.closed"
  | "command.received"
  | "command.accepted"
  | "command.refused"
  | "transaction.failed"
  | "revision.conflict"
  | "resync.requested"
  | "snapshot.loaded"
  | "event.replay.completed"
  | "scene.manifest.generated"
  | "protocol.violation"
  | "rate.limited";

export type DiagnosticLevel = "info" | "warn" | "error";

/**
 * The fixed diagnostic field set from PDR §22. All fields are optional because
 * a given event only carries the subset relevant to it (a connection event has
 * no commandId; a command event has no eventSequence until it commits). Extra
 * contextual fields are permitted via the index signature.
 */
export interface DiagnosticFields {
  requestId?: string;
  commandId?: string;
  playerId?: string;
  worldId?: string;
  roomId?: string;
  roomRevision?: number;
  eventSequence?: number;
  rulesetVersion?: string;
  [extra: string]: unknown;
}

export interface DiagnosticRecord {
  /** ISO-8601 emission timestamp (wall-clock assigned at the boundary). */
  ts: string;
  level: DiagnosticLevel;
  event: DiagnosticEvent;
  fields: DiagnosticFields;
}

export type DiagnosticSink = (record: DiagnosticRecord) => void;

/**
 * Default sink: one compact JSON line per record on stdout. Structured, never a
 * bare prose sentence, so downstream tooling can parse every field.
 */
export const consoleDiagnosticSink: DiagnosticSink = (record) => {
  console.log(JSON.stringify(record));
};

/** A sink that discards everything (quiet tests / disabled observability). */
export const nullDiagnosticSink: DiagnosticSink = () => {};

export interface DiagnosticLoggerOptions {
  /** Injectable clock for deterministic timestamps in tests. */
  now?: () => Date;
}

export class DiagnosticLogger {
  private sink: DiagnosticSink;
  private now: () => Date;

  constructor(sink: DiagnosticSink = nullDiagnosticSink, options: DiagnosticLoggerOptions = {}) {
    this.sink = sink;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Emit one structured record. Never throws: a sink failure is swallowed so
   * observability cannot take down the authoritative loop (PDR §13.3).
   */
  emit(event: DiagnosticEvent, fields: DiagnosticFields = {}, level: DiagnosticLevel = "info"): void {
    try {
      this.sink({ ts: this.now().toISOString(), level, event, fields: { ...fields } });
    } catch {
      /* observability must never crash the server */
    }
  }

  // ─── Convenience helpers (one per §22 required event) ────────────────────────

  connectionOpened(fields: DiagnosticFields): void {
    this.emit("connection.opened", fields);
  }

  connectionClosed(fields: DiagnosticFields): void {
    this.emit("connection.closed", fields);
  }

  commandReceived(fields: DiagnosticFields): void {
    this.emit("command.received", fields);
  }

  commandAccepted(fields: DiagnosticFields): void {
    this.emit("command.accepted", fields);
  }

  commandRefused(fields: DiagnosticFields): void {
    this.emit("command.refused", fields, "warn");
  }

  transactionFailed(fields: DiagnosticFields): void {
    this.emit("transaction.failed", fields, "error");
  }

  revisionConflict(fields: DiagnosticFields): void {
    this.emit("revision.conflict", fields, "warn");
  }

  resyncRequested(fields: DiagnosticFields): void {
    this.emit("resync.requested", fields);
  }

  snapshotLoaded(fields: DiagnosticFields): void {
    this.emit("snapshot.loaded", fields);
  }

  eventReplayCompleted(fields: DiagnosticFields): void {
    this.emit("event.replay.completed", fields);
  }

  sceneManifestGenerated(fields: DiagnosticFields): void {
    this.emit("scene.manifest.generated", fields);
  }

  protocolViolation(fields: DiagnosticFields): void {
    this.emit("protocol.violation", fields, "warn");
  }

  rateLimited(fields: DiagnosticFields): void {
    this.emit("rate.limited", fields, "warn");
  }
}
