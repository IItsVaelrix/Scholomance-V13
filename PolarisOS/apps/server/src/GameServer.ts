/**
 * GameServer — Milestone 3 realtime multiplayer wiring, hardened in Milestone 6.
 *
 * Composes the authoritative stack behind a Fastify + WebSocket surface:
 *
 *   WebSocket protocol  → MessageCodec (decode/validate)
 *   connection registry → ConnectionRegistry (connections + room subscriptions)
 *   serialized room actor → RoomActorHub / RoomActor (race-safe command queue)
 *   two-phase commit    → CommitCoordinator + SqlitePersistence (durability)
 *   snapshots + events  → buildRoomSnapshot + domain.events/scene.patch broadcast
 *
 * Authority law (PDR §5.1): the server owns all world truth. Clients request
 * actions; they never mutate state. Every mutation flows:
 *   decode → bind → actor.enqueue → propose → persist → accept → broadcast.
 *
 * Milestone 6 hardening (PDR §21 security, §22 observability, §23 QA):
 *   - Structured DiagnosticLogger on every required transition (§22).
 *   - Per-connection command rate limiting (§21 "rate-limit command submission").
 *   - commandId idempotency: a duplicated submission never re-mutates (§23
 *     "Duplicate messages do not duplicate mutations"). Without this, a retried
 *     commandId re-derives identical eventIds and the kernel throws
 *     DUPLICATE_EVENT_ID — an unhandled rejection. We short-circuit it here.
 *   - Chat sanitization at the boundary (§21 "sanitize chat output").
 *   - Defensive try/catch around actor execution so no command path can crash
 *     the process (PDR §13.3).
 *
 * This file is application-layer glue. It imports packages but adds no new
 * domain rules — those live in the kernel/runtime.
 */

import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";

import { MessageCodec, ConnectionRegistry } from "@polaris/realtime-protocol";
import { WorldSession, CommitCoordinator, RoomActorHub } from "@polaris/world-runtime";
import type { PersistencePort } from "@polaris/world-runtime";
import { SqlitePersistence } from "@polaris/persistence-sqlite";
import { createInitialState } from "@polaris/world-kernel";
import { CommandBinder } from "@polaris/command-language";
import { SceneCompiler } from "@polaris/scene-compiler";
import { NarrativeProjector } from "@polaris/narrative-projector";
import type {
  ClientMessage,
  DomainEvent,
  RevisionEnvelope,
  BoundCommand,
  EntityState,
  PlayerState,
} from "@polaris/contracts";

import { loadWorldpack, type LoadedWorldpack } from "./loadWorldpack.js";
import { buildRoomSnapshot, buildSceneHints, collectVisibleEntities, type SnapshotDeps } from "./SnapshotBuilder.js";
import { DiagnosticLogger, nullDiagnosticSink, type DiagnosticSink } from "./DiagnosticLogger.js";
import { RateLimiter } from "./RateLimiter.js";
import { sanitizeChat } from "./sanitize.js";
import { buildSealedPacket } from "@polaris/scene-packet";

/** Generous default: 30 commands / second per connection stops floods, not play. */
const DEFAULT_RATE_LIMIT = { maxRequests: 30, windowMs: 1000 };
/** Bounded idempotency cache: enough to absorb client retries without growing unbounded. */
const SEEN_COMMAND_CAP = 2048;

export interface GameServerConfig {
  worldpackDir: string;
  /** SQLite path. Use ":memory:" for tests. */
  dbPath: string;
  /** Optional persistence override (test double). */
  persistence?: PersistencePort;
  /** Fastify's own request logger. */
  logger?: boolean;
  /** Structured observability sink (PDR §22). Defaults to a quiet no-op. */
  diagnosticSink?: DiagnosticSink;
  /** Command-submission rate limit (PDR §21). Defaults to DEFAULT_RATE_LIMIT. */
  rateLimit?: { maxRequests: number; windowMs: number };
}

