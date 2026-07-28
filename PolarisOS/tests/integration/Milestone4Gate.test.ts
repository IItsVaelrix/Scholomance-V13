/**
 * Milestone 4 Exit Gate — Scene compiler integration test.
 *
 * Exit criterion (PDR §25 Milestone 4):
 *   "World-state mutations produce correct scene manifests."
 *
 * Boots the REAL GameServer (Fastify + WebSocket + SQLite + kernel + runtime +
 * scene compiler) against the authored shrine-demo worldpack and drives two real
 * `ws` clients. Unlike the unit tests, this proves the scene contract survives
 * the full stack WITH authored illustration hints flowing from the worldpack:
 *
 *   M4-1  initial snapshot manifest validates against SceneManifestSchema and
 *         projects authored hotspots / text regions / positions (§15.2, §16.1)
 *   M4-2  taking the lantern hides its layer (scenario step 7)
 *   M4-3  lighting the brazier swaps unlit→lit layers + warm overlay (§15.5),
 *         and BOTH clients receive an identical contractHash (determinism)
 *   M4-4  a resync snapshot and the broadcast scene.patch yield the SAME
 *         contractHash for the same state — snapshot/patch parity (§15.4)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";
import { buildGameServer, type GameServer } from "../../apps/server/src/GameServer.js";
import { SceneManifestSchema } from "@polaris/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLDPACK_DIR = resolve(__dirname, "../../worldpacks/shrine-demo");
const ROOM = "ruined_shrine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

describe("Milestone 4 Exit Gate: scene compiler", () => {
  let server: GameServer;
  let url: string;
  let alice: TestClient;
  let bob: TestClient;
  let initialSnapshot: any;

  beforeAll(async () => {
    server = await buildGameServer({ worldpackDir: WORLDPACK_DIR, dbPath: ":memory:" });
    const port = await server.start(0, "127.0.0.1");
    url = `ws://127.0.0.1:${port}/ws`;

    alice = new TestClient(url);
    bob = new TestClient(url);
    await Promise.all([alice.open(), bob.open()]);

    alice.send({ type: "connection.identify", playerId: "alice" });
    bob.send({ type: "connection.identify", playerId: "bob" });
    await alice.waitFor((m) => m.type === "connection.ready");
    await bob.waitFor((m) => m.type === "connection.ready");

    alice.send({ type: "room.join", playerId: "alice", roomId: ROOM });
    initialSnapshot = await alice.waitFor((m) => m.type === "room.snapshot");
    bob.send({ type: "room.join", playerId: "bob", roomId: ROOM });
    await bob.waitFor((m) => m.type === "room.snapshot");
  }, 20000);

  afterAll(async () => {
    await server?.stop();
    alice?.close();
    bob?.close();
  });

  it("M4-1: the snapshot manifest is a valid §15 projection of authored data", () => {
    const manifest = initialSnapshot.sceneManifest;
    expect(manifest).toBeTruthy();

    // Validates against the PDR §15.2 schema.
    expect(() => SceneManifestSchema.parse(manifest)).not.toThrow();

    // §15.2 fields.
    expect(manifest.sceneId).toBe(`${ROOM}_rev${manifest.roomRevision}`);
    expect(manifest.visualRevision).toBe(manifest.roomRevision);
    expect(manifest.contractHash).toHaveLength(16);

    // Authored background + ambient effects flow from the worldpack.
    expect(manifest.backgroundAssetKey).toBe("rooms/ruined_shrine/background");
    expect(manifest.ambientEffects).toContain("dust_motes");

    // §16.1 interactable hotspot for the brazier, with its authored command.
    const brazierHotspot = manifest.hotspots.find((h: any) => h.entityId === "shrine_brazier");
    expect(brazierHotspot).toBeTruthy();
    expect(brazierHotspot.command).toBe("light brazier");

    // Text regions: title + description + entity labels.
    const title = manifest.textRegions.find((r: any) => r.kind === "title");
    expect(title?.text).toBe("The Ruined Shrine");
    expect(manifest.textRegions.some((r: any) => r.kind === "entity-label")).toBe(true);

    // Authored brazier position is projected (not the default 0,0).
    const brazierUnlit = manifest.layers.find((l: any) => l.layerId.endsWith("shrine_brazier_unlit"));
    expect(brazierUnlit?.position).toEqual({ x: 400, y: 280 });

    // Initial lighting is ambient; brazier unlit layer visible, lit hidden.
    expect(manifest.lightingState).toBe("ambient_moonlight");
    expect(brazierUnlit?.visible).toBe(true);
    expect(manifest.layers.find((l: any) => l.layerId.endsWith("shrine_brazier_lit"))?.visible).toBe(false);
  });

  it("M4-2: taking the lantern hides its scene layer for both clients", async () => {
    const aliceBase = alice.messages.length;
    const bobBase = bob.messages.length;
    alice.send({ type: "command.submit", commandId: "alice_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
    await alice.waitFor((m) => m.commandId === "alice_take" && m.type === "command.accepted", { fromIndex: aliceBase });

    const alicePatch = await alice.waitFor((m) => m.type === "scene.patch", { fromIndex: aliceBase });
    const bobPatch = await bob.waitFor((m) => m.type === "scene.patch", { fromIndex: bobBase });

    for (const patch of [alicePatch, bobPatch]) {
      // The lantern is no longer visibly rendered in the room scene — it has
      // been removed from its position (layer hidden or absent entirely).
      const visibleLantern = patch.sceneManifest.layers.find(
        (l: any) => l.layerId.includes("shrine_lantern") && l.visible,
      );
      expect(visibleLantern).toBeUndefined();
    }
  });

  it("M4-3: lighting the brazier swaps layers + warm overlay, identical hash for both", async () => {
    alice.send({ type: "command.submit", commandId: "alice_light", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "light brazier" });

    const alicePatch = await alice.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight");
    const bobPatch = await bob.waitFor((m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight");

    for (const patch of [alicePatch, bobPatch]) {
      const m = patch.sceneManifest;
      expect(m.layers.find((l: any) => l.layerId.endsWith("shrine_brazier_unlit"))?.visible).toBe(false);
      expect(m.layers.find((l: any) => l.layerId.endsWith("shrine_brazier_lit"))?.visible).toBe(true);
      expect(m.layers.find((l: any) => l.layerId.endsWith("warm_light_overlay"))?.visible).toBe(true);
      expect(() => SceneManifestSchema.parse(m)).not.toThrow();
    }

    // Determinism across the wire: both clients receive the same contract.
    expect(alicePatch.sceneManifest.contractHash).toBe(bobPatch.sceneManifest.contractHash);
  });

  it("M4-4: snapshot and scene.patch agree on the contractHash for the same state (§15.4)", async () => {
    // The most recent scene.patch reflects the lit shrine.
    const lastPatch = [...alice.messages].reverse().find((m) => m.type === "scene.patch");
    expect(lastPatch).toBeTruthy();

    // A fresh resync snapshot of the same authoritative state must produce the
    // SAME contractHash — proving snapshot and patch compile identically.
    const base = alice.messages.length;
    alice.send({ type: "state.resync.request", playerId: "alice", roomId: ROOM, lastSequence: 0 });
    const snap = await alice.waitFor((m) => m.type === "room.snapshot", { fromIndex: base });

    expect(snap.sceneManifest.contractHash).toBe(lastPatch.sceneManifest.contractHash);
    expect(snap.sceneManifest.lightingState).toBe("warm_firelight");
  });
});
