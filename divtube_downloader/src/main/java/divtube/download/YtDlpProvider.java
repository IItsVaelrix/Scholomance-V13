package divtube.download;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import divtube.process.ProcessResult;
import divtube.process.ProcessRunner;
import divtube.validation.SavePathValidator;
import divtube.validation.YouTubeUrlValidator;
import java.nio.file.Path;

public class YtDlpProvider implements DownloadProvider {
    private final ProcessRunner processRunner;
    private final ObjectMapper mapper;
    // Written on the download thread, read by cancel() from the UI thread —
    // volatile for safe cross-thread publication under the JMM.
    private volatile Process currentProcess;

    public YtDlpProvider() {
        this.processRunner = new ProcessRunner();
        this.mapper = new ObjectMapper();
    }

    @Override
    public VideoMetadata analyze(String url) throws DownloadException {
        // Enforced here as well as in the UI: MainViewController validates on the
        // analyze path only, so download() would otherwise hand an arbitrary
        // string to yt-dlp. The sink is the last place every caller must pass.
        requireYouTubeUrl(url);

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

        } catch (DownloadException e) {
            // Already the right type with the right message (e.g. "This video
            // requires login or is private.") — don't re-wrap and blur it
            // into a generic "Analyze process failed: ..." string.
            throw e;
        } catch (Exception e) {
            throw new DownloadException("Analyze process failed: " + e.getMessage(), e);
        }
    }

    @Override
    public void download(DownloadRequest request, DownloadProgressListener listener) throws DownloadException {
        requireYouTubeUrl(request.getUrl());

        // Validate before anything is spawned: an unusable save location used to
        // reach Path.of and come back as "Download execution failed: null".
        final Path outputDir;
        try {
            outputDir = SavePathValidator.resolve(request.getSaveLocation());
        } catch (IllegalArgumentException e) {
            throw new DownloadException(e.getMessage());
        }

        String formatArg = getFormatArgument(request.getQuality(), request.getFormat());
        boolean audioOnly = "MP3 audio".equalsIgnoreCase(request.getFormat());

        java.util.List<String> command = new java.util.ArrayList<>();
        command.add("yt-dlp");
        command.add("--newline"); // emit each progress tick on its own line so it can be parsed live
        command.add("-f");
        command.add(formatArg);
        if (audioOnly) {
            // Extract and re-encode to MP3 (requires ffmpeg on PATH).
            command.add("--extract-audio");
            command.add("--audio-format");
            command.add("mp3");
        }
        command.add("--no-playlist");
        command.add("--no-cookies");
        command.add("--no-cookies-from-browser");
        command.add("-o");
        command.add(Path.of(outputDir.toString(), "%(title)s.%(ext)s").toString());
        command.add(request.getUrl());

        try {
            this.currentProcess = processRunner.runAsync(command.toArray(new String[0]), listener);
            int exitCode = currentProcess.waitFor();
            if (exitCode != 0) {
                throw new DownloadException("Download process exited with code " + exitCode);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DownloadException("Download was interrupted.");
        } catch (DownloadException e) {
            // Same symmetry fix as analyze(): don't blur an already-correct
            // message (e.g. "Download process exited with code 5") into a
            // generic "Download execution failed: ..." wrapper.
            throw e;
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

    /**
     * Single choke point for the URL that becomes a process argument. Uses the
     * parsed-authority validator, so a lookalike host is refused here even if a
     * caller forgot to (or was never shown a text box to) validate first.
     */
    private static void requireYouTubeUrl(String url) throws DownloadException {
        if (!YouTubeUrlValidator.isValid(url)) {
            throw new DownloadException("Not a supported YouTube link: "
                + YouTubeUrlValidator.describe(url));
        }
    }

    private String getFormatArgument(String quality, String format) {
        if ("MP3 audio".equalsIgnoreCase(format)) {
            // Select the best audio stream; download() adds --extract-audio
            // --audio-format mp3 to re-encode it to MP3 via ffmpeg.
            return "bestaudio";
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
