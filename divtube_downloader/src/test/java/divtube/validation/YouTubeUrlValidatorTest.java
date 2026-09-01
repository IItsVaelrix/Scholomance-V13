package divtube.validation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The validator gates a URL that is handed straight to yt-dlp as a process
 * argument, so "does this string appear anywhere" is not good enough — it must
 * decide on the parsed authority. The hostile cases below are the ones named in
 * the validator's own docstring plus the classic authority tricks.
 */
class YouTubeUrlValidatorTest {

    @DisplayName("accepts real YouTube watch/short URLs")
    @ParameterizedTest(name = "valid: {0}")
    @ValueSource(strings = {
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        // Extra query params, either side of v=
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        "https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ",
        // Host case is not significant
        "https://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ",
        // Scheme-less input stayed acceptable, as with the old substring check
        "youtube.com/watch?v=dQw4w9WgXcQ",
        "  https://youtu.be/dQw4w9WgXcQ  ",
    })
    void acceptsGenuineYouTubeUrls(String url) {
        assertTrue(YouTubeUrlValidator.isValid(url), () -> "should accept: " + url);
    }

    @DisplayName("rejects lookalikes that only CONTAIN the YouTube string")
    @ParameterizedTest(name = "hostile: {0}")
    @ValueSource(strings = {
        // The two cases the validator's docstring calls out by name
        "https://evil.example/?x=/youtube.com/watch?v=a",
        "http://youtube.com.attacker.tld/watch?v=x",
        // Suffix/prefix host tricks
        "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com.evil.co/watch?v=dQw4w9WgXcQ",
        "https://evil.youtu.be.attacker.tld/dQw4w9WgXcQ",
        // userinfo trick: authority is evil.example, not youtube.com
        "https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ",
        // Path-only mention on an unrelated host
        "https://example.com/youtube.com/watch?v=dQw4w9WgXcQ",
        // Non-http(s) schemes must not reach the downloader
        "file:///etc/passwd",
        "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
        "javascript:alert(1)//youtube.com/watch?v=a",
    })
    void rejectsHostileLookalikes(String url) {
        assertFalse(YouTubeUrlValidator.isValid(url), () -> "should reject: " + url);
    }

    @DisplayName("rejects malformed, empty, and right-host/wrong-shape input")
    @ParameterizedTest(name = "invalid: {0}")
    @NullSource
    @ValueSource(strings = {
        "",
        "   ",
        "not a url at all",
        // Correct host, but not a watchable target
        "https://www.youtube.com/",
        "https://www.youtube.com/feed/subscriptions",
        "https://www.youtube.com/watch",
        "https://www.youtube.com/watch?list=PL123",
        // youtu.be with no video path
        "https://youtu.be/",
        "https://youtu.be",
    })
    void rejectsMalformedOrNonWatchUrls(String url) {
        assertFalse(YouTubeUrlValidator.isValid(url), () -> "should reject: " + url);
    }
}
