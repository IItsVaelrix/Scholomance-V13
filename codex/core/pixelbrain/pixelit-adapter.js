export class PixelItAdapter {
  constructor(pixelItInstance) {
    this.pixelit = pixelItInstance;
  }

  async processImage(imageSource, options = {}) {
    if (!this.pixelit) {
      throw new Error('PixelIt library not provided. Cannot process image.');
    }

    // This adapts a third-party pixelation library into the workflow safely.
    // PixelIt generates pixelated canvas image data.
    
    // Example wrapper usage (assuming standard PixelIt API):
    this.pixelit.setDrawTo(options.targetCanvas || null);
    this.pixelit.setDrawFrom(imageSource);
    
    if (options.scale) {
      this.pixelit.setScale(options.scale);
    }
    if (options.palette) {
      this.pixelit.setPalette(options.palette);
      this.pixelit.colorPalette();
    }
    
    // Execute drawing and pixelation
    const resultCanvas = this.pixelit.draw().pixelate();
    
    return resultCanvas;
  }
}
