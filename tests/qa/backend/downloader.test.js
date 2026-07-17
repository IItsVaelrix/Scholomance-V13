import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ytdl.config to provide the required profiles
vi.mock('../../../src/tools/youtube-downloader/ytdl.config.js', () => ({
  YTDL_CONFIG: {
    outputRoot: '/tmp',
    profiles: {
      archive: { format: 'best', writeInfoJson: true },
      audioSource: { extractAudio: true, audioFormat: 'mp3' }
    }
  }
}));

import { downloaderService } from '../../../codex/server/services/downloader.service.js';

// Mock the downloader module map
vi.mock('../../../src/tools/youtube-downloader/ytdl.command-map.js', () => ({
  executeInfo: vi.fn(),
  executeDownload: vi.fn()
}));

import { executeInfo, executeDownload } from '../../../src/tools/youtube-downloader/ytdl.command-map.js';

// Mock youtube-dl-exec child process output
vi.mock('youtube-dl-exec', () => {
  return {
    default: {
      exec: vi.fn((url, options, { signal }) => {
        let onClose, onError;

        // Setup mock event emitter for stdout
        const stdout = {
          on: vi.fn((event, cb) => {
             // We can mock sending a data event if we want
          })
        };

        const child = {
          stdout,
          on: vi.fn((event, cb) => {
            if (event === 'close') onClose = cb;
            if (event === 'error') onError = cb;
          }),
        };

        if (signal) {
          signal.addEventListener('abort', () => {
             if (onClose) onClose(1); // simulate kill
          });
        }

        // Auto-close mock if it's not canceled immediately
        setTimeout(() => {
          if (!signal.aborted && onClose) onClose(0);
        }, 100);

        return child;
      })
    }
  };
});

describe('DownloaderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('preflight (URL validation & metadata)', () => {
    it('should reject SSRF / unsafe URLs', async () => {
      const unsafeUrls = [
        'http://localhost:8080/video',
        'http://127.0.0.1/video',
        'file:///etc/passwd',
        'http://192.168.1.1/admin',
        'http://10.0.0.1/'
      ];

      for (const url of unsafeUrls) {
        await expect(downloaderService.preflight(url)).rejects.toThrow(/Unsafe URL rejected/);
      }
    });

    it('should fetch metadata for a valid URL', async () => {
      executeInfo.mockResolvedValueOnce({
        title: 'Test Video',
        id: '12345',
        duration: 120,
        channel: 'Test Channel'
      });

      const info = await downloaderService.preflight('https://youtube.com/watch?v=12345');
      expect(info.title).toBe('Test Video');
      expect(info.channel).toBe('Test Channel');
      expect(executeInfo).toHaveBeenCalledWith({ url: 'https://youtube.com/watch?v=12345' });
    });
  });

  describe('job lifecycle', () => {
    it('should explicitly reject SSRF URLs during createJob', async () => {
      await expect(downloaderService.createJob('http://localhost:8080/video')).rejects.toThrow(/Unsafe URL rejected/);
    });

    it('should create a queued job', async () => {
      executeInfo.mockRejectedValueOnce(new Error('Preflight failed but job should still be created'));

      const job = await downloaderService.createJob('https://youtube.com/watch?v=12345', {
        profile: 'audioSource'
      });

      expect(job).toBeDefined();
      expect(job.status).toBe('queued');
      expect(job.url).toBe('https://youtube.com/watch?v=12345');
      expect(job.profile).toBe('audioSource');
    });

    it('should handle successful job execution', async () => {
      executeInfo.mockResolvedValueOnce({
        title: 'Mock Video', channel: 'Mock Channel'
      });

      const job = await downloaderService.createJob('https://youtube.com/watch?v=12345');

      const startedJob = await downloaderService.startJob(job.id);
      expect(startedJob).toBeDefined();

      // Wait for the background promise to settle
      await downloaderService.activeJobs.get(job.id)?.promise;

      const updatedJob = await downloaderService.getJob(job.id);
      expect(updatedJob.status).toBe('completed');
    });

    it('should handle cancellation safely', async () => {
      executeInfo.mockResolvedValueOnce({ title: 'Mock Video', channel: 'Mock Channel' });

      const job = await downloaderService.createJob('https://youtube.com/watch?v=12345');

      await downloaderService.startJob(job.id);

      // It is downloading, let's cancel it
      await downloaderService.cancelJob(job.id);

      // The background promise should catch the abort
      const updatedJob = await downloaderService.getJob(job.id);
      expect(updatedJob.status).toBe('cancelled');
    });
  });
});
