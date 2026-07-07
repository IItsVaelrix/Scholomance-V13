import ffmpeg from 'fluent-ffmpeg';

/**
 * Extracts per-frame RMS volume data from an audio/video file.
 * Uses astats to compute RMS levels across frames.
 * 
 * @param {string} filePath - Path to the media file
 * @param {number} fps - The target framerate for the analysis
 * @returns {Promise<number[]>} Array of RMS volume levels (0-1) per frame
 */
export function executeFfmpegRmsExtraction(filePath, fps) {
  return new Promise((resolve, reject) => {
    const frameDuration = 1 / fps;
    const rmsData = [];
    let stderrData = '';
    
    // aresample ensures the sample rate is uniform
    // astats with length=frameDuration segments the audio to output stats per frame
    // ametadata prints the lavfi.astats.Overall.RMS_level key
    ffmpeg(filePath)
      .outputOptions([
        '-vn', // no video
        '-af', `aresample=44100,astats=metadata=1:reset=1:length=${frameDuration},ametadata=print:key=lavfi.astats.Overall.RMS_level`,
        '-f', 'null'
      ])
      .on('stderr', (stderrLine) => {
         // Accumulate stderr output, as event can trigger on partial chunks
         stderrData += stderrLine;
      })
      .on('end', () => {
         const regex = /lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/g;
         let match;
         while ((match = regex.exec(stderrData)) !== null) {
            let db = parseFloat(match[1]);
            // clamp -Infinity or NaN
            if (db === -Infinity || isNaN(db)) db = -100;
            
            // Convert dB to linear (0.0 to 1.0)
            let linear = Math.pow(10, db / 20);
            rmsData.push(linear);
         }
         resolve(rmsData);
      })
      .on('error', reject)
      .output('/dev/null')
      .run();
  });
}

/**
 * Extracts multi-band volume data (bass, mid, treble) per frame.
 * (Placeholder for more complex multi-pass or filtergraph DSP)
 * 
 * @param {string} filePath - Path to the media file
 * @param {number} fps - Target framerate
 * @returns {Promise<Object>} Object containing bass, mid, and treble arrays
 */
export function executeFfmpegBandExtraction(filePath, fps) {
  return new Promise((resolve) => {
     // Resolving with empty arrays for Phase 2 as the focus is primary RMS
     resolve({
       bass: [],
       mid: [],
       treble: []
     });
  });
}

/**
 * Extracts complete deterministic audio analysis record for a media file.
 * 
 * @param {string} filePath - Path to the media file
 * @param {number} fps - Video framerate for synchronised frame indices
 * @returns {Promise<Object>} AudioAnalysisRecord payload
 */
export async function extractAudioAnalysis(filePath, fps) {
  const rms = await executeFfmpegRmsExtraction(filePath, fps);
  const bands = await executeFfmpegBandExtraction(filePath, fps);

  return {
    fps,
    channels: {
      rms,
      bass: bands.bass,
      mid: bands.mid,
      treble: bands.treble,
    },
  };
}
