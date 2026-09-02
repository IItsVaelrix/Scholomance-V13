package divtube.validation;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Decides whether a string is a YouTube URL DivTube will hand to yt-dlp.
 *
 * <p>Validation is by parsed authority, never by substring search. The previous
 * implementation was {@code url.contains("youtube.com/watch?v=")}, which
 * "https://evil.example/?x=/youtube.com/watch?v=a" satisfies without the host
 * being anywhere near YouTube.
 *
 * <p>The policy in this class is canonical and is asserted against
 * `divtube_downloader/tests/youtube_url_policy.json` by both
 * YouTubeUrlConformanceTest (Java) and tests/test_url_policy_conformance.py
 * (Python). Change one side and the other suite fails; that is the point. The
 * host list previously existed in three places that had drifted apart.
 *
 * <p>Scheme is the one intentional asymmetry with the remote protocol, which
 * demands https because its URLs arrive from a paired device. Here http is
 * accepted for desktop convenience; see the JSON's _intentional_difference.
 */
public class YouTubeUrlValidator {

    private static final Set<String> ALLOWED_HOSTS = Set.of(
        "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
        "youtu.be", "www.youtu.be"
    );

    private static final Set<String> ALLOWED_SCHEMES = Set.of("http", "https");

    /**
     * An explicit port sends the request wherever the caller likes, and the
     * allowlisted hostname still looks legitimate in any log: https://youtube.com:22/...
     * parses with host "youtube.com" because the port is not part of it. Only
     * the defaults are honoured.
     */
    private static final Set<Integer> ALLOWED_PORTS = Set.of(80, 443);

    /** Path prefixes that identify a single playable video, with their id position. */
    private static final Set<String> WATCH_PATHS = Set.of("/watch");
    private static final Set<String> ID_SEGMENT_PATHS =
        Set.of("/shorts", "/live", "/embed", "/v");

