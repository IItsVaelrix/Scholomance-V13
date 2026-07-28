/**
 * Milestone 5 Exit Gate — illustrated client visual projection.
 *
 * Exit criterion (PDR §25 Milestone 5):
 *   "The complete MVP scenario is playable through the browser."
 *
 * The browser-only PixiJS drawing cannot run under the node test runner (it
 * needs WebGL). But every visual DECISION the client makes lives in the pure,
 * deterministic buildScenePlan projection (packages/renderer-pixi/scenePlan.ts).
 * So this gate boots the REAL GameServer, drives two real `ws` clients through
 * the MVP scenario, and runs every authoritative manifest the server emits
 * through buildScenePlan — proving the client's illustration tracks the world:
 *
 *   M5-1  the initial snapshot projects to an illustrated plan: lantern +
 *         unlit brazier sprites present, deterministic planHash, hotspots wired
 *   M5-2  taking the lantern removes its sprite from the plan (scenario step 7)
 *   M5-3  lighting the brazier swaps unlit→lit + warm overlay + warm tint, and
 *         BOTH clients derive an IDENTICAL planHash (client projection parity)
 *   M5-4  the same manifest projects to accessible fallback text (PDR §5.4)
 *
 * Together with the PixiSceneRenderer browser adapter (which only draws the plan
 * this module verifies), this proves the illustrated client is playable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";
import { buildGameServer, type GameServer } from "../../apps/server/src/GameServer.js";
import { buildScenePlan } from "@polaris/renderer-pixi";
import type { SceneManifest } from "@polaris/contracts";

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

describe("Milestone 5 Exit Gate: illustrated client projection", () => {
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

  it("M5-1: the initial snapshot projects to a deterministic illustrated plan", () => {
    const manifest = initialSnapshot.sceneManifest as SceneManifest;
    const plan = buildScenePlan(manifest);

    expect(plan.mode).toBe("illustrated");
    expect(plan.planHash).toMatch(/^[0-9a-f]{8}$/);

    // Determinism: re-projecting the same manifest yields the same plan.
    expect(buildScenePlan(manifest).planHash).toBe(plan.planHash);

    // Lantern + unlit brazier are visibly rendered; background is not a sprite.
    const ids = plan.sprites.map((s) => s.layerId);
    expect(ids).toContain("ruined_shrine_entity_shrine_lantern");
    expect(ids).toContain("ruined_shrine_entity_shrine_brazier_unlit");
    expect(ids.some((id) => id.endsWith("_bg"))).toBe(false);

    // Initial lighting is cool moonlight.
    expect(plan.lightingState).toBe("ambient_moonlight");
    expect(plan.lightingTint).toBe(0x8fa9d6);

    // Hotspots are projected with their authored commands (click → command).
    const brazierHotspot = plan.hotspots.find((h) => h.entityId === "shrine_brazier");
    expect(brazierHotspot?.command).toBe("light brazier");
  });

  it("M5-2: taking the lantern removes its sprite from the plan (step 7)", async () => {
    const aliceBase = alice.messages.length;
    alice.send({ type: "command.submit", commandId: "alice_take", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "take lantern" });
    await alice.waitFor((m) => m.commandId === "alice_take" && m.type === "command.accepted", { fromIndex: aliceBase });

    const patch = await alice.waitFor((m) => m.type === "scene.patch", { fromIndex: aliceBase });
    const plan = buildScenePlan(patch.sceneManifest as SceneManifest);

    // The lantern is gone from the illustrated scene (moved to inventory).
    expect(plan.sprites.map((s) => s.layerId)).not.toContain("ruined_shrine_entity_shrine_lantern");
    // Its hotspot is gone too — nothing left to click in the room.
    expect(plan.hotspots.map((h) => h.entityId)).not.toContain("shrine_lantern");
  });

  it("M5-3: lighting the brazier swaps layers + warm tint, identical plan for both clients", async () => {
    const aliceBase = alice.messages.length;
    const bobBase = bob.messages.length;
    alice.send({ type: "command.submit", commandId: "alice_light", playerId: "alice", roomId: ROOM, expectedRevision: 0, rawInput: "light brazier" });

    const alicePatch = await alice.waitFor(
      (m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight",
      { fromIndex: aliceBase },
    );
    const bobPatch = await bob.waitFor(
      (m) => m.type === "scene.patch" && m.sceneManifest?.lightingState === "warm_firelight",
      { fromIndex: bobBase },
    );

    const alicePlan = buildScenePlan(alicePatch.sceneManifest as SceneManifest);
    const bobPlan = buildScenePlan(bobPatch.sceneManifest as SceneManifest);

    for (const plan of [alicePlan, bobPlan]) {
      const ids = plan.sprites.map((s) => s.layerId);
      expect(ids).toContain("ruined_shrine_entity_shrine_brazier_lit");
      expect(ids).not.toContain("ruined_shrine_entity_shrine_brazier_unlit");
      expect(ids).toContain("ruined_shrine_warm_light_overlay");
      expect(plan.lightingTint).toBe(0xffb066); // warm firelight
    }

    // Client projection parity: both browsers derive the SAME illustrated plan.
    expect(alicePlan.planHash).toBe(bobPlan.planHash);
  });

  it("M5-4: the same scene projects to accessible fallback text (PDR §5.4)", () => {
    const manifest = initialSnapshot.sceneManifest as SceneManifest;
    const plan = buildScenePlan(manifest, { fallbackMode: true });

    expect(plan.mode).toBe("fallback");
    expect(plan.fallbackLines.some((l) => l.startsWith("Lighting:"))).toBe(true);
    expect(plan.fallbackLines.some((l) => l.includes("Brass Lantern"))).toBe(true);
    expect(plan.fallbackLines.some((l) => l.startsWith("Interact:"))).toBe(true);
    // Fallback projection is a distinct plan from the illustrated one.
    expect(plan.planHash).not.toBe(buildScenePlan(manifest).planHash);
  });
});
