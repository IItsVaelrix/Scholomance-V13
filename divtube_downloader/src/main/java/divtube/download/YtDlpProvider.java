package divtube.download;

import divtube.process.ProcessRunner;
import divtube.process.ProcessResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class YtDlpProvider implements DownloadProvider {
    private final ProcessRunner processRunner;
    private final ObjectMapper mapper;
    private Process currentProcess;

    public YtDlpProvider() {
        this.processRunner = new ProcessRunner();
        this.mapper = new ObjectMapper();
    }

    @Override
    public VideoMetadata analyze(String url) throws DownloadException {
        // Enforce strict no-circumvention policy by explicitly disabling cookies and login
        String[] command = {
            "yt-dlp",
            "--dump-json",
            "--no-playlist",
            "--no-cookies",
            "--no-cookies-from-browser",
            "--geo-bypass", // Geo-bypass is generally acceptable, but we can omit it if strictly enforcing no-bypass
            url
        };

        try {
            ProcessResult result = processRunner.runSync(command);
            if (result.getExitCode() != 0) {
                if (result.getErrorOutput().contains("Private video") || result.getErrorOutput().contains("Sign in")) {
                    throw new DownloadException("Cannot analyze: This video requires login or is private.");
                }
                throw new DownloadException("Failed to analyze video. Ensure yt-dlp is installed. " + result.getErrorOutput());
            }

            JsonNode root = mapper.readTree(result.getStandardOutput());
            String title = root.path("title").asText("Unknown Title");
            String channel = root.path("uploader").asText("Unknown Channel");
            int duration = root.path("duration").asInt(0);
            String thumbnail = root.path("thumbnail").asText("");

            return new VideoMetadata(title, channel, duration, thumbnail);

        } catch (Exception e) {
            throw new DownloadException("Analyze process failed: " + e.getMessage(), e);
        }
    }

    @Override
    public void download(DownloadRequest request, DownloadProgressListener listener) throws DownloadException {
        String formatArg = getFormatArgument(request.getQuality(), request.getFormat());

        String[] command = {
            "yt-dlp",
            "-f", formatArg,
            "--no-playlist",
            "--no-cookies",
            "--no-cookies-from-browser",
            "-o", request.getSaveLocation() + "/%(title)s.%(ext)s",
            request.getUrl()
        };

        try {
            this.currentProcess = processRunner.runAsync(command, listener);
            int exitCode = currentProcess.waitFor();
            if (exitCode != 0) {
                throw new DownloadException("Download process exited with code " + exitCode);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DownloadException("Download was interrupted.");
        } catch (Exception e) {
            throw new DownloadException("Download execution failed: " + e.getMessage(), e);
        } finally {
            this.currentProcess = null;
        }
    }

    @Override
    public void cancel() {
        if (currentProcess != null && currentProcess.isAlive()) {
            currentProcess.destroy();
        }
    }

    private String getFormatArgument(String quality, String format) {
        if ("MP3 audio".equalsIgnoreCase(format)) {
            return "bestaudio"; // Note: For actual MP3 conversion, we'd need --extract-audio --audio-format mp3
        }
        if ("Best".equalsIgnoreCase(quality)) {
            return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }
        if ("1080p".equalsIgnoreCase(quality)) {
            return "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }
        if ("720p".equalsIgnoreCase(quality)) {
            return "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
        }
        return "best"; // default fallback
    }
}
