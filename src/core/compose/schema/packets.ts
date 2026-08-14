/**
 * Canonical PB-* / SCHOL packet types (PDR §8).
 * Intent only — no DOM, React, Zag, or XState objects.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ComponentPartDefinition {
  id: string;
  role: string;
  label?: string;
  description?: string;
  interactive?: boolean;
  visible?: boolean;
  required?: boolean;
  children?: ComponentPartDefinition[];
}

export interface SlotDefinition {
  name: string;
  accepts: string[];
  required?: boolean;
  maxChildren?: number;
}

export interface StateDefinition {
  name: string;
  type: 'boolean' | 'string' | 'number' | 'enum';
  enumValues?: string[];
  default?: JsonValue;
  ariaMapping?: string;
}

export interface EventDefinition {
  type: string;
  payloadSchemaId?: string;
  bubbles?: boolean;
}

export interface AccessibilityContract {
  ariaRole: string;
  requiredAttributes?: string[];
  keyboard: string[];
  announcements?: string[];
  focusRetention?: 'restore' | 'trap' | 'none';
  nameFrom?: 'contents' | 'author' | 'none';
}

export interface CapabilityRequirement {
  id: string;
  required: boolean;
}

export interface LayoutIntentRef {
  layoutId: string;
}

export interface VisualAttachmentRef {
  visualId: string;
}

export interface ProvenanceRecord {
  sourceKind: 'json' | 'typescript' | 'scdl-ui' | 'migrated';
  sourcePath?: string;
  contentHash: string;
  author?: string;
  establishedAt: string;
}

export interface ScholComponentDefinitionV1 {
  contract: 'SCHOL-COMPONENT-DEFINITION-v1';
  /**
   * Definition revision. '1.0.0' = original anatomy; '1.1.0' admits sealed
   * anatomy revisions (ConstellationResult re-sealed its contract twice:
   * hero-figure part + discovery-field, commits 76a73349/6e37af26). The
   * CONTRACT name stays v1; only the definition revision moves.
   */
  version: '1.0.0' | '1.1.0';
  kind: string;
  description?: string;
  anatomy: {
    rootRole: string;
    parts: ComponentPartDefinition[];
    slots?: SlotDefinition[];
  };
  states: StateDefinition[];
  events: EventDefinition[];
  accessibility: AccessibilityContract;
  capabilities?: CapabilityRequirement[];
  defaultLayout?: LayoutIntentRef;
  defaultVisuals?: VisualAttachmentRef[];
  provenance: ProvenanceRecord;
}

export interface UiSceneNode {
  id: string;
  kind: string;
  role?: string;
  props?: Record<string, JsonValue>;
  state?: Record<string, JsonValue>;
  layoutRef?: string;
  visualRefs?: string[];
  slots?: Record<string, UiSceneNode[]>;
  children?: UiSceneNode[];
}

export interface PbUiSceneV1 {
  contract: 'PB-UI-SCENE-v1';
  version: '1.0.0';
  id: string;
  root: UiSceneNode;
  definitions: Record<string, ScholComponentDefinitionV1>;
  layouts: Record<string, PbLayoutV1>;
  visuals: Record<string, VisualAttachment>;
  sourceChecksum: string;
}

export interface CommonLayoutIntent {
  paddingPx?: number | [number, number] | [number, number, number, number];
  marginPx?: number | [number, number] | [number, number, number, number];
  minWidthPx?: number;
  maxWidthPx?: number;
  minHeightPx?: number;
  maxHeightPx?: number;
  writingDirection?: 'ltr' | 'rtl';
}

export interface FlowLayoutIntent {
  direction: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  gapPx?: number;
  wrap?: boolean;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
}

export interface GridLayoutIntent {
  columns: string;
  rows?: string;
  gapPx?: number | [number, number];
  align?: FlowLayoutIntent['align'];
  justify?: FlowLayoutIntent['justify'];
}

export interface AbsoluteLayoutIntent {
  xPx: number;
  yPx: number;
  widthPx?: number;
  heightPx?: number;
  zIndex?: number;
}

export interface OverlayLayoutIntent {
  anchor: 'viewport' | 'parent' | { nodeId: string };
  placement: 'center' | 'top' | 'bottom' | 'start' | 'end';
  offsetPx?: { x?: number; y?: number };
  backdrop?: boolean;
}

export interface ConstraintVariableDef {
  id: string;
  initial?: number;
  min?: number;
  max?: number;
}

export interface LinearConstraintDef {
  id: string;
  expression: string;
  strength: 'required' | 'strong' | 'medium' | 'weak';
}

export interface ConstraintLayoutIntent {
  regionId: string;
  maxNodes: number;
  maxConstraints: number;
  variables: ConstraintVariableDef[];
  rules: LinearConstraintDef[];
  fallbackLayoutRef: string;
}

export interface PbLayoutV1 {
  contract: 'PB-LAYOUT-v1';
  version: '1.0.0';
  mode: 'flow' | 'grid' | 'absolute' | 'overlay' | 'constraint';
  common?: CommonLayoutIntent;
  flow?: FlowLayoutIntent;
  grid?: GridLayoutIntent;
  absolute?: AbsoluteLayoutIntent;
  overlay?: OverlayLayoutIntent;
  constraint?: ConstraintLayoutIntent;
}

export interface PbUiEventV1<TPayload = JsonValue> {
  contract: 'PB-UI-EVENT-v1';
  version: '1.0.0';
  type: string;
  sourceId: string;
  target?: string;
  payload?: TPayload;
  sequence: number;
  correlationId?: string;
}

export type VisualAttachment =
  | TokenVisualAttachment
  | WandVisualAttachment
  | ScdlAssetAttachment
  | NativeDomVisualAttachment;

export interface TokenVisualAttachment {
  kind: 'token';
  tokenPath: string;
  cssProperty?: string;
  placementSlot: string;
}

export interface WandVisualAttachment {
  kind: 'wand';
  formulaId: string;
  role: string;
  placementSlot: string;
}

export interface ScdlAssetAttachment {
  kind: 'scdl-asset';
  packetId: string;
  placementSlot: string;
}

export interface NativeDomVisualAttachment {
  kind: 'native-dom';
  className?: string;
  styleTokens?: string[];
  placementSlot: string;
}
