package divtube.companion.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import android.net.Uri

const val PROTOCOL_VERSION = "divtube-remote-v1"

@Serializable
data class ServerEnvelope(
    val protocolVersion: String,
    val instanceId: String,
    val seq: Long,
    val type: String,
    val requestId: String? = null,
    val payload: JsonObject,
)

@Serializable
data class ClientEnvelope(
    val protocolVersion: String = PROTOCOL_VERSION,
    val type: String,
    val requestId: String,
    val payload: JsonObject,
)

object RemoteProtocol {
    val json = Json { ignoreUnknownKeys = false; explicitNulls = true }
    private val serverTypes = setOf("status.snapshot", "chat.activity", "chat.message", "download.accepted", "download.progress", "download.completed", "error")

    fun decodeServer(raw: String, previousInstance: String? = null, previousSeq: Long? = null): ServerEnvelope {
        val envelope = json.decodeFromString<ServerEnvelope>(raw)
        require(envelope.protocolVersion == PROTOCOL_VERSION) { "Unsupported protocol version" }
        require(envelope.type in serverTypes) { "Unsupported event type" }
        require(envelope.instanceId.isNotBlank() && envelope.seq >= 0) { "Invalid envelope identity" }
        if (previousInstance == envelope.instanceId && previousSeq != null) require(envelope.seq > previousSeq) { "Stale event sequence" }
        if (envelope.type == "status.snapshot") {
            require(envelope.payload["lastSeq"]?.jsonPrimitive?.longOrNull == envelope.seq) { "Invalid snapshot sequence" }
        }
        return envelope
    }
}

data class PairingOffer(val host: String, val port: Int, val fingerprint: String, val token: String) {
    companion object {
        fun parse(uri: String): PairingOffer {
            val parsed = Uri.parse(uri)
            require(parsed.scheme == "divtube" && parsed.host == "pair") { "Invalid pairing URI" }
            val host = requireNotNull(parsed.getQueryParameter("host"))
            val port = requireNotNull(parsed.getQueryParameter("port")).toInt()
            val fingerprint = requireNotNull(parsed.getQueryParameter("fingerprint"))
            val token = requireNotNull(parsed.getQueryParameter("offer"))
            require(parsed.getQueryParameter("protocol") == PROTOCOL_VERSION)
            return PairingOffer(host, port, fingerprint, token)
        }
    }
}
