import { describe, it, expect, vi } from 'vitest';
import { generateAssetProxy } from '../asset-proxy-worker.mjs';
import { extractAudioAnalysis, executeFfmpegRmsExtraction } from '../audio-analysis-worker.mjs';

// Mock fluent-ffmpeg and fs to prevent actual system calls during unit tests
vi.mock('fs', async () => {
  const actualFs = await vi.importActual('fs');
  return {
    ...actualFs,
    default: {
      promises: {
        readFile: vi.fn().mockResolvedValue(Buffer.from('mock-file-content'))
      }
    }
  };
});

vi.mock('fluent-ffmpeg', () => {
  const ffmpegMock = Object.assign(function() {
    return {
      outputOptions: vi.fn().mockReturnThis(),
      output: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation(function(event, callback) {
        if (event === 'stderr') {
            callback('lavfi.astats.Overall.RMS_level=-20.0\nlavfi.astats.Overall.RMS_level=-10.0');
        }
        if (event === 'end') {
            setTimeout(() => callback(), 10);
        }
        return this;
      }),
      run: vi.fn().mockReturnThis()
    };
  }, {
    ffprobe: vi.fn((path, cb) => {
      cb(null, {
        streams: [{
          codec_type: 'video',
          width: 3840,
          height: 2160,
          r_frame_rate: '30/1'
        }],
        format: { duration: 10 }
      });
    })
  });
  return { default: ffmpegMock };
});

describe('Asset Proxy Worker', () => {
  it('should generate a proxy and return valid asset metadata', async () => {
    const result = await generateAssetProxy('mock.mp4', '/tmp/output');
    
    expect(result).toBeDefined();
    expect(result.status).toBe('ready');
    expect(result.proxyUrl).toContain('_proxy_');
    expect(result.width).toBe(3840);
    expect(result.height).toBe(2160);
    expect(result.durationFrames).toBe(300);
    expect(result.hash).toBeDefined();
  });
});

describe('Audio Analysis Worker', () => {
  it('should extract per-frame RMS data and convert dB to linear', async () => {
    const analysis = await extractAudioAnalysis('mock.mp4', 30);
    
    expect(analysis).toBeDefined();
    expect(analysis.fps).toBe(30);
    expect(analysis.channels.rms).toHaveLength(2);
    // -20dB = 0.1, -10dB ~ 0.316
    expect(analysis.channels.rms[0]).toBeCloseTo(0.1);
    expect(analysis.channels.rms[1]).toBeCloseTo(0.31622776601683794);
  });
});
