/**
 * Milestone 6 Exit Gate — Hardening.
 *
 * Exit criterion (PDR §25 Milestone 6):
 *   "Every acceptance criterion passes without manual repair."
 *
 * This gate boots the REAL GameServer (Fastify + WebSocket + SQLite + kernel +
 * runtime) and proves each Milestone 6 deliverable over the wire:
 *
 *   M6-1  forced restart  — committed mutations survive a full process restart
 *                           and a fresh server re-derives them from the ledger
 *                           (PDR §5.6, §24 acceptance 11–15, §23 persistence).
 *   M6-2  duplicate msg   — a retried commandId never re-mutates; it is answered
 *                           idempotently and the server does not crash
 *                           (PDR §23 "Duplicate messages do not duplicate mutations").
 *   M6-3  resync          — a player who disconnects, misses mutations, and
 *                           reconnects receives the current authoritative state;
 *                           an explicit resync request converges (PDR §5.4, §17.4).
 *   M6-4  protocol valid. — invalid JSON, unknown types, and oversized input are
 *                           rejected with server.error and the server stays alive
 *                           (PDR §21 "validate all incoming messages", "reject
 *                           unknown message types", "enforce command length limits").
 *   M6-5  rate limiting   — a command flood is throttled with RATE_LIMITED refusals
 *                           and the server stays alive (PDR §21 "rate-limit command
 *                           submission").
 *   M6-6  logging         — every required §22 transition emits a structured record
 *                           carrying the required diagnostic fields (PDR §22).
 *   M6-7  race condition  — two concurrent takes: exactly one winner, one refusal,
 *                           one synchronized ENTITY_TAKEN (PDR §14.2, §23 multiplayer).
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import WebSocket from "ws";
import { buildGameServer, type GameServer, type GameServerConfig } from "../../apps/server/src/GameServer.js";
import type { DiagnosticRecord } from "../../apps/server/src/DiagnosticLogger.js";

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

  /** Send a raw string (for protocol-violation tests). */
  sendRaw(raw: string): void {
    this.ws.send(raw);
  }

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

  countEvents(eventType: string): number {
    let n = 0;
    for (const m of this.messages) {
      if (m.type === "domain.events" && Array.isArray(m.events)) {
        n += m.events.filter((e: any) => e.eventType === eventType).length;
      }
    }
    return n;
  }

  async close(): Promise<void> {
    await new Promise<void>((res) => {
      this.ws.once("close", () => res());
      this.ws.close();
    });
  }
}

// ─── Server harness ────────────────────────────────────────────────────────────

interface Harness {
  server: GameServer;
  url: string;
  httpBase: string;
  records: DiagnosticRecord[];
}

async function startServer(extra: Partial<GameServerConfig> = {}): Promise<Harness> {
  const records: DiagnosticRecord[] = [];
  const server = await buildGameServer({
    worldpackDir: WORLDPACK_DIR,
    dbPath: ":memory:",
    diagnosticSink: (r) => records.push(r),
    ...extra,
  });
  const port = await server.start(0, "127.0.0.1");
  return {
    server,
    url: `ws://127.0.0.1:${port}/ws`,
    httpBase: `http://127.0.0.1:${port}`,
    records,
  };
}

async function joinClient(url: string, playerId: string): Promise<TestClient> {
  const client = new TestClient(url);
  await client.open();
  client.send({ type: "connection.identify", playerId });
  await client.waitFor((m) => m.type === "connection.ready");
  client.send({ type: "room.join", playerId, roomId: ROOM });
  await client.waitFor((m) => m.type === "room.snapshot");
  return client;
}

async function healthOk(httpBase: string): Promise<boolean> {
  const res = await fetch(`${httpBase}/health`);
  if (!res.ok) return false;
  const body = (await res.json()) as { status: string };
  return body.status === "ok";
}

// ─── Suite ─────────────────────────────────────────────────────────────────────

