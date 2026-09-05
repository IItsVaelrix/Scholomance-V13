import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { STUDIO_AMP_RECORDS as sourceRecords } from "../../codex/core/pixelbrain/studio/studio-amp-manifest.generated.js";
import { defaultParams as sourceGrassDefaults } from "../../codex/core/pixelbrain/grass-engine.js";
import * as facade from "../src/lib/pixelbrain/studio-facade.js";

const EXPECTED_EXPORTS = [
  "acceptStudioMutation",
  "beginStudioMutation",
  "commitStudioAmpExecution",
  "createStudioAssetSnapshot",
  "generateStudioGrass",
  "getStudioAdapterCoverage",
  "getStudioAmpManifest",
  "getStudioGrassDefaults",
  "getStudioGrassPalettes",
  "inspectStudioSupportExecution",
  "planStudioAmps",
  "previewStudioAmpExecution",
  "proposeStudioMutationExecution",
  "rejectStudioMutation",
];

test("exports only the approved 14-function browser facade", () => {
  assert.deepEqual(Object.keys(facade).sort(), EXPECTED_EXPORTS);
});

test("facade is target-local and exposes the frozen 54-record manifest", async () => {
  const source = await readFile(
    new URL("../src/lib/pixelbrain/studio-facade.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /(?:\.\.\/)+(?:codex|src)\//);
  const records = facade.getStudioAmpManifest();
  assert.equal(records.length, 54);
  assert.deepEqual(records, sourceRecords);
  assert.ok(Object.isFrozen(records));
});

test("snapshot normalization is deterministic and isolates Map-backed cells", () => {
  const cell = { x: 1, y: 2, color: "#79d45e" };
  const grid = {
    width: 16,
    height: 12,
    gridType: "rectangular",
    palette: ["#102316", "#79d45e"],
    layers: [{ name: "Grass", cells: new Map([["1,2", cell]]) }],
  };
  const a = facade.createStudioAssetSnapshot(grid, "test");
  const b = facade.createStudioAssetSnapshot(grid, "test");
  assert.deepEqual(a, b);
  assert.match(a.checksum, /^studio-output1:/);
  assert.ok(Object.isFrozen(a));
  cell.color = "#ffffff";
  assert.equal(a.layers[0].cells[0].color, "#79d45e");
});

test("grass defaults retain source behavior and mutation rejection preserves identity", () => {
  assert.deepEqual(facade.getStudioGrassDefaults(), sourceGrassDefaults());
  const base = facade.createStudioAssetSnapshot({ width: 8, height: 8, layers: [] });
  const result = facade.createStudioAssetSnapshot({ width: 8, height: 8, layers: [] }, "candidate");
  const transaction = facade.beginStudioMutation({ base, result, ampId: "test-mutation" });
  assert.equal(facade.rejectStudioMutation({ current: base, transaction }), base);
  const accepted = facade.acceptStudioMutation({ current: base, transaction });
  assert.equal(accepted.parentChecksum, base.checksum);
  assert.equal(accepted.mutationAmpId, "test-mutation");
});
