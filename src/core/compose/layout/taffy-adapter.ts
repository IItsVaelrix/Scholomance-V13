/**
 * Taffy WASM Adapter
 * 
 * Bridges the compose layout system to the real Taffy WASM library.
 * Converts LayoutNode trees → Taffy trees, computes layout, reads back positions.
 * 
 * This replaces the custom TaffyLayoutEngine with the real Taffy library
 * for accurate CSS Flexbox, Grid, and Block layout computation.
 */

import {
  loadTaffy,
  TaffyTree,
  Style,
  Display,
  FlexDirection,
  JustifyContent,
  AlignItems,
  AlignContent,
  Position as TaffyPosition,
  type Size,
  type AvailableSpace,
  type Dimension,
  type LengthPercentage,
} from 'taffy-layout';

import type {
  LayoutNode,
  LayoutResult,
  LayoutIntent,
  CSSProperties,
  CSSLoweringStrategy,
} from './index';

// ─── Initialization ──────────────────────────────────────────────────────────

let taffyInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize Taffy WASM module. Safe to call multiple times.
 */
export async function initTaffy(): Promise<void> {
  if (taffyInitialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    await loadTaffy();
    taffyInitialized = true;
  })();
  
  return initPromise;
}

/**
 * Check if Taffy WASM is initialized.
 */
