import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDocumentController,
  detectAmpsFromSource,
  detectShadersFromSource,
  ingestScdlIntoDocument,
} from "../src/lib/pixelbrain/studio-authoring-facade.js";

test("detectShadersFromSource extracts cylinder and mass shaders from maple_master.scdl", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const result = detectShadersFromSource(source);

  assert.ok(result.detectedShaders.length >= 4, "Should detect at least 4 form shaders");
  assert.equal(result.activeShaderIds.length, result.detectedShaders.length);

  const trunkShader = result.detectedShaders.find((s) => s.layerName === "trunk");
  assert.ok(trunkShader, "Trunk shader should be detected");
  assert.equal(trunkShader.type, "cylinder");
  assert.equal(trunkShader.source, "semantic");
  assert.equal(trunkShader.options?.specular, true);
  assert.equal(trunkShader.ramp?.void, "#1c1917");
  assert.equal(trunkShader.ramp?.frost, "#78716c");

  const canopyShader = result.detectedShaders.find((s) => s.layerName === "canopy_masses");
  assert.ok(canopyShader, "Canopy shader should be detected");
  assert.ok(canopyShader.type === "foliage" || canopyShader.type === "mass");
  assert.equal(canopyShader.source, "explicit");
  assert.equal(canopyShader.ramp?.void, "#450a0a");
  assert.equal(canopyShader.ramp?.hi, "#fde047");
});

test("detectShadersFromSource extracts botanical shaders from oak_master.scdl and pine_master.scdl", async () => {
  const oakSource = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/oak_master.scdl", import.meta.url),
    "utf8",
  );
  const oakResult = detectShadersFromSource(oakSource);
  assert.ok(oakResult.detectedShaders.some((s) => s.layerName === "trunk" && s.type === "cylinder"));
  assert.ok(oakResult.detectedShaders.some((s) => s.layerName === "canopy_masses" && (s.type === "foliage" || s.type === "mass")));
  assert.equal(oakResult.barkRamp?.void, "#281404");
  assert.equal(oakResult.canopyRamp?.hi, "#a3e635");

  const pineSource = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/pine_master.scdl", import.meta.url),
    "utf8",
  );
  const pineResult = detectShadersFromSource(pineSource);
  assert.ok(pineResult.detectedShaders.some((s) => s.layerName === "trunk" && s.type === "cylinder"));
  assert.ok(pineResult.detectedShaders.some((s) => s.layerName === "canopy_masses" && (s.type === "foliage" || s.type === "mass")));
  assert.equal(pineResult.barkRamp?.void, "#241408");
  assert.equal(pineResult.canopyRamp?.hi, "#7fd48f");
});

test("detectShadersFromSource prioritizes explicit SHADER directives", () => {
  const customScdl = `
SCDL 2
ASSET custom_rig
CANVAS WIDTH 32 HEIGHT 32
SHADER arm_l CYLINDER RAMP #101010 #202020 #303030 #404040 #505050
APPLY_SHADER mass ON head_mass
LAYER arm_l { PAINT $a FILL #303030 RASTER MIDPOINT }
LAYER head_mass { PAINT $h FILL #404040 RASTER MIDPOINT }
`;

  const result = detectShadersFromSource(customScdl);
  assert.equal(result.detectedShaders.length, 2);

  const arm = result.detectedShaders.find((s) => s.layerName === "arm_l");
  assert.ok(arm);
  assert.equal(arm.type, "cylinder");
  assert.equal(arm.source, "explicit");
  assert.equal(arm.ramp.void, "#101010");
  assert.equal(arm.ramp.hi, "#505050");

  const head = result.detectedShaders.find((s) => s.layerName === "head_mass");
  assert.ok(head);
  assert.equal(head.type, "mass");
  assert.equal(head.source, "explicit");
});

test("ingestScdlIntoDocument applies form shaders at compilation time to layer cells", async () => {
  const source = await readFile(
    new URL("../SCDL-V2-ASSETS/TREES/masters/maple_master.scdl", import.meta.url),
    "utf8",
  );
  const doc = createDocumentController();
  const result = ingestScdlIntoDocument(doc, source);

  assert.equal(result.ok, true);
  assert.ok(result.detectedShaders.length >= 4);
  assert.ok(result.detectedAmps.length >= 10);
  assert.equal(result.receipt.detectedShaderCount, result.detectedShaders.length);
  assert.equal(result.receipt.detectedAmpCount, result.detectedAmps.length);

  // Verify snapshot contains both channels
  const snap = doc.getSnapshot();
  assert.equal(snap.detectedShaders.length, result.detectedShaders.length);
  assert.equal(snap.detectedAmps.length, result.detectedAmps.length);

  // Controller getters
  assert.equal(doc.getDetectedShaders().length, result.detectedShaders.length);
  assert.equal(doc.getActiveShaderIds().length, result.activeShaderIds.length);

  // Verify compilation-time shading of trunk cells
  const trunkLayer = snap.layers.find((l) => l.name === "trunk");
  assert.ok(trunkLayer, "Trunk layer must exist");
  assert.ok(trunkLayer.cells.length > 0, "Trunk layer should contain cells");
  const trunkColors = new Set(trunkLayer.cells.map((c) => c.color.toUpperCase()));
  assert.ok(trunkColors.size >= 4, "Trunk should be shaded across at least 4 value tiers (not flat solid)");
  assert.ok(trunkColors.has("#1C1917"), "Trunk should include dark shadow tier");
  assert.ok(trunkColors.has("#78716C"), "Trunk should include lit/specular tier");

  // Verify compilation-time shading of canopy cells
  const canopyLayer = snap.layers.find((l) => l.name === "canopy_masses");
  assert.ok(canopyLayer, "Canopy layer must exist");
  assert.ok(canopyLayer.cells.length > 0, "Canopy layer should contain cells");
  const canopyColors = new Set(canopyLayer.cells.map((c) => c.color.toUpperCase()));
  assert.ok(canopyColors.size >= 4, "Canopy should be shaded with foliage gradient");
  assert.ok(canopyColors.has("#450A0A"), "Canopy should include deep void shadow");
  assert.ok(canopyColors.has("#F97316") || canopyColors.has("#FDE047") || canopyColors.has("#EF4444"), "Canopy should include highlight/specular");
});
