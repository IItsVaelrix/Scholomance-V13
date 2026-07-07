/**
 * Example Phaser 4 Scene for the Floating Ritual Arena tiles.
 *
 * Usage:
 *   import { FloatingArenaScene } from '...';
 *   // in game config
 *   scene: [FloatingArenaScene]
 */

export class FloatingArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FloatingArenaScene' });
  }

  preload() {
    const base = 'assets/aspirations/floating-arena/tiles';

    // Floor tileset (atlas)
    this.load.atlas('arena-floor', `${base}/phaser4/arena-floor-tileset.png`, `${base}/phaser4/arena-floor-atlas.json`);

    // Special large elements (use base pixel art or swap for enhanced jpg)
    this.load.image('central-circle', `${base}/base-pixelart/central-circle-base-png.png`);
    this.load.image('edge-border', `${base}/base-pixelart/edge-ice-border-png.png`);
    this.load.image('crystal-prop', `${base}/base-pixelart/prop-crystal-cluster-png.png`);

    // Layout data
    this.load.json('arena-layout', `${base}/placements/arena-layout-v1.json`);
  }

  create() {
    const layout = this.cache.json.get('arena-layout');
    const tileSize = layout.tileSize || 64;

    this.cameras.main.setBackgroundColor('#0a0f1f');

    // --- Floor tiles ---
    (layout.floorTiles || []).forEach((tile) => {
      const x = tile.gridX * tileSize;
      const y = tile.gridY * tileSize;

      // frame name matches the keys in our atlas (rune-01-star, etc.)
      const img = this.add.image(x, y, 'arena-floor', tile.type);
      img.setOrigin(0, 0);
    });

    // --- Edges ---
    (layout.edges || []).forEach((edge) => {
      const x = edge.gridX * tileSize;
      const y = edge.gridY * tileSize;
      const img = this.add.image(x, y, 'edge-border');
      img.setOrigin(0, 0);
      if (edge.rotation) img.setRotation(Phaser.Math.DegToRad(edge.rotation));
    });

    // --- Props ---
    (layout.props || []).forEach((prop) => {
      const x = prop.gridX * tileSize;
      const y = prop.gridY * tileSize;
      const img = this.add.image(x, y, 'crystal-prop');
      img.setOrigin(0.5, 1); // typical bottom anchor for props
      if (prop.scale) img.setScale(prop.scale);
    });

    // --- Central ritual circle (special large feature) ---
    const center = (layout.features || []).find(f => f.type === 'central-circle-base');
    if (center) {
      const cx = center.gridX * tileSize;
      const cy = center.gridY * tileSize;
      const circle = this.add.image(cx, cy, 'central-circle');
      circle.setDepth(10);
    }

    // Optional: simple interaction / camera
    this.cameras.main.centerOn(4 * tileSize, 3.5 * tileSize);
    this.cameras.main.setZoom(0.8);

    this.add.text(20, 20, 'Floating Ritual Arena - Phaser 4\n(Pixel art bases + layout)', {
      fontSize: '16px',
      color: '#a0d8ff'
    });
  }
}

// For direct use without modules:
// new Phaser.Game({ ... scene: [FloatingArenaScene] });
