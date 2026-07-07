# Phaser 4 Compatibility for Floating Arena Tiles

## Provided Assets

### 1. Individual Tile Data
- `phaser/*.json` → `scdl-phaser-v1` format (pixels + palette) for every tile. Can be used with custom loaders.
- Base PNGs in `../base-pixelart/*-png.png` (64x64 or appropriate) for clean pixel art textures.

### 2. Tileset Atlas (recommended for performance)
- `arena-floor-tileset.png` — packed spritesheet of all floor rune variants.
- `arena-floor-atlas.json` — Phaser atlas format.
- `arena-floor-tileset.json` — Tiled/Phaser tileset definition (standard format).

### 3. Special Elements (load as images)
- `central-circle-base-png.png` (large)
- `edge-ice-border-png.png`
- `prop-crystal-cluster-png.png`

Use the enhanced JPG versions if you want the AI-upscaled look in final visuals.

### 4. Layout
- `../placements/arena-layout-v1.json` — source of truth for positions.
- See example usage below.

## Loading in Phaser 4 (multiple recommended options)

### 1. Atlas + Layout (most flexible for this irregular arena)
```js
preload() {
  this.load.atlas('arena-floor', 'tiles/phaser4/arena-floor-tileset.png', 'tiles/phaser4/arena-floor-atlas.json');
  this.load.image('central-circle', 'tiles/base-pixelart/central-circle-base-png.png');
  this.load.image('edge-border', 'tiles/base-pixelart/edge-ice-border-png.png');
  this.load.image('crystal-prop', 'tiles/base-pixelart/prop-crystal-cluster-png.png');
  this.load.json('arena-layout', 'tiles/placements/arena-layout-v1.json');
}

create() {
  const layout = this.cache.json.get('arena-layout');
  const ts = layout.tileSize || 64;

  (layout.floorTiles || []).forEach(t => {
    this.add.image(t.gridX * ts, t.gridY * ts, 'arena-floor', t.type).setOrigin(0);
  });

  const center = (layout.features || []).find(f => f.type.includes('central'));
  if (center) this.add.image(center.gridX * ts, center.gridY * ts, 'central-circle').setDepth(10);
}
```

### 2. Standard Phaser Tilemap (Tiled format)
```js
preload() {
  this.load.image('arena-floor-tileset', 'tiles/phaser4/arena-floor-tileset.png');
  this.load.tilemapTiledJSON('arena-map', 'tiles/phaser4/arena-floor-map.json');
}

create() {
  const map = this.make.tilemap({ key: 'arena-map' });
  const tiles = map.addTilesetImage('arena-floor', 'arena-floor-tileset');
  const layer = map.createLayer('Floor', tiles, 0, 0);
}
```

## Using scdl-phaser-v1 data directly (advanced)

You can convert the pixel list into a texture at runtime:

```js
function createTextureFromSCDLPhaser(scene, data, key) {
  const { width, height } = data.canvas;
  const pixels = data.pixels;
  
  const texture = scene.textures.createCanvas(key, width, height);
  const ctx = texture.getContext();
  const imageData = ctx.createImageData(width, height);
  
  // Fill (assumes palette or direct color ints)
  // Simple implementation: treat color as 0xRRGGBB
  for (const p of pixels) {
    const idx = (p.y * width + p.x) * 4;
    const c = p.color;
    imageData.data[idx]     = (c >> 16) & 0xff;
    imageData.data[idx + 1] = (c >> 8) & 0xff;
    imageData.data[idx + 2] = c & 0xff;
    imageData.data[idx + 3] = 255;
  }
  
  ctx.putImageData(imageData, 0, 0);
  texture.refresh();
  return texture;
}
```

## Full Arena Assembly

See `example-phaser-scene.js` for a complete minimal Phaser 4 Scene that assembles the arena from these tiles.

## Notes
- Use base PNGs for pixel-perfect / engine logic.
- Enhanced JPGs for high-fidelity visuals (load the same keys or different "enhanced-" keys).
- Central circle and props are not regular 64x64 tiles — place them as separate images.
- The platform shape is irregular; the layout JSON approximates the visible grid in the reference.
