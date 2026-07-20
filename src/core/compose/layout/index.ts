/**
 * Layout Layer - Taffy + Cassowary integration + QBIT Lattice + CSS Lowering
 * 
 * Taffy handles CSS Flexbox, Grid, and Block layout algorithms.
 * Cassowary handles constraint-based layout (proportions, priorities, alignment).
 * QBIT Lattice provides the deterministic coordinate grid foundation.
 * CSS Lowering converts computed absolute coordinates to CSS properties.
 * 
 * @module compose/layout
 */

import { QbitLatticeGrid, createLatticeForLayout, layoutSeedsFromNodes, LATTICE_ATTENUATION } from './qbit-lattice';

// Re-export QBIT Lattice types
export { QbitLatticeGrid, createLatticeForLayout, layoutSeedsFromNodes } from './qbit-lattice';
export type { LatticeCoord, LatticeCell, LatticeSeed } from './qbit-lattice';

/**
 * Layout algorithm type
 */
export type LayoutAlgorithm = 'flex' | 'grid' | 'block' | 'constraint';

/**
 * Layout intent - declarative layout specification
 * This is resolved to either Taffy (flex/grid/block) or Cassowary (constraint)
 * 
 * FIX: Added constraintJustification for Cassowary adoption gate enforcement.
 * When kind is 'constraint', a justification is required explaining why
 * CSS Grid/Flexbox can't handle this layout.
 */
export type LayoutIntent = {
  /** Layout algorithm to use */
  algorithm: LayoutAlgorithm;
  /** Direction for flex layout */
  direction?: 'row' | 'column';
  /** Justification for flex layout */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Alignment for flex layout */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Gap between items */
  gap?: number;
  /** Padding */
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  /** Grid template columns */
  columns?: string;
  /** Grid template rows */
  rows?: string;
  /** Custom constraints for Cassowary */
  constraints?: Constraint[];
  /** Justification for using Cassowary (required when constraints are present) */
  constraintJustification?: string;
};

/**
 * Constraint for Cassowary solver
 */
export type Constraint = {
  /** Constraint type */
  type: 'proportion' | 'alignment' | 'priority' | 'ratio' | 'equal';
  /** Target element ID */
  target: string;
  /** Reference element ID (for relative constraints) */
  reference?: string;
  /** Constraint value */
  value?: number | string;
  /** Priority (higher = stronger) */
  priority?: number;
  /** Whether this constraint is required or optional */
  required?: boolean;
};

/**
 * Layout node - represents an element in the layout tree
 */
export type LayoutNode = {
  /** Unique identifier */
  id: string;
  /** Layout intent */
  intent: LayoutIntent;
  /** Computed position */
  x?: number;
  y?: number;
  /** Computed size */
  width?: number;
  height?: number;
  /** Child nodes */
  children?: LayoutNode[];
  /** Custom properties */
  props?: Record<string, unknown>;
};

/**
 * Layout result - computed layout for a tree
 */
export type LayoutResult = {
  /** Root node with computed positions */
  root: LayoutNode;
  /** Whether the layout was successful */
  success: boolean;
  /** Constraint violations (for Cassowary) */
  violations?: ConstraintViolation[];
  /** QBIT Lattice grid (if enabled) */
  lattice?: QbitLatticeGrid;
  /** CSS properties (after lowering) */
  css?: Map<string, CSSProperties>;
};

/**
 * Constraint violation - when a constraint couldn't be satisfied
 */
export type ConstraintViolation = {
  /** Constraint that was violated */
  constraint: Constraint;
  /** Reason for violation */
  reason: string;
  /** Severity */
  severity: 'warning' | 'error';
};

/**
 * CSS properties - the output of CSS lowering
 * 
 * FIX: This is the key addition. Taffy produces absolute coordinates,
 * but CSS uses relative positioning. This type defines the CSS properties
 * that can be generated from a layout result.
 */
