import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorldpack, resolveDefaultWorldpackDir } from "../../apps/server/src/loadWorldpack.js";
import { FlagsSchema } from "../../packages/contracts/src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("default worldpack resolution", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves shrine-demo from the PolarisOS root instead of the process cwd", () => {
    const expected = resolve(testDir, "../../worldpacks/shrine-demo");
    vi.spyOn(process, "cwd").mockReturnValue(resolve(testDir, "../../apps/server"));

    expect(resolve(process.cwd(), "worldpacks/shrine-demo")).not.toBe(expected);
    expect(resolveDefaultWorldpackDir()).toBe(expected);
  });
});

describe("worldpack flag sanitization", () => {
  it("strips null/undefined flag markers so every entity conforms to FlagsSchema", async () => {
    // shrine_brazier is authored with `activation: null` (an "unset" marker).
    // If that reached the wire it would fail FlagsSchema and quarantine the
    // whole scene.patch / room.snapshot, silently blanking the scene.
    const loaded = await loadWorldpack(resolveDefaultWorldpackDir());
    const brazier = loaded.definition.entities.find((e) => e.entityId === "shrine_brazier");

    expect(brazier).toBeDefined();
    // The null marker is dropped; the concrete flag survives.
    expect(brazier!.flags).not.toHaveProperty("activation");
    expect(brazier!.flags?.activated).toBe(false);

    // Every loaded entity's and room's flags must validate against the wire contract.
    for (const entity of loaded.definition.entities) {
      expect(FlagsSchema.safeParse(entity.flags).success).toBe(true);
    }
    for (const room of loaded.definition.rooms) {
      expect(FlagsSchema.safeParse(room.flags).success).toBe(true);
    }
  });
});
