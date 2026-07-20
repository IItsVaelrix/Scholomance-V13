/**
 * Renderer Layer - DOM primary; Canvas hybrid; Skia/Vello stubs (no WASM).
 *
 * DOM + native CSS is the primary web reference target.
 * Canvas 2D hosts creative attachments. Skia WASM is skipped (Phase 10).
 *
 * @module compose/render
 */

import type { SceneGraph, SceneNode } from '../scene';
import type { Material, Transform } from '../scene';

export type { RendererBackendId, RendererBackendInfo } from './capabilities';
export {
  listRendererBackends,
  negotiateRenderer,
  negotiateSceneCapabilities,
} from './capabilities';
export type { SemanticGeometry, GeometryCompareResult } from './geometry';
export { compareSemanticGeometry } from './geometry';
export type { SceneAttachment, HybridMountResult, HybridHostOptions } from './hybrid-host';
export { mountHybridAttachment, collectSceneAttachments } from './hybrid-host';
export { probeSkiaAdapter } from './skia-adapter';
export { probeVelloAdapter } from './vello-adapter';
export { renderSceneToDomSpec, type DomNodeSpec } from './dom-adapter';

/**
 * Render target - where to render the scene
 */
export type RenderTarget = 'dom' | 'canvas' | 'skia' | 'webgl' | 'vello';

/**
 * Render options
 */
export type RenderOptions = {
  /** Target rendering backend */
  target: RenderTarget;
  /** Container element (for DOM) */
  container?: HTMLElement;
  /** Canvas element (for canvas/skia/webgl) */
  canvas?: HTMLCanvasElement;
  /** Pixel ratio for high-DPI displays */
  pixelRatio?: number;
  /** Whether to enable accessibility features */
  accessibility?: boolean;
  /** Custom CSS class prefix */
  classPrefix?: string;
};

/**
 * Renderer interface
 */
export interface Renderer {
  /**
   * Render a scene graph
   */
  render(scene: SceneGraph, options: RenderOptions): void;
  
  /**
   * Update a rendered scene
   */
  update(scene: SceneGraph): void;
  
  /**
   * Destroy the renderer and clean up
   */
  destroy(): void;
}

/**
 * DOM Renderer - primary web renderer
 * Renders scene graphs to DOM elements with CSS styling
 */
export class DOMRenderer implements Renderer {
  private container: HTMLElement | null = null;
  private rootElement: HTMLElement | null = null;
  private nodeMap = new Map<string, HTMLElement>();

  /**
   * Render a scene graph to the DOM
   */
  render(scene: SceneGraph, options: RenderOptions): void {
    if (!options.container) {
      throw new Error('DOM renderer requires a container element');
    }

    this.container = options.container;
    this.rootElement = this.renderNode(scene.root, options);
    this.container.appendChild(this.rootElement);
  }

  /**
   * Update a rendered scene
   */
  update(scene: SceneGraph): void {
    if (!this.rootElement || !this.container) {
      throw new Error('Renderer not initialized');
    }

    // Clear and re-render (simplified - real implementation would diff)
    this.container.innerHTML = '';
    this.nodeMap.clear();
    this.rootElement = this.renderNode(scene.root, { target: 'dom', container: this.container });
    this.container.appendChild(this.rootElement);
  }

  /**
   * Destroy the renderer
   */
  destroy(): void {
    if (this.rootElement && this.container) {
      this.container.removeChild(this.rootElement);
    }
    this.nodeMap.clear();
    this.container = null;
    this.rootElement = null;
  }