    private static final Pattern HAS_SCHEME = Pattern.compile("(?i)^[a-z][a-z0-9+.-]*://.*");
    /**
     * Character set only, deliberately with no length minimum. Real YouTube ids
     * are 11 characters from this alphabet, but the security-relevant property
     * is that the value cannot smuggle separators or other syntax into the
     * yt-dlp argument -- a length rule is a policy guess about someone else's
     * identifier format, and an earlier revision of this class inventing {6,}
     * broke three working tests that use short synthetic ids.
     */
    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]+$");
    private static final int MAX_ECHO = 60;

    /**
     * Why a URL was refused. isValid() and describe() both read the same
     * Decision, so the text shown to a user cannot disagree with the boolean a
     * caller already branched on.
     */
    enum Verdict {
        OK("supported YouTube link"),
        EMPTY("no link was provided"),
        CONTROL_CHARACTER("the link contains non-printing characters"),
        MALFORMED("the link could not be parsed as a URL"),
        UNSUPPORTED_SCHEME("only http and https links are supported"),
        MISSING_HOST("the link has no host component"),
        CREDENTIALS("the link must not carry credentials"),
        HOST_NOT_ALLOWED("the link does not point at a YouTube host"),
        PORT_NOT_ALLOWED("the link specifies an unsupported port"),
        NO_VIDEO_ID("the link does not identify a video"),
        UNSUPPORTED_PATH("only watch, shorts, live and embed links are supported");

        final String reason;

        Verdict(String reason) {
            this.reason = reason;
        }
    }

    static final class Decision {
        final Verdict verdict;
        final String detail;

        private Decision(Verdict verdict, String detail) {
            this.verdict = verdict;
            this.detail = detail;
        }
    }

    private static final Decision OK = new Decision(Verdict.OK, null);

    private static Decision reject(Verdict verdict) {
        return new Decision(verdict, null);
    }

    private static Decision reject(Verdict verdict, String detail) {
        return new Decision(verdict, detail);
    }

    public static boolean isValid(String url) {
        return evaluate(url).verdict == Verdict.OK;
    }

    /**
     * A short, safe, user-presentable reason for a refusal. Does not echo the
     * raw input: it may contain control characters that break terminal
     * rendering, or be long enough to swamp the message it is embedded in.
     */
    public static String describe(String url) {
        Decision decision = evaluate(url);
        if (decision.verdict == Verdict.OK) {
            return decision.verdict.reason;
        }
        if (decision.detail == null || decision.detail.isEmpty()) {
            return decision.verdict.reason;
        }
        return decision.verdict.reason + ": " + sanitizeForDisplay(decision.detail);
    }

    private static Decision evaluate(String url) {
        if (url == null) {
            return reject(Verdict.EMPTY);
        }

        // Before stripping, and before parsing. String.trim() removes everything
        // at or below U+0020, and NUL is U+0000, so trimming first erases a
        // leading or trailing NUL and the string silently becomes a different
        // path than the one the user typed.
        if (containsControlCharacter(url)) {
            return reject(Verdict.CONTROL_CHARACTER);
        }

        String trimmed = url.strip();
        if (trimmed.isEmpty()) {
            return reject(Verdict.EMPTY);
        }

        // Accept bare "youtube.com/watch?v=x" the way the old substring check
        // did, by assuming https for parsing purposes only.
        String candidate = HAS_SCHEME.matcher(trimmed).matches() ? trimmed : "https://" + trimmed;

        URI uri;
        try {
            uri = new URI(candidate);
        } catch (URISyntaxException e) {
            return reject(Verdict.MALFORMED);
        }

        String scheme = uri.getScheme();
        if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase())) {
            return reject(Verdict.UNSUPPORTED_SCHEME, scheme);
        }

        // userinfo must be refused outright: "https://youtube.com@evil.example/"
        // reads as a YouTube URL and is not one.
        if (uri.getUserInfo() != null) {
            return reject(Verdict.CREDENTIALS, uri.getUserInfo());
        }

        String host = uri.getHost();
        if (host == null) {
            return reject(Verdict.MISSING_HOST);
        }
        String lowered = host.toLowerCase();
        if (!ALLOWED_HOSTS.contains(lowered)) {
            return reject(Verdict.HOST_NOT_ALLOWED, host);
        }

        int port = uri.getPort();
        if (port != -1 && !ALLOWED_PORTS.contains(port)) {
            return reject(Verdict.PORT_NOT_ALLOWED, Integer.toString(port));
        }

        String path = uri.getPath() == null ? "" : uri.getPath();

        if (lowered.equals("youtu.be") || lowered.equals("www.youtu.be")) {
            String id = firstSegment(path);
            return VIDEO_ID.matcher(id).matches()
                ? OK
                : reject(Verdict.NO_VIDEO_ID, path);
        }

        if (WATCH_PATHS.contains(path)) {
            String v = queryValue(uri.getQuery(), "v");
            return (v != null && VIDEO_ID.matcher(v).matches())
                ? OK
                : reject(Verdict.NO_VIDEO_ID, "watch");
        }

        String head = firstSegment(path);
        if (ID_SEGMENT_PATHS.contains("/" + head) && path.split("/").length >= 3) {
            String id = path.substring(("/" + head + "/").length());
            int slash = id.indexOf('/');
            if (slash >= 0) {
                id = id.substring(0, slash);
            }
            return VIDEO_ID.matcher(id).matches()
                ? OK
                : reject(Verdict.NO_VIDEO_ID, path);
        }

        return reject(Verdict.UNSUPPORTED_PATH, path.isEmpty() ? "(none)" : path);
    }

    private static boolean containsControlCharacter(String raw) {
        for (int i = 0; i < raw.length(); i++) {
            if (Character.isISOControl(raw.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    private static String firstSegment(String path) {
        String stripped = path.startsWith("/") ? path.substring(1) : path;
        int slash = stripped.indexOf('/');
        return slash < 0 ? stripped : stripped.substring(0, slash);
    }

    /**
     * Reads one query parameter from the raw query string. URI.getQuery() is
     * used rather than splitting the whole URL, and only an exact key match
     * counts -- a substring test here would accept "?preview=v=abc".
     */
    private static String queryValue(String query, String wanted) {
        if (query == null || query.isEmpty()) {
            return null;
        }
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            String key = eq < 0 ? pair : pair.substring(0, eq);
            if (key.equals(wanted)) {
                return eq < 0 ? "" : pair.substring(eq + 1);
            }
        }
        return null;
    }

    /** Collapses control characters and caps length for safe display. */
    private static String sanitizeForDisplay(String raw) {
        String collapsed = raw.replaceAll("\\p{Cntrl}", "?");
        if (collapsed.length() <= MAX_ECHO) {
            return collapsed;
        }
        return collapsed.substring(0, MAX_ECHO) + "...";
    }
}
