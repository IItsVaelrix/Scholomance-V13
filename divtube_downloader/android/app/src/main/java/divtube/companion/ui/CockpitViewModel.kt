package divtube.companion.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import divtube.companion.data.ClientEnvelope
import divtube.companion.data.PairingOffer
import divtube.companion.data.PairingRecord
import divtube.companion.data.PinnedCockpitClient
import divtube.companion.data.RemoteProtocol
import divtube.companion.data.ServerEnvelope
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

enum class ConnectionState { UNPAIRED, CONNECTING, CONNECTED, OFFLINE }
data class ChatLine(val id: String, val text: String, val terminal: Boolean)
data class JobLine(val id: String, val mediaType: String, val percent: Int, val state: String)
data class CockpitUiState(
    val connection: ConnectionState = ConnectionState.UNPAIRED,
    val instanceId: String? = null,
    val lastSeq: Long = -1,
    val activity: String = "idle",
    val messages: List<ChatLine> = emptyList(),
    val jobs: List<JobLine> = emptyList(),
    val error: String? = null,
    val rightsConfirmed: Boolean = false,
)

class CockpitViewModel : ViewModel() {
    private val mutableState = MutableStateFlow(CockpitUiState())
    val state: StateFlow<CockpitUiState> = mutableState.asStateFlow()
    private var client: PinnedCockpitClient? = null
    private var socket: WebSocket? = null

    fun reduce(envelope: ServerEnvelope) {
        val current = mutableState.value
        if (current.instanceId == envelope.instanceId && envelope.seq <= current.lastSeq) return
        var next = current.copy(connection = ConnectionState.CONNECTED, instanceId = envelope.instanceId, lastSeq = envelope.seq, error = null)
        when (envelope.type) {
            "status.snapshot" -> next = next.copy(jobs = envelope.payload["activeJobs"]!!.jsonArray.map(::job))
            "chat.activity" -> next = next.copy(activity = envelope.payload["state"]!!.jsonPrimitive.content)
            "chat.message" -> next = next.copy(messages = next.messages + ChatLine(
                envelope.payload["messageId"]!!.jsonPrimitive.content,
                envelope.payload["text"]!!.jsonPrimitive.content,
                envelope.payload["terminal"]!!.jsonPrimitive.content.toBoolean(),
            ))
            "download.accepted" -> Unit // server progress/snapshot is authoritative
            "download.progress" -> {
                val updated = job(envelope.payload)
                next = next.copy(jobs = (next.jobs.filterNot { it.id == updated.id } + updated).sortedBy { it.id })
            }
            "download.completed" -> {
                val id = envelope.payload["jobId"]!!.jsonPrimitive.content
                val state = envelope.payload["state"]!!.jsonPrimitive.content
                next = next.copy(jobs = next.jobs.map { if (it.id == id) it.copy(percent = if (state == "completed") 100 else it.percent, state = state) else it })
            }
            "error" -> next = next.copy(error = envelope.payload["message"]!!.jsonPrimitive.content)
        }
        mutableState.value = next
    }

    fun pair(uri: String, label: String, onPaired: (PairingRecord) -> Unit = {}) {
        mutableState.value = mutableState.value.copy(connection = ConnectionState.CONNECTING, error = null)
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { PinnedCockpitClient.pair(PairingOffer.parse(uri), label) }
                .onSuccess { record -> onPaired(record); connect(record) }
                .onFailure { mutableState.value = mutableState.value.copy(connection = ConnectionState.UNPAIRED, error = "Pairing failed") }
        }
    }

    fun connect(record: PairingRecord) {
        val connection = PinnedCockpitClient(record)
        client = connection
        socket = connection.events(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { mutableState.value = mutableState.value.copy(connection = ConnectionState.CONNECTED) }
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { RemoteProtocol.decodeServer(text, mutableState.value.instanceId, mutableState.value.lastSeq) }.onSuccess(::reduce)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                mutableState.value = mutableState.value.copy(connection = ConnectionState.OFFLINE, error = "Connection lost")
            }
        })
    }

    fun sendChat(text: String) = send("chat.turn.request", buildJsonObject { put("text", text); put("conversation", "main") })

    fun submitDownload(url: String, mediaType: String) {
        if (!mutableState.value.rightsConfirmed) return
        send("download.request", buildJsonObject { put("url", url); put("mediaType", mediaType); put("rightsConfirmed", true) })
        mutableState.value = mutableState.value.copy(rightsConfirmed = false)
    }

    fun setRightsConfirmed(value: Boolean) { mutableState.value = mutableState.value.copy(rightsConfirmed = value) }
    fun revokeLocal() { socket?.close(1000, "revoked"); socket = null; client = null; mutableState.value = CockpitUiState() }

    private fun send(type: String, payload: JsonObject) {
        val activeClient = client ?: return
        val activeSocket = socket ?: return
        activeClient.send(activeSocket, ClientEnvelope(type = type, requestId = UUID.randomUUID().toString(), payload = payload))
    }

    private fun job(value: kotlinx.serialization.json.JsonElement): JobLine = job(value.jsonObject)
    private fun job(value: JsonObject) = JobLine(
        value["jobId"]!!.jsonPrimitive.content,
        value["mediaType"]?.jsonPrimitive?.content ?: "video",
        value["percent"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
        value["state"]!!.jsonPrimitive.content,
    )
}
