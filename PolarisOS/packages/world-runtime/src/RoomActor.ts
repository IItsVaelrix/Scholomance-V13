/**
 * RoomActor — serialized per-room command processing (PDR §14 Concurrency Model).
 *
 * "Each active room has a serialized command queue."
 *   export interface RoomActor {
 *     roomId: string;
 *     enqueue(command: BoundCommand): Promise<CommandResolution>;
 *     getRevision(): number;
 *   }
 *
 * Race-safety guarantee (§14.2): when two players both `take lantern`, the first
 * valid command acquires it and the second is evaluated against the UPDATED state
 * (receiving TARGET_UNAVAILABLE). This requires that propose → persist → accept
 * never interleave between concurrent submissions.
 *
 * Because the world has a SINGLE global revision authority (one WorldSession), the
 * RoomActorHub owns one global serialization chain. Every RoomActor funnels its
 * work through that chain, so commits are globally ordered and race-free, while
 * still presenting a per-room actor interface to callers.
 *
 * DEPENDENCY LAW:
 *   contracts ← world-kernel ← world-runtime (this file) ← server/apps
 *   No WebSocket / SQLite / Fastify imports here. Broadcasting is the caller's job
 *   (wired via CommitCoordinator.onCommit).
 */

import type { BoundCommand, CommandResolution, CommitResult } from "@polaris/contracts";
import type { CommitCoordinator } from "./CommitCoordinator.js";

export interface ExecuteResult {
  resolution: CommandResolution;
  commit?: CommitResult;
}

/**
 * RoomActorHub — owns the global serialization chain and vends per-room actors.
 */
export class RoomActorHub {
  private coordinator: CommitCoordinator;
  private actors: Map<string, RoomActor> = new Map();
  /** Global serialization chain. Never rejects (errors are swallowed into the link). */
  private chain: Promise<void> = Promise.resolve();

  constructor(coordinator: CommitCoordinator) {
    this.coordinator = coordinator;
  }

  /**
   * Get (or create) the actor for a room.
   */
  actorFor(roomId: string): RoomActor {
    let actor = this.actors.get(roomId);
    if (!actor) {
      actor = new RoomActor(roomId, this);
      this.actors.set(roomId, actor);
    }
    return actor;
  }

  /**
   * Run a task serialized behind all previously enqueued tasks.
   * The returned promise resolves/rejects with the task's own outcome; the
   * internal chain always advances so a single failure cannot jam the queue.
   */
  serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  getCoordinator(): CommitCoordinator {
    return this.coordinator;
  }
}

/**
 * RoomActor — the per-room serialized queue interface from PDR §14.1.
 */
export class RoomActor {
  readonly roomId: string;
  private hub: RoomActorHub;

  constructor(roomId: string, hub: RoomActorHub) {
    this.roomId = roomId;
    this.hub = hub;
  }

  /**
   * Enqueue a bound command for serialized execution.
   * Resolves with the resolution (+ commit result if it reached persistence).
   */
  enqueue(command: BoundCommand): Promise<ExecuteResult> {
    return this.hub.serialize(() => this.hub.getCoordinator().executeCommand(command));
  }

  /**
   * Enqueue a player joining this room (serialized).
   */
  enqueueJoin(playerId: string, displayName: string, commandId: string): Promise<ExecuteResult> {
    return this.hub.serialize(() =>
      this.hub.getCoordinator().executePlayerJoin(playerId, displayName, this.roomId, commandId),
    );
  }

  /**
   * Enqueue a player leaving this room (serialized).
   */
  enqueueLeave(playerId: string, commandId: string): Promise<ExecuteResult> {
    return this.hub.serialize(() =>
      this.hub.getCoordinator().executePlayerLeave(playerId, this.roomId, commandId),
    );
  }

  /**
   * Current room revision (PDR §14.1 getRevision).
   */
  getRevision(): number {
    return this.hub.getCoordinator().getSession().getRoomRevision(this.roomId);
  }
}
