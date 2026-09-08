import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDIO_TABS,
  isStudioTab,
  normalizeStudioTab,
} from "../src/components/studio/pixelbrain/studio-tabs.js";

test("Phase B exposes exactly the nine source Studio tabs", () => {
  assert.deepEqual(
    STUDIO_TABS.map(({ id }) => id),
    ["canvas", "blueprint", "foundry", "amps", "mutations", "finish", "mentor", "library", "diagnostics"],
  );
  assert.ok(Object.isFrozen(STUDIO_TABS));
  assert.ok(STUDIO_TABS.every(Object.isFrozen));
});

test("missing and invalid tab ids normalize to Canvas", () => {
  for (const value of [undefined, null, "", "editor", "phase-a"]) {
    assert.equal(normalizeStudioTab(value), "canvas");
    assert.equal(isStudioTab(value), false);
  }
  assert.equal(normalizeStudioTab("mutations"), "mutations");
  assert.equal(isStudioTab("canvas"), true);
  assert.equal(isStudioTab("library"), true);
});
