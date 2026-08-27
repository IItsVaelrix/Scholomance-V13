package divtube.companion.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import divtube.companion.data.CodingClientEnvelope
import divtube.companion.data.CodingProtocol
import divtube.companion.data.CodingServerEnvelope
import divtube.companion.data.PairingRecord
import divtube.companion.data.PinnedCockpitClient
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

data class CodingReceipt(val state: String, val summary: String, val proposalDigest: String, val postDigest: String)
data class CodingProposal(
    val actionId: String,
    val capability: String,
    val summary: String,
    val digest: String,
    val expiresAt: String,
    val risk: String,
    val targets: List<String>,
    val state: String,
) { val approvable: Boolean get() = state == "pending_approval" }
data class CodingTask(
    val id: String,
    val title: String,
    val state: String,
    val summary: String,
    val proposal: CodingProposal? = null,
    val receipt: CodingReceipt? = null,
    val verification: String? = null,
    val messages: List<String> = emptyList(),
)
data class CodingPartnerUiState(
    val instanceId: String? = null,
    val lastSeq: Long = -1,
    val tasks: List<CodingTask> = emptyList(),
    val selectedTaskId: String? = null,
    val connected: Boolean = false,
    val error: String? = null,
)

/** Reducer only: host events supply facts; the phone does not invent receipts. */
class CodingPartnerViewModel : ViewModel() {
    private val mutableState = MutableStateFlow(CodingPartnerUiState())
    val state: StateFlow<CodingPartnerUiState> = mutableState.asStateFlow()
    private var client: PinnedCockpitClient? = null
    private var socket: WebSocket? = null
    private var pairedRecord: PairingRecord? = null

