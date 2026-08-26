package divtube.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PinnedCockpitClientTest {
    @Test fun convertsFingerprintToCertificateDigest() {
        val fingerprint = (0 until 32).joinToString(":") { "%02X".format(it) }
        assertEquals((0 until 32).toList(), PinnedCockpitClient.fingerprintBytes(fingerprint).map { it.toInt() and 0xff })
    }
    @Test fun rejectsMalformedFingerprint() {
        assertThrows(IllegalArgumentException::class.java) { PinnedCockpitClient.fingerprintBytes("secret") }
    }
}
