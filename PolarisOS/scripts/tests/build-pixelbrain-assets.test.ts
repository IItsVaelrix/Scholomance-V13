import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPixelBrainAssets,
  type BuildPixelBrainAssetsOptions,
} from "../build-pixelbrain-assets.js";

const temporaryDirectories: string[] = [];

async function workspace(): Promise<BuildPixelBrainAssetsOptions> {
  const root = await mkdtemp(join(tmpdir(), "polaris-pixelbrain-assets-"));
  temporaryDirectories.push(root);
  const sourceDir = join(root, "source");
  const publicDir = join(root, "public");
  await mkdir(sourceDir, { recursive: true });
  return {
    sourceDir,
    publicDir,
    registryFile: join(root, "pixelbrainAssetRegistry.ts"),
  };
}

function packet(id: string, snappedX = 0) {
  return {
    kind: "pixelbrain.render.v1",
    id,
    schemaVersion: 1,
    canvas: {
      width: 4,
      height: 4,
      cellSize: 2,
      transparent: true,
      background: "#00000000",
    },
    coordinates: [{ snappedX, snappedY: 0, color: "#ffaa00" }],
  };
}

async function writeSource(
  options: BuildPixelBrainAssetsOptions,
  filename: string,
  value: unknown,
): Promise<void> {
  await writeFile(
    join(options.sourceDir, filename),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

async function snapshotDirectory(directory: string): Promise<string[]> {
  const names = (await readdir(directory)).sort();
  return Promise.all(names.map(async (name) => (
    `${name}\0${await readFile(join(directory, name), "utf8")}`
  )));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("PixelBrain asset registry generator", () => {
  it("generates immutable URLs and byte-identical output", async () => {
    const first = await workspace();
    await writeSource(first, "lantern.pixelbrain.json", {
      assetKey: "entities/lantern",
      packet: packet("lantern"),
    });

    const firstResult = await buildPixelBrainAssets(first);
    const firstFiles = await snapshotDirectory(first.publicDir);
    const firstRegistry = await readFile(first.registryFile, "utf8");

    const second = await workspace();
    await writeSource(second, "lantern.pixelbrain.json", {
      assetKey: "entities/lantern",
      packet: packet("lantern"),
    });
    const secondResult = await buildPixelBrainAssets(second);

    expect(firstResult.registry).toEqual(secondResult.registry);
    expect(await snapshotDirectory(second.publicDir)).toEqual(firstFiles);
    expect(await readFile(second.registryFile, "utf8")).toBe(firstRegistry);
    expect(firstResult.registry["entities/lantern"]?.pixelBrainUrl).toMatch(
      /lantern\.pb1-[0-9a-f]{64}\.pixelbrain\.json$/,
    );
    expect(
      firstResult.registry["entities/lantern"]?.expectedPacketContentHash,
    ).toMatch(/^pb1:[0-9a-f]{64}$/);
  });

  it("rejects duplicate asset keys", async () => {
    const options = await workspace();
    await writeSource(options, "first.pixelbrain.json", {
      assetKey: "entities/lantern",
      packet: packet("first"),
    });
    await writeSource(options, "second.pixelbrain.json", {
      assetKey: "entities/lantern",
      packet: packet("second"),
    });

    await expect(buildPixelBrainAssets(options)).rejects.toThrow(
      /duplicate assetKey/i,
    );
  });

  it("rejects invalid source packets with bridge diagnostics", async () => {
    const options = await workspace();
    await writeSource(options, "misaligned.pixelbrain.json", {
      assetKey: "entities/misaligned",
      packet: packet("misaligned", 1),
    });

    await expect(buildPixelBrainAssets(options)).rejects.toThrow(
      /INVALID_GRID_ALIGNMENT/,
    );
  });

  it("fingerprints PNG revisions from the actual bytes", async () => {
    const options = await workspace();
    const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    await writeFile(join(options.sourceDir, "lantern.png"), pngBytes);
    await writeSource(options, "lantern.pixelbrain.json", {
      assetKey: "entities/lantern",
      packet: packet("lantern"),
      pngFile: "lantern.png",
    });

    const result = await buildPixelBrainAssets(options);
    const entry = result.registry["entities/lantern"];
    expect(entry?.pngUrl).toMatch(
      /lantern\.png1-[0-9a-f]{64}\.png$/,
    );
    expect(entry?.expectedPngHash).toMatch(/^png1:[0-9a-f]{64}$/);
  });
});