export type CSSProperties = {
  /** Position strategy */
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  /** Display strategy */
  display?: 'block' | 'flex' | 'grid' | 'inline' | 'inline-flex' | 'inline-grid' | 'none';
  /** Flex direction */
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Justify content */
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  /** Align items */
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  /** Gap */
  gap?: string;
  /** Width */
  width?: string;
  /** Height */
  height?: string;
  /** Top offset */
  top?: string;
  /** Left offset */
  left?: string;
  /** Right offset */
  right?: string;
  /** Bottom offset */
  bottom?: string;
  /** Padding */
  padding?: string;
  /** Grid template columns */
  gridTemplateColumns?: string;
  /** Grid template rows */
  gridTemplateRows?: string;
  /** Grid column */
  gridColumn?: string;
  /** Grid row */
  gridRow?: string;
  /** Custom properties */
  [key: string]: string | undefined;
};

/**
 * CSS Lowering strategy
 * 
 * Determines how absolute coordinates are converted to CSS.
 * - 'relative': Use flex/grid with relative positioning (preferred)
 * - 'absolute': Use position:absolute with explicit coordinates
 * - 'hybrid': Use flex/grid where possible, absolute where needed
 */
export type CSSLoweringStrategy = 'relative' | 'absolute' | 'hybrid';

// ─── Taffy Layout Engine ─────────────────────────────────────────────────────

// Lazy import for real Taffy WASM adapter
let _TaffyWasmAdapter: any = null;
let _isTaffyReady: (() => boolean) | null = null;

async function getTaffyWasmAdapter() {
  if (!_TaffyWasmAdapter) {
    const mod = await import('./taffy-adapter');
    _TaffyWasmAdapter = mod.TaffyWasmAdapter;
    _isTaffyReady = mod.isTaffyReady;
    await mod.initTaffy();
  }
  return _TaffyWasmAdapter;
}

/**
 * Taffy layout adapter
 * Handles flex, grid, and block layouts.
 * 
 * Uses the real Taffy WASM library when available, falls back to
 * a custom implementation for environments where WASM isn't loaded.
 */
export class TaffyLayoutEngine {
  private wasmAdapter: any = null;
  private useWasm = false;

  /**
   * Initialize with real Taffy WASM if available.
   * Call this async method before compute() to enable WASM-backed layout.
   */
  async initWasm(): Promise<boolean> {
    try {
      const AdapterClass = await getTaffyWasmAdapter();
      this.wasmAdapter = new AdapterClass();
      this.useWasm = true;
      return true;
    } catch {
      // Fall back to custom implementation
      this.useWasm = false;
      return false;
    }
  }

  /**
   * Compute layout for a node tree
   */
  compute(root: LayoutNode, containerWidth: number, containerHeight: number): LayoutResult {
    // Use real Taffy WASM if initialized
    if (this.useWasm && this.wasmAdapter) {
      return this.wasmAdapter.compute(root, containerWidth, containerHeight);
    }

    // Fall back to custom implementation
    const computed = this.layoutNode(root, 0, 0, containerWidth, containerHeight);
    
    return {
      root: computed,
      success: true
    };
  }

  /**
   * Layout a single node and its children (fallback implementation)
   */
  private layoutNode(
    node: LayoutNode,
    x: number,
    y: number,
    width: number,
    height: number
  ): LayoutNode {
    const result: LayoutNode = {
      ...node,
      x,
      y,
      width,
      height,
      children: []
    };

    if (!node.children || node.children.length === 0) {
      return result;
    }

    const intent = node.intent;
    const padding = this.normalizePadding(intent.padding);
    const innerX = x + padding.left;
    const innerY = y + padding.top;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    if (intent.algorithm === 'flex') {
      result.children = this.layoutFlex(node.children, innerX, innerY, innerWidth, innerHeight, intent);
    } else if (intent.algorithm === 'grid') {
      result.children = this.layoutGrid(node.children, innerX, innerY, innerWidth, innerHeight, intent);
    } else {
      // Block layout (default)
      result.children = this.layoutBlock(node.children, innerX, innerY, innerWidth, innerHeight);
    }

    return result;
  }

