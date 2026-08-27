package divtube.companion.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
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
    if (state.connection == ConnectionState.UNPAIRED || state.connection == ConnectionState.CONNECTING) {
        PairingPane(state, onPair)
        return
    }
    // Chat owns the screen once paired. The device controls previously sat
    // in the same scrolling column and squeezed the transcript into a 280dp
    // box; reading long answers was the primary use, so they get their own
    // tab instead of competing for the same vertical space.
    var tab by rememberSaveable { mutableStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        ConnectionBanner(state)
        TabRow(selectedTabIndex = tab) {
            Tab(tab == 0, { tab = 0 }, text = { Text("Chat") })
            Tab(tab == 1, { tab = 1 }, text = { Text("Device") })
        }
        when (tab) {
            0 -> ChatPane(state, onChat, Modifier.weight(1f))
            else -> DevicePane(state, onDownload, onRights, onRevoke, Modifier.weight(1f))
        }
    }
}

@Composable
private fun PairingPane(state: CockpitUiState, onPair: (String, String) -> Unit) {
    var pairingUri by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("DivTube Cockpit", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Pair with the cockpit running on your PC. Run /remote-pair there and paste the link it prints.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        OutlinedTextField(
            pairingUri,
            { pairingUri = it },
            label = { Text("Pairing link") },
            placeholder = { Text("divtube://pair?…") },
            singleLine = false,
            modifier = Modifier.fillMaxWidth(),
        )
        state.error?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp).semantics { contentDescription = "Error: $it" },
            )
        }
        Button(
            onClick = { onPair(pairingUri.trim(), "Android companion") },
            enabled = pairingUri.trim().startsWith("divtube://pair")
                && state.connection != ConnectionState.CONNECTING,
            modifier = Modifier.padding(top = 16.dp).fillMaxWidth(),
        ) {
            Text(if (state.connection == ConnectionState.CONNECTING) "Pairing…" else "Pair securely")
        }
    }
}

@Composable
private fun ConnectionBanner(state: CockpitUiState) {
    val label = state.connection.name.lowercase()
    val tint = when (state.connection) {
        ConnectionState.CONNECTED -> MaterialTheme.colorScheme.secondary
        ConnectionState.OFFLINE -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("DivTube Cockpit", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = tint,
                modifier = Modifier.semantics { contentDescription = "Connection state $label" },
            )
        }
        if (state.connection == ConnectionState.OFFLINE) {
            Text(
                "PC is offline. Reconnect resumes from a fresh snapshot.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        state.error?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { contentDescription = "Error: $it" },
            )
        }
    }
}

@Composable
private fun ChatPane(state: CockpitUiState, onChat: (String) -> Unit, modifier: Modifier = Modifier) {
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val thinking = state.activity == "thinking"

    // Follow the tail as replies stream in — the agent emits progressive
    // fragments, so a transcript that stayed put would hide its own output.
    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    Column(modifier.fillMaxSize()) {
        if (state.messages.isEmpty()) {
            Column(
                Modifier.weight(1f).fillMaxWidth().padding(32.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Ask about your codebase", style = MaterialTheme.typography.titleMedium)
                Text(
                    "This agent can read, search and navigate the project on your PC. It cannot change anything.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            ) {
                items(state.messages, key = { it.id }) { MessageBubble(it) }
            }
        }
        if (thinking) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                Text(
                    "Working…",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 8.dp).semantics { contentDescription = "Agent is working" },
                )
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                draft,
                { draft = it },
                label = { Text("Ask a question") },
                modifier = Modifier.weight(1f),
                maxLines = 5,
            )
            Button(
                onClick = { onChat(draft); draft = "" },
                enabled = draft.isNotBlank() && !thinking,
                modifier = Modifier.padding(start = 8.dp, bottom = 4.dp),
            ) { Text("Send") }
        }
    }
}

@Composable
private fun MessageBubble(line: ChatLine) {
    val isUser = line.role == ChatRole.USER
    val clipboard = LocalClipboardManager.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = if (isUser) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                // User text is shown verbatim: it is what they typed, and
                // markdown-rendering their own words would misrepresent it.
                if (isUser) {
                    Text(line.text, style = MaterialTheme.typography.bodyMedium)
                } else {
                    MarkdownText(line.text)
                    TextButton(
                        onClick = { clipboard.setText(AnnotatedString(line.text)) },
                        modifier = Modifier.align(Alignment.End),
                    ) { Text("Copy", style = MaterialTheme.typography.labelSmall) }
                }
            }
        }
    }
}

@Composable
private fun DevicePane(
    state: CockpitUiState,
    onDownload: (String, String) -> Unit,
    onRights: (Boolean) -> Unit,
    onRevoke: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var url by remember { mutableStateOf("") }
    var mediaType by remember { mutableStateOf("video") }
    Column(modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Confirmed download", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            url, { url = it },
            label = { Text("YouTube HTTPS URL") },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
        Row(Modifier.padding(top = 8.dp)) {
            listOf("video", "audio").forEach { type ->
                FilterChip(
                    selected = mediaType == type,
                    onClick = { mediaType = type },
                    label = { Text(type) },
                    modifier = Modifier.padding(end = 8.dp),
                )
            }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(state.rightsConfirmed, onRights)
            Text("I confirm I have rights to download this media", style = MaterialTheme.typography.bodySmall)
        }
        Button(
            onClick = { onDownload(url.trim(), mediaType) },
            enabled = state.rightsConfirmed && url.trim().startsWith("https://"),
            modifier = Modifier.padding(top = 8.dp),
        ) { Text("Queue download") }

        if (state.jobs.isNotEmpty()) {
            HorizontalDivider(Modifier.padding(vertical = 16.dp))
            Text("Jobs", style = MaterialTheme.typography.titleMedium)
            state.jobs.forEach { job ->
                Column(Modifier.padding(top = 8.dp)) {
                    Text("${job.mediaType} — ${job.state}", style = MaterialTheme.typography.bodyMedium)
                    LinearProgressIndicator(
                        progress = { job.percent / 100f },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    )
                    Text("${job.percent}%", style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        HorizontalDivider(Modifier.padding(vertical = 16.dp))
        OutlinedButton(onClick = onRevoke) { Text("Forget and revoke this device") }
    }
}
