import ffmpeg from 'fluent-ffmpeg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generates a 720p proxy for a video asset, preserving aspect ratio,
 * and computes a stable cryptographic hash from the original file bytes.
 * 
 * @param {string} inputPath - Path to the original uploaded video asset.
 * @param {string} outputDir - Directory to store the proxy.
 * @returns {Promise<Object>} Metadata about the processed asset.
 */
export async function generateAssetProxy(inputPath, outputDir) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Compute stable cryptographic hash
      const fileBuffer = await fs.promises.readFile(inputPath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const fileName = path.basename(inputPath);
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      
      const proxyFileName = `${baseName}_proxy_${hash.substring(0, 8)}.mp4`;
      const proxyPath = path.join(outputDir, proxyFileName);

      // 2. Extract metadata with ffprobe
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
            return reject(new Error('No video stream found'));
        }

        const width = videoStream.width;
        const height = videoStream.height;
        const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate;
        let fps = 30;
        if (fpsStr && fpsStr.includes('/')) {
            const [num, den] = fpsStr.split('/');
            if (den && parseInt(den) > 0) {
               fps = parseInt(num) / parseInt(den);
            }
        } else if (fpsStr) {
            fps = parseFloat(fpsStr);
        }
        
        const duration = metadata.format.duration;
        const durationFrames = Math.floor(duration * fps);
        const aspectRatio = width && height ? `${width}:${height}` : undefined;

        // 3. Generate 720p proxy preserving aspect ratio
        ffmpeg(inputPath)
          .outputOptions([
            // scale=-2:720 ensures width is even (h264 requirement) and height is 720
            // This maintains the original aspect ratio automatically
            '-vf scale=-2:720',
            '-c:v libx264',
            '-crf 23',
            '-preset fast',
            '-c:a aac',
            '-b:a 128k'
          ])
          .output(proxyPath)
          .on('end', () => {
            resolve({
              originalUrl: inputPath,
              proxyUrl: proxyPath,
              hash: hash,
              width: width, // returning original dimensions for the registry
              height: height,
              durationFrames: durationFrames,
              fps: fps,
              aspectRatio: aspectRatio,
              status: 'ready'
            });
          })
          .on('error', (err) => {
            reject(err);
          })
          .run();
      });
    } catch (error) {
      reject(error);
    }
  });
}
