package divtube.companion

import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import divtube.companion.data.PairingStore
import divtube.companion.ui.CockpitScreen
import divtube.companion.ui.CockpitViewModel
import divtube.companion.ui.theme.DivTubeTheme

class MainActivity : ComponentActivity() {
    private val model: CockpitViewModel by viewModels()

    private val requestLocalNetwork =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* result surfaces as a connection error if denied */ }

    /**
     * Ask for local-network access before any pairing attempt.
     *
     * Under Local Network Protection (Android 16+, and this app targets 37)
     * a denied or never-requested permission does not raise SecurityException
     * — the platform just drops LAN traffic, so the app sees an ordinary
     * connect timeout. Requesting up front means the user gets the system
     * prompt instead of a silent ten-second failure with no explanation.
     */
    private fun ensureLocalNetworkAccess() {
        if (Build.VERSION.SDK_INT < 36) return
        val permission = "android.permission.ACCESS_LOCAL_NETWORK"
        // Framework API (Context.checkSelfPermission, API 23+) rather than
        // ContextCompat — this module declares no androidx.core dependency
        // and minSdk is 29, so the compat shim would buy nothing.
        if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
            requestLocalNetwork.launch(permission)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureLocalNetworkAccess()
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
