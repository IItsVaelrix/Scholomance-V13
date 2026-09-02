package divtube.validation;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * Validates the directory a download is written to before it is interpolated
 * into the yt-dlp {@code -o} argument.
 *
 * <p>What this defends against: {@code null}/blank reaching {@code Path.of},
 * which produced either an {@code NullPointerException} or an
 * {@code InvalidPathException} and surfaced to the user as the useless string
 * {@code "Download execution failed: null"}. Also embedded NUL bytes, which
 * POSIX {@code execve} silently truncates at — so a location of
 * {@code "/tmp/x\0evil"} would have been handed to the process as
 * {@code "/tmp/x"}.
 *
 * <p>What this deliberately does NOT pretend to defend against: path
 * traversal. This is a desktop app in which the save directory is chosen by
 * the same local user who is already free to write anywhere on their own
 * filesystem, so there is no privilege boundary for {@code ..} to cross. A
 * check that rejected {@code ..} here would be a control that only inconveniences
 * real users while implying a threat model the app does not have. The
 * access-control promise that used to sit on this path was deleted for exactly
 * that reason (see the removal of {@code urlRequiresLoginKnown}); it is not
 * being reintroduced as decoration.
 *
 * <p>The output template itself ({@code %(title)s.%(ext)s}) is yt-dlp's own
 * syntax and is supplied by the application, never by the user.
 */
public final class SavePathValidator {

    private SavePathValidator() {
        // utility
    }

    /**
     * @param rawSaveLocation user-supplied directory, may be relative
     * @return an absolute, normalized path
     * @throws IllegalArgumentException with a user-presentable message when the
     *                                  value cannot be used as a directory
     */
    public static Path resolve(String rawSaveLocation) {
        if (rawSaveLocation == null) {
            throw new IllegalArgumentException("Choose a save location before downloading.");
        }

        // Checked on the RAW value, deliberately before any trimming. This is the
        // subtlety that a first version of this method got wrong: String.trim()
        // removes every character <= U+0020, and NUL is U+0000, so trim() erased a
        // leading or trailing NUL entirely. "/tmp/downloads\0" then resolved
        // happily to "/tmp/downloads" -- a path the user never typed, with the
        // guard downstream of it never seeing anything suspicious. String.strip()
        // is the safe equivalent here because Character.isWhitespace('\0') is
        // false, but the ordering is what actually makes the check airtight.
        if (rawSaveLocation.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("The save location contains invalid characters.");
        }

        String trimmed = rawSaveLocation.strip();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("Choose a save location before downloading.");
        }

        Path path;
        try {
            path = Path.of(trimmed);
        } catch (InvalidPathException e) {
            // Message must not leak the raw value back unescaped; it may contain
            // control characters that break terminal/UI rendering.
            throw new IllegalArgumentException("The save location is not a usable path.");
        }

        return path.toAbsolutePath().normalize();
    }
}
