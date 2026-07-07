/**
 * RESONANCE GRID BRIDGE
 * 
 * Provides BPM quantization and resonance sidecar integration for gear-glide-amp.
 * Bridges sparse animation keyframes (from resonance.json) into continuous functions.
 */

export function compileGrid(sidecar) {
  if (!sidecar) return null;

  const { sync, channels, frames } = sidecar;
  const bpm = sync?.bpm || 120;
  const analysisOffsetMs = sync?.analysisOffsetMs || 0;
  
  const downbeatsMs = sync?.downbeatsMs || [];
  const beatPeriod = 60000 / bpm;
  
  const anchors = [];
  let cumulativeBeats = 0;
  
  for (let i = 0; i < downbeatsMs.length; i++) {
    const d = downbeatsMs[i];
    if (i > 0) {
      const prevD = downbeatsMs[i - 1];
      const interval = d - prevD;
      // Re-lock to an exact integer beat count at every downbeat
      cumulativeBeats += Math.round(interval / beatPeriod);
    }
    anchors.push({
      time: d,
      beats: cumulativeBeats
    });
  }

  // Optimize per-channel frame extraction for fast lookup
  const sortedFrames = (frames || []).slice().sort((a, b) => a.timeMs - b.timeMs);
  const channelData = {};

  if (channels) {
    for (const channelPath of Object.keys(channels)) {
      const channelFrames = [];
      for (const frame of sortedFrames) {
        const val = getNestedValue(frame, channelPath);
        if (val !== undefined) {
          channelFrames.push({ timeMs: frame.timeMs, value: val });
        }
      }
      channelData[channelPath] = channelFrames;
    }
  }

  return {
    anchors,
    channels: channels || {},
    channelData,
    bpm,
    analysisOffsetMs
  };
}

export function fractionalBeatAt(grid, timeMs) {
  if (!grid || !grid.anchors || grid.anchors.length === 0) {
    // Fallback if no grid: scalar BPM integration
    const bpm = grid?.bpm || 90;
    const offset = grid?.analysisOffsetMs || 0;
    const t = timeMs - offset;
    return (bpm / 60000) * t;
  }

  const { anchors, bpm, analysisOffsetMs } = grid;
  const t = timeMs - analysisOffsetMs;

  if (t < anchors[0].time) {
    const dt = t - anchors[0].time;
    return anchors[0].beats + (bpm / 60000) * dt;
  }

  const lastAnchor = anchors[anchors.length - 1];
  if (t >= lastAnchor.time) {
    const dt = t - lastAnchor.time;
    return lastAnchor.beats + (bpm / 60000) * dt;
  }

  // Binary search for interval
  let low = 0;
  let high = anchors.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (anchors[mid].time <= t) {
      if (mid === anchors.length - 1 || anchors[mid + 1].time > t) {
        const d_i = anchors[mid];
        const d_next = anchors[mid + 1];
        const ratio = (t - d_i.time) / (d_next.time - d_i.time);
        return d_i.beats + (d_next.beats - d_i.beats) * ratio;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  return 0; // Should not be reached
}

export function sampleChannel(grid, channelPath, timeMs) {
  if (!grid || !grid.channels || !grid.channelData) return 0;
  
  const channelDef = grid.channels[channelPath];
  const interpolation = channelDef?.interpolation || 'linear';
  const defValue = channelDef?.default !== undefined ? channelDef.default : 0;
  
  const frames = grid.channelData[channelPath] || [];
  if (frames.length === 0) return defValue;
  
  const t = timeMs - grid.analysisOffsetMs;
  
  if (t < frames[0].timeMs) return defValue;
  if (t >= frames[frames.length - 1].timeMs) return frames[frames.length - 1].value;
  
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].timeMs <= t) {
      if (mid === frames.length - 1 || frames[mid + 1].timeMs > t) {
        const f1 = frames[mid];
        const f2 = frames[mid + 1];
        
        if (interpolation === 'step') {
          return f1.value;
        }
        
        const ratio = (t - f1.timeMs) / (f2.timeMs - f1.timeMs);
        return f1.value + (f2.value - f1.value) * ratio;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  return defValue;
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}
