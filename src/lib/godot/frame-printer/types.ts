export type GodotNodeType =
  | "Node2D"
  | "Sprite2D"
  | "AnimatedSprite2D"
  | "Label"
  | "TileMap"
  | "ParticleEmitter2D";

export type GodotTransform2D = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex?: number;
};

export type GodotCreateInstruction = {
  op: "create";
  id: string;
  type: GodotNodeType;
  parentId?: string;
  resource?: string;
  transform: GodotTransform2D;
  props?: Record<string, unknown>;
};

export type GodotUpdateInstruction = {
  op: "update";
  id: string;
  transform?: Partial<GodotTransform2D>;
  /** Omitted when visibility is unchanged or the source has no explicit visibility preference. */
  visible?: boolean;
  props?: Record<string, unknown>;
};

export type GodotDestroyInstruction = {
  op: "destroy";
  id: string;
};

export type GodotFrameInstruction =
  | GodotCreateInstruction
  | GodotUpdateInstruction
  | GodotDestroyInstruction;

export type FrameInstantiationPacket = {
  frame: number;
  timestampMs: number;
  sceneId: string;
  seed: string;
  create: GodotCreateInstruction[];
  update: GodotUpdateInstruction[];
  destroy: GodotDestroyInstruction[];
  metadata?: {
    sourceBytecodeId?: string;
    verseIrId?: string;
    trueSightBytecodeId?: string;
    bytecodeAuthority?: "verseir" | "truesight" | "pixelbrain" | "lotus" | "manual";
    celId?: string;
    passId?: string;
    deterministicHash?: string;
  };
};

export type FrameInstantiationTimeline = {
  schemaVersion: 1;
  sceneId: string;
  fps: number;
  /** Exclusive upper bound of frame numbers, not the number of packets in sparse timelines. */
  durationFrames: number;
  seed: string;
  frames: FrameInstantiationPacket[];
  metadata?: {
    printerVersion?: string;
    sourceSystem?: "pixelbrain" | "lotus" | "bytecode" | "verseir" | "truesight" | "manual";
    verseIrId?: string;
    trueSightBytecodeId?: string;
    bytecodeContract?: "visualBytecode" | "trueSightBytecode" | "pixelBrainBytecode" | "framePacket";
    deterministicHash?: string;
  };
};

export type NormalizedSceneObject = {
  id: string;
  type: GodotNodeType;
  parentId?: string;
  resource?: string;
  transform: GodotTransform2D;
  /** Undefined means no explicit visibility preference; it is not serialized as a reset. */
  visible?: boolean;
  props?: Record<string, unknown>;
};

export type NormalizedFrameState = {
  frame: number;
  timestampMs: number;
  sceneId: string;
  seed: string;
  objects: NormalizedSceneObject[];
};
