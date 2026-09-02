package divtube.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Asserts that the Java validator agrees with the canonical, language-neutral
 * policy table that the Python cockpit is tested against too. A change to this
 * class that diverges from the table fails here; a change to only one language
 * fails in the other suite. That is the mechanism that keeps the two allowlists
 * from drifting again the way they had.
 */
class YouTubeUrlConformanceTest {

    private static final String FIXTURE = "tests/youtube_url_policy.json";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static Path fixture() {
        Path direct = Path.of(FIXTURE);
        if (Files.isRegularFile(direct)) {
            return direct;
        }
        // Tolerate a different working directory by walking up to the module root.
        Path probe = Path.of("").toAbsolutePath();
        for (int i = 0; i < 6 && probe != null; i++, probe = probe.getParent()) {
            Path candidate = probe.resolve(FIXTURE);
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
            "canonical policy table not found at " + direct.toAbsolutePath()
                + "; both language suites must read the same file");
    }

    private static JsonNode cases() {
        try (InputStream in = Files.newInputStream(fixture())) {
            JsonNode root = MAPPER.readTree(in);
            JsonNode cases = root.path("cases");
            assertTrue(cases.isArray() && cases.size() >= 40,
                "policy table looks truncated: " + cases.size() + " cases");
            return cases;
        } catch (IOException e) {
            throw new IllegalStateException("cannot read " + fixture(), e);
        }
    }

    static Stream<Arguments> policyCases() {
        JsonNode cases = cases();
        Stream.Builder<Arguments> builder = Stream.builder();
        for (int i = 0; i < cases.size(); i++) {
            JsonNode c = cases.get(i);
            builder.add(Arguments.of(i, c.path("url").asText(null), c.path("expect").asText()));
        }
        return builder.build();
    }

    @Test
    @DisplayName("the canonical policy table is present and readable")
    void fixtureExists() {
        assertTrue(Files.isRegularFile(fixture()), fixture().toString());
    }

    @ParameterizedTest(name = "[{0}] {2} {1}")
    @MethodSource("policyCases")
    void matchesCanonicalPolicy(int index, String url, String expect) {
        boolean accepted = YouTubeUrlValidator.isValid(url);
        assertEquals("accept".equals(expect), accepted,
            () -> "case " + index + " expects " + expect + " for <" + url + ">");
    }

    @ParameterizedTest(name = "[{0}] describe() explains {1}")
    @MethodSource("policyCases")
    void everyRejectionHasAReason(int index, String url, String expect) {
        if ("accept".equals(expect)) {
            return;
        }
        String reason = YouTubeUrlValidator.describe(url);
        assertNotNull(reason);
        assertTrue(reason.length() > 0 && !reason.equals("supported YouTube link"),
            () -> "rejection of case " + index + " produced no explanation");
        // describe() must never echo control bytes back into a UI or log line.
        assertTrue(reason.chars().noneMatch(Character::isISOControl),
            () -> "describe() leaked a control character for case " + index + ": "
                + reason.replace('\0', '~'));
    }
}
