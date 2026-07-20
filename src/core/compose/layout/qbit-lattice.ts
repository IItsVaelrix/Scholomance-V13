/**
 * QBIT Lattice Grid - Coordinate Foundation for Compose Layout
 * 
 * Uses the QBIT field model from PixelBrain as the deterministic coordinate
 * grid for UI layout. Every layout node gets an implicit coordinate in the
 * lattice, enabling spatial reasoning, energy-based material assignment,
 * and gradient-driven spatial relationships.
 * 
 * The QBIT Lattice provides:
 * - Deterministic spatial addressing (every cell has an implicit coordinate)
 * - Energy-based material assignment (threshold-driven)
 * - Gradient computation for spatial relationships
 * - 3D coordinate support (x, y, z) for layered UI
 * 
 * @module compose/layout/qbit-lattice
 */

/**
 * QBIT Lattice coordinate - deterministic spatial address
 * Every point in the lattice has a unique (x, y, z) coordinate.
 */
export type LatticeCoord = {
  x: number;
  y: number;
  z: number;
};

/**
 * QBIT Lattice cell - a single cell in the grid
 * Contains energy value and optional material assignment.
 */
export type LatticeCell = {
  coord: LatticeCoord;
  energy: number;
  materialId: number;
};

/**
 * QBIT material thresholds - maps energy to material identity
 * Mirrors the PixelBrain material system.
 */
export const LATTICE_MATERIAL_THRESHOLDS = Object.freeze([
  { materialId: 0, name: 'void', threshold: -Infinity, color: 'transparent' },
  { materialId: 1, name: 'surface', threshold: 0.00, color: 'var(--token-color-surface)' },
  { materialId: 2, name: 'elevated', threshold: 0.25, color: 'var(--token-color-elevated)' },
  { materialId: 3, name: 'interactive', threshold: 0.50, color: 'var(--token-color-interactive)' },
  { materialId: 4, name: 'focus', threshold: 0.70, color: 'var(--token-color-focus)' },
]);

/**
 * Attenuation models for energy propagation
 */
export const LATTICE_ATTENUATION = Object.freeze({
  LINEAR: 'linear',
  GAUSSIAN: 'gaussian',
  INVERSE_SQUARE: 'inverse_square',
} as const);

export type LatticeAttenuation = typeof LATTICE_ATTENUATION[keyof typeof LATTICE_ATTENUATION];

/**
 * Lattice seed - a source point that emits energy into the grid
 */
export type LatticeSeed = {
  coord: LatticeCoord;
  energy: number;
  radius: number;
  attenuation: LatticeAttenuation;
};

/**
 * QBIT Lattice Grid - deterministic coordinate system for layout
 * 
 * The grid provides:
 * 1. Spatial addressing: every (x,y,z) maps to a unique cell
 * 2. Energy propagation: seeds emit energy that fills the grid
 * 3. Material assignment: energy thresholds determine material identity
 * 4. Gradient computation: spatial derivatives for layout decisions
 */
export class QbitLatticeGrid {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  private energyBuffer: Float32Array;
  private materialBuffer: Uint8Array;

