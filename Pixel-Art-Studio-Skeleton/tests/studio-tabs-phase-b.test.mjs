import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDIO_TABS,
  isStudioTab,
  normalizeStudioTab,
  studioHomeForFeature,
} from "../src/components/studio/pixelbrain/studio-tabs.js";

const EXPECTED_IDS = [
  "canvas",
  "blueprint",
  "foundry",
  "amps",
  "mutations",
  "finish",
  "mentor",
  "library",
  "diagnostics",
];

const EXPECTED_LABELS = [
  "Canvas & Aseprite",
  "Blueprint",
  "Foundry",
  "AMP Conveyor",
  "Mutation Lab",
  "Material & Finish",
  "Mentor & Reference",
  "Library & Export",
  "Diagnostics",
];

test("exposes exactly the nine source Studio tabs in source order", () => {
  assert.deepEqual(
    STUDIO_TABS.map(({ id }) => id),
    EXPECTED_IDS,
  );
  assert.deepEqual(
    STUDIO_TABS.map(({ label }) => label),
    EXPECTED_LABELS,
  );
  assert.equal(STUDIO_TABS.length, 9);
  assert.ok(Object.isFrozen(STUDIO_TABS));
  assert.ok(STUDIO_TABS.every(Object.isFrozen));
});

test("missing, invalid, and empty tab ids normalize to Canvas", () => {
  for (const value of [undefined, null, "", "nope", "editor", "phase-a"]) {
    assert.equal(normalizeStudioTab(value), "canvas");
    assert.equal(isStudioTab(value), false);
  }
  assert.equal(normalizeStudioTab("foundry"), "foundry");
  assert.equal(isStudioTab("canvas"), true);
  assert.equal(isStudioTab("library"), true);
});

test("feature homes match the source tab contract", () => {
  assert.equal(studioHomeForFeature("TemplateEditor"), "canvas");
  assert.equal(studioHomeForFeature("ForgeGatePanel"), "blueprint");
  assert.equal(studioHomeForFeature("GrassFoundryPanel"), "foundry");
  assert.equal(studioHomeForFeature("AmpConveyorPanel"), "amps");
  assert.equal(studioHomeForFeature("MutationLabPanel"), "mutations");
  assert.equal(studioHomeForFeature("ShaderForgePanel"), "finish");
  assert.equal(studioHomeForFeature("MentorCritiquePanel"), "mentor");
  assert.equal(studioHomeForFeature("LocalLibrary"), "library");
  assert.equal(studioHomeForFeature("ReceiptLedger"), "diagnostics");
  assert.equal(studioHomeForFeature("missing"), null);
});
