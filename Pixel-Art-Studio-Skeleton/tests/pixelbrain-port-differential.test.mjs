import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const TARGET_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(TARGET_ROOT, "..");
const SOURCE_CORE = path.join(REPOSITORY_ROOT, "codex/core");
const TARGET_CORE = path.join(TARGET_ROOT, "src/lib");
const SOURCE_STUDIO = path.join(SOURCE_CORE, "pixelbrain/studio");

const SOURCE_ENTRIES = Object.freeze([
  ...readdirSync(SOURCE_STUDIO)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => path.join(SOURCE_STUDIO, name)),
  ...["grass-amp.js", "grass-engine.js", "grass-palettes.js", "grass-types.js"].map((name) =>
    path.join(SOURCE_CORE, "pixelbrain", name),
  ),
]);

const IMPORT_PATTERN =
  /(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

function resolveRelativeImport(fromFile, specifier) {
  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  if (path.extname(unresolved)) return unresolved;
  for (const suffix of [".js", ".mjs", ".ts", ".jsx", ".tsx", "/index.js"]) {
    const candidate = `${unresolved}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return unresolved;
}

function collectClosure(entries) {
  const seen = new Set();
  const visit = (filePath) => {
    const normalized = path.normalize(filePath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const source = readFileSync(normalized, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      if (match[1].startsWith(".")) visit(resolveRelativeImport(normalized, match[1]));
    }
  };
  entries.forEach(visit);
  return [...seen].sort();
}

function targetForSource(sourcePath) {
  return path.join(TARGET_CORE, path.relative(SOURCE_CORE, sourcePath));
}

test("mirrors the complete 104-file Studio execution closure byte-for-byte", () => {
  const closure = collectClosure(SOURCE_ENTRIES);
  assert.equal(closure.length, 104);
  for (const sourcePath of closure) {
    const targetPath = targetForSource(sourcePath);
    assert.equal(
      existsSync(targetPath),
      true,
      `missing mirrored file: ${path.relative(TARGET_ROOT, targetPath)}`,
    );
    assert.deepEqual(readFileSync(targetPath), readFileSync(sourcePath));
  }
});

test("ported adapters load and execute the same deterministic witnesses as source", async () => {
  const targetRegistryPath = path.join(
    TARGET_CORE,
    "pixelbrain/studio/studio-amp-adapter-registry.js",
  );
  assert.equal(
    existsSync(targetRegistryPath),
    true,
    "ported adapter registry must exist before execution proof",
  );

  const sourceManifest = await import(
    pathToFileURL(path.join(SOURCE_STUDIO, "studio-amp-manifest.generated.js"))
  );
  const sourceRegistry = await import(
    pathToFileURL(path.join(SOURCE_STUDIO, "studio-amp-adapter-registry.js"))
  );
  const sourceExecution = await import(
    pathToFileURL(path.join(SOURCE_STUDIO, "studio-amp-execution.js"))
  );
  const targetManifest = await import(
    pathToFileURL(path.join(TARGET_CORE, "pixelbrain/studio/studio-amp-manifest.generated.js"))
  );
  const targetRegistry = await import(pathToFileURL(targetRegistryPath));
  const targetExecution = await import(
    pathToFileURL(path.join(TARGET_CORE, "pixelbrain/studio/studio-amp-execution.js"))
  );

  assert.deepEqual(targetManifest.STUDIO_AMP_RECORDS, sourceManifest.STUDIO_AMP_RECORDS);
  assert.equal(targetManifest.STUDIO_AMP_RECORDS.length, 54);

  for (const record of sourceManifest.STUDIO_AMP_RECORDS) {
    const sourceAdapter = await sourceRegistry.resolveStudioAmpAdapter(record.adapterId);
    const targetAdapter = await targetRegistry.resolveStudioAmpAdapter(record.adapterId);
    assert.equal(targetAdapter.adapterId, sourceAdapter.adapterId);
    assert.equal(targetAdapter.entry, sourceAdapter.entry);
    assert.equal(
      typeof targetAdapter.entrypoint,
      typeof sourceAdapter.entrypoint,
      record.adapterId,
    );
  }

  const snapshot = Object.freeze({
    checksum: "asset:standalone-differential",
    width: 8,
    height: 8,
    seed: 17,
    layers: Object.freeze([
      Object.freeze({
        name: "Ink",
        cells: Object.freeze([
          Object.freeze({ x: 2, y: 2, color: "#446633", partId: "body", slot: 1 }),
        ]),
      }),
    ]),
  });

  for (const record of sourceManifest.STUDIO_AMP_RECORDS) {
    if (record.kind === "support") {
      const source = await sourceExecution.inspectStudioSupport(record.ampId);
      const target = await targetExecution.inspectStudioSupport(record.ampId);
      assert.deepEqual(target, source, record.ampId);
      continue;
    }
    const execute = record.kind === "mutation" ? "proposeStudioMutation" : "previewStudioAmp";
    const source = await sourceExecution[execute]({ ampId: record.ampId, snapshot });
    const target = await targetExecution[execute]({ ampId: record.ampId, snapshot });
    assert.deepEqual(target, source, record.ampId);
  }
});