  constructor(width: number, height: number, depth: number = 1) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    const totalCells = width * height * depth;
    this.energyBuffer = new Float32Array(totalCells);
    this.materialBuffer = new Uint8Array(totalCells);
  }

  /**
   * Get the flat index for a 3D coordinate
   */
  private indexOf(x: number, y: number, z: number): number {
    return y * this.width * this.depth + z * this.width + x;
  }

  /**
   * Check if a coordinate is within bounds
   */
  inBounds(coord: LatticeCoord): boolean {
    return (
      coord.x >= 0 && coord.x < this.width &&
      coord.y >= 0 && coord.y < this.height &&
      coord.z >= 0 && coord.z < this.depth
    );
  }

  /**
   * Get energy at a coordinate
   * Floors the coordinates to the nearest integer cell.
   */
  energyAt(coord: LatticeCoord): number {
    const x = Math.floor(coord.x);
    const y = Math.floor(coord.y);
    const z = Math.floor(coord.z);
    if (!this.inBounds({ x, y, z })) return 0;
    return this.energyBuffer[this.indexOf(x, y, z)];
  }

  /**
   * Get material ID at a coordinate
   * Floors the coordinates to the nearest integer cell.
   */
  materialAt(coord: LatticeCoord): number {
    const x = Math.floor(coord.x);
    const y = Math.floor(coord.y);
    const z = Math.floor(coord.z);
    if (!this.inBounds({ x, y, z })) return 0;
    return this.materialBuffer[this.indexOf(x, y, z)];
  }

  /**
   * Assign material based on energy value
   */
  private assignMaterial(energy: number): number {
    for (let i = LATTICE_MATERIAL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (energy >= LATTICE_MATERIAL_THRESHOLDS[i].threshold) {
        return LATTICE_MATERIAL_THRESHOLDS[i].materialId;
      }
    }
    return 0;
  }

  /**
   * Propagate energy from seeds into the grid
   * Uses the specified attenuation model for each seed.
   */
  propagate(seeds: LatticeSeed[]): void {
    // Reset buffers
    this.energyBuffer.fill(0);
    this.materialBuffer.fill(0);

    for (const seed of seeds) {
      const { coord: sc, energy: seedEnergy, radius, attenuation } = seed;
      
      // Bounding box for this seed
      const x0 = Math.max(0, Math.floor(sc.x - radius));
      const x1 = Math.min(this.width, Math.ceil(sc.x + radius + 1));
      const y0 = Math.max(0, Math.floor(sc.y - radius));
      const y1 = Math.min(this.height, Math.ceil(sc.y + radius + 1));
      const z0 = Math.max(0, Math.floor(sc.z - radius));
      const z1 = Math.min(this.depth, Math.ceil(sc.z + radius + 1));

      for (let y = y0; y < y1; y++) {
        for (let z = z0; z < z1; z++) {
          for (let x = x0; x < x1; x++) {
            const dx = x - sc.x;
            const dy = y - sc.y;
            const dz = z - sc.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const dist = Math.sqrt(distSq);

            if (dist > radius) continue;

            let contribution: number;
            switch (attenuation) {
              case LATTICE_ATTENUATION.GAUSSIAN:
                contribution = seedEnergy * Math.exp(-dist * 0.15);
                break;
              case LATTICE_ATTENUATION.INVERSE_SQUARE:
                contribution = seedEnergy / (distSq + 1);
                break;
              case LATTICE_ATTENUATION.LINEAR:
              default:
                contribution = seedEnergy * (1 - dist / radius);
                break;
            }

            const idx = this.indexOf(x, y, z);
            this.energyBuffer[idx] = Math.min(1, this.energyBuffer[idx] + contribution);
          }
        }
      }
    }

    // Assign materials based on energy
    for (let i = 0; i < this.energyBuffer.length; i++) {
      this.materialBuffer[i] = this.assignMaterial(this.energyBuffer[i]);
    }
  }

  /**
   * Compute gradient at a coordinate (spatial derivative)
   * Returns the direction of steepest energy increase.
   */
  gradientAt(coord: LatticeCoord): { gx: number; gy: number; gz: number } {
    if (!this.inBounds(coord)) return { gx: 0, gy: 0, gz: 0 };

    const { x, y, z } = coord;
    
    // Central differences
    const xPrev = x > 0 ? this.energyBuffer[this.indexOf(x - 1, y, z)] : this.energyBuffer[this.indexOf(x, y, z)];
    const xNext = x < this.width - 1 ? this.energyBuffer[this.indexOf(x + 1, y, z)] : this.energyBuffer[this.indexOf(x, y, z)];
    
    const yPrev = y > 0 ? this.energyBuffer[this.indexOf(x, y - 1, z)] : this.energyBuffer[this.indexOf(x, y, z)];
    const yNext = y < this.height - 1 ? this.energyBuffer[this.indexOf(x, y + 1, z)] : this.energyBuffer[this.indexOf(x, y, z)];
    
    const zPrev = z > 0 ? this.energyBuffer[this.indexOf(x, y, z - 1)] : this.energyBuffer[this.indexOf(x, y, z)];
    const zNext = z < this.depth - 1 ? this.energyBuffer[this.indexOf(x, y, z + 1)] : this.energyBuffer[this.indexOf(x, y, z)];

    return {
      gx: (xNext - xPrev) / 2,
      gy: (yNext - yPrev) / 2,
      gz: (zNext - zPrev) / 2,
    };
  }

  /**
   * Get all cells with energy above a threshold
   */
  getActiveCells(threshold: number = 0.01): LatticeCell[] {
    const cells: LatticeCell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let z = 0; z < this.depth; z++) {
        for (let x = 0; x < this.width; x++) {
          const idx = this.indexOf(x, y, z);
          const energy = this.energyBuffer[idx];
          if (energy >= threshold) {
            cells.push({
              coord: { x, y, z },
              energy,
              materialId: this.materialBuffer[idx],
            });
          }
        }
      }
    }
    return cells;
  }

  /**
   * Convert lattice coordinates to pixel coordinates
   * Maps the lattice grid to a pixel space for rendering.
   */
  toPixelCoord(coord: LatticeCoord, pixelWidth: number, pixelHeight: number): { px: number; py: number } {
    const scaleX = pixelWidth / this.width;
    const scaleY = pixelHeight / this.height;
    return {
      px: coord.x * scaleX,
      py: coord.y * scaleY,
    };
  }

  /**
   * Convert pixel coordinates to lattice coordinates
   */
  fromPixelCoord(px: number, py: number, pixelWidth: number, pixelHeight: number): LatticeCoord {
    const scaleX = this.width / pixelWidth;
    const scaleY = this.height / pixelHeight;
    return {
      x: Math.floor(px * scaleX),
      y: Math.floor(py * scaleY),
      z: 0,
    };
  }

  /**
   * Get the material name for a material ID
   */
  static getMaterialName(materialId: number): string {
    const entry = LATTICE_MATERIAL_THRESHOLDS.find(t => t.materialId === materialId);
    return entry?.name ?? 'void';
  }

  /**
   * Get the CSS color for a material ID
   */
  static getMaterialColor(materialId: number): string {
    const entry = LATTICE_MATERIAL_THRESHOLDS.find(t => t.materialId === materialId);
    return entry?.color ?? 'transparent';
  }
}

