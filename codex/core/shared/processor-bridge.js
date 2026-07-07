/**
 * UNIFIED PROCESSOR BRIDGE
 *
 * Consistent async interface for microprocessors across environments.
 * - Browser: offloads to WebWorker, falls back gracefully on failure.
 * - Node.js: executes directly via factory (lazy import avoids bundling Node APIs in browser).
 */

// Safe fallback results — keep the pipeline alive when a processor fails
const FALLBACKS = {
  'pixel.trace':    () => ({ coordinates: [] }),
  'pixel.resample': ({ pixelData, dimensions }) => ({ pixelData, dimensions }),
  'pixel.quantize': ({ colors }) => ({ quantizedColors: Array.isArray(colors) ? colors : [] }),
  'pixel.decode':   () => ({ pixelData: new Uint8ClampedArray(0), dimensions: { width: 0, height: 0 } }),
};

// AMP runtime imports (lazy to avoid bundling issues)
let ampRuntime = null;

async function getAmpRuntime() {
  if (!ampRuntime) {
    ampRuntime = await import('../../runtime/amp.pipeline.js');
  }
  return ampRuntime;
}

async function executeDirect(id, payload, context) {
  const { verseIRMicroprocessors } = await import('../microprocessors/index.js');
  return verseIRMicroprocessors.execute(id, payload, context);
}

async function executePipelineDirect(sequence, payload, context) {
  const { verseIRMicroprocessors } = await import('../microprocessors/index.js');
  return verseIRMicroprocessors.executePipeline(sequence, payload, context);
}

class ProcessorBridge {
  async execute(id, payload, context = {}, options = {}) {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      // Browser: use worker, then the same registered processor directly.
      try {
        const { workerClient } = await import('./microprocessor.worker-client.js');
        return await workerClient.execute(id, payload, context, options);
      } catch (err) {
        console.warn(`[ProcessorBridge] Worker failed for [${id}] — executing directly. Reason: ${err.message}`);
        try {
          return await executeDirect(id, payload, context);
        } catch (directErr) {
          console.warn(`[ProcessorBridge] Direct execution failed for [${id}]. Reason: ${directErr.message}`);
          const fallback = FALLBACKS[id];
          if (fallback) return fallback(payload, context);
          throw directErr;
        }
      }
    } else {
      // Node.js (or browser without Worker support): lazy import avoids bundling Node-only APIs
      return executeDirect(id, payload, context);
    }
  }

  async executePipeline(sequence, payload, context = {}, options = {}) {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const { workerClient } = await import('./microprocessor.worker-client.js');
        return await workerClient.executePipeline(sequence, payload, context, options);
      } catch (err) {
        console.warn(`[ProcessorBridge] Worker pipeline failed [${sequence.join(' → ')}] — executing directly. Reason: ${err.message}`);
        return executePipelineDirect(sequence, payload, context);
      }
    } else {
      return executePipelineDirect(sequence, payload, context);
    }
  }
}

export const processorBridge = new ProcessorBridge();