/** Terminal outcome of a processed commandId, cached for idempotent replay. */
interface CommandOutcome {
  kind: "accepted" | "refused";
  envelope?: RevisionEnvelope;
  refusal?: string;
  alternatives?: Array<{ entityId: string; label: string }>;
}

/**
 * An at-most-once execution slot for a commandId. The `settled` promise lets a
 * concurrent duplicate await the original's outcome instead of re-executing.
 */
interface InFlightCommand {
  roomId: string;
  outcome?: CommandOutcome;
  settle: (outcome: CommandOutcome) => void;
  settled: Promise<CommandOutcome>;
}

export class GameServer {
  readonly app: FastifyInstance;
  private config: GameServerConfig;

  private codec = new MessageCodec();
  private registry = new ConnectionRegistry();
  private binder = new CommandBinder();
  private sceneCompiler = new SceneCompiler();
  private narrative = new NarrativeProjector();

  private worldpack!: LoadedWorldpack;
  private worldId = "";
  private rulesetVersion = "";
  private persistence!: PersistencePort;
  private session!: WorldSession;
  private coordinator!: CommitCoordinator;
  private hub!: RoomActorHub;
  private snapshotDeps!: SnapshotDeps;
  private opCounter = 0;
  private requestCounter = 0;
  /** Per-server monotonic sequence for sealed packet delivery ordering. */
  private sealSequenceCounter = 0;

  // Milestone 6 hardening state.
  private logger: DiagnosticLogger;
  private rateLimiter: RateLimiter;
  /** At-most-once execution slots keyed by commandId (bounded LRU). */
  private inFlight: Map<string, InFlightCommand> = new Map();

  constructor(config: GameServerConfig) {
    this.config = config;
    this.app = Fastify({ logger: config.logger ?? false });
    this.logger = new DiagnosticLogger(config.diagnosticSink ?? nullDiagnosticSink);
    const limit = config.rateLimit ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(limit.maxRequests, limit.windowMs);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    // 1. Load the authored world.
    this.worldpack = await loadWorldpack(this.config.worldpackDir);
    this.worldId = this.worldpack.worldId;
    this.rulesetVersion = this.worldpack.rulesetVersion;

    // 2. Persistence boundary.
    this.persistence =
      this.config.persistence ?? new SqlitePersistence({ dbPath: this.config.dbPath });
    await (this.persistence as SqlitePersistence).initialize?.();
    await (this.persistence as SqlitePersistence).initializeWorld?.(this.worldId, this.rulesetVersion);

    // 3. Authoritative session + restart restoration (PDR §13.4).
    const initialState = createInitialState(this.worldpack.definition);
    this.session = new WorldSession(initialState, { rulesetVersion: this.rulesetVersion });
    await this.restore();

    // 4. Projection + composition helpers.
    this.snapshotDeps = {
      sceneCompiler: this.sceneCompiler,
      roomCatalog: this.worldpack.roomCatalog,
      entityCatalog: this.worldpack.entityCatalog,
    };

    // 5. Two-phase commit coordinator with broadcast hook.
    this.coordinator = new CommitCoordinator(this.session, this.persistence, {
      onCommit: (events) => this.broadcastEvents(events),
    });

    // 6. Serialized room actors (PDR §14).
    this.hub = new RoomActorHub(this.coordinator);

    // 7. Transport surface.
    await this.app.register(websocket);
    this.registerRoutes();
  }