export function isTaffyReady(): boolean {
  return taffyInitialized;
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

/**
 * Map LayoutIntent algorithm to Taffy Display enum
 */
function mapDisplay(intent: LayoutIntent): Display {
  switch (intent.algorithm) {
    case 'flex':
      return Display.Flex;
    case 'grid':
      return Display.Grid;
    case 'block':
      return Display.Block;
    default:
      return Display.Flex;
  }
}

/**
 * Map direction string to Taffy FlexDirection enum
 */
function mapFlexDirection(direction?: 'row' | 'column'): FlexDirection {
  switch (direction) {
    case 'column':
      return FlexDirection.Column;
    case 'row':
    default:
      return FlexDirection.Row;
  }
}

/**
 * Map justify string to Taffy JustifyContent enum
 */
function mapJustifyContent(justify?: string): JustifyContent | undefined {
  switch (justify) {
    case 'start':
      return JustifyContent.Start;
    case 'center':
      return JustifyContent.Center;
    case 'end':
      return JustifyContent.End;
    case 'between':
      return JustifyContent.SpaceBetween;
    case 'around':
      return JustifyContent.SpaceAround;
    case 'evenly':
      return JustifyContent.SpaceEvenly;
    default:
      return undefined;
  }
}

/**
 * Map align string to Taffy AlignItems enum
 */
function mapAlignItems(align?: string): AlignItems | undefined {
  switch (align) {
    case 'start':
      return AlignItems.Start;
    case 'center':
      return AlignItems.Center;
    case 'end':
      return AlignItems.End;
    case 'stretch':
      return AlignItems.Stretch;
    default:
      return undefined;
  }
}

/**
 * Normalize padding to { top, right, bottom, left }
 */
function normalizePadding(
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number }
): { top: number; right: number; bottom: number; left: number } {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  if (typeof padding === 'object' && padding) {
    return {
      top: padding.top || 0,
      right: padding.right || 0,
      bottom: padding.bottom || 0,
      left: padding.left || 0,
    };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * Apply layout intent to a Taffy Style object
 */
function applyIntentToStyle(style: Style, intent: LayoutIntent): void {
  style.display = mapDisplay(intent);

  if (intent.algorithm === 'flex') {
    style.flexDirection = mapFlexDirection(intent.direction);

    const justify = mapJustifyContent(intent.justify);
    if (justify !== undefined) style.justifyContent = justify;

    const align = mapAlignItems(intent.align);
    if (align !== undefined) style.alignItems = align;
  }

  if (intent.gap !== undefined) {
    style.gap = { width: intent.gap, height: intent.gap };
  }

  const pad = normalizePadding(intent.padding);
  style.padding = {
    top: pad.top,
    right: pad.right,
    bottom: pad.bottom,
    left: pad.left,
  };

  // Grid-specific properties
  if (intent.algorithm === 'grid') {
    if (intent.columns) {
      const cols = parseInt(intent.columns, 10);
      if (!isNaN(cols) && cols > 0) {
        // Create equal-width columns using fr units
        style.gridTemplateColumns = Array(cols).fill({ min: 'auto', max: '1fr' });
      }
    }
    if (intent.rows) {
      const rows = parseInt(intent.rows, 10);
      if (!isNaN(rows) && rows > 0) {
        style.gridTemplateRows = Array(rows).fill({ min: 'auto', max: '1fr' });
      }
    }
  }
}

// ─── Node Registry ───────────────────────────────────────────────────────────

/**
 * Maps Taffy bigint node IDs back to our LayoutNode objects.
 */
type NodeRegistry = Map<bigint, LayoutNode>;

// ─── Taffy WASM Adapter ─────────────────────────────────────────────────────

/**
 * Real Taffy WASM layout adapter.
 * 
 * Converts LayoutNode trees into Taffy trees, computes layout using the
 * real Taffy WASM library, and reads back computed positions.
 * 
 * Maintains the same API as TaffyLayoutEngine for drop-in replacement.
 */
export class TaffyWasmAdapter {
  /**
   * Compute layout for a node tree using real Taffy WASM.
   * 
   * @param root - The root LayoutNode
   * @param containerWidth - Available width in pixels
   * @param containerHeight - Available height in pixels
   * @returns LayoutResult with computed positions
   */
  compute(root: LayoutNode, containerWidth: number, containerHeight: number): LayoutResult {
    if (!taffyInitialized) {
      throw new Error(
        'Taffy WASM not initialized. Call await initTaffy() before using TaffyWasmAdapter.'
      );
    }

    const tree = new TaffyTree();
    const registry: NodeRegistry = new Map();

    try {
      // Build Taffy tree from LayoutNode tree, sizing root to container
      const rootNodeId = this.buildTaffyTreeSized(tree, root, registry, containerWidth, containerHeight);

      // Compute layout
      const availableSpace: Size<AvailableSpace> = {
        width: containerWidth,
        height: containerHeight,
      };
      tree.computeLayout(rootNodeId, availableSpace);

      // Read back positions
      const computedRoot = this.readBackLayout(tree, rootNodeId, registry);

      return {
        root: computedRoot,
        success: true,
      };
    } finally {
      // Clean up WASM resources
      tree.free();
    }
  }

  /**
   * Build a Taffy tree with the root explicitly sized to the container.
   * This ensures Taffy has a defined root size to lay out against.
   */
  private buildTaffyTreeSized(
    tree: TaffyTree,
    node: LayoutNode,
    registry: NodeRegistry,
    containerWidth: number,
    containerHeight: number
  ): bigint {
    const style = new Style();
    applyIntentToStyle(style, node.intent);
    // Root gets explicit container dimensions
    style.width = containerWidth;
    style.height = containerHeight;

    let nodeId: bigint;

    if (!node.children || node.children.length === 0) {
      nodeId = tree.newLeaf(style);
    } else {
      nodeId = tree.newLeaf(style);
      // For block layout, children need explicit heights since Taffy doesn't auto-distribute
      const isBlock = node.intent.algorithm === 'block';
      const childCount = node.children.length;
      
      for (let i = 0; i < childCount; i++) {
        const child = node.children[i];
        const childId = this.buildTaffyTreeForParent(
          tree, child, registry, 
          isBlock ? containerHeight / childCount : undefined
        );
        tree.addChild(nodeId, childId);
      }
    }

    registry.set(nodeId, node);
    return nodeId;
  }

  /**
   * Build a Taffy tree node with an optional forced height (for block layout children).
   */
  private buildTaffyTreeForParent(
    tree: TaffyTree,
    node: LayoutNode,
    registry: NodeRegistry,
    forcedHeight?: number
  ): bigint {
    const style = new Style();
    applyIntentToStyle(style, node.intent);

    if (node.width !== undefined) {
      style.width = node.width;
    }
    if (node.height !== undefined) {
      style.height = node.height;
    }
    // Block layout children get explicit height
    if (forcedHeight !== undefined && node.height === undefined) {
      style.height = forcedHeight;
    }

    if (node.width === undefined && node.height === undefined && forcedHeight === undefined) {
      style.flexGrow = 1;
    }

    let nodeId: bigint;

    if (!node.children || node.children.length === 0) {
      nodeId = tree.newLeaf(style);
    } else {
      nodeId = tree.newLeaf(style);
      const isBlock = node.intent.algorithm === 'block';
      const childCount = node.children.length;

      for (let i = 0; i < childCount; i++) {
        const child = node.children[i];
        const childHeight = isBlock && forcedHeight !== undefined
          ? forcedHeight / childCount
          : undefined;
        const childId = this.buildTaffyTreeForParent(tree, child, registry, childHeight);
        tree.addChild(nodeId, childId);
      }
    }

    registry.set(nodeId, node);
    return nodeId;
  }

  /**
   * Recursively build a Taffy tree from a LayoutNode tree.
   * Returns the bigint node ID of the root.
   */
  private buildTaffyTree(
    tree: TaffyTree,
    node: LayoutNode,
    registry: NodeRegistry
  ): bigint {
    const style = new Style();
    applyIntentToStyle(style, node.intent);

    // Set explicit dimensions if provided
    if (node.width !== undefined) {
      style.width = node.width;
    }
    if (node.height !== undefined) {
      style.height = node.height;
    }

    // Auto-grow nodes that have no explicit dimensions
    if (node.width === undefined && node.height === undefined) {
      style.flexGrow = 1;
    }

    let nodeId: bigint;

    if (!node.children || node.children.length === 0) {
      nodeId = tree.newLeaf(style);
    } else {
      nodeId = tree.newLeaf(style);
      const isBlock = node.intent.algorithm === 'block';
      const childCount = node.children.length;

      for (let i = 0; i < childCount; i++) {
        const child = node.children[i];
        // For block layout, distribute height equally among children
        const childHeight = isBlock ? undefined : undefined; // Let children grow
        const childId = this.buildTaffyTreeForParent(tree, child, registry, childHeight);
        tree.addChild(nodeId, childId);
      }
    }

    registry.set(nodeId, node);
    return nodeId;
  }

  /**
   * Read back computed layout from Taffy tree into LayoutNode tree.
   */
  private readBackLayout(
    tree: TaffyTree,
    nodeId: bigint,
    registry: NodeRegistry
  ): LayoutNode {
    const layout = tree.getLayout(nodeId);
    const originalNode = registry.get(nodeId);

    const result: LayoutNode = {
      id: originalNode?.id || `node-${nodeId}`,
      intent: originalNode?.intent || { algorithm: 'block' },
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      children: [],
      props: originalNode?.props,
    };

    // Read children
    const childCount = tree.childCount(nodeId);
    for (let i = 0; i < childCount; i++) {
      const childId = tree.getChildAtIndex(nodeId, i);
      result.children!.push(this.readBackLayout(tree, childId, registry));
    }

    return result;
  }
}

// ─── CSS Lowering (unchanged from original) ──────────────────────────────────

/**
 * CSS Lowering Engine for Taffy WASM results.
 * Converts absolute coordinates from Taffy into CSS properties.
 */
export class TaffyCSSLoweringEngine {
  private strategy: CSSLoweringStrategy;

  constructor(strategy: CSSLoweringStrategy = 'relative') {
    this.strategy = strategy;
  }

  /**
   * Lower a layout result to CSS properties
   */
  lower(result: LayoutResult): Map<string, CSSProperties> {
    const cssMap = new Map<string, CSSProperties>();
    this.lowerNode(result.root, cssMap, null);
    return cssMap;
  }

  private lowerNode(
    node: LayoutNode,
    cssMap: Map<string, CSSProperties>,
    parent: LayoutNode | null
  ): void {
    let css: CSSProperties = {};

    if (this.strategy === 'absolute') {
      css.position = 'absolute';
      if (node.x !== undefined) css.left = `${node.x}px`;
      if (node.y !== undefined) css.top = `${node.y}px`;
      if (node.width !== undefined) css.width = `${node.width}px`;
      if (node.height !== undefined) css.height = `${node.height}px`;
    } else if (this.strategy === 'relative' && parent) {
      css = this.lowerToRelativeCSS(node, parent);
    } else {
      // Root or hybrid
      if (!parent) {
        css.display = this.getDisplayForAlgorithm(node.intent.algorithm);
        css.width = node.width !== undefined ? `${node.width}px` : '100%';
        css.height = node.height !== undefined ? `${node.height}px` : 'auto';
        css = { ...css, ...this.getFlexOrGridProps(node.intent) };
      } else {
        css.position = 'relative';
        if (node.width !== undefined) css.width = `${node.width}px`;
        if (node.height !== undefined) css.height = `${node.height}px`;
      }
    }

    // Padding
    if (node.intent.padding) {
      if (typeof node.intent.padding === 'number') {
        css.padding = `${node.intent.padding}px`;
      } else {
        const p = node.intent.padding;
        css.padding = `${p.top || 0}px ${p.right || 0}px ${p.bottom || 0}px ${p.left || 0}px`;
      }
    }

    // Gap
    if (node.intent.gap) {
      css.gap = `${node.intent.gap}px`;
    }

    cssMap.set(node.id, css);

    if (node.children) {
      for (const child of node.children) {
        this.lowerNode(child, cssMap, node);
      }
    }
  }

  private lowerToRelativeCSS(node: LayoutNode, parent: LayoutNode): CSSProperties {
    const css: CSSProperties = {};

    if (parent.intent.algorithm === 'flex') {
      css.flex = '1 1 auto';
      if (node.width !== undefined) css.width = `${node.width}px`;
      if (node.height !== undefined) css.height = `${node.height}px`;
    } else if (parent.intent.algorithm === 'grid') {
      css.position = 'relative';
      if (node.width !== undefined) css.width = `${node.width}px`;
      if (node.height !== undefined) css.height = `${node.height}px`;
    } else {
      css.display = 'block';
      if (node.width !== undefined) css.width = `${node.width}px`;
      if (node.height !== undefined) css.height = `${node.height}px`;
    }

    return css;
  }

  private getDisplayForAlgorithm(algorithm: string): CSSProperties['display'] {
    switch (algorithm) {
      case 'flex': return 'flex';
      case 'grid': return 'grid';
      case 'block': return 'block';
      default: return 'block';
    }
  }

  private getFlexOrGridProps(intent: LayoutIntent): CSSProperties {
    const props: CSSProperties = {};

    if (intent.algorithm === 'flex') {
      if (intent.direction) props.flexDirection = intent.direction;
      if (intent.justify) {
        const justifyMap = {
          start: 'flex-start',
          center: 'center',
          end: 'flex-end',
          between: 'space-between',
          around: 'space-around',
          evenly: 'space-evenly',
        } as const;
        props.justifyContent = justifyMap[intent.justify] || 'flex-start';
      }
      if (intent.align) {
        const alignMap = {
          start: 'flex-start',
          center: 'center',
          end: 'flex-end',
          stretch: 'stretch',
        } as const;
        props.alignItems = alignMap[intent.align] || 'stretch';
      }
    }

    if (intent.algorithm === 'grid') {
      if (intent.columns) {
        const cols = parseInt(intent.columns, 10);
        if (!isNaN(cols)) {
          props.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        }
      }
    }

    return props;
  }
}
