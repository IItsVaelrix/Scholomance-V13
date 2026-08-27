package divtube.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

private val codingTabs = listOf("Tasks", "Code", "Changes", "Verify", "Control")

/**
 * Phone-native review/control surface. It deliberately shows facts emitted by
 * the host, rather than pretending that the phone has direct repository power.
 */
@Composable
fun CodingPartnerScreen(
    state: CodingPartnerUiState,
    onCreateTask: (String) -> Unit,
    onSelectTask: (String) -> Unit,
    onApprove: (String, String) -> Unit,
    onReject: (String) -> Unit,
    onCancel: (String) -> Unit,
    onVerify: (String) -> Unit,
    onRevoke: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                codingTabs.forEachIndexed { index, label ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { ReceiptMark(index, state) },
                        label = { Text(label) },
                    )
                }
            }
        },
    ) { inset ->
        Column(Modifier.fillMaxSize().padding(inset)) {
            CodingHeader(state)
            when (tab) {
                0 -> TasksPane(state, onCreateTask, onSelectTask)
                1 -> CodePane(state)
                2 -> ChangesPane(state, onApprove, onReject, onCancel)
                3 -> VerifyPane(state, onVerify)
                else -> ControlPane(state, onRevoke)
            }
        }
    }
}

@Composable
private fun ReceiptMark(index: Int, state: CodingPartnerUiState) {
    val active = when (index) {
        0 -> state.tasks.any { it.state in setOf("planning", "exploring") }
        1 -> state.tasks.any { it.state == "review" }
        2 -> state.tasks.any { it.proposal != null || it.receipt != null }
        3 -> state.tasks.any { it.verification != null }
        else -> state.connected
    }
    Text(if (active) "●" else "·", style = MaterialTheme.typography.labelLarge)
}

@Composable
private fun CodingHeader(state: CodingPartnerUiState) {
    val connection = if (state.connected) "HOST LINKED" else "HOST OFFLINE"
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Coding partner", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text("Signal ledger · host-authoritative", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Surface(
                color = if (state.connected) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(100.dp),
                modifier = Modifier.semantics { contentDescription = "Coding host $connection" },
            ) { Text(connection, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)) }
        }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
    }
    HorizontalDivider()
}

