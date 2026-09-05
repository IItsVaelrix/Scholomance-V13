import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE_A_STUDIO_TABS,
  isStudioTab,
  normalizeStudioTab,
} from "../src/components/studio/pixelbrain/studio-tabs.js";

test("Phase A exposes exactly the four approved Studio tabs", () => {
  assert.deepEqual(
    PHASE_A_STUDIO_TABS.map(({ id }) => id),
    ["foundry", "amps", "mutations", "diagnostics"],
  );
  assert.ok(Object.isFrozen(PHASE_A_STUDIO_TABS));
  assert.ok(PHASE_A_STUDIO_TABS.every(Object.isFrozen));
});

test("missing, invalid, and Phase B tab ids normalize to Foundry", () => {
  for (const value of [undefined, null, "", "canvas", "blueprint", "finish", "mentor", "library"]) {
    assert.equal(normalizeStudioTab(value), "foundry");
    assert.equal(isStudioTab(value), false);
  }
  assert.equal(normalizeStudioTab("mutations"), "mutations");
  assert.equal(isStudioTab("mutations"), true);
});
