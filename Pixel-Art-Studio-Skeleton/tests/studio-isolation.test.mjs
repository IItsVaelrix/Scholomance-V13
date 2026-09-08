import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as facade from "../src/lib/pixelbrain/studio-facade.js";
import * as authoring from "../src/lib/pixelbrain/studio-authoring-facade.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const FORBIDDEN = /from\s+['"](?:\.\.\/)+(?:codex|src)\//;
const NODE_FS = /from\s+['"]node:(fs|fs\/promises|child_process|os)['"]/;

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      await walk(path, files);
    } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

test("Phase A facade remains the frozen 14-function surface", () => {
  assert.deepEqual(Object.keys(facade).sort(), [
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
  ]);
});

test("authoring facade exposes the browser-safe authoring operations", () => {
  for (const name of [
    "createDocumentController",
    "encodePng",
    "decodePng",
    "encodeAsepriteFromDocument",
    "importAsepriteIntoDocument",
    "evaluateForgeGate",
    "transmuteStyle",
    "critiqueDocument",
    "keepLocally",
    "loadStudioLibrary",
  ]) {
    assert.equal(typeof authoring[name], "function", name);
  }
});

test("production target files do not import root runtime or Node filesystem APIs", async () => {
  const files = await walk(SRC);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (FORBIDDEN.test(source) || NODE_FS.test(source)) {
      violations.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(violations, []);
});
