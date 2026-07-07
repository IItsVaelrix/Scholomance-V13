import { SUPPORTED_GODOT_NODE_TYPES } from "./constants";
import type {
  FrameInstantiationTimeline,
  GodotCreateInstruction,
  GodotDestroyInstruction,
  GodotUpdateInstruction,
} from "./types";

export type FrameValidationIssue = {
  code: string;
  message: string;
  frame?: number;
  id?: string;
};

export type FrameValidationResult = {
  ok: boolean;
  issues: FrameValidationIssue[];
};

function validateCreate(
  instruction: GodotCreateInstruction,
  frame: number,
  seenIds: Set<string>
): FrameValidationIssue[] {
  const issues: FrameValidationIssue[] = [];

  if (!instruction.id) {
    issues.push({
      code: "FRAME_CREATE_MISSING_ID",
      message: "Create instruction is missing an id.",
      frame,
    });
  }

  if (instruction.id && seenIds.has(instruction.id)) {
    issues.push({
      code: "FRAME_CREATE_DUPLICATE_ID",
      message: `Create instruction reused existing id: ${instruction.id}`,
      frame,
      id: instruction.id,
    });
  }

  if (!SUPPORTED_GODOT_NODE_TYPES.has(instruction.type)) {
    issues.push({
      code: "FRAME_CREATE_UNSUPPORTED_NODE_TYPE",
      message: `Unsupported Godot node type: ${instruction.type}`,
      frame,
      id: instruction.id,
    });
  }

  issues.push(...validateSerializableProps(instruction.props, frame, instruction.id));

  return issues;
}

function validateUpdate(
  instruction: GodotUpdateInstruction,
  frame: number,
  seenIds: Set<string>
): FrameValidationIssue[] {
  const issues: FrameValidationIssue[] = [];

  if (!seenIds.has(instruction.id)) {
    issues.push({
      code: "FRAME_UPDATE_UNKNOWN_ID",
      message: `Update instruction targets unknown id: ${instruction.id}`,
      frame,
      id: instruction.id,
    });
  }

  issues.push(...validateSerializableProps(instruction.props, frame, instruction.id));

  return issues;
}

function validateSerializableProps(
  props: Record<string, unknown> | undefined,
  frame: number,
  id: string
): FrameValidationIssue[] {
  const issues: FrameValidationIssue[] = [];

  function visit(value: unknown, path: string): void {
    if (typeof value === "number" && !Number.isFinite(value)) {
      issues.push({
        code: "FRAME_PROP_NON_FINITE_NUMBER",
        message: `Prop ${path} contains a non-finite number that cannot be serialized safely.`,
        frame,
        id,
      });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((nested, index) => visit(nested, `${path}[${index}]`));
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        visit(nested, path ? `${path}.${key}` : key);
      }
    }
  }

  visit(props, "props");

  return issues;
}

function validateDestroy(
  instruction: GodotDestroyInstruction,
  frame: number,
  seenIds: Set<string>
): FrameValidationIssue[] {
  if (!seenIds.has(instruction.id)) {
    return [
      {
        code: "FRAME_DESTROY_UNKNOWN_ID",
        message: `Destroy instruction targets unknown id: ${instruction.id}`,
        frame,
        id: instruction.id,
      },
    ];
  }

  return [];
}

export function validateFrameTimeline(timeline: FrameInstantiationTimeline): FrameValidationResult {
  const issues: FrameValidationIssue[] = [];
  const seenIds = new Set<string>();
  let previousFrame = -1;

  for (const packet of timeline.frames) {
    if (packet.frame <= previousFrame) {
      issues.push({
        code: "FRAME_ORDER_INVALID",
        message: `Frame ${packet.frame} is not strictly after frame ${previousFrame}.`,
        frame: packet.frame,
      });
    }

    previousFrame = packet.frame;

    for (const create of packet.create) {
      issues.push(...validateCreate(create, packet.frame, seenIds));
      if (create.id) {
        seenIds.add(create.id);
      }
    }

    for (const update of packet.update) {
      issues.push(...validateUpdate(update, packet.frame, seenIds));
    }

    for (const destroy of packet.destroy) {
      issues.push(...validateDestroy(destroy, packet.frame, seenIds));
      seenIds.delete(destroy.id);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertValidFrameTimeline(timeline: FrameInstantiationTimeline): void {
  const result = validateFrameTimeline(timeline);

  if (!result.ok) {
    const printable = result.issues
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid frame instantiation timeline:\n${printable}`);
  }
}
