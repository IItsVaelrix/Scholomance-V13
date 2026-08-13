import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_VERIFIERS } from "../../../codex/core/immunity/cleri-probe/verifier-registry.js";

const manifest = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../fixtures/cleri-probe/manifest.json"),
  "utf8"
));

describe("Cleri Probe accuracy corpus", () => {
  it("has a verified and hard-negative case for every installed verifier", () => {
    // Read from the registry rather than a list: a family installed without a
    // labeled corpus is exactly the drift this case exists to catch.
    const installed = DEFAULT_VERIFIERS.map(verifier => verifier.pathologyClass).sort();
    const families = new Set(manifest.cases.map(item => item.pathologyClass));
    expect([...families].sort()).toEqual(installed);
    for (const family of families) {
      const cases = manifest.cases.filter(item => item.pathologyClass === family);
      expect(cases.some(item => item.expected === "VERIFIED")).toBe(true);
      expect(cases.some(item => item.expected === "NO_FINDING")).toBe(true);
    }
  });

  it("labels every case with exactly one of the four required subtypes", () => {
    const validSubtypes = new Set([
      "CLEAR_POSITIVE",
      "REAL_WORLD_POSITIVE",
      "DIRECT_HARD_NEGATIVE",
      "ADVERSARIAL_HARD_NEGATIVE"
    ]);
    for (const item of manifest.cases) {
      expect(validSubtypes.has(item.subtype)).toBe(true);
    }
    const families = new Set(manifest.cases.map(item => item.pathologyClass));
    for (const family of families) {
      const subtypes = manifest.cases
        .filter(item => item.pathologyClass === family)
        .map(item => item.subtype);
      expect([...new Set(subtypes)].sort()).toEqual([...validSubtypes].sort());
    }
  });
});
