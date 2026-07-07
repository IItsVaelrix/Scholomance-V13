package divtube.process;

import divtube.download.DownloadProgressListener;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ProcessEventParser {
    
    // Example: [download]   6.1% of  246.27KiB at   14.45MiB/s ETA 00:00
    // The previous pattern used \\s (literal backslash + s) instead of \s, so it
    // never matched real yt-dlp output and no progress events were ever emitted.
    private static final Pattern PROGRESS_PATTERN = Pattern.compile(
        "\\[download\\]\\s+([0-9.]+)%\\s+of\\s+\\S+\\s+at\\s+(.+?)\\s+ETA\\s+(\\S+)"
    );

    public static void parseDownloadProgress(String line, DownloadProgressListener listener) {
        if (listener == null || line == null || !line.contains("[download]")) {
            return;
        }

        Matcher matcher = PROGRESS_PATTERN.matcher(line);
        if (matcher.find()) {
            try {
                String percentStr = matcher.group(1);
                double percent = Double.parseDouble(percentStr);
                
                String speed = matcher.group(2) != null ? matcher.group(2) : "Unknown speed";
                String eta = matcher.group(3) != null ? matcher.group(3) : "Unknown ETA";
                
                listener.onProgress(percent, speed, eta);
            } catch (NumberFormatException ignored) {
                // Safely ignore parsing failures to maintain stability
            }
        }
    }
}
