/**
 * Normalizes caller-provided parts into a Godot-safe ID. This is not a hash;
 * different inputs can normalize to the same value after separator collapse.
 */
export function toStableGodotId(parts: Array<string | number | undefined>): string {
  const raw = parts
    .filter((part) => part !== undefined && part !== "")
    .map((part) => String(part).trim())
    .join("__");

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    throw new Error("Cannot create stable Godot ID from empty parts.");
  }

  return normalized;
}
