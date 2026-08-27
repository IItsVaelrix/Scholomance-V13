package divtube.companion.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CodingProtocolTest {
    private fun event(
        seq: Long = 1,
        type: String = "task.snapshot",
        payload: String = "{\"tasks\":[],\"lastSeq\":1}",
    ) = """{"protocolVersion":"divtube-remote-v2","instanceId":"pc-1","seq":$seq,"type":"$type","requestId":null,"payload":$payload}"""

    @Test fun decodesStrictTaskSnapshot() {
        assertEquals(1, CodingProtocol.decodeServer(event()).seq)
    }

    @Test fun rejectsUnknownEnvelopeFields() {
        assertThrows(IllegalArgumentException::class.java) {
            CodingProtocol.decodeServer(event().dropLast(1) + ",\"future\":true}")
        }
    }

    @Test fun rejectsStaleSequence() {
        assertThrows(IllegalArgumentException::class.java) {
            CodingProtocol.decodeServer(event(seq = 3), "pc-1", 3)
        }
    }

    @Test fun rejectsProposalApprovalDigestMismatch() {
        assertThrows(IllegalArgumentException::class.java) {
            CodingProtocol.validateApproval("sha256:" + "a".repeat(64), "sha256:" + "b".repeat(64))
        }
    }
}