  /**
   * Render a scene node to a DOM element
   */
  private renderNode(node: SceneNode, options: RenderOptions): HTMLElement {
    const element = document.createElement('div');
    element.id = node.id;
    this.nodeMap.set(node.id, element);

    // Apply position and size
    if (node.x !== undefined) element.style.left = `${node.x}px`;
    if (node.y !== undefined) element.style.top = `${node.y}px`;
    if (node.width !== undefined) element.style.width = `${node.width}px`;
    if (node.height !== undefined) element.style.height = `${node.height}px`;

    // Apply material
    if (node.material) {
      this.applyMaterial(element, node.material);
    }

    // Apply transform
    if (node.transform) {
      this.applyTransform(element, node.transform);
    }

    // Apply accessibility
    if (options.accessibility !== false) {
      if (node.ariaLabel) element.setAttribute('aria-label', node.ariaLabel);
      if (node.ariaRole) element.setAttribute('role', node.ariaRole);
    }

    // Apply visibility
    if (node.visible === false) {
      element.style.display = 'none';
    }

    // Render children
    if (node.children) {
      for (const child of node.children) {
        const childElement = this.renderNode(child, options);
        element.appendChild(childElement);
      }
    }

    // Render text content
    if (node.type === 'text' && node.text) {
      element.textContent = node.text;
    }

    // Render image
    if (node.type === 'image' && node.src) {
      const img = document.createElement('img');
      img.src = node.src;
      img.style.width = '100%';
      img.style.height = '100%';
      element.appendChild(img);
    }

    return element;
  }

  /**
   * Apply material properties to an element
   */
  private applyMaterial(element: HTMLElement, material: Material): void {
    if (material.fill) element.style.backgroundColor = material.fill;
    if (material.stroke) element.style.borderColor = material.stroke;
    if (material.strokeWidth) element.style.borderWidth = `${material.strokeWidth}px`;
    if (material.opacity !== undefined) element.style.opacity = String(material.opacity);
    if (material.shadow) element.style.boxShadow = material.shadow;
    
    if (material.borderRadius) {
      if (typeof material.borderRadius === 'number') {
        element.style.borderRadius = `${material.borderRadius}px`;
      } else {
        const { topLeft = 0, topRight = 0, bottomRight = 0, bottomLeft = 0 } = material.borderRadius;
        element.style.borderRadius = `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`;
      }
    }

    if (material.gradient) {
      const stops = material.gradient.stops
        .map(s => `${s.color} ${s.offset * 100}%`)
        .join(', ');
      
      if (material.gradient.type === 'linear') {
        const angle = material.gradient.angle || 0;
        element.style.background = `linear-gradient(${angle}deg, ${stops})`;
      } else {
        element.style.background = `radial-gradient(circle, ${stops})`;
      }
    }
  }

  /**
   * Apply transform to an element
   */
  private applyTransform(element: HTMLElement, transform: Transform): void {
    const transforms: string[] = [];
    
    if (transform.translate) {
      transforms.push(`translate(${transform.translate.x}px, ${transform.translate.y}px)`);
    }
    if (transform.rotate !== undefined) {
      transforms.push(`rotate(${transform.rotate}deg)`);
    }
    if (transform.scale) {
      transforms.push(`scale(${transform.scale.x}, ${transform.scale.y})`);
    }
    
    if (transforms.length > 0) {
      element.style.transform = transforms.join(' ');
    }
    
    if (transform.origin) {
      element.style.transformOrigin = `${transform.origin.x}px ${transform.origin.y}px`;
    }
  }

  /**
   * Get a rendered element by ID
   */
  getElement(id: string): HTMLElement | undefined {
    return this.nodeMap.get(id);
  }
}

/**
 * Canvas Renderer - renders to HTML5 Canvas
 * Stub implementation for future Skia/WebGL migration
 */