@Composable
private fun TasksPane(state: CodingPartnerUiState, onCreateTask: (String) -> Unit, onSelectTask: (String) -> Unit) {
    var draft by rememberSaveable { mutableStateOf("") }
    if (state.tasks.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            EmptyLedger("No host tasks yet", "Start a bounded task. The phone receives reviewable work, not a shell.")
            OutlinedTextField(draft, { draft = it }, label = { Text("Describe the coding task") }, modifier = Modifier.fillMaxWidth(), maxLines = 4)
            Button(onClick = { onCreateTask(draft.trim()); draft = "" }, enabled = draft.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Start bounded task") }
        }
        return
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Live work", style = MaterialTheme.typography.titleMedium) }
        items(state.tasks, key = { it.id }) { task ->
            TaskCard(task, selected = task.id == state.selectedTaskId, onClick = { onSelectTask(task.id) })
        }
        item { TextButton(onClick = { onCreateTask("Inspect the current codebase task list") }) { Text("Start another task") } }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun TaskCard(task: CodingTask, selected: Boolean, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Task state ${task.state}" },
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(task.title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                StateChip(task.state)
            }
            Text(task.summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            task.proposal?.let { Text("Review change · ${it.targets.joinToString()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp)) }
            task.receipt?.let { Text("Host receipt · ${it.state}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}

@Composable
private fun StateChip(value: String) {
    val color = when (value) {
        "blocked", "failed" -> MaterialTheme.colorScheme.errorContainer
        "applied", "completed", "passed" -> MaterialTheme.colorScheme.tertiaryContainer
        else -> MaterialTheme.colorScheme.primaryContainer
    }
    Surface(color = color, shape = RoundedCornerShape(100.dp)) {
        Text(value.replace('_', ' '), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
    }
}

@Composable
private fun CodePane(state: CodingPartnerUiState) {
    val task = selected(state)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Code review", style = MaterialTheme.typography.titleMedium)
        Text("Logical paths and review artifacts are shown here. The host keeps absolute paths and tool credentials private.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(16.dp))
        if (task == null) EmptyLedger("No task selected", "Choose a task to read host progress and inspect a proposed change.")
        else {
            if (task.messages.isNotEmpty()) {
                Text("Host notes", style = MaterialTheme.typography.titleSmall)
                task.messages.forEach { message ->
                    Text(message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                }
                Spacer(Modifier.height(16.dp))
            }
            if (task.proposal == null) EmptyLedger("No review artifact", "The host is still inspecting, or it completed without proposing a change.")
            else ProposalArtifact(task.proposal)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProposalArtifact(proposal: CodingProposal) {
    Text("Review change", style = MaterialTheme.typography.titleSmall)
    Text(proposal.summary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 12.dp)) {
        proposal.targets.forEach { target -> AssistChip(onClick = {}, label = { Text(target, fontFamily = FontFamily.Monospace) }) }
    }
    ReceiptSpine("Review", proposal.state, null)
    DigestLine("Proposal digest", proposal.digest)
    Text("Expires ${proposal.expiresAt}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ChangesPane(state: CodingPartnerUiState, onApprove: (String, String) -> Unit, onReject: (String) -> Unit, onCancel: (String) -> Unit) {
    val task = selected(state)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Changes", style = MaterialTheme.typography.titleMedium)
        task?.proposal?.let { proposal ->
            ProposalArtifact(proposal)
            Spacer(Modifier.height(16.dp))
            Button(onClick = { onApprove(task.id, proposal.actionId) }, enabled = proposal.approvable, modifier = Modifier.fillMaxWidth()) { Text("Approve change") }
            OutlinedButton(onClick = { onReject(proposal.actionId) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Reject change") }
            TextButton(onClick = { onCancel(proposal.actionId) }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("Cancel proposal") }
        } ?: task?.receipt?.let { receipt -> ReceiptCard(receipt) } ?: run {
            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text("Approve change") }
            EmptyLedger("Nothing awaiting approval", "The host has not issued a digest-bound proposal for this task.")
        }
    }
}

@Composable
private fun VerifyPane(state: CodingPartnerUiState, onVerify: (String) -> Unit) {
    val task = selected(state)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Verify", style = MaterialTheme.typography.titleMedium)
        Text("A verification receipt is a host result, not an agent claim.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
        if (task == null) EmptyLedger("Select a task", "Choose a task before starting an allowed verification preset.") else {
            ReceiptSpine("Verify", task.verification ?: "not run", task.receipt)
            Button(onClick = { onVerify(task.id) }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp), enabled = task.receipt?.state == "applied") { Text("Run allowed verification") }
        }
    }
}

@Composable
private fun ControlPane(state: CodingPartnerUiState, onRevoke: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("Control", style = MaterialTheme.typography.titleMedium)
        ReceiptSpine("Host link", if (state.connected) "linked" else "offline", null)
        Text("This device is paired over your local network. It cannot receive host secrets, shell access, or a generic command channel.", style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = onRevoke, modifier = Modifier.fillMaxWidth().padding(top = 20.dp)) { Text("Forget and revoke this device") }
    }
}

@Composable
private fun ReceiptSpine(stage: String, state: String, receipt: CodingReceipt?) {
    val stages = listOf("Plan", "Review", "Apply", "Verify")
    Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        stages.forEach { label ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(color = if (label == stage || (label == "Apply" && receipt != null)) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(100.dp)) { Box(Modifier.width(14.dp).height(14.dp)) }
                Text(label, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
    Text(state.replace('_', ' '), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ReceiptCard(receipt: CodingReceipt) {
    Text("Host receipt", style = MaterialTheme.typography.titleSmall)
    ReceiptSpine("Apply", receipt.state, receipt)
    Text(receipt.summary, style = MaterialTheme.typography.bodyMedium)
    DigestLine("Proposal digest", receipt.proposalDigest)
    DigestLine("Post-image digest", receipt.postDigest)
}

@Composable
private fun DigestLine(label: String, digest: String) {
    Column(Modifier.padding(top = 10.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(digest, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun EmptyLedger(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
}

private fun selected(state: CodingPartnerUiState): CodingTask? = state.tasks.firstOrNull { it.id == state.selectedTaskId } ?: state.tasks.firstOrNull()
