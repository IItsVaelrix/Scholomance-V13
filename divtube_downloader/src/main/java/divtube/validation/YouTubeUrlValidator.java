package divtube.validation;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Set;
import java.util.regex.Pattern;

public class YouTubeUrlValidator {
    private static final Set<String> ALLOWED_HOSTS = Set.of(
        "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"
    );
    private static final Pattern HAS_SCHEME = Pattern.compile("(?i)^[a-z][a-z0-9+.-]*://.*");

    /**
     * Validates by parsed authority (host), not substring search — a URL
     * like "https://evil.example/?x=youtube.com/watch?v=a" or
     * "http://youtube.com.attacker.tld/watch?v=x" contains the old
     * substring check's targets without ever being a YouTube host.
     */
    public static boolean isValid(String url) {
        if (url == null) return false;
        String trimmed = url.trim();
        if (trimmed.isEmpty()) return false;

        // Accept bare "youtube.com/watch?v=x" (no scheme) like the old
        // substring check did, by assuming https for parsing purposes only.
        String candidate = HAS_SCHEME.matcher(trimmed).matches() ? trimmed : "https://" + trimmed;

        URI uri;
        try {
            uri = new URI(candidate);
        } catch (URISyntaxException e) {
            return false;
        }

        String scheme = uri.getScheme();
        if (scheme == null || !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            return false;
        }

        String host = uri.getHost();
        if (host == null || !ALLOWED_HOSTS.contains(host.toLowerCase())) {
            return false;
        }

        String path = uri.getPath() == null ? "" : uri.getPath();
        if ("youtu.be".equalsIgnoreCase(host)) {
            return path.length() > 1; // "/<videoId>"
        }

        String query = uri.getQuery() == null ? "" : uri.getQuery();
        return "/watch".equals(path) && (query.equals("v") || query.startsWith("v=") || query.contains("&v="));
    }
}