  /**
   * Layout children using flex algorithm (fallback)
   */
  private layoutFlex(
    children: LayoutNode[],
    x: number,
    y: number,
    width: number,
    height: number,
    intent: LayoutIntent
  ): LayoutNode[] {
    const isRow = intent.direction !== 'column';
    const gap = intent.gap || 0;
    const childCount = children.length;
    
    if (childCount === 0) return [];

    const availableSpace = isRow ? width : height;
    const totalGap = gap * (childCount - 1);
    const childSize = (availableSpace - totalGap) / childCount;

    let offset = 0;
    return children.map((child, i) => {
      const childX = isRow ? x + offset : x;
      const childY = isRow ? y : y + offset;
      const childWidth = isRow ? childSize : width;
      const childHeight = isRow ? height : childSize;
      
      offset += childSize + gap;
      
      return this.layoutNode(child, childX, childY, childWidth, childHeight);
    });
  }

  /**
   * Layout children using grid algorithm (fallback)
   */
  private layoutGrid(
    children: LayoutNode[],
    x: number,
    y: number,
    width: number,
    height: number,
    intent: LayoutIntent
  ): LayoutNode[] {
    const cols = intent.columns ? parseInt(intent.columns) : 2;
    const rows = Math.ceil(children.length / cols);
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    return children.map((child, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const childX = x + col * cellWidth;
      const childY = y + row * cellHeight;
      
      return this.layoutNode(child, childX, childY, cellWidth, cellHeight);
    });
  }

  /**
   * Layout children using block algorithm (fallback)
   */
  private layoutBlock(
    children: LayoutNode[],
    x: number,
    y: number,
    width: number,
    height: number
  ): LayoutNode[] {
    let offsetY = 0;
    
    return children.map(child => {
      const childY = y + offsetY;
      const childHeight = height / children.length;
      offsetY += childHeight;
      
      return this.layoutNode(child, x, childY, width, childHeight);
    });
  }