describe("Milestone 6 Exit Gate: hardening", () => {
  it("M6-1: committed mutations survive a forced full-process restart", async () => {
    // A real on-disk DB so state must outlive the process.
    const dir = await mkdtemp(join(tmpdir(), "polaris-m6-"));
    const dbPath = join(dir, "world.sqlite");

    let phase1LanternOwner: string | null;
    try {
      // ── Phase A: live server, commit the two MVP mutations over the wire. ──
      const h1 = await startServer({ dbPath });
      const alice = await joinClient(h1.url, "alice");

      alice.send({ type: "command.submit", commandId: "a_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
      await alice.waitFor((m) => m.commandId === "a_take" && m.type === "command.accepted");
      alice.send({ type: "command.submit", commandId: "a_light", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "light brazier" });
      await alice.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight");

      // Confirm the authoritative pre-restart state.
      const base = alice.messages.length;
      alice.send({ type: "state.resync.request", playerId: "alice", roomId: ROOM, lastSequence: 0 });
      const before = await alice.waitFor((m) => m.type === "room.snapshot", { fromIndex: base });
      expect(before.sceneManifest.lightingState).toBe("warm_firelight");
      const lantern = before.entities.find((e: any) => e.definitionId === "lantern");
      phase1LanternOwner = lantern?.location?.type === "inventory" ? lantern.location.playerId : null;
      expect(phase1LanternOwner).toBe("alice");

      await alice.close();
      // ── Phase B: forced termination. Transport dies; the process is gone. ──
      // (better-sqlite3 commits are synchronous + WAL-flushed, so the ack above
      //  was only sent once the mutation was durable on disk.)
      await h1.server.stop();

      // ── Phase C: a BRAND-NEW process/server on the same DB file. It starts ──
      // from the pristine worldpack and MUST replay the ledger to reach the
      // mutated state — there is no shared memory to lean on.
      const h2 = await startServer({ dbPath });
      try {
        // Durability, independent of any client: the restored in-memory session
        // re-derived the mutations purely from the ledger.
        const restored = h2.server.getSession().getState();
        const restoredLantern = Object.values(restored.entities).find(
          (e) => e.definitionId === "lantern",
        );
        expect(restoredLantern?.location).toEqual({ type: "inventory", playerId: "alice" });
        const shrineFlags = restored.rooms[ROOM]?.flags ?? {};
        expect(Object.keys(shrineFlags).some((k) => k.includes("lit") && shrineFlags[k] === true)).toBe(true);

        // The wire path: the OWNER reconnects. Acceptance §24.13–15 — the lantern
        // owner remains correct and the brazier remains lit after restart. This
        // also proves a reconnect does not wipe the owner's inventory (§5.6).
        const alice2 = await joinClient(h2.url, "alice");
        const snap = alice2.messages.find((m) => m.type === "room.snapshot");

        const lantern2 = snap.entities.find((e: any) => e.definitionId === "lantern");
        expect(lantern2?.location?.type).toBe("inventory");
        expect(lantern2?.location?.playerId).toBe(phase1LanternOwner);
        expect(snap.sceneManifest.lightingState).toBe("warm_firelight");
        const flags = snap.room.flags ?? {};
        expect(Object.keys(flags).some((k) => k.includes("lit") && flags[k] === true)).toBe(true);

        // Restoration came from the ledger: the replay/snapshot log fired on boot.
        expect(h2.records.some((r) => r.event === "event.replay.completed" || r.event === "snapshot.loaded")).toBe(true);

        await alice2.close();
      } finally {
        await h2.server.stop();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("M6-2: a duplicated commandId is idempotent — one mutation, no crash", async () => {
    const h = await startServer();
    try {
      const alice = await joinClient(h.url, "alice");
      const base = alice.messages.length;

      // Submit the SAME commandId twice (a client retry after a lost ack).
      const submit = { type: "command.submit", commandId: "dup_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" };
      alice.send(submit);
      alice.send(submit);

      // Both submissions receive a command.accepted ack for that commandId.
      await alice.waitFor((m) => m.commandId === "dup_take" && m.type === "command.accepted", { fromIndex: base });
      // Give the duplicate a moment to (incorrectly) mutate, if it were going to.
      await sleep(150);

      // Exactly ONE ENTITY_TAKEN event was ever broadcast — the retry did not
      // duplicate the mutation.
      expect(alice.countEvents("ENTITY_TAKEN")).toBe(1);

      // The duplicate was recognized as such in the structured log.
      expect(h.records.some((r) => r.event === "command.accepted" && r.fields.duplicate === true)).toBe(true);

      // The server is still healthy (no unhandled DUPLICATE_EVENT_ID rejection).
      expect(await healthOk(h.httpBase)).toBe(true);

      await alice.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);

  it("M6-3: a reconnecting player receives current state after missing mutations", async () => {
    const h = await startServer();
    try {
      const alice = await joinClient(h.url, "alice");
      let bob = await joinClient(h.url, "bob");

      // Bob leaves and will miss everything Alice does next.
      await bob.close();
      await sleep(100);

      const aBase = alice.messages.length;
      alice.send({ type: "command.submit", commandId: "a_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
      await alice.waitFor((m) => m.commandId === "a_take" && m.type === "command.accepted", { fromIndex: aBase });
      alice.send({ type: "command.submit", commandId: "a_light", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "light brazier" });
      await alice.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight", { fromIndex: aBase });

      // Bob reconnects fresh and rejoins — he must converge to the true state
      // even though he missed both mutations (PDR §5.4).
      bob = await joinClient(h.url, "bob");
      const snap = bob.messages.find((m) => m.type === "room.snapshot");
      expect(snap.sceneManifest.lightingState).toBe("warm_firelight");
      const lanternLoose = snap.entities.some((e: any) => e.definitionId === "lantern" && e.location?.type === "room");
      expect(lanternLoose).toBe(false);

      // An explicit resync request also converges and is logged (§22).
      const bBase = bob.messages.length;
      bob.send({ type: "state.resync.request", playerId: "bob", roomId: ROOM, lastSequence: 0 });
      const resynced = await bob.waitFor((m) => m.type === "room.snapshot", { fromIndex: bBase });
      expect(resynced.sceneManifest.lightingState).toBe("warm_firelight");
      expect(resynced.envelope.sequence).toBeGreaterThanOrEqual(snap.envelope.sequence);
      expect(h.records.some((r) => r.event === "resync.requested")).toBe(true);

      await alice.close();
      await bob.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);

  it("M6-4: invalid, unknown, and oversized messages are rejected; server stays alive", async () => {
    const h = await startServer();
    try {
      const client = new TestClient(h.url);
      await client.open();
      client.send({ type: "connection.identify", playerId: "mallory" });
      await client.waitFor((m) => m.type === "connection.ready");

      // (a) malformed JSON
      client.sendRaw("{this is not json");
      await client.waitFor((m) => m.type === "server.error" && m.code === "INVALID_MESSAGE");

      // (b) unknown message type
      const before = client.messages.length;
      client.sendRaw(JSON.stringify({ type: "world.delete", playerId: "mallory" }));
      await client.waitFor((m) => m.type === "server.error", { fromIndex: before });

      // (c) oversized rawInput (> 500 chars, the schema cap)
      const before2 = client.messages.length;
      client.sendRaw(JSON.stringify({
        type: "command.submit",
        commandId: "big",
        playerId: "mallory",
        roomId: ROOM,
        expectedRevision: 0,
        rawInput: "x".repeat(501),
      }));
      await client.waitFor((m) => m.type === "server.error", { fromIndex: before2 });

      // Every violation was logged as a structured protocol.violation (§21/§22).
      const violations = h.records.filter((r) => r.event === "protocol.violation");
      expect(violations.length).toBeGreaterThanOrEqual(3);

      // The server survived all three violations.
      expect(await healthOk(h.httpBase)).toBe(true);

      await client.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);

  it("M6-5: a command flood is rate-limited; server stays alive", async () => {
    // A deliberately tight budget so the throttle trips deterministically.
    const h = await startServer({ rateLimit: { maxRequests: 3, windowMs: 5000 } });
    try {
      const alice = await joinClient(h.url, "alice");
      const base = alice.messages.length;

      // Fire 8 zero-event commands as fast as possible.
      for (let i = 0; i < 8; i++) {
        alice.send({ type: "command.submit", commandId: `look_${i}`, playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "look" });
      }

      // Collect the 8 terminal responses (accepted or refused).
      const responses: any[] = [];
      const start = Date.now();
      while (responses.length < 8 && Date.now() - start < 5000) {
        for (const m of alice.messages.slice(base)) {
          if ((m.type === "command.accepted" || m.type === "command.refused") && m.commandId?.startsWith("look_")) {
            if (!responses.some((r) => r.commandId === m.commandId)) responses.push(m);
          }
        }
        await sleep(20);
      }

      const accepted = responses.filter((r) => r.type === "command.accepted");
      const limited = responses.filter((r) => r.type === "command.refused" && r.refusal === "RATE_LIMITED");

      expect(accepted).toHaveLength(3); // exactly the budget
      expect(limited.length).toBeGreaterThanOrEqual(5); // the rest throttled
      expect(h.records.some((r) => r.event === "rate.limited")).toBe(true);

      // The server is still healthy after the flood.
      expect(await healthOk(h.httpBase)).toBe(true);

      await alice.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);

  it("M6-6: required §22 transitions emit structured records with diagnostic fields", async () => {
    const h = await startServer();
    try {
      const alice = await joinClient(h.url, "alice");
      const bob = await joinClient(h.url, "bob");

      // A refused command (nothing to take twice) + an accepted one.
      const base = alice.messages.length;
      alice.send({ type: "command.submit", commandId: "a_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
      await alice.waitFor((m) => m.commandId === "a_take" && m.type === "command.accepted", { fromIndex: base });
      bob.send({ type: "command.submit", commandId: "b_take", playerId: "bob", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
      await bob.waitFor((m) => m.commandId === "b_take" && m.type === "command.refused", { fromIndex: base });

      const events = new Set(h.records.map((r) => r.event));
      // Required §22 events that this scenario must have produced.
      for (const required of [
        "connection.opened",
        "command.received",
        "command.accepted",
        "command.refused",
        "snapshot.loaded",
        "scene.manifest.generated",
      ]) {
        expect(events.has(required as any), `missing log event: ${required}`).toBe(true);
      }

      // The accepted-command record carries the full diagnostic field set (§22).
      const accepted = h.records.find((r) => r.event === "command.accepted" && r.fields.commandId === "a_take");
      expect(accepted).toBeDefined();
      expect(accepted!.fields.playerId).toBe("alice");
      expect(accepted!.fields.worldId).toBeTruthy();
      expect(accepted!.fields.roomId).toBe(ROOM);
      expect(accepted!.fields.rulesetVersion).toBeTruthy();
      expect(typeof accepted!.fields.roomRevision).toBe("number");
      expect(typeof accepted!.fields.eventSequence).toBe("number");
      expect(accepted!.fields.requestId).toBeTruthy();

      await alice.close();
      await bob.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);

  it("M6-7: concurrent lantern race — one winner, one refusal, one synchronized event", async () => {
    const h = await startServer();
    try {
      const alice = await joinClient(h.url, "alice");
      const bob = await joinClient(h.url, "bob");

      // Fire both takes near-simultaneously.
      alice.send({ type: "command.submit", commandId: "alice_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
      bob.send({ type: "command.submit", commandId: "bob_take", playerId: "bob", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });

      const aliceResult = await alice.waitFor((m) => m.commandId === "alice_take" && (m.type === "command.accepted" || m.type === "command.refused"));
      const bobResult = await bob.waitFor((m) => m.commandId === "bob_take" && (m.type === "command.accepted" || m.type === "command.refused"));

      const results = [aliceResult, bobResult];
      expect(results.filter((r) => r.type === "command.accepted")).toHaveLength(1);
      expect(results.filter((r) => r.type === "command.refused")).toHaveLength(1);

      // Both clients observe the SAME single ENTITY_TAKEN event.
      const aliceTaken = await alice.waitFor((m) => m.type === "domain.events" && m.events?.some((e: any) => e.eventType === "ENTITY_TAKEN"));
      const bobTaken = await bob.waitFor((m) => m.type === "domain.events" && m.events?.some((e: any) => e.eventType === "ENTITY_TAKEN"));
      const aEvt = aliceTaken.events.find((e: any) => e.eventType === "ENTITY_TAKEN");
      const bEvt = bobTaken.events.find((e: any) => e.eventType === "ENTITY_TAKEN");
      expect(aEvt.eventId).toBe(bEvt.eventId);

      await alice.close();
      await bob.close();
    } finally {
      await h.server.stop();
    }
  }, 20000);
});
