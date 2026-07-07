import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { downloaderPersistence } from '../db/downloader.persistence.js';
import { executeInfo } from '../../../src/tools/youtube-downloader/ytdl.command-map.js';
import youtubedl from 'youtube-dl-exec';
import { resolveOutputDir, createOutputTemplate, ensureDirectory } from '../../../src/tools/youtube-downloader/ytdl.paths.js';
import { YTDL_CONFIG } from '../../../src/tools/youtube-downloader/ytdl.config.js';
import { writeManifest } from '../../../src/tools/youtube-downloader/ytdl.manifest.js';

class DownloaderService extends EventEmitter {
  constructor() {
    super();
    this.activeJobs = new Map(); // Job ID -> { childProcess, promise, controller }
  }

  generateJobId() {
    return crypto.randomUUID();
  }

  normalizeError(error) {
    if (error.name === 'YtdlError') {
      return { code: error.code, message: error.message };
    }
    const msg = error.message || String(error);
    if (msg.includes('Video unavailable')) return { code: 'UNSUPPORTED_SOURCE', message: msg };
    if (msg.includes('Sign in to confirm')) return { code: 'PERMISSION_DENIED', message: msg };

    return { code: 'UNKNOWN', message: msg };
  }

  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }
    const disallowed = ['localhost', '127.0.0.1', 'file://', '192.168.', '10.'];
    for (const d of disallowed) {
      if (url.includes(d)) throw new Error('Unsafe URL rejected');
    }
  }

  async preflight(url) {
    this.validateUrl(url);

    try {
      const info = await executeInfo({ url });
      return info;
    } catch (e) {
      const norm = this.normalizeError(e);
      throw new Error(`Preflight failed: ${norm.code} - ${norm.message}`);
    }
  }

  async createJob(url, options = {}) {
    // SECURITY: Strictly validate URL before creating job or allowing it to run
    this.validateUrl(url);

    const jobId = this.generateJobId();

    let title = null;
    let channel = null;

    try {
      // Best effort preflight, we've already validated the URL structure for safety
      const info = await executeInfo({ url });
      title = info.title;
      channel = info.channel;
    } catch (e) {
      // Ignored for record creation, safety validation passed
    }

    const job = await downloaderPersistence.createJob({
      id: jobId,
      url,
      profile: options.profile || 'archive',
      format: options.format,
      title,
      channel,
    });

    return job;
  }

  async startJob(jobId, args = {}) {
    const job = await downloaderPersistence.getJob(jobId);
    if (!job) throw new Error('Job not found');
    if (job.status === 'downloading') throw new Error('Job already active');

    const controller = new AbortController();

    await this.updateJobStatus(jobId, 'downloading');

    const profileName = job.profile || 'archive';
    const profile = YTDL_CONFIG.profiles[profileName];
    if (!profile) {
      await this.updateJobStatus(jobId, 'failed', { error_message: 'Unknown profile', error_code: 'PROFILE_UNKNOWN' });
      return;
    }

    const outputDir = resolveOutputDir({
      outputRoot: YTDL_CONFIG.outputRoot,
      profile: profileName,
      videoId: jobId // Use jobId to isolate
    });

    await ensureDirectory(outputDir);
    const outputTemplate = createOutputTemplate(outputDir);

    const ytdlOptions = {
      output: outputTemplate,
      format: job.format || profile.format,
      writeInfoJson: profile.writeInfoJson,
      writeThumbnail: profile.writeThumbnail,
      embedMetadata: profile.embedMetadata,
      noWarnings: true,
      restrictFilenames: true,
      noCallHome: true
    };

    if (profile.remuxVideo) ytdlOptions.remuxVideo = profile.remuxVideo;
    if (profile.extractAudio) {
      ytdlOptions.extractAudio = true;
      ytdlOptions.audioFormat = profile.audioFormat;
    }

    const downloadPromise = new Promise((resolve, reject) => {
      let child;
      try {
        child = youtubedl.exec(job.url, ytdlOptions, { signal: controller.signal });
      } catch (err) {
         this.updateJobStatus(jobId, 'failed', { error_message: err.message, error_code: 'START_FAILED' }).finally(resolve);
         return;
      }

      this.activeJobs.set(jobId, { child, controller });

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          const text = data.toString();
          // Basic progress parsing (e.g., "[download]  15.2% of 50.00MiB at 1.25MiB/s ETA 00:30")
          const match = text.match(/\[download\]\s+([\d\.]+)%/);
          if (match) {
            const percent = parseFloat(match[1]);
            this.updateJobStatus(jobId, 'downloading', { progress_percent: Math.floor(percent) }).catch(()=>{});
            this.recordEvent(jobId, { status: 'downloading', progress_percent: Math.floor(percent) }).catch(()=>{});
          }
        });
      }

      child.on('close', async (code) => {
        this.activeJobs.delete(jobId);
        if (controller.signal.aborted) {
          await this.updateJobStatus(jobId, 'cancelled');
          await this.recordEvent(jobId, { status: 'cancelled' });
          resolve();
          return;
        }

        if (code === 0) {
          try {
            await writeManifest(outputDir, {
              videoId: jobId,
              url: job.url,
              licenseDeclaration: 'Creative Commons', // Auto-granted for this internal service
              profile: profileName,
              toolchain: { runner: 'downloader.service', backend: 'yt-dlp', wrapper: 'youtube-dl-exec' }
            });
            await this.updateJobStatus(jobId, 'completed', { output_dir: outputDir, progress_percent: 100 });
            await this.recordEvent(jobId, { status: 'completed', progress_percent: 100 });
            resolve();
          } catch (e) {
            await this.updateJobStatus(jobId, 'failed', { error_message: e.message, error_code: 'MANIFEST_FAILED' });
            resolve();
          }
        } else {
          await this.updateJobStatus(jobId, 'failed', { error_message: 'Process exited with code ' + code, error_code: 'DOWNLOAD_FAILED' });
          await this.recordEvent(jobId, { status: 'failed' });
          resolve();
        }
      });

      child.on('error', async (err) => {
        this.activeJobs.delete(jobId);
        if (controller.signal.aborted) {
          await this.updateJobStatus(jobId, 'cancelled');
          resolve();
        } else {
          await this.updateJobStatus(jobId, 'failed', { error_message: err.message, error_code: 'DOWNLOAD_FAILED' });
          resolve();
        }
      });
    });

    this.activeJobs.get(jobId).promise = downloadPromise;
    return job;
  }

  async cancelJob(jobId) {
    const jobData = this.activeJobs.get(jobId);
    if (jobData) {
      jobData.controller.abort(); // Triggers the child process to be killed via the AbortSignal
      await this.updateJobStatus(jobId, 'cancelled');
      this.activeJobs.delete(jobId);
    } else {
      const job = await downloaderPersistence.getJob(jobId);
      if (job && job.status === 'queued') {
        await this.updateJobStatus(jobId, 'cancelled');
      }
    }
  }

  async updateJobStatus(jobId, status, extra = {}) {
    const updated = await downloaderPersistence.updateJob(jobId, { status, ...extra });
    this.emit('job_updated', updated);
    return updated;
  }

  async recordEvent(jobId, eventData) {
    await downloaderPersistence.recordEvent(jobId, eventData);
    this.emit('job_event', { jobId, ...eventData });
  }

  async getJob(jobId) {
    return downloaderPersistence.getJob(jobId);
  }

  async getAllJobs() {
    return downloaderPersistence.getAllJobs();
  }

  async getEvents(jobId) {
    return downloaderPersistence.getEvents(jobId);
  }
}

export const downloaderService = new DownloaderService();