/**
 * Create a lattice grid sized to contain a layout tree
 */
export function createLatticeForLayout(
  containerWidth: number,
  containerHeight: number,
  cellSize: number = 8
): QbitLatticeGrid {
  const gridWidth = Math.ceil(containerWidth / cellSize);
  const gridHeight = Math.ceil(containerHeight / cellSize);
  return new QbitLatticeGrid(gridWidth, gridHeight, 1);
}

/**
 * Generate lattice seeds from a layout node tree
 * Each interactive element becomes a seed with energy proportional to its importance.
 * 
 * If cellSize is provided, coordinates are converted from pixel space to lattice space.
 * If cellSize is not provided, coordinates are used as-is (assumed to be in lattice space).
 */
export function layoutSeedsFromNodes(
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number; interactive?: boolean; focused?: boolean }>,
  cellSize?: number
): LatticeSeed[] {
  const scale = cellSize ? 1 / cellSize : 1;
  
  return nodes.map(node => ({
    coord: {
      x: (node.x + node.width / 2) * scale,
      y: (node.y + node.height / 2) * scale,
      z: 0,
    },
    energy: node.focused ? 1.0 : node.interactive ? 0.7 : 0.3,
    radius: (Math.max(node.width, node.height) / 2) * scale,
    attenuation: (node.focused 
      ? LATTICE_ATTENUATION.GAUSSIAN 
      : LATTICE_ATTENUATION.LINEAR) as LatticeAttenuation,
  }));
}
