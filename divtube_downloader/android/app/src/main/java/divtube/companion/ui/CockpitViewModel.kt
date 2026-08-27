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
import kotlinx.coroutines.delay
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

/**
 * Who produced a chat line.
 *
 * The server already labels every `chat.message` with a role; the UI simply
 * had nowhere to put it, so a sent message vanished until the assistant
 * replied and there was no way to tell a question from an answer in the
 * scrollback. USER lines are added locally on send — the server echoes only
 * assistant output.
 */
enum class ChatRole { USER, ASSISTANT }

data class ChatLine(
    val id: String,
    val text: String,
    val terminal: Boolean,
    val role: ChatRole = ChatRole.ASSISTANT,
)
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
    private var pairedRecord: PairingRecord? = null
    private var reconnectAttempt = 0

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
                role = if (envelope.payload["role"]?.jsonPrimitive?.content == "user") ChatRole.USER
                       else ChatRole.ASSISTANT,
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
                .onFailure {
                    // A flat "Pairing failed" here was indistinguishable
                    // between a malformed URI, an HTTP rejection with a
                    // real server-side reason, a TLS pin mismatch, and a
                    // plain network/DNS failure — surface the actual
                    // exception so a real failure mode is visible instead
                    // of forcing a guess from the PC side with no evidence.
                    val detail = it.message ?: it::class.simpleName ?: "unknown error"
                    mutableState.value = mutableState.value.copy(connection = ConnectionState.UNPAIRED, error = "Pairing failed: $detail")
                }
        }
    }

    fun connect(record: PairingRecord) {
        pairedRecord = record
        val connection = PinnedCockpitClient(record)
        client = connection
        socket = connection.events(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { reconnectAttempt = 0; mutableState.value = mutableState.value.copy(connection = ConnectionState.CONNECTED) }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.toByteArray().size > 32 * 1024) { webSocket.close(1009, "message too large"); return }
                runCatching { RemoteProtocol.decodeServer(text, mutableState.value.instanceId, mutableState.value.lastSeq) }
                    .onSuccess(::reduce)
                    .onFailure { failure ->
                        // Decoding is strict (ignoreUnknownKeys = false), so a
                        // protocol drift between PC and phone rejects the
                        // event. Dropping it silently made the app look frozen
                        // while the cockpit believed it had replied; a stale
                        // sequence is normal and stays quiet, anything else is
                        // a real mismatch the user should see.
                        val reason = failure.message ?: failure::class.simpleName ?: "unknown"
                        if (!reason.contains("Stale event sequence")) {
                            mutableState.value = mutableState.value.copy(error = "Dropped an event from the PC: $reason")
                        }
                    }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                mutableState.value = mutableState.value.copy(connection = ConnectionState.OFFLINE, error = "Connection lost")
                val retry = pairedRecord ?: return
                val waitSeconds = minOf(30, 1 shl minOf(reconnectAttempt++, 5))
                viewModelScope.launch { delay(waitSeconds * 1000L); if (mutableState.value.connection == ConnectionState.OFFLINE) connect(retry) }
            }
        })
    }

    /**
     * Send a turn and show it immediately.
     *
     * The server echoes only assistant output, so without a local append the
     * user's own message disappeared the moment it was sent — the single
     * biggest reason the surface felt unresponsive. Appended before the
     * request so the transcript reads in the order it happened even if the
     * socket is slow or the send fails.
     */
    fun sendChat(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        mutableState.value = mutableState.value.copy(
            messages = mutableState.value.messages + ChatLine(
                id = "local-" + UUID.randomUUID().toString(),
                text = trimmed,
                terminal = true,
                role = ChatRole.USER,
            ),
        )
        send("chat.turn.request", buildJsonObject { put("text", trimmed); put("conversation", "main") })
    }

    fun submitDownload(url: String, mediaType: String) {
        if (!mutableState.value.rightsConfirmed) return
        send("download.request", buildJsonObject { put("url", url); put("mediaType", mediaType); put("rightsConfirmed", true) })
        mutableState.value = mutableState.value.copy(rightsConfirmed = false)
    }

    fun setRightsConfirmed(value: Boolean) { mutableState.value = mutableState.value.copy(rightsConfirmed = value) }
    fun revokeLocal() { pairedRecord = null; socket?.close(1000, "revoked"); socket = null; client = null; mutableState.value = CockpitUiState() }

    /**
     * Send one client envelope, reporting failure instead of hiding it.
     *
     * This used to `return` silently when the socket or client was absent,
     * and discarded OkHttp's enqueue result. The effect was that a message
     * sent while disconnected simply vanished: no reply, no activity
     * indicator, and no error to explain why — indistinguishable from the
     * agent ignoring you. A transport that cannot deliver has to say so.
     */
    private fun send(type: String, payload: JsonObject): Boolean {
        val activeClient = client
        val activeSocket = socket
        if (activeClient == null || activeSocket == null) {
            mutableState.value = mutableState.value.copy(
                connection = if (pairedRecord == null) ConnectionState.UNPAIRED else ConnectionState.OFFLINE,
                error = "Not connected to the cockpit. Is DivTube running on your PC?",
            )
            return false
        }
        val queued = activeClient.send(
            activeSocket,
            ClientEnvelope(type = type, requestId = UUID.randomUUID().toString(), payload = payload),
        )
        if (!queued) {
            mutableState.value = mutableState.value.copy(
                connection = ConnectionState.OFFLINE,
                error = "Message could not be sent — the connection dropped.",
            )
        }
        return queued
    }

    private fun job(value: kotlinx.serialization.json.JsonElement): JobLine = job(value.jsonObject)
    private fun job(value: JsonObject) = JobLine(
        value["jobId"]!!.jsonPrimitive.content,
        value["mediaType"]?.jsonPrimitive?.content ?: "video",
        value["percent"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
        value["state"]!!.jsonPrimitive.content,
    )
}
