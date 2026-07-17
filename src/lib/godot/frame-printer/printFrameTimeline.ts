import {
  DEFAULT_FRAME_PRINTER_VERSION,
  FRAME_PRINTER_SCHEMA_VERSION,
} from "./constants";
import { deterministicHash } from "./deterministicHash";
import { diffFrameState } from "./diffFrameState";
import { assertValidFrameTimeline } from "./validateFramePacket";
import type {
  FrameInstantiationPacket,
  FrameInstantiationTimeline,
  NormalizedFrameState,
} from "./types";

export type PrintFrameTimelineOptions = {
  sceneId: string;
  fps: number;
  seed: string;
  sourceSystem?: "pixelbrain" | "lotus" | "bytecode" | "verseir" | "truesight" | "manual";
  verseIrId?: string;
  trueSightBytecodeId?: string;
  bytecodeContract?: "visualBytecode" | "trueSightBytecode" | "pixelBrainBytecode" | "framePacket";
  validate?: boolean;
};

export function printFrameTimeline(
  frames: NormalizedFrameState[],
  options: PrintFrameTimelineOptions
): FrameInstantiationTimeline {
  if (frames.length === 0) {
    throw new Error("Cannot print frame timeline from empty frames.");
  }

  const orderedFrames = [...frames].sort((left, right) => left.frame - right.frame);
  const packets: FrameInstantiationPacket[] = [];

  for (let index = 0; index < orderedFrames.length; index += 1) {
    const previousFrame = index > 0 ? orderedFrames[index - 1] : undefined;
    const nextFrame = orderedFrames[index];
    const diff = diffFrameState(previousFrame, nextFrame);

    const packetWithoutHash: FrameInstantiationPacket = {
      frame: nextFrame.frame,
      timestampMs: nextFrame.timestampMs,
      sceneId: options.sceneId,
      seed: options.seed,
      create: diff.create,
      update: diff.update,
      destroy: diff.destroy,
      metadata: {},
    };

    packets.push({
      ...packetWithoutHash,
      metadata: {
        deterministicHash: deterministicHash(packetWithoutHash),
      },
    });
  }

  const timelineWithoutHash: FrameInstantiationTimeline = {
    schemaVersion: FRAME_PRINTER_SCHEMA_VERSION,
    sceneId: options.sceneId,
    fps: options.fps,
    durationFrames: orderedFrames[orderedFrames.length - 1].frame + 1,
    seed: options.seed,
    frames: packets,
    metadata: {
      printerVersion: DEFAULT_FRAME_PRINTER_VERSION,
      sourceSystem: options.sourceSystem ?? "manual",
      verseIrId: options.verseIrId,
      trueSightBytecodeId: options.trueSightBytecodeId,
      bytecodeContract: options.bytecodeContract,
    },
  };

  const timeline: FrameInstantiationTimeline = {
    ...timelineWithoutHash,
    metadata: {
      ...timelineWithoutHash.metadata,
      deterministicHash: deterministicHash(timelineWithoutHash),
    },
  };

  if (options.validate ?? true) {
    assertValidFrameTimeline(timeline);
  }

  return timeline;
}
