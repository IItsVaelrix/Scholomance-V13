import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface WorkspaceManifest {
  scripts?: Record<string, string>;
}

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceDir = resolve(testDir, "../../apps/world-studio");
const manifest = JSON.parse(
  readFileSync(resolve(workspaceDir, "package.json"), "utf8"),
) as WorkspaceManifest;
const hasApplicationEntry = existsSync(resolve(workspaceDir, "index.html"));

describe("World Studio workspace manifest", () => {
  it("advertises a build only when the application entry exists", () => {
    expect(Boolean(manifest.scripts?.build)).toBe(hasApplicationEntry);
  });

  it("advertises a dev server only when the application entry exists", () => {
    expect(Boolean(manifest.scripts?.dev)).toBe(hasApplicationEntry);
  });
});
