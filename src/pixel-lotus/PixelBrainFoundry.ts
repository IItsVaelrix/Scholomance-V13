/**
 * PixelBrainFoundry
 * Square Enix-style chibi sprite generator.
 * Uses foundry assets (e.g. icy-holy-fire-chestplate.1x.png) as base references.
 */
const FOUNDRY_PATH = '/home/deck/Downloads/Scholomance-V12-main/output/foundry';

export class PixelBrainFoundry {
  readonly style = 'square-enix-chibi' as const;
  readonly headRatio = 0.55;
  readonly bodyRatio = 0.35;
  readonly palette = ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#f5f5f5', '#ffd700'];

  constructor(private readonly seed: number = Date.now()) {}

  private getFoundryAsset(item: string) {
    return `${FOUNDRY_PATH}/${item}/${item}.1x.png`;
  }

  generateChibiSprite(characterName: string, variant: 'hero' | 'villain' | 'npc' = 'hero', baseAsset = 'icy-holy-fire-chestplate') {
    return {
      id: `${characterName.toLowerCase().replace(/\s+/g, '-')}-${variant}-${this.seed}`,
      style: this.style,
      proportions: { head: this.headRatio, body: this.bodyRatio, eyes: 0.18 },
      palette: this.palette,
      variant,
      baseAsset: this.getFoundryAsset(baseAsset),
      renderHint: 'pixel-perfect-32x48',
    };
  }

  batchGenerate(names: string[], variant: 'hero' | 'villain' | 'npc' = 'hero', baseAsset = 'icy-holy-fire-chestplate') {
    return names.map((n) => this.generateChibiSprite(n, variant, baseAsset));
  }
}

export const pixelBrainFoundry = new PixelBrainFoundry();
