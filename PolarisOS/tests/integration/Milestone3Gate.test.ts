/**
 * Milestone 3 Exit Gate — Realtime multiplayer integration test.
 *
 * Exit criterion (PDR §25 Milestone 3): "Two browser clients receive synchronized state."
 *
 * This boots the REAL GameServer (Fastify + WebSocket + SQLite + kernel + runtime)
 * on an ephemeral port and drives two real `ws` clients through the protocol:
 *
 *   1. Both connect, identify, and join the ruined shrine.
 *   2. Both observe each other (synchronized presence).
 *   3. Both race for the lantern — exactly one wins, the other is refused,
 *      and BOTH receive the same ENTITY_TAKEN event (synchronized mutation).
 *   4. The winner lights the brazier — BOTH receive the scene.patch whose
 *      deterministic lighting state flips to warm_firelight (synchronized visual).
 *   5. A resync request returns a fresh snapshot reflecting the true state.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";
import { buildGameServer, type GameServer } from "../../apps/server/src/GameServer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLDPACK_DIR = resolve(__dirname, "../../worldpacks/shrine-demo");
const ROOM = "ruined_shrine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Minimal promise-based WS test client ──────────────────────────────────────

class TestClient {
  ws: WebSocket;
  messages: any[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      try {
        this.messages.push(JSON.parse(data.toString()));
      } catch {
        /* ignore non-JSON */
      }
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((res, rej) => {
      this.ws.once("open", () => res());
      this.ws.once("error", rej);
    });
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  /** Poll accumulated messages for one matching the predicate. */
  async waitFor(pred: (m: any) => boolean, opts: { timeout?: number; fromIndex?: number } = {}): Promise<any> {
    const timeout = opts.timeout ?? 5000;
    const fromIndex = opts.fromIndex ?? 0;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = this.messages.slice(fromIndex).find(pred);
      if (found) return found;
      await sleep(15);
    }
    throw new Error(
      `Timed out waiting for message. Have: ${JSON.stringify(this.messages.slice(fromIndex).map((m) => m.type))}`,
    );
  }

  close(): void {
    this.ws.close();
  }
}

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe("Milestone 3 Exit Gate: realtime multiplayer", () => {
  let server: GameServer;
  let port: number;
  let url: string;
  let alice: TestClient;
  let bob: TestClient;

  beforeAll(async () => {
    server = await buildGameServer({ worldpackDir: WORLDPACK_DIR, dbPath: ":memory:" });
    port = await server.start(0, "127.0.0.1");
    url = `ws://127.0.0.1:${port}/ws`;

    alice = new TestClient(url);
    bob = new TestClient(url);
    await Promise.all([alice.open(), bob.open()]);

    // Identify + join.
    alice.send({ type: "connection.identify", playerId: "alice" });
    bob.send({ type: "connection.identify", playerId: "bob" });
    await alice.waitFor((m) => m.type === "connection.ready");
    await bob.waitFor((m) => m.type === "connection.ready");

    alice.send({ type: "room.join", playerId: "alice", roomId: ROOM });
    await alice.waitFor((m) => m.type === "room.snapshot");
    bob.send({ type: "room.join", playerId: "bob", roomId: ROOM });
    await bob.waitFor((m) => m.type === "room.snapshot");
  }, 20000);

  afterAll(async () => {
    // Stop the server first: it closes WS connections (draining leave commits
    // while the DB is still open) before closing the database.
    await server?.stop();
    alice?.close();
    bob?.close();
  });

  it("M3-1: both clients observe each other (synchronized presence)", async () => {
    // Alice should have been told Bob entered.
    const bobEnter = await alice.waitFor(
      (m) => m.type === "domain.events" && m.events?.some((e: any) => e.eventType === "PLAYER_ENTERED_ROOM" && e.payload?.playerId === "bob"),
    );
    expect(bobEnter).toBeDefined();

    // A resync snapshot for Alice lists both occupants.
    const base = alice.messages.length;
    alice.send({ type: "state.resync.request", playerId: "alice", roomId: ROOM, lastSequence: 0 });
    const snap = await alice.waitFor((m) => m.type === "room.snapshot", { fromIndex: base });
    const ids = snap.players.map((p: any) => p.playerId).sort();
    expect(ids).toEqual(["alice", "bob"]);
  });

  it("M3-2: lantern race — one winner, one refusal, both see the same event", async () => {
    // Fire both takes near-simultaneously.
    alice.send({ type: "command.submit", commandId: "alice_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
    bob.send({ type: "command.submit", commandId: "bob_take", playerId: "bob", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });

    const aliceResult = await alice.waitFor((m) => m.commandId === "alice_take" && (m.type === "command.accepted" || m.type === "command.refused"));
    const bobResult = await bob.waitFor((m) => m.commandId === "bob_take" && (m.type === "command.accepted" || m.type === "command.refused"));

    const results = [aliceResult, bobResult];
    const accepted = results.filter((r) => r.type === "command.accepted");
    const refused = results.filter((r) => r.type === "command.refused");

    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    // The loser is refused. The exact code depends on bind-time vs resolve-time:
    //   - TARGET_UNAVAILABLE: bound while the lantern was still in the room, then
    //     resolved against updated state (it's now held) — PDR §14.2.
    //   - TARGET_NOT_FOUND: bound after the winner committed, so the binder sees
    //     no takeable lantern left in the room.
    // Both are correct refusals; the invariant is exactly-one-winner + a single
    // synchronized ENTITY_TAKEN event (asserted below).
    expect(["TARGET_UNAVAILABLE", "TARGET_NOT_FOUND"]).toContain(refused[0].refusal);

    // BOTH clients receive the same ENTITY_TAKEN domain event (synchronized mutation).
    const aliceTaken = await alice.waitFor((m) => m.type === "domain.events" && m.events?.some((e: any) => e.eventType === "ENTITY_TAKEN"));
    const bobTaken = await bob.waitFor((m) => m.type === "domain.events" && m.events?.some((e: any) => e.eventType === "ENTITY_TAKEN"));
    const aliceEvt = aliceTaken.events.find((e: any) => e.eventType === "ENTITY_TAKEN");
    const bobEvt = bobTaken.events.find((e: any) => e.eventType === "ENTITY_TAKEN");
    expect(aliceEvt.eventId).toBe(bobEvt.eventId); // identical authoritative event
  });

  it("M3-3: lighting the brazier synchronizes the visual mutation for both", async () => {
    // Whoever won the race may differ; lighting works for either player in the room.
    alice.send({ type: "command.submit", commandId: "alice_light", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "light brazier" });

    // Both clients receive a scene.patch whose lighting flipped to warm_firelight.
    const alicePatch = await alice.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight");
    const bobPatch = await bob.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight");

    expect(alicePatch.sceneManifest.lightingState).toBe("warm_firelight");
    expect(bobPatch.sceneManifest.lightingState).toBe("warm_firelight");
    // Deterministic contract: same state → same content hash for both clients.
    expect(alicePatch.sceneManifest.contractHash).toBe(bobPatch.sceneManifest.contractHash);
  });

  it("M3-4: resync returns a snapshot reflecting the true authoritative state", async () => {
    const base = bob.messages.length;
    bob.send({ type: "state.resync.request", playerId: "bob", roomId: ROOM, lastSequence: 0 });
    const snap = await bob.waitFor((m) => m.type === "room.snapshot", { fromIndex: base });

    // Brazier lit flag is present in the authoritative room state.
    const flags = snap.room.flags ?? {};
    expect(Object.keys(flags).some((k) => k.includes("lit") && flags[k] === true)).toBe(true);

    // The lantern is no longer a loose entity in the room.
    const lanternLoose = snap.entities.some(
      (e: any) => e.definitionId === "lantern" && e.location?.type === "room",
    );
    expect(lanternLoose).toBe(false);

    // Scene manifest agrees.
    expect(snap.sceneManifest.lightingState).toBe("warm_firelight");
  });
});
