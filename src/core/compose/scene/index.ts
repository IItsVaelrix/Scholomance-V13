/**
 * Scene Graph Layer - WAND integration
 * 
 * Keeps geometry and material meaning independent from the renderer.
 * The scene graph is the intermediate representation between semantic
 * components and visual rendering.
 * 
 * @module compose/scene
 */

import type { LayoutNode } from '../layout';
import type { ComponentState } from '../schema/ComponentSchema';

/**
 * Scene node types
 */
export type SceneNodeType = 
  | 'container'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'path'
  | 'text'
  | 'image'
  | 'group'
  | 'component';

/**
 * Material - visual appearance properties
 */
export type Material = {
  /** Fill color (CSS color string or token reference) */
  fill?: string;
  /** Stroke color */
  stroke?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Shadow */
  shadow?: string;
  /** Border radius */
  borderRadius?: number | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number };
  /** Background gradient */
  gradient?: {
    type: 'linear' | 'radial';
    stops: Array<{ color: string; offset: number }>;
    angle?: number;
  };
};

/**
 * Transform - geometric transformation
 */
export type Transform = {
  /** Translation */
  translate?: { x: number; y: number };
  /** Rotation (degrees) */
  rotate?: number;
  /** Scale */
  scale?: { x: number; y: number };
  /** Origin point for transformations */
  origin?: { x: number; y: number };
};

/**
 * Scene node - a node in the scene graph
 */
export type SceneNode = {
  /** Unique identifier */
  id: string;
  /** Node type */
  type: SceneNodeType;
  /** Position (from layout) */
  x?: number;
  y?: number;
  /** Size (from layout) */
  width?: number;
  height?: number;
  /** Material properties */
  material?: Material;
  /** Geometric transformation */
  transform?: Transform;
  /** Child nodes */
  children?: SceneNode[];
  /** Text content (for text nodes) */
  text?: string;
  /** Image source (for image nodes) */
  src?: string;
  /** Path data (for path nodes) */
  path?: string;
  /** Component reference (for component nodes) */
  componentId?: string;
  /** Component state (for component nodes) */
  componentState?: ComponentState;
  /** Custom properties */
  props?: Record<string, unknown>;
  /** Accessibility label */
  ariaLabel?: string;
  /** Accessibility role */
  ariaRole?: string;
  /** Whether this node is interactive */
  interactive?: boolean;
  /** Whether this node is visible */
  visible?: boolean;
};

/**
 * Scene graph - complete visual representation
 */
export type SceneGraph = {
  /** Root node */
  root: SceneNode;
  /** Scene metadata */
  metadata?: {
    /** Scene name */
    name?: string;
    /** Scene description */
    description?: string;
    /** Canvas size */
    width?: number;
    height?: number;
    /** Background color */
    background?: string;
  };
};

/**
 * Scene builder - fluent API for building scene graphs
 */
export class SceneBuilder {
  private root: SceneNode;
  private currentPath: SceneNode[] = [];

  constructor() {
    this.root = {
      id: 'root',
      type: 'container',
      children: []
    };
    this.currentPath = [this.root];
  }

  /**
   * Add a container node
   */
  container(id: string, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'container',
      children: [],
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Add a rectangle node
   */
  rectangle(id: string, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'rectangle',
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Add a circle node
   */
  circle(id: string, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'circle',
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Add a text node
   */
  text(id: string, content: string, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'text',
      text: content,
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Add an image node
   */
  image(id: string, src: string, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'image',
      src,
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Add a component node
   */
  component(id: string, componentId: string, state?: ComponentState, props?: Partial<SceneNode>): SceneBuilder {
    const node: SceneNode = {
      id,
      type: 'component',
      componentId,
      componentState: state,
      ...props
    };
    this.addChild(node);
    return this;
  }

  /**
   * Enter a node (make it the current parent)
   */
  enter(id: string): SceneBuilder {
    const current = this.currentPath[this.currentPath.length - 1];
    const child = current.children?.find(c => c.id === id);
    if (child) {
      this.currentPath.push(child);
    } else {
      throw new Error(`Node ${id} not found`);
    }
    return this;
  }

  /**
   * Exit to parent node
   */
  exit(): SceneBuilder {
    if (this.currentPath.length > 1) {
      this.currentPath.pop();
    }
    return this;
  }

  /**
   * Build the scene graph
   */
  build(): SceneGraph {
    return {
      root: this.root,
      metadata: {
        name: 'Scene',
        width: this.root.width,
        height: this.root.height
      }
    };
  }

  /**
   * Add a child to the current node
   */
  private addChild(node: SceneNode): void {
    const current = this.currentPath[this.currentPath.length - 1];
    if (!current.children) {
      current.children = [];
    }
    current.children.push(node);
  }
}

/**
 * Convert a layout tree to a scene graph
 */
export function layoutToScene(layout: LayoutNode): SceneGraph {
  function convert(node: LayoutNode): SceneNode {
    const sceneNode: SceneNode = {
      id: node.id,
      type: 'container',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      children: node.children?.map(convert)
    };
    return sceneNode;
  }

  return {
    root: convert(layout),
    metadata: {
      width: layout.width,
      height: layout.height
    }
  };
}

/**
 * Create a scene builder
 */
export function createSceneBuilder(): SceneBuilder {
  return new SceneBuilder();
}
