package divtube.companion.ui

import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class CodingPartnerScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun pendingProposalShowsSemanticReviewAndReceiptSpine() {
        val proposal = CodingProposal("action-1", "apply_patch", "Change note.txt", "sha256:" + "a".repeat(64), "2030-01-01T00:00:00Z", "review_required", listOf("note.txt"), "pending_approval")
        compose.setContent {
            CodingPartnerScreen(
                CodingPartnerUiState(tasks = listOf(CodingTask("task-1", "Repair pairing", "awaiting_approval", "One reviewed edit", proposal = proposal))),
                {}, {}, { _, _ -> }, { _ -> }, { _ -> }, { _ -> }, {},
            )
        }
        compose.onNodeWithText("Review change").assertExists()
        compose.onNodeWithText("note.txt").assertExists()
        compose.onNodeWithText("Plan").assertExists()
        compose.onNodeWithText("Verify").assertExists()
    }

    @Test fun approvalIsDisabledWhenNoProposalAndBlockedStateIsAnnounced() {
        compose.setContent {
            CodingPartnerScreen(
                CodingPartnerUiState(tasks = listOf(CodingTask("task-1", "Inspect repository", "blocked", "Host policy blocked this action"))),
                {}, {}, { _, _ -> }, { _ -> }, { _ -> }, { _ -> }, {},
            )
        }
        compose.onNodeWithText("Approve change").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Task state blocked").assertExists()
    }
}
