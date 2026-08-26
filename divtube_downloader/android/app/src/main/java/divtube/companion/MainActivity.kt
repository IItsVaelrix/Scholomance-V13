package divtube.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import divtube.companion.data.PairingStore
import divtube.companion.ui.CockpitScreen
import divtube.companion.ui.CockpitViewModel
import divtube.companion.ui.theme.DivTubeTheme

class MainActivity : ComponentActivity() {
    private val model: CockpitViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = PairingStore(this)
        store.load()?.let(model::connect)
        setContent {
            val state by model.state.collectAsState()
            DivTubeTheme {
                CockpitScreen(
                    state,
                    onPair = { uri, label -> model.pair(uri, label, store::save) },
                    onChat = model::sendChat,
                    onDownload = model::submitDownload,
                    onRights = model::setRightsConfirmed,
                    onRevoke = { store.clear(); model.revokeLocal() },
                )
            }
        }
    }
}