export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * Render a scene graph to canvas
   */
  render(scene: SceneGraph, options: RenderOptions): void {
    if (!options.canvas) {
      throw new Error('Canvas renderer requires a canvas element');
    }

    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    
    if (!this.ctx) {
      throw new Error('Failed to get 2D context');
    }

    this.renderNode(scene.root);
  }

  /**
   * Update a rendered scene
   */
  update(scene: SceneGraph): void {
    if (!this.ctx || !this.canvas) {
      throw new Error('Renderer not initialized');
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Re-render
    this.renderNode(scene.root);
  }

  /**
   * Destroy the renderer
   */
  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Render a scene node to canvas
   */
  private renderNode(node: SceneNode): void {
    if (!this.ctx) return;

    this.ctx.save();

    // Apply transform
    if (node.transform) {
      if (node.transform.translate) {
        this.ctx.translate(node.transform.translate.x, node.transform.translate.y);
      }
      if (node.transform.rotate !== undefined) {
        this.ctx.rotate((node.transform.rotate * Math.PI) / 180);
      }
      if (node.transform.scale) {
        this.ctx.scale(node.transform.scale.x, node.transform.scale.y);
      }
    }

    // Apply material
    if (node.material) {
      if (node.material.fill) {
        this.ctx.fillStyle = node.material.fill;
      }
      if (node.material.stroke) {
        this.ctx.strokeStyle = node.material.stroke;
      }
      if (node.material.strokeWidth) {
        this.ctx.lineWidth = node.material.strokeWidth;
      }
      if (node.material.opacity !== undefined) {
        this.ctx.globalAlpha = node.material.opacity;
      }
    }

    // Render based on type
    if (node.type === 'rectangle' && node.width && node.height) {
      if (node.material?.fill) {
        this.ctx.fillRect(node.x || 0, node.y || 0, node.width, node.height);
      }
      if (node.material?.stroke) {
        this.ctx.strokeRect(node.x || 0, node.y || 0, node.width, node.height);
      }
    } else if (node.type === 'circle' && node.width && node.height) {
      const radius = Math.min(node.width, node.height) / 2;
      const cx = (node.x || 0) + node.width / 2;
      const cy = (node.y || 0) + node.height / 2;
      
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (node.material?.fill) this.ctx.fill();
      if (node.material?.stroke) this.ctx.stroke();
    } else if (node.type === 'text' && node.text) {
      this.ctx.fillStyle = node.material?.fill || '#000';
      this.ctx.fillText(node.text, node.x || 0, node.y || 0);
    }

    // Render children
    if (node.children) {
      for (const child of node.children) {
        this.renderNode(child);
      }
    }

    this.ctx.restore();
  }
}

/**
 * Skia stub renderer — never loads WASM; paints via Canvas 2D fallback.
 */
export class SkiaStubRenderer implements Renderer {
  private inner = new CanvasRenderer();
  private warned = false;

  render(scene: SceneGraph, options: RenderOptions): void {
    if (!this.warned && typeof console !== 'undefined') {
      console.info(
        '[compose/render] Skia WASM skipped (Phase 10); using Canvas 2D fallback',
      );
      this.warned = true;
    }
    this.inner.render(scene, { ...options, target: 'canvas' });
  }

  update(scene: SceneGraph): void {
    this.inner.update(scene);
  }

  destroy(): void {
    this.inner.destroy();
  }
}

/**
 * Vello stub — experimental, no-op destroy-safe renderer.
 */
export class VelloStubRenderer implements Renderer {
  render(_scene: SceneGraph, _options: RenderOptions): void {
    // Experimental unshipped — lawful no-op
  }

  update(_scene: SceneGraph): void {
    // no-op
  }

  destroy(): void {
    // no-op
  }
}

/**
 * Create a renderer based on target.
 * `skia` → Canvas 2D fallback (no WASM). `vello` → experimental no-op.
 */
export function createRenderer(target: RenderTarget): Renderer {
  switch (target) {
    case 'dom':
      return new DOMRenderer();
    case 'canvas':
    case 'webgl':
      return new CanvasRenderer();
    case 'skia':
      return new SkiaStubRenderer();
    case 'vello':
      return new VelloStubRenderer();
    default:
      throw new Error(`Unsupported render target: ${target}`);
  }
}
