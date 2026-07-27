import { describe, expect, it, vi } from "vitest";
import {
  SceneRenderCoordinator,
  type Releasable,
} from "../src/SceneRenderCoordinator.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function lease(name: string, released: string[]): Releasable {
  let active = true;
  return {
    release() {
      if (!active) return;
      active = false;
      released.push(name);
    },
  };
}

describe("SceneRenderCoordinator", () => {
  it("prevents slow Scene A from overwriting fast Scene B", async () => {
    const coordinator = new SceneRenderCoordinator();
    const releaseBuildA = deferred<string>();
    const commits: string[] = [];
    const released: string[] = [];
    const discarded: string[] = [];
    const buildingA = deferred<void>();

    const slowA = coordinator.run({
      resolve: async () => "A",
      acquire: async () => [lease("A", released)],
      build: async () => {
        buildingA.resolve();
        return releaseBuildA.promise;
      },
      discard: (scene) => discarded.push(scene),
      commit: (scene) => {
        commits.push(scene);
      },
    });
    await buildingA.promise;

    const fastB = coordinator.run({
      resolve: async () => "B",
      acquire: async () => [lease("B", released)],
      build: async (scene) => scene,
      commit: (scene) => {
        commits.push(scene);
      },
    });
    await fastB;
    releaseBuildA.resolve("A");
    await slowA;

    expect(commits).toEqual(["B"]);
    expect(released).toContain("A");
    expect(released).not.toContain("B");
    expect(discarded).toEqual(["A"]);
  });

  it("releases provisional assets when destroyed during resolution", async () => {
    const coordinator = new SceneRenderCoordinator();
    const releaseBuild = deferred<string>();
    const acquired = deferred<void>();
    const released: string[] = [];
    const commit = vi.fn();
    const run = coordinator.run({
      resolve: async () => "scene",
      acquire: async () => {
        acquired.resolve();
        return [lease("scene", released)];
      },
      build: async () => releaseBuild.promise,
      commit,
    });
    await acquired.promise;
    coordinator.destroy();
    releaseBuild.resolve("scene");

    expect(await run).toBe("STALE");
    expect(released).toEqual(["scene"]);
    expect(commit).not.toHaveBeenCalled();
  });

  it("releases a partial acquisition and retains the previous commit on failure", async () => {
    const coordinator = new SceneRenderCoordinator();
    const released: string[] = [];
    const commit = vi.fn();
    const onFailure = vi.fn();

    const result = await coordinator.run({
      resolve: async () => "broken",
      acquire: async () => [lease("partial", released)],
      build: async () => {
        throw new Error("draw failed");
      },
      commit,
      onFailure,
    });

    expect(result).toBe("FAILED");
    expect(released).toEqual(["partial"]);
    expect(commit).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it("releases prior scene resources only after a successful commit", async () => {
    const coordinator = new SceneRenderCoordinator();
    const released: string[] = [];
    const old = lease("old", released);
    const order: string[] = [];

    const result = await coordinator.run({
      resolve: async () => "new",
      acquire: async () => [lease("new", released)],
      build: async (scene) => scene,
      commit: () => {
        order.push("commit");
        return [old];
      },
      afterCommit: () => order.push("after"),
    });

    expect(result).toBe("COMMITTED");
    expect(order).toEqual(["commit", "after"]);
    expect(released).toEqual(["old"]);
  });

  it("invalidates unfinished renders for context restoration", async () => {
    const coordinator = new SceneRenderCoordinator();
    const pending = deferred<string>();
    const commit = vi.fn();
    const run = coordinator.run({
      resolve: async () => pending.promise,
      acquire: async () => [],
      build: async (scene) => scene,
      commit,
    });
    coordinator.invalidate();
    pending.resolve("old");

    expect(await run).toBe("STALE");
    expect(commit).not.toHaveBeenCalled();
  });
});
