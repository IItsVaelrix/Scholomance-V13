package divtube.companion

/**
 * Decide whether a launch Intent's data string is a divtube pairing link.
 *
 * Plain string checks, deliberately not android.net.Uri: this module's
 * plain-JVM unit tests run with unitTests.isReturnDefaultValues = true and
 * no Robolectric, so Uri.parse(...) returns Android-stub defaults rather
 * than a real parse — see PairingOffer.parse in Protocol.kt, which is real
 * Uri-based parsing and has no unit test for exactly that reason. Real
 * validation of the URI's fields still happens downstream in
 * PairingOffer.parse when CockpitViewModel.pair() is called with it; this
 * function only decides "is this even worth trying."
 */
internal fun pairingUriOrNull(intentDataString: String?): String? =
    intentDataString?.takeIf { it.startsWith("divtube://pair") }
