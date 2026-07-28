/**
 * @polaris/world-runtime
 *
 * Stateful orchestration layer. Wraps the pure world-kernel with:
 *   - Two-phase commit (propose → persist → accept)
 *   - Revision authority (in-memory)
 *   - Sequence continuity enforcement
 *   - Duplicate eventId rejection
 *   - ResolutionContext construction (wall-clock boundary)
 *
 * DEPENDENCY LAW:
 *   contracts ← world-kernel ← world-runtime ← server/apps
 *
 * This package MAY hold state. The kernel MUST NOT.
 * SQLite logic MUST NOT creep in here. Persistence is injected via PersistencePort.
 */

export { WorldSession } from "./WorldSession.js";
export { CommitCoordinator } from "./CommitCoordinator.js";
export { RoomActor, RoomActorHub } from "./RoomActor.js";
export type { SessionConfig } from "./WorldSession.js";
export type { PersistencePort, CommitCoordinatorConfig } from "./CommitCoordinator.js";
export type { ExecuteResult } from "./RoomActor.js";
