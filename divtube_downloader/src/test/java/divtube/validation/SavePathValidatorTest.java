package divtube.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The save location is interpolated into the yt-dlp argument vector, so the
 * contract under test is "either a usable absolute path, or an
 * IllegalArgumentException carrying a message safe to show the user". The old
 * behaviour was an NPE that reached the UI as "Download execution failed:
 * null".
 */
class SavePathValidatorTest {

    @DisplayName("rejects missing or blank locations with a user-facing message")
    @ParameterizedTest(name = "blank: [{0}]")
    @NullSource
    @ValueSource(strings = {"", "   ", "\t", "\n"})
    void rejectsBlankLocations(String raw) {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
            () -> SavePathValidator.resolve(raw));
        assertEquals("Choose a save location before downloading.", e.getMessage());
    }

    @DisplayName("rejects embedded NUL at any position, not just the middle")
    @ParameterizedTest(name = "nul: {0}")
    @ValueSource(strings = {
        "/tmp/downloads\0",        // trailing: erased by trim(), the regression case
        "\0/tmp/downloads",        // leading
        " /tmp/downloads\0 ",      // trailing, shielded by surrounding spaces
        "\0",                      // NUL and nothing else
        "/tmp/dow\nloads\0x",      // interior, alongside real whitespace
    })
    void rejectsNulBytes(String raw) {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
            () -> SavePathValidator.resolve(raw));
        assertEquals("The save location contains invalid characters.", e.getMessage());
    }

    @Test
    @DisplayName("a relative location is resolved against the working directory")
    void relativeLocationBecomesAbsolute() {
        Path resolved = SavePathValidator.resolve("Downloads");
        assertTrue(resolved.isAbsolute(), "must be absolute: " + resolved);
        assertEquals(Path.of(System.getProperty("user.dir")).resolve("Downloads").normalize(),
            resolved);
    }

    @Test
    @DisplayName("surrounding whitespace is stripped, dot-segments are collapsed")
    void normalizesAndTrims() {
        Path resolved = SavePathValidator.resolve("  /tmp/a/./b/../c  ");
        assertEquals(Path.of("/tmp/a/c"), resolved);
    }

    @Test
    @DisplayName("an already-absolute location is returned unchanged")
    void absoluteLocationIsPreserved() {
        assertEquals(Path.of("/tmp/divtube-out"),
            SavePathValidator.resolve("/tmp/divtube-out"));
    }
}
