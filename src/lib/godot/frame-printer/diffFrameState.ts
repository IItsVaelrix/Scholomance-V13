import type {
  GodotCreateInstruction,
  GodotDestroyInstruction,
  GodotUpdateInstruction,
  GodotTransform2D,
  NormalizedFrameState,
  NormalizedSceneObject,
} from "./types";

function deepEqualValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((leftValue, index) => deepEqualValue(leftValue, right[index]));
  }

  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    return leftEntries.every(([key, leftValue], index) => {
      const [rightKey, rightValue] = rightEntries[index];
      return key === rightKey && deepEqualValue(leftValue, rightValue);
    });
  }

  return false;
}

function deepEqualProps(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean {
  return deepEqualValue(left ?? {}, right ?? {});
}

function diffTransform(
  previous: GodotTransform2D,
  next: GodotTransform2D
): Partial<GodotTransform2D> | undefined {
  const diff: Partial<GodotTransform2D> = {};

  if (previous.x !== next.x) {
    diff.x = next.x;
  }

  if (previous.y !== next.y) {
    diff.y = next.y;
  }

  if (previous.rotation !== next.rotation) {
    diff.rotation = next.rotation;
  }

  if (previous.scaleX !== next.scaleX) {
    diff.scaleX = next.scaleX;
  }

  if (previous.scaleY !== next.scaleY) {
    diff.scaleY = next.scaleY;
  }

  if (previous.zIndex !== next.zIndex) {
    diff.zIndex = next.zIndex;
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

function hasExplicitVisibilityChange(
  previous: NormalizedSceneObject,
  next: NormalizedSceneObject
): boolean {
  return next.visible !== undefined && previous.visible !== next.visible;
}

function toCreateInstruction(object: NormalizedSceneObject): GodotCreateInstruction {
  return {
    op: "create",
    id: object.id,
    type: object.type,
    parentId: object.parentId,
    resource: object.resource,
    transform: object.transform,
    props: object.props,
  };
}

export type FrameStateDiff = {
  create: GodotCreateInstruction[];
  update: GodotUpdateInstruction[];
  destroy: GodotDestroyInstruction[];
};

export function diffFrameState(
  previousFrame: NormalizedFrameState | undefined,
  nextFrame: NormalizedFrameState
): FrameStateDiff {
  const previousObjects = new Map(
    previousFrame?.objects.map((object) => [object.id, object]) ?? []
  );
  const nextObjects = new Map(nextFrame.objects.map((object) => [object.id, object]));

  const create: GodotCreateInstruction[] = [];
  const update: GodotUpdateInstruction[] = [];
  const destroy: GodotDestroyInstruction[] = [];

  for (const nextObject of nextFrame.objects) {
    const previousObject = previousObjects.get(nextObject.id);

    if (!previousObject) {
      create.push(toCreateInstruction(nextObject));
      continue;
    }

    const transformDiff = diffTransform(previousObject.transform, nextObject.transform);
    const propsChanged = !deepEqualProps(previousObject.props, nextObject.props);
    const visibleChanged = hasExplicitVisibilityChange(previousObject, nextObject);

    if (transformDiff || propsChanged || visibleChanged) {
      update.push({
        op: "update",
        id: nextObject.id,
        transform: transformDiff,
        visible: visibleChanged ? nextObject.visible : undefined,
        props: propsChanged ? nextObject.props : undefined,
      });
    }
  }

  for (const previousObject of previousObjects.values()) {
    if (!nextObjects.has(previousObject.id)) {
      destroy.push({
        op: "destroy",
        id: previousObject.id,
      });
    }
  }

  return { create, update, destroy };
}