  /**
   * Restart restoration: snapshot + replay, or full ledger replay.
   */
  private async restore(): Promise<void> {
    const sqlite = this.persistence as SqlitePersistence;
    if (typeof sqlite.restoreWorld !== "function") return;

    const { snapshot, eventsAfterSnapshot } = await sqlite.restoreWorld(this.worldId);
    if (snapshot) {
      this.session.restoreFromSnapshot(snapshot.state, snapshot.sequence, []);
      this.session.replayEvents(eventsAfterSnapshot);
      this.logger.snapshotLoaded({
        worldId: this.worldId,
        rulesetVersion: this.rulesetVersion,
        eventSequence: snapshot.sequence,
        eventsReplayedAfter: eventsAfterSnapshot.length,
      });
    } else {
      const allEvents = await sqlite.loadAllEvents(this.worldId);
      if (allEvents.length > 0) {
        this.session.replayEvents(allEvents);
      }
      this.logger.eventReplayCompleted({
        worldId: this.worldId,
        rulesetVersion: this.rulesetVersion,
        eventSequence: this.session.getSequenceCounter(),
        eventsReplayed: allEvents.length,
      });
    }
  }

  async start(port = 3100, host = "0.0.0.0"): Promise<number> {
    await this.app.listen({ port, host });
    const addr = this.app.server.address();
    return typeof addr === "object" && addr ? addr.port : port;
  }

  async stop(): Promise<void> {
    await this.app.close();
    await (this.persistence as SqlitePersistence).close?.();
  }

  getWorldId(): string {
    return this.worldId;
  }

  getSession(): WorldSession {
    return this.session;
  }

  getRegistry(): ConnectionRegistry {
    return this.registry;
  }

  getLogger(): DiagnosticLogger {
    return this.logger;
  }

  // ─── Routes ──────────────────────────────────────────────────────────────────

  private registerRoutes(): void {
    this.app.get("/health", async () => ({
      status: "ok",
      world: this.worldId,
      version: "0.1.0",
    }));

    this.app.get("/ws", { websocket: true }, (socket) => {
      const connectionId = randomUUID();
      const send = (msg: string) => {
        try {
          socket.send(msg);
        } catch {
          /* connection already gone */
        }
      };
      this.registry.addConnection(connectionId, send);
      this.logger.connectionOpened({ requestId: connectionId });

      socket.on("message", (raw: Buffer) => {
        let msg: ClientMessage;
        try {
          msg = this.codec.decode(raw.toString());
        } catch (err) {
          // PDR §21: "log rejected protocol violations."
          this.logger.protocolViolation({
            requestId: connectionId,
            playerId: this.registry.getPlayerId(connectionId) ?? undefined,
            code: "INVALID_MESSAGE",
            message: err instanceof Error ? err.message : "invalid message",
          });
          send(
            JSON.stringify({
              type: "server.error",
              code: "INVALID_MESSAGE",
              message: err instanceof Error ? err.message : "invalid message",
            }),
          );
          return;
        }
        void this.handleMessage(connectionId, msg);
      });

      const onClose = () => {
        this.logger.connectionClosed({
          requestId: connectionId,
          playerId: this.registry.getPlayerId(connectionId) ?? undefined,
        });
        this.rateLimiter.reset(connectionId);
        void this.handleDisconnect(connectionId);
      };
      socket.on("close", onClose);
      socket.on("error", onClose);
    });
  }

  // ─── Message routing ─────────────────────────────────────────────────────────

