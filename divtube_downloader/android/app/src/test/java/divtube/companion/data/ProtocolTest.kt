package divtube.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ProtocolTest {
    private fun event(version: String = PROTOCOL_VERSION, seq: Long = 1, type: String = "status.snapshot") =
        """{"protocolVersion":"$version","instanceId":"pc-1","seq":$seq,"type":"$type","requestId":null,"payload":{"cockpit":{"state":"idle"},"activeJobs":[],"lastSeq":$seq}}"""

    @Test fun decodesStrictSnapshot() { assertEquals(1, RemoteProtocol.decodeServer(event()).seq) }
    @Test fun rejectsProtocolMismatch() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event("v0")) } }
    @Test fun rejectsUnknownType() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event(type="future")) } }
    @Test fun rejectsStaleSequence() { assertThrows(IllegalArgumentException::class.java) { RemoteProtocol.decodeServer(event(seq=2), "pc-1", 2) } }
}
