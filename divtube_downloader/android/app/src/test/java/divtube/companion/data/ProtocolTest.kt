package divtube.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class ProtocolTest {
    private fun event(version: String = PROTOCOL_VERSION, seq: Long = 1, type: String = "status.snapshot") =
        """{"protocolVersion":"$version","instanceId":"pc-1","seq":$seq,"type":"$type","requestId":null,"payload":{"cockpit":{"state":"idle"},"activeJobs":[],"lastSeq":$seq}}"""

    @Test fun decodesStrictSnapshot() { assertEquals(1, RemoteProtocol.decodeServer(event()).seq) }
    @Test fun rejectsProtocolMismatch() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event("v0")) } }
    @Test fun rejectsUnknownType() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event(type="future")) } }
    @Test fun rejectsStaleSequence() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event(seq=2), "pc-1", 2) } }

    @Test fun clientEnvelopeSerialisesProtocolVersionExplicitly() {
        // The PC validates client envelopes with an EXACT key set
        // {protocolVersion, type, requestId, payload} (tui/remote/protocol.py
        // _ENVELOPE_KEYS). kotlinx.serialization omits properties equal to
        // their default unless encodeDefaults is on, and protocolVersion has
        // a default — so every websocket message the app sent was missing it
        // and was rejected with "Envelope contains missing or extra keys".
        // Pairing was unaffected because it hand-builds its JSON body rather
        // than going through this serializer, which is why the connection
        // looked healthy while nothing could actually be sent over it.
        val envelope = ClientEnvelope(
            type = "chat.turn.request",
            requestId = "req-1",
            payload = buildJsonObject { put("text", "hi"); put("conversation", "main") },
        )
        val encoded = RemoteProtocol.json.encodeToString(ClientEnvelope.serializer(), envelope)
        val keys = RemoteProtocol.json.parseToJsonElement(encoded).jsonObject.keys
        assertEquals(setOf("protocolVersion", "type", "requestId", "payload"), keys)
    }
}
