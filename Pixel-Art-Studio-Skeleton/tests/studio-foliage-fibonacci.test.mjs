import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDocumentController,
  detectAmpsFromSource,
  detectShadersFromSource,
  ingestScdlIntoDocument,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";

test("detectAmpsFromSource detects Fibonacci seed field from regenerated tree SCDL", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const result = detectAmpsFromSource(source);

  assert.ok(result.detectedAmps.length > 0, "Should detect AMPs");
  const fibonacciAmp = result.detectedAmps.find((a) => a.manifestId === "pixelbrain.fibonacci-seed-field" || a.ampId.includes("fibonacci"));
  assert.ok(fibonacciAmp, "Should detect pixelbrain.fibonacci-seed-field AMP");
  assert.equal(fibonacciAmp.name, "Fibonacci Seed Field (Phyllotaxis)");
});

test("detectShadersFromSource detects foliage and bark detail shaders from master maple", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const result = detectShadersFromSource(source);

  // Foliage shader on canopy_masses
  const foliageShader = result.detectedShaders.find((s) => s.layerName === "canopy_masses");
  assert.ok(foliageShader, "Foliage shader must be detected on canopy_masses");
  assert.equal(foliageShader.type, "foliage");
  assert.equal(foliageShader.options?.clusterCount, 12);
  assert.equal(foliageShader.options?.dither, true);

  // Bark detail shader on surface_detail
  const barkShader = result.detectedShaders.find((s) => s.layerName === "surface_detail");
  assert.ok(barkShader, "Bark detail shader must be detected on surface_detail");
  assert.equal(barkShader.type, "bark_detail");

  // Cylinder shader on trunk
  const trunkShader = result.detectedShaders.find((s) => s.layerName === "trunk");
  assert.ok(trunkShader, "Cylinder shader must be detected on trunk");
  assert.equal(trunkShader.type, "cylinder");
});

test("ingestScdlIntoDocument compiles and renders textured foliage clusters at compile time", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController({ width: 48, height: 64 });
  const result = ingestScdlIntoDocument(doc, source);

  assert.ok(result.ok, "Ingestion must succeed");
  const snap = result.snapshot;

  // Verify canopy_masses cells
  const canopy = snap.layers.find((l) => l.name === "canopy_masses");
  assert.ok(canopy && canopy.cells.length > 0, "Canopy masses must have cells");

  // Verify value distribution across 5 tiers
  const colors = new Set(canopy.cells.map((c) => c.color.toLowerCase()));
  assert.ok(colors.size >= 4, "Canopy must have textured multi-tier shading (not flat)");
  assert.ok(colors.has("#450a0a"), "Must include void tier");
  assert.ok(colors.has("#fde047") || colors.has("#f97316") || colors.has("#ef4444"), "Must include lit/hi tier");

  // Verify surface_detail cells
  const detail = snap.layers.find((l) => l.name === "surface_detail");
  assert.ok(detail && detail.cells.length > 0, "Surface detail must have cells");

  // Verify receipt records
  assert.ok(result.receipt.detectedShaderCount >= 3, "Receipt must record at least 3 detected shaders");
  assert.ok(result.receipt.detectedAmpCount >= 1, "Receipt must record detected AMPs");
});
