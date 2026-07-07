import { stableStringify } from "../deterministicHash";
import type { FrameInstantiationTimeline } from "../types";

export function toGodotRuntimeJson(timeline: FrameInstantiationTimeline): string {
  return `${stableStringify(timeline)}\n`;
}
