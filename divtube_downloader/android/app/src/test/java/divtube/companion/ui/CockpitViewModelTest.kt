package divtube.companion.ui

import divtube.companion.data.RemoteProtocol
import org.junit.Assert.assertEquals
import org.junit.Test

class CockpitViewModelTest {
    private fun activity(seq: Int, state: String) = RemoteProtocol.decodeServer(
        """{"protocolVersion":"divtube-remote-v1","instanceId":"pc-1","seq":$seq,"type":"chat.activity","requestId":null,"payload":{"state":"$state"}}"""
    )
    @Test fun reducerRejectsStaleSequence() {
        val model = CockpitViewModel()
        model.reduce(activity(2, "thinking"))
        model.reduce(activity(1, "failed"))
        assertEquals("thinking", model.state.value.activity)
        assertEquals(2, model.state.value.lastSeq)
    }
    @Test fun confirmationCanBeResetWithoutOptimisticJob() {
        val model = CockpitViewModel()
        model.setRightsConfirmed(true)
        model.submitDownload("https://youtu.be/x", "video")
        assertEquals(false, model.state.value.rightsConfirmed)
        assertEquals(emptyList<JobLine>(), model.state.value.jobs)
    }
}
