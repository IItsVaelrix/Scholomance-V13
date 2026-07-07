import { toGodotRuntimeJson } from "./adapters/toGodotRuntimeJson";
import { printFrameTimeline } from "./printFrameTimeline";
import type { PrintFrameTimelineOptions } from "./printFrameTimeline";
import type { NormalizedFrameState } from "./types";

export type ShadowPrintGodotFrameTimelineOptions = Partial<PrintFrameTimelineOptions>;

export function shadowPrintGodotFrameTimeline(
  frames: NormalizedFrameState[],
  options: ShadowPrintGodotFrameTimelineOptions = {}
): string {
  const timeline = printFrameTimeline(frames, {
    sceneId: options.sceneId ?? "shadow_scene",
    fps: options.fps ?? 60,
    seed: options.seed ?? "shadow_seed_v1",
    sourceSystem: options.sourceSystem ?? "manual",
    verseIrId: options.verseIrId,
    trueSightBytecodeId: options.trueSightBytecodeId,
    bytecodeContract: options.bytecodeContract,
    validate: options.validate ?? true,
  });

  return toGodotRuntimeJson(timeline);
}
