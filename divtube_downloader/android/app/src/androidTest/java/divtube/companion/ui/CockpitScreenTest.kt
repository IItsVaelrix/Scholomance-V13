package divtube.companion.ui

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class CockpitScreenTest {
    @get:Rule val compose = createComposeRule()
    @Test fun rightsGateIsVisibleAndDownloadStartsDisabled() {
        compose.setContent { CockpitScreen(CockpitUiState(connection = ConnectionState.CONNECTED), {_,_->}, {}, {_,_->}, {}, {}) }
        compose.onNodeWithText("I confirm I have rights to download this media").assertExists()
        compose.onNodeWithText("Queue download").assertIsNotEnabled()
        compose.onNodeWithText("Connection: connected").assertExists()
    }
}