  private async handleMessage(connectionId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "connection.identify":
        return this.onIdentify(connectionId, msg.playerId);
      case "room.join":
        return this.onRoomJoin(connectionId, msg.playerId, msg.roomId);
      case "command.submit":
        return this.onCommandSubmit(connectionId, msg);
      case "chat.send":
        return this.onChatSend(connectionId, msg.playerId, msg.roomId, msg.message);
      case "state.resync.request":
        return this.onResyncRequest(connectionId, msg);
    }
  }

  private onIdentify(connectionId: string, playerId: string): void {
    this.registry.identify(connectionId, playerId);
    this.sendTo(connectionId, {
      type: "connection.ready",
      playerId,
      worldId: this.worldId,
      spawnRoomId: this.worldpack.spawnRoomId,
      serverTime: new Date().toISOString(),
    });
  }

  private async onRoomJoin(
    connectionId: string,
    playerId: string,
    roomId: string,
  ): Promise<void> {
    const resolvedPlayer = this.registry.getPlayerId(connectionId) ?? playerId;
    this.registry.identify(connectionId, resolvedPlayer);
    // Subscribe BEFORE the join commit so the joiner receives their own entry event.
    this.registry.subscribe(connectionId, roomId);

    if (!this.session.getState().rooms[roomId]) {
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: `join_${roomId}`,
        refusal: "TARGET_NOT_FOUND",
      });
      return;
    }

    const commandId = this.nextId(`join_${resolvedPlayer}_${roomId}`);
    const actor = this.hub.actorFor(roomId);
    const result = await actor.enqueueJoin(resolvedPlayer, resolvedPlayer, commandId);

    if (!result.resolution.accepted) {
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId,
        refusal: (result.resolution as { refusal: string }).refusal,
      });
      return;
    }

    // Authoritative full-state snapshot for the joining client.
    this.sendSnapshot(connectionId, roomId);
  }

  private async onCommandSubmit(
    connectionId: string,
    msg: Extract<ClientMessage, { type: "command.submit" }>,
  ): Promise<void> {
    const requestId = this.nextRequestId();
    const playerId = this.registry.getPlayerId(connectionId) ?? msg.playerId;

    this.logger.commandReceived({
      requestId,
      commandId: msg.commandId,
      playerId,
      worldId: this.worldId,
      roomId: msg.roomId,
      rulesetVersion: this.rulesetVersion,
      rawInput: msg.rawInput,
    });

    // PDR §21: rate-limit command submission. A throttled command is refused,
    // never queued, so a flood cannot starve the serialized room actor.
    if (!this.rateLimiter.allow(connectionId)) {
      this.logger.rateLimited({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: msg.roomId,
      });
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: msg.commandId,
        refusal: "RATE_LIMITED",
      });
      return;
    }

    // PDR §23: duplicate messages must not duplicate mutations. A commandId
    // executes AT MOST ONCE. If this commandId is already claimed (in flight or
    // settled), await the original's outcome and replay it — never re-enter the
    // kernel (which would throw on the re-derived duplicate eventIds). The claim
    // below is synchronous and happens before the first await, so a concurrent
    // duplicate is caught here on the single-threaded event loop.
    const existing = this.inFlight.get(msg.commandId);
    if (existing) {
      this.logger.commandAccepted({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: existing.roomId,
        duplicate: true,
      });
      const outcome = await existing.settled;
      if (outcome.kind === "accepted") {
        this.sendTo(connectionId, {
          type: "command.accepted",
          commandId: msg.commandId,
          envelope: outcome.envelope,
        });
        this.sendSnapshot(connectionId, existing.roomId);
      } else {
        this.sendTo(connectionId, {
          type: "command.refused",
          commandId: msg.commandId,
          refusal: outcome.refusal ?? "DUPLICATE",
          alternatives: outcome.alternatives,
        });
      }
      return;
    }

    // Bind raw text → BoundCommand (deterministic, refuses ambiguity).
    const bind = this.binder.bind(msg.rawInput, {
      commandId: msg.commandId,
      actorId: playerId,
      roomId: msg.roomId,
      state: this.session.getState(),
    });

    if (!bind.success || !bind.command) {
      this.logger.commandRefused({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: msg.roomId,
        refusal: bind.refusal ?? "INVALID_ACTION",
      });
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: msg.commandId,
        refusal: bind.refusal ?? "INVALID_ACTION",
        alternatives: bind.alternatives,
      });
      return;
    }

    // Claim the commandId synchronously (at-most-once gate) BEFORE the first
    // await, so a concurrent duplicate sees the claim and short-circuits above.
    const claim = this.claimCommand(msg.commandId, msg.roomId);

    const actor = this.hub.actorFor(msg.roomId);
    let result;
    try {
      result = await actor.enqueue(bind.command);
    } catch (err) {
      // PDR §13.3: no command path may crash the process. Convert any unexpected
      // executor failure (e.g. a slipped-through duplicate eventId) into a clean
      // refusal + structured log.
      claim.settle({ kind: "refused", refusal: "INTERNAL_ERROR" });
      this.logger.transactionFailed({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: msg.roomId,
        reason: err instanceof Error ? err.message : "EXECUTOR_ERROR",
      });
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: msg.commandId,
        refusal: "INTERNAL_ERROR",
      });
      return;
    }

    const resolution = result.resolution;

    if (!resolution.accepted) {
      claim.settle({
        kind: "refused",
        refusal: resolution.refusal,
        alternatives: resolution.alternatives,
      });
      this.logger.commandRefused({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: msg.roomId,
        refusal: resolution.refusal,
      });
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: msg.commandId,
        refusal: resolution.refusal,
        alternatives: resolution.alternatives,
      });
      return;
    }

    // Accepted by the kernel. Did persistence confirm?
    if (result.commit && !result.commit.committed) {
      claim.settle({ kind: "refused", refusal: "REVISION_CONFLICT" });
      this.logger.revisionConflict({
        requestId,
        commandId: msg.commandId,
        playerId,
        roomId: msg.roomId,
        reason: result.commit.reason ?? "REVISION_MISMATCH",
      });
      this.sendTo(connectionId, {
        type: "command.refused",
        commandId: msg.commandId,
        refusal: "REVISION_CONFLICT",
      });
      return;
    }

    const envelope = this.envelopeFor(msg.roomId, this.session.getSequenceCounter());
    claim.settle({ kind: "accepted", envelope });

    this.logger.commandAccepted({
      requestId,
      commandId: msg.commandId,
      playerId,
      worldId: this.worldId,
      roomId: msg.roomId,
      roomRevision: this.session.getRoomRevision(msg.roomId),
      eventSequence: envelope.sequence,
      rulesetVersion: this.rulesetVersion,
    });

    this.sendTo(connectionId, {
      type: "command.accepted",
      commandId: msg.commandId,
      envelope,
    });

    // Zero-event commands (LOOK / INVENTORY / EXAMINE) produce no broadcast;
    // send the submitter a fresh snapshot so they see current state.
    if (resolution.events.length === 0) {
      this.sendSnapshot(connectionId, msg.roomId);
    }

    // Movement crosses rooms: broadcastEvents only reaches each room's existing
    // subscribers, so the mover — still subscribed to the source — would never
    // receive the destination's scene. Follow them: re-subscribe the connection
    // to the destination and deliver its authoritative snapshot so the new room's
    // title, exits, entities and illustrated scene all arrive (PDR §3, §5.3).
    const entered = resolution.events.find(
      (e) => e.eventType === "PLAYER_ENTERED_ROOM" && e.actorId === playerId,
    );
    if (entered?.roomId && entered.roomId !== msg.roomId) {
      this.registry.unsubscribe(connectionId, msg.roomId);
      this.registry.subscribe(connectionId, entered.roomId);
      this.sendSnapshot(connectionId, entered.roomId);
    }
  }

  private async onChatSend(
    connectionId: string,
    playerId: string,
    roomId: string,
    message: string,
  ): Promise<void> {
    const resolvedPlayer = this.registry.getPlayerId(connectionId) ?? playerId;
    // PDR §21: sanitize player-authored chat at the boundary.
    const clean = sanitizeChat(message);
    if (clean.length === 0) return; // nothing to say after sanitization

    const commandId = this.nextId(`chat_${resolvedPlayer}`);
    this.logger.commandReceived({
      requestId: this.nextRequestId(),
      commandId,
      playerId: resolvedPlayer,
      roomId,
      kind: "chat",
    });
    const command: BoundCommand = {
      commandId,
      actorId: resolvedPlayer,
      roomId,
      action: "SAY",
      targetIds: [],
      arguments: { message: clean },
      evidence: [{ source: "chat.send", confidence: 1 }],
    };
    try {
      await this.hub.actorFor(roomId).enqueue(command);
    } catch (err) {
      this.logger.transactionFailed({
        commandId,
        playerId: resolvedPlayer,
        roomId,
        reason: err instanceof Error ? err.message : "EXECUTOR_ERROR",
      });
    }
  }

  private onResyncRequest(
    connectionId: string,
    msg: Extract<ClientMessage, { type: "state.resync.request" }>,
  ): void {
    this.logger.resyncRequested({
      requestId: this.nextRequestId(),
      playerId: this.registry.getPlayerId(connectionId) ?? msg.playerId,
      roomId: msg.roomId,
      eventSequence: msg.lastSequence,
    });
    this.sendSnapshot(connectionId, msg.roomId);
  }

  private async handleDisconnect(connectionId: string): Promise<void> {
    const playerId = this.registry.getPlayerId(connectionId);
    const rooms = this.registry.getSubscribedRooms(connectionId);
    this.registry.removeConnection(connectionId);

    if (!playerId) return;
    for (const roomId of rooms) {
      try {
        const commandId = this.nextId(`leave_${playerId}_${roomId}`);
        await this.hub.actorFor(roomId).enqueueLeave(playerId, commandId);
      } catch {
        // Benign: a disconnect during shutdown or a transient commit failure must
        // never crash the process (PDR §13.3). The connection is already removed
        // from the registry; presence reconciles on the player's next join.
      }
    }
  }

  // ─── Outbound helpers ────────────────────────────────────────────────────────

  private sendTo(connectionId: string, obj: unknown): void {
    this.registry.sendTo(connectionId, JSON.stringify(obj));
  }

  private sendSnapshot(connectionId: string, roomId: string): void {
    const state = this.session.getState();
    const sequence = this.session.getSequenceCounter();
    const snapshot = buildRoomSnapshot(
      this.worldId,
      roomId,
      state,
      sequence,
      this.snapshotDeps,
    );
    this.logger.snapshotLoaded({
      playerId: this.registry.getPlayerId(connectionId) ?? undefined,
      worldId: this.worldId,
      roomId,
      roomRevision: state.rooms[roomId]?.revision ?? 0,
      eventSequence: sequence,
      rulesetVersion: this.rulesetVersion,
    });
    if (snapshot.sceneManifest) {
      this.logger.sceneManifestGenerated({
        worldId: this.worldId,
        roomId,
        roomRevision: state.rooms[roomId]?.revision ?? 0,
        contractHash: snapshot.sceneManifest.contractHash,
      });
    }
    this.registry.sendTo(connectionId, JSON.stringify(snapshot));
  }

  /**
   * Broadcast committed events to every subscriber of each affected room, as a
   * domain.events message (with projected prose) followed by a scene.patch
   * carrying the recompiled deterministic SceneManifest.
   */
  private broadcastEvents(events: DomainEvent[]): void {
    const byRoom = new Map<string, DomainEvent[]>();
    for (const event of events) {
      if (!event.roomId) continue;
      if (!byRoom.has(event.roomId)) byRoom.set(event.roomId, []);
      byRoom.get(event.roomId)!.push(event);
    }

    const state = this.session.getState();

    for (const [roomId, roomEvents] of byRoom) {
      const room = state.rooms[roomId];
      const envelope = this.envelopeFor(roomId, roomEvents[roomEvents.length - 1].sequence);
      const narrative = this.narrative.projectAll(roomEvents);

      this.registry.sendToRoom(
        roomId,
        JSON.stringify({ type: "domain.events", envelope, events: roomEvents, narrative }),
      );

      const roomEntities: EntityState[] = room
        ? room.entityIds.map((id) => state.entities[id]).filter((e): e is EntityState => Boolean(e))
        : [];
      const occupants: PlayerState[] = room
        ? room.occupantIds.map((id) => state.players[id]).filter((p): p is PlayerState => Boolean(p))
        : [];
      const sceneManifest = room
        ? this.sceneCompiler.compile({
            worldId: this.worldId,
            room,
            entities: roomEntities,
            occupants,
            sceneHints: buildSceneHints(roomId, roomEntities, this.snapshotDeps),
          })
        : null;

      if (sceneManifest) {
        this.logger.sceneManifestGenerated({
          worldId: this.worldId,
          roomId,
          roomRevision: room?.revision ?? 0,
          eventSequence: envelope.sequence,
          contractHash: sceneManifest.contractHash,
        });
      }

      // Attach the refreshed visible entities + occupants (+ display names) so
      // clients can re-project their inventory / here / present panels on every
      // mutation, not just on full snapshots (Milestone 5 playable scenario).
      const visibleEntities = collectVisibleEntities(state, room, occupants);

      this.registry.sendToRoom(
        roomId,
        JSON.stringify({
          type: "scene.patch",
          envelope,
          sceneManifest,
          entities: visibleEntities,
          players: occupants,
          entityInfo: this.snapshotDeps.entityCatalog,
        }),
      );

      // Defold Bridge Design §"Runtime Flow" step 4: the server is the ONE
      // seal producer. Build and emit scene.sealed alongside scene.patch
      // (scene.patch remains during transition so the PixiJS lab keeps working).
      if (sceneManifest) {
        this.sealSequenceCounter += 1;
        const sealedPacket = buildSealedPacket(sceneManifest, {
          sequence: this.sealSequenceCounter,
        });
        this.registry.sendToRoom(
          roomId,
          JSON.stringify({
            type: "scene.sealed",
            envelope,
            packet: sealedPacket,
          }),
        );
      }
    }
  }

  private envelopeFor(roomId: string, sequence: number): RevisionEnvelope {
    const room = this.session.getState().rooms[roomId];
    return {
      worldId: this.worldId,
      roomId,
      sequence,
      roomRevision: room?.revision ?? 0,
    };
  }

  private nextId(prefix: string): string {
    this.opCounter += 1;
    return `${prefix}_${this.opCounter}_${Date.now().toString(36)}`;
  }

  private nextRequestId(): string {
    this.requestCounter += 1;
    return `req_${this.requestCounter}_${Date.now().toString(36)}`;
  }

  /**
   * Claim a commandId for at-most-once execution (PDR §23). Called synchronously
   * before the first await so concurrent duplicates observe the claim. Returns a
   * handle whose `settle` records the terminal outcome and resolves any duplicate
   * awaiting `settled`. The slot is kept (bounded LRU) so a later retry replays
   * the outcome instead of re-executing.
   */
  private claimCommand(commandId: string, roomId: string): InFlightCommand {
    let resolve!: (outcome: CommandOutcome) => void;
    const settled = new Promise<CommandOutcome>((res) => {
      resolve = res;
    });
    const entry: InFlightCommand = {
      roomId,
      settle: (outcome) => {
        entry.outcome = outcome;
        resolve(outcome);
      },
      settled,
    };
    this.inFlight.set(commandId, entry);
    this.evictSettled();
    return entry;
  }

  /**
   * Keep the idempotency cache bounded. Only SETTLED slots are evicted — an
   * in-flight slot may have a concurrent duplicate awaiting it, so it must stay
   * until it resolves (which is near-instant on the serialized actor).
   */
  private evictSettled(): void {
    if (this.inFlight.size <= SEEN_COMMAND_CAP) return;
    for (const [id, entry] of this.inFlight) {
      if (this.inFlight.size <= SEEN_COMMAND_CAP) break;
      if (entry.outcome !== undefined) this.inFlight.delete(id);
    }
  }
}

export async function buildGameServer(config: GameServerConfig): Promise<GameServer> {
  const server = new GameServer(config);
  await server.initialize();
  return server;
}
