import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@polaris/contracts": resolve(__dirname, "packages/contracts/src/index.ts"),
      "@polaris/world-kernel": resolve(__dirname, "packages/world-kernel/src/index.ts"),
      "@polaris/world-runtime": resolve(__dirname, "packages/world-runtime/src/index.ts"),
      "@polaris/command-language": resolve(__dirname, "packages/command-language/src/index.ts"),
      "@polaris/narrative-projector": resolve(__dirname, "packages/narrative-projector/src/index.ts"),
      "@polaris/scene-compiler": resolve(__dirname, "packages/scene-compiler/src/index.ts"),
      "@polaris/realtime-protocol": resolve(__dirname, "packages/realtime-protocol/src/index.ts"),
      "@polaris/persistence-sqlite": resolve(__dirname, "packages/persistence-sqlite/src/index.ts"),
      "@polaris/pixelbrain-bridge": resolve(__dirname, "packages/pixelbrain-bridge/src/index.ts"),
      "@polaris/renderer-pixi": resolve(__dirname, "packages/renderer-pixi/src/index.ts"),
      "@polaris/test-harness": resolve(__dirname, "packages/test-harness/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
      "scripts/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
