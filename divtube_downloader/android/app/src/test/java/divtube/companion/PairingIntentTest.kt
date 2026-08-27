package divtube.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * MainActivity.onCreate() never read the launch Intent's data — the
 * manifest's divtube://pair intent-filter means the OS correctly opens the
 * app when a QR scanner (outside the app; there's no in-app camera scanner)
 * resolves that scheme, but the app then just showed its normal manual-paste
 * pairing screen with the URI dropped on the floor. "Scans and opens the
 * app but fails" is exactly that: launch succeeds, pairing never fires.
 *
 * pairingUriOrNull is the pure decision extracted out of onCreate so it's
 * unit-testable without android.net.Uri, which returns Android-stub default
 * values (unitTests.isReturnDefaultValues = true, no Robolectric) rather
 * than real parses under this module's plain-JVM test setup — see
 * PairingOffer.parse in Protocol.kt, which uses real Uri and, not
 * coincidentally, has no unit test exercising it.
 */
class PairingIntentTest {
    @Test
    fun recognizesAPairingUri() {
        val uri = "divtube://pair?host=192.168.1.5&port=8766&fingerprint=ab12&offer=tok&protocol=divtube-remote-v1"
        assertEquals(uri, pairingUriOrNull(uri))
    }

    @Test
    fun ignoresNullIntentData() {
        assertNull(pairingUriOrNull(null))
    }

    @Test
    fun ignoresUnrelatedSchemes() {
        assertNull(pairingUriOrNull("https://example.com/pair?host=x"))
    }

    @Test
    fun ignoresTheWrongHost() {
        // Right scheme, wrong host — not a pairing link, must not be treated as one.
        assertNull(pairingUriOrNull("divtube://revoke?device=abc"))
    }

    @Test
    fun ignoresEmptyString() {
        assertNull(pairingUriOrNull(""))
    }
}