    fun connect(record: PairingRecord) {
        pairedRecord = record
        val connection = PinnedCockpitClient(record)
        client = connection
        socket?.close(1000, "replaced")
        socket = connection.codingEvents(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                mutableState.value = mutableState.value.copy(connected = true, error = null)
                requestSnapshot()
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.toByteArray().size > 32 * 1024) { webSocket.close(1009, "message too large"); return }
                runCatching { CodingProtocol.decodeServer(text, mutableState.value.instanceId, mutableState.value.lastSeq) }
                    .onSuccess(::reduce)
                    .onFailure { error ->
                        if (!error.message.orEmpty().contains("Stale event sequence")) {
                            mutableState.value = mutableState.value.copy(error = "Dropped a coding event: ${error.message ?: "invalid event"}")
                        }
                    }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                mutableState.value = mutableState.value.copy(connected = false, error = "Coding host is offline")
            }
        })
    }

    fun createTask(text: String) { send("task.create", buildJsonObject { put("text", text) }) }
    fun requestSnapshot() { send("task.snapshot.request", buildJsonObject {}) }
    fun approveAction(taskId: String, actionId: String) {
        val proposal = mutableState.value.tasks.firstOrNull { it.id == taskId }?.proposal ?: return
        if (proposal.actionId != actionId || !proposal.approvable) return
        send("action.approve", buildJsonObject { put("taskId", taskId); put("actionId", actionId); put("proposalDigest", proposal.digest) })
    }
    fun rejectAction(actionId: String) { actionTask(actionId)?.let { (taskId, proposal) -> send("action.reject", buildJsonObject { put("taskId", taskId); put("actionId", actionId); put("reason", "Rejected from paired phone") }) } }
    fun cancelAction(actionId: String) { actionTask(actionId)?.let { (taskId, _) -> send("action.cancel", buildJsonObject { put("taskId", taskId); put("actionId", actionId) }) } }
    fun verify(taskId: String) { send("verification.start.request", buildJsonObject { put("taskId", taskId); put("preset", "test_run") }) }
    fun revokeLocal() { socket?.close(1000, "revoked"); socket = null; client = null; pairedRecord = null; mutableState.value = CodingPartnerUiState() }

    private fun actionTask(actionId: String): Pair<String, CodingProposal>? = mutableState.value.tasks.firstNotNullOfOrNull { task -> task.proposal?.takeIf { it.actionId == actionId }?.let { task.id to it } }
    private fun send(type: String, payload: kotlinx.serialization.json.JsonObject) {
        val activeClient = client
        val activeSocket = socket
        if (activeClient == null || activeSocket == null) {
            mutableState.value = mutableState.value.copy(connected = false, error = "Not connected to the coding host")
            return
        }
        if (!activeClient.sendCoding(activeSocket, CodingClientEnvelope(type = type, requestId = UUID.randomUUID().toString(), payload = payload))) {
            mutableState.value = mutableState.value.copy(connected = false, error = "Coding request could not be sent")
        }
    }

    fun reduce(envelope: CodingServerEnvelope) {
        val current = mutableState.value
        if (current.instanceId == envelope.instanceId && envelope.seq <= current.lastSeq) return
        var next = current.copy(instanceId = envelope.instanceId, lastSeq = envelope.seq, connected = true, error = null)
        when (envelope.type) {
            "task.snapshot" -> next = next.copy(tasks = envelope.payload["tasks"]!!.jsonArray.map(::task), selectedTaskId = current.selectedTaskId)
            "task.activity" -> next = update(next, envelope.payload["taskId"]!!.jsonPrimitive.content) { it.copy(state = envelope.payload["state"]!!.jsonPrimitive.content) }
            "task.blocked" -> next = update(next, envelope.payload["taskId"]!!.jsonPrimitive.content) { it.copy(state = "blocked", summary = envelope.payload["summary"]!!.jsonPrimitive.content) }
            "task.completed" -> next = update(next, envelope.payload["taskId"]!!.jsonPrimitive.content) { it.copy(state = "completed", summary = envelope.payload["summary"]!!.jsonPrimitive.content) }
            "task.message" -> next = update(next, envelope.payload["taskId"]!!.jsonPrimitive.content) {
                it.copy(messages = (it.messages + envelope.payload["text"]!!.jsonPrimitive.content).takeLast(100))
            }
            "action.proposed", "action.approval.required" -> next = proposal(next, envelope)
            "action.receipt" -> next = receipt(next, envelope)
            "verification.receipt" -> next = update(next, envelope.payload["taskId"]!!.jsonPrimitive.content) { it.copy(verification = envelope.payload["state"]!!.jsonPrimitive.content) }
            "error" -> next = next.copy(error = envelope.payload["message"]!!.jsonPrimitive.content)
        }
        mutableState.value = next
    }

    fun selectTask(taskId: String) { mutableState.value = mutableState.value.copy(selectedTaskId = taskId) }

    private fun proposal(state: CodingPartnerUiState, envelope: CodingServerEnvelope): CodingPartnerUiState {
        val p = envelope.payload
        val taskId = p["taskId"]!!.jsonPrimitive.content
        val proposal = CodingProposal(p["actionId"]!!.jsonPrimitive.content, p["capability"]!!.jsonPrimitive.content, p["summary"]!!.jsonPrimitive.content, p["proposalDigest"]!!.jsonPrimitive.content, p["expiresAt"]!!.jsonPrimitive.content, p["risk"]!!.jsonPrimitive.content, p["targets"]!!.jsonArray.map { it.jsonPrimitive.content }, p["state"]!!.jsonPrimitive.content)
        return update(state, taskId) { it.copy(proposal = proposal, state = if (proposal.approvable) "awaiting_approval" else "blocked") }
    }

    private fun receipt(state: CodingPartnerUiState, envelope: CodingServerEnvelope): CodingPartnerUiState {
        val p = envelope.payload
        val taskId = p["taskId"]!!.jsonPrimitive.content
        val receipt = CodingReceipt(p["state"]!!.jsonPrimitive.content, p["summary"]!!.jsonPrimitive.content, p["proposalDigest"]!!.jsonPrimitive.content, p["postDigest"]!!.jsonPrimitive.content)
        return update(state, taskId) { it.copy(receipt = receipt, proposal = null, state = receipt.state) }
    }

    private fun update(state: CodingPartnerUiState, taskId: String, transform: (CodingTask) -> CodingTask): CodingPartnerUiState {
        val exists = state.tasks.any { it.id == taskId }
        val tasks = if (exists) state.tasks.map { if (it.id == taskId) transform(it) else it }
        else state.tasks + CodingTask(taskId, "Task $taskId", "planning", "Waiting for host detail").let(transform)
        return state.copy(tasks = tasks, selectedTaskId = state.selectedTaskId ?: taskId)
    }

    private fun task(value: kotlinx.serialization.json.JsonElement): CodingTask {
        val item = value.jsonObject
        return CodingTask(item["taskId"]!!.jsonPrimitive.content, item["title"]!!.jsonPrimitive.content, item["state"]!!.jsonPrimitive.content, item["summary"]!!.jsonPrimitive.content)
    }
}
