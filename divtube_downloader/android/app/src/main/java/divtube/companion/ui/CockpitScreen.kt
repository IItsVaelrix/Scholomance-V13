package divtube.companion.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

@Composable
fun CockpitScreen(
    state: CockpitUiState,
    onPair: (String, String) -> Unit,
    onChat: (String) -> Unit,
    onDownload: (String, String) -> Unit,
    onRights: (Boolean) -> Unit,
    onRevoke: () -> Unit,
) {
    var pairingUri by remember { mutableStateOf("") }
    var chat by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var mediaType by remember { mutableStateOf("video") }
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("DivTube Cockpit", style = MaterialTheme.typography.headlineMedium)
        Text("Connection: ${state.connection.name.lowercase()}", Modifier.semantics { contentDescription = "Connection state ${state.connection.name.lowercase()}" })
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { contentDescription = "Error: $it" }) }
        if (state.connection == ConnectionState.UNPAIRED || state.connection == ConnectionState.CONNECTING) {
            OutlinedTextField(pairingUri, { pairingUri = it }, label = { Text("Pairing URI") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onPair(pairingUri, "Android companion") }, enabled = pairingUri.startsWith("divtube://pair")) { Text("Pair securely") }
            return@Column
        }
        if (state.connection == ConnectionState.OFFLINE) Text("PC is offline. Reconnect will resume from a fresh snapshot.")
        Text("Agent: ${state.activity}", Modifier.semantics { contentDescription = "Agent activity ${state.activity}" })
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 280.dp)) {
            items(state.messages, key = { it.id }) { Text(it.text, Modifier.padding(vertical = 4.dp)) }
        }
        Row(Modifier.fillMaxWidth()) {
            OutlinedTextField(chat, { chat = it }, label = { Text("Message") }, modifier = Modifier.weight(1f))
            Button(onClick = { onChat(chat); chat = "" }, enabled = chat.isNotBlank()) { Text("Send") }
        }
        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Text("Confirmed download", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(url, { url = it }, label = { Text("YouTube HTTPS URL") }, modifier = Modifier.fillMaxWidth())
        Row { listOf("video", "audio").forEach { type -> FilterChip(selected = mediaType == type, onClick = { mediaType = type }, label = { Text(type) }, modifier = Modifier.padding(end = 8.dp)) } }
        Row { Checkbox(state.rightsConfirmed, onRights); Text("I confirm I have rights to download this media", Modifier.padding(top = 12.dp)) }
        Button(onClick = { onDownload(url, mediaType) }, enabled = state.rightsConfirmed && url.startsWith("https://")) { Text("Queue download") }
        state.jobs.forEach { Text("${it.mediaType} ${it.id}: ${it.percent}% — ${it.state}") }
        OutlinedButton(onClick = onRevoke, modifier = Modifier.padding(top = 16.dp)) { Text("Forget and revoke this device") }
    }
}
