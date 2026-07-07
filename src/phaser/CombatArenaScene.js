const Phaser = (typeof window !== 'undefined' && window.Phaser)
  ? window.Phaser
  : null;

export default class CombatArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatArenaScene' });
  }

  preload() {
    // Add any necessary preloads here
  }

  create() {
    // Solid obsidian floor
    this.cameras.main.setBackgroundColor('#0a0a12');
    
    // Grid (Indigo, fading out)
    const grid = this.add.grid(0, 0, 10000, 10000, 64, 64, 0x11111A, 1, 0x2E2A5A, 0.25).setOrigin(0.5);

    // Void rift / Glowing Altar
    this.add.circle(400, 400, 150, 0x8B1E3D, 0.15); // Outer glow
    this.add.circle(400, 400, 80, 0x8B1E3D, 0.4); // Inner glow
    this.add.rectangle(400, 400, 60, 60, 0x4A2C6A).setStrokeStyle(4, 0x8B1E3D);
    this.add.text(370, 392, 'VOID', { fontSize: '20px', color: '#A8A8B8', fontFamily: 'monospace' });

    // Some Pillars for cover
    const createPillar = (x, y) => {
      // Base shadow
      this.add.ellipse(x, y + 60, 80, 30, 0x000000, 0.5);
      // Pillar body
      this.add.rectangle(x, y, 64, 128, 0x11111A).setStrokeStyle(2, 0x4A2C6A);
      // Pillar top
      this.add.rectangle(x, y - 64, 64, 20, 0x2E2A5A);
      // Rune
      this.add.text(x - 8, y - 20, '▼', { fontSize: '18px', color: '#A8A8B8' });
    };
    
    createPillar(200, 200);
    createPillar(800, 300);
    createPillar(500, 700);
    createPillar(100, 600);

    // Player (Silver / Crimson)
    this.player = this.add.rectangle(500, 500, 32, 48, 0xA8A8B8);
    this.player.setStrokeStyle(2, 0x8B1E3D);

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.2);

    // Controls
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // Launch the HUD scene simultaneously so it overlays on top
    this.scene.launch('CombatHUDScene');
  }

  update(time, delta) {
    const speed = 400 * (delta / 1000);
    let vx = 0;
    let vy = 0;

    if (this.keys.A.isDown) vx -= speed;
    if (this.keys.D.isDown) vx += speed;
    if (this.keys.W.isDown) vy -= speed;
    if (this.keys.S.isDown) vy += speed;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
    }

    this.player.x += vx;
    this.player.y += vy;
  }
}
