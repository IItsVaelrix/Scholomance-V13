import { beforeAll } from 'vitest';
import { createCanvas } from 'canvas';

/**
 * tests/setup.js stubs every HTMLCanvasElement 2D context as a no-op jest mock
 * for textarea cursor-measurement tests. Call this in a describe block that
 * needs a real 2D context (pixel reads/writes, toDataURL) to swap in
 * node-canvas for that file only — vitest isolates DOM globals per test file,
 * so this never leaks into other suites.
 */
export function installRealCanvas() {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function realGetContext(type) {
      if (type !== '2d') return null;
      this.__nodeCanvas = createCanvas(this.width, this.height);
      return this.__nodeCanvas.getContext('2d');
    };
    HTMLCanvasElement.prototype.toDataURL = function realToDataURL(...args) {
      return this.__nodeCanvas.toDataURL(...args);
    };
  });
}
