export {
  encodeToPhotonicRetina,
} from './retina-adapter.js';

export {
  createPhotonicRetinaPacketCache,
} from './retina-cache.js';

export {
  createRetinaBrushStrokeBatcher,
} from './retina-stream.js';

export {
  RETINA_WORKER_MESSAGE_TYPES,
  createRetinaWorkerEncodeMessage,
  handleRetinaWorkerMessage,
  installRetinaWorkerScope,
} from './retina-worker.js';

export {
  createRetinaDiagnosticsSnapshot,
} from './retina-diagnostics.js';

export {
  createRetinaReplayEntry,
  replayRetinaEntries,
} from './retina-replay.js';

export {
  createLowBitPreview,
  createOpticalSimulation,
  createPacketDelta,
  routeRetinaPacketToPhotonicBridge,
} from './retina-bridge.js';

export {
  cellIndex,
  cellCount,
  cellSignature,
  buildCellSignatures,
  diffCellSignatures,
} from './retina-cell-index.js';

export {
  SHADOW_DELTA_EPSILON,
  diffShadowField,
} from './retina-shadow-field.js';

export {
  assemblePerceptionFrame,
  fullAttendFrame,
} from './retina-perception.js';

// --- LING-0F03 fix: Register photonic bridge for codex/core ---
// codex/core files cannot import from src/ directly. Instead, we register
// the implementations here so codex/core can look them up at runtime.
import { registerPhotonicBridge } from '../../../codex/core/pixelbrain/photonic-bridge-registry.js';
import { routeRetinaPacketToPhotonicBridge } from './retina-bridge.js';
import { buildCellSignatures, diffCellSignatures } from './retina-cell-index.js';
import { diffShadowField } from './retina-shadow-field.js';
import { assemblePerceptionFrame } from './retina-perception.js';

registerPhotonicBridge({
  routeRetinaPacketToPhotonicBridge,
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
});
