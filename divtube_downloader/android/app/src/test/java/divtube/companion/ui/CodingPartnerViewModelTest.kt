package divtube.companion.ui

import divtube.companion.data.CodingProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CodingPartnerViewModelTest {
    @Test fun snapshotThenReceiptPreservesAuthoritativeReceipt() {
        val model = CodingPartnerViewModel()
        model.reduce(CodingProtocol.decodeServer(
            """{"protocolVersion":"divtube-remote-v2","instanceId":"pc-1","seq":1,"type":"task.snapshot","requestId":null,"payload":{"tasks":[{"taskId":"task-1","title":"Repair pairing","state":"review","summary":"One proposed edit"}],"lastSeq":1}}"""
        ))
        model.reduce(CodingProtocol.decodeServer(
            """{"protocolVersion":"divtube-remote-v2","instanceId":"pc-1","seq":2,"type":"task.message","requestId":"req-1","payload":{"taskId":"task-1","text":"Found the stale pairing URI."}}"""
        ))
        model.reduce(CodingProtocol.decodeServer(
            """{"protocolVersion":"divtube-remote-v2","instanceId":"pc-1","seq":3,"type":"action.receipt","requestId":"req-1","payload":{"taskId":"task-1","actionId":"action-1","state":"applied","summary":"Changed note.txt","proposalDigest":"sha256:${"a".repeat(64)}","postDigest":"sha256:${"b".repeat(64)}"}}"""
        ))

        val task = model.state.value.tasks.single()
        assertEquals("applied", task.receipt?.state)
        assertEquals("sha256:" + "b".repeat(64), task.receipt?.postDigest)
        assertEquals(listOf("Found the stale pairing URI."), task.messages)
    }

    @Test fun blockedActionDoesNotEnableApproval() {
        val model = CodingPartnerViewModel()
        model.reduce(CodingProtocol.decodeServer(
            """{"protocolVersion":"divtube-remote-v2","instanceId":"pc-1","seq":1,"type":"action.proposed","requestId":null,"payload":{"taskId":"task-1","actionId":"action-1","capability":"apply_patch","summary":"Change note.txt","proposalDigest":"sha256:${"a".repeat(64)}","expiresAt":"2030-01-01T00:00:00Z","risk":"review_required","targets":["note.txt"],"state":"blocked"}}"""
        ))
        assertTrue(!model.state.value.tasks.single().proposal!!.approvable)
    }
}