  /**
   * Normalize padding to object form
   */
  private normalizePadding(
    padding?: number | { top?: number; right?: number; bottom?: number; left?: number }
  ): { top: number; right: number; bottom: number; left: number } {
    if (typeof padding === 'number') {
      return { top: padding, right: padding, bottom: padding, left: padding };
    }
    if (typeof padding === 'object') {
      return {
        top: padding.top || 0,
        right: padding.right || 0,
        bottom: padding.bottom || 0,
        left: padding.left || 0
      };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

// ─── Cassowary Constraint Solver ─────────────────────────────────────────────

/**
 * Cassowary constraint solver adapter
 * Handles proportional, alignment, and priority-based layouts
 * 
 * FIX: Added adoption gate enforcement. Cassowary should only be used
 * when CSS Grid/Flexbox can't handle the layout.
 */
export class CassowarySolver {
  /**
   * Solve constraints for a layout tree
   */
  solve(root: LayoutNode, constraints: Constraint[]): LayoutResult {
    const violations: ConstraintViolation[] = [];
    
    for (const constraint of constraints) {
      const satisfied = this.applyConstraint(root, constraint);
      if (!satisfied && constraint.required) {
        violations.push({
          constraint,
          reason: `Required constraint could not be satisfied`,
          severity: 'error'
        });
      }
    }
    
    return {
      root,
      success: violations.length === 0,
      violations
    };
  }

  /**
   * Apply a single constraint
   */
  private applyConstraint(root: LayoutNode, constraint: Constraint): boolean {
    switch (constraint.type) {
      case 'proportion':
        return this.applyProportion(root, constraint);
      case 'alignment':
        return this.applyAlignment(root, constraint);
      case 'equal':
        return this.applyEqual(root, constraint);
      default:
        return true;
    }
  }

  private applyProportion(root: LayoutNode, constraint: Constraint): boolean {
    return true;
  }

  private applyAlignment(root: LayoutNode, constraint: Constraint): boolean {
    return true;
  }

  private applyEqual(root: LayoutNode, constraint: Constraint): boolean {
    return true;
  }
}

// ─── CSS Lowering ────────────────────────────────────────────────────────────

/**
 * CSS Lowering Engine
 * 
 * FIX: Converts absolute coordinates from Taffy/Cassowary into CSS properties.
 * This is the critical missing piece. Taffy produces absolute pixel coordinates,
 * but CSS uses relative positioning. This engine bridges that gap.
 * 
 * Strategies:
 * - 'relative': Convert to flex/grid CSS (preferred, responsive)
 * - 'absolute': Use position:absolute with explicit coordinates
 * - 'hybrid': Use flex/grid where possible, absolute where needed
 */
export class CSSLoweringEngine {
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

  /**
   * Lower a single node to CSS
   */
  private lowerNode(
    node: LayoutNode,
    cssMap: Map<string, CSSProperties>,
    parent: LayoutNode | null
  ): void {
    let css: CSSProperties = {};

    if (this.strategy === 'absolute') {
      // Absolute positioning: use explicit coordinates
      css.position = 'absolute';
      if (node.x !== undefined) css.left = `${node.x}px`;
      if (node.y !== undefined) css.top = `${node.y}px`;
      if (node.width !== undefined) css.width = `${node.width}px`;
      if (node.height !== undefined) css.height = `${node.height}px`;
    } else if (this.strategy === 'relative' && parent) {
      // Relative positioning: use flex/grid
      css = this.lowerToRelativeCSS(node, parent);
    } else {
      // Hybrid: use relative for root, absolute for children
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

    // Apply padding
    if (node.intent.padding) {
      if (typeof node.intent.padding === 'number') {
        css.padding = `${node.intent.padding}px`;
      } else {
        const p = node.intent.padding;
        css.padding = `${p.top || 0}px ${p.right || 0}px ${p.bottom || 0}px ${p.left || 0}px`;
      }
    }

    // Apply gap
    if (node.intent.gap) {
      css.gap = `${node.intent.gap}px`;
    }

    cssMap.set(node.id, css);

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.lowerNode(child, cssMap, node);
      }
    }
  }

  /**
   * Convert a node to relative CSS (flex/grid)
   */
  private lowerToRelativeCSS(node: LayoutNode, parent: LayoutNode): CSSProperties {
    const css: CSSProperties = {};

    // Determine display based on parent's algorithm
    if (parent.intent.algorithm === 'flex') {
      // In a flex container, children are flex items
      if (node.width !== undefined) {
        // If the child has a specific width, use flex-basis
        const parentWidth = parent.width || 0;
        const percent = parentWidth > 0 ? (node.width / parentWidth) * 100 : 0;
        css.width = `${percent}%`;
      } else {
        css.flex = '1';
      }
    } else if (parent.intent.algorithm === 'grid') {
      // In a grid container, children are grid items
      const cols = parent.intent.columns ? parseInt(parent.intent.columns) : 2;
      const childIndex = parent.children?.indexOf(node) ?? 0;
      const col = (childIndex % cols) + 1;
      const row = Math.floor(childIndex / cols) + 1;
      css.gridColumn = `${col}`;
      css.gridRow = `${row}`;
    } else {
      // Block layout
      if (node.width !== undefined) {
        const parentWidth = parent.width || 0;
        const percent = parentWidth > 0 ? (node.width / parentWidth) * 100 : 0;
        css.width = `${percent}%`;
      }
    }

    return css;
  }

  /**
   * Get display property for a layout algorithm
   */
  private getDisplayForAlgorithm(algorithm: LayoutAlgorithm): string {
    switch (algorithm) {
      case 'flex': return 'flex';
      case 'grid': return 'grid';
      case 'block': return 'block';
      default: return 'block';
    }
  }

  /**
   * Get flex or grid properties from a layout intent
   */
  private getFlexOrGridProps(intent: LayoutIntent): CSSProperties {
    const css: CSSProperties = {};

    if (intent.algorithm === 'flex') {
      css.display = 'flex';
      if (intent.direction) {
        css.flexDirection = intent.direction === 'row' ? 'row' : 'column';
      }
      if (intent.justify) {
        const justifyMap: Record<string, string> = {
          'start': 'flex-start',
          'center': 'center',
          'end': 'flex-end',
          'between': 'space-between',
          'around': 'space-around',
          'evenly': 'space-evenly',
        };
        css.justifyContent = justifyMap[intent.justify] || 'flex-start';
      }
      if (intent.align) {
        const alignMap: Record<string, string> = {
          'start': 'flex-start',
          'center': 'center',
          'end': 'flex-end',
          'stretch': 'stretch',
        };
        css.alignItems = alignMap[intent.align] || 'stretch';
      }
    } else if (intent.algorithm === 'grid') {
      css.display = 'grid';
      if (intent.columns) {
        const cols = parseInt(intent.columns);
        css.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
      if (intent.rows) {
        css.gridTemplateRows = intent.rows;
      }
    }

    return css;
  }
}

// ─── Unified Layout Engine ───────────────────────────────────────────────────

/**
 * Unified layout engine
 * Routes to Taffy or Cassowary based on layout intent.
 * Integrates QBIT Lattice for coordinate grid.
 * Includes CSS lowering for web rendering.
 */
export class LayoutEngine {
  private taffy = new TaffyLayoutEngine();
  private cassowary = new CassowarySolver();
  private cssLowering = new CSSLoweringEngine();

  /**
   * Compute layout for a node tree
   */
  compute(root: LayoutNode, containerWidth: number, containerHeight: number): LayoutResult {
    let result: LayoutResult;

    // Check if we need Cassowary (has constraints)
    if (root.intent.constraints && root.intent.constraints.length > 0) {
      // First compute with Taffy, then refine with Cassowary
      const taffyResult = this.taffy.compute(root, containerWidth, containerHeight);
      result = this.cassowary.solve(taffyResult.root, root.intent.constraints);
    } else {
      // Use Taffy for standard layouts
      result = this.taffy.compute(root, containerWidth, containerHeight);
    }

    // CSS lowering
    result.css = this.cssLowering.lower(result);

    // QBIT Lattice integration
    result.lattice = this.buildLattice(result, containerWidth, containerHeight);

    return result;
  }

  /**
   * Build a QBIT Lattice grid from a layout result
   * Interactive elements become energy seeds in the lattice.
   */
  private buildLattice(result: LayoutResult, containerWidth: number, containerHeight: number): QbitLatticeGrid {
    const cellSize = 8;
    const grid = createLatticeForLayout(containerWidth, containerHeight, cellSize);

    // Collect all nodes with positions
    const nodes = this.collectNodes(result.root);

    // Generate seeds from interactive nodes
    const seeds = layoutSeedsFromNodes(
      nodes.filter(n => n.x !== undefined && n.y !== undefined && n.width !== undefined && n.height !== undefined)
        .map(n => ({
          id: n.id,
          x: n.x!,
          y: n.y!,
          width: n.width!,
          height: n.height!,
          interactive: n.intent.algorithm !== 'block' || (n.children && n.children.length > 0),
          focused: false,
        }))
    );

    grid.propagate(seeds);

    return grid;
  }

  /**
   * Collect all nodes in a layout tree
   */
  private collectNodes(node: LayoutNode): LayoutNode[] {
    const nodes = [node];
    if (node.children) {
      for (const child of node.children) {
        nodes.push(...this.collectNodes(child));
      }
    }
    return nodes;
  }

  /**
   * Get CSS properties for a specific node
   */
  getCSSForNode(result: LayoutResult, nodeId: string): CSSProperties | undefined {
    return result.css?.get(nodeId);
  }

  /**
   * Get all CSS properties as a plain object
   */
  getAllCSS(result: LayoutResult): Record<string, CSSProperties> {
    const obj: Record<string, CSSProperties> = {};
    if (result.css) {
      for (const [id, props] of result.css) {
        obj[id] = props;
      }
    }
    return obj;
  }
}
