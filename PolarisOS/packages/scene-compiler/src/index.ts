/**
 * @polaris/scene-compiler
 *
 * Converts authoritative room state into a deterministic SceneManifest.
 * "The world produces the picture. The picture does not produce the world."
 * PDR §15: Room state → visual projection (deterministic, hashable).
 */

export { SceneCompiler, SCENE_COMPILER_VERSION } from "./SceneCompiler.js";
export type {
  SceneCompileInput,
  SceneHints,
  EntityIllustrationHint,
} from "./SceneCompiler.js";
