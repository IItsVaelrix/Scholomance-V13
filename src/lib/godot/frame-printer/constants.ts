import type { GodotNodeType } from "./types";

export const FRAME_PRINTER_SCHEMA_VERSION = 1;

export const SUPPORTED_GODOT_NODE_TYPES: ReadonlySet<GodotNodeType> = new Set<GodotNodeType>([
  "Node2D",
  "Sprite2D",
  "AnimatedSprite2D",
  "Label",
  "TileMap",
  "ParticleEmitter2D",
]);

export const DEFAULT_FRAME_PRINTER_VERSION = "0.1.0";
