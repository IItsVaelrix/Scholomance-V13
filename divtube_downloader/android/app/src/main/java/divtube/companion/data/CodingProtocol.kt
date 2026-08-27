package divtube.companion.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

const val CODING_PROTOCOL_VERSION = "divtube-remote-v2"

@Serializable
data class CodingServerEnvelope(
    val protocolVersion: String,
    val instanceId: String,
    val seq: Long,
    val type: String,
    val requestId: String? = null,
    val payload: JsonObject,
)

@Serializable
data class CodingClientEnvelope(
    val protocolVersion: String = CODING_PROTOCOL_VERSION,
    val type: String,
    val requestId: String,
    val payload: JsonObject,
)

/**
 * V2 has a deliberately separate decoder: accepting an unknown event or field
 * would make the phone an optimistic interpreter of a host it cannot audit.
 */
object CodingProtocol {
    val json = Json { ignoreUnknownKeys = false; explicitNulls = true; encodeDefaults = true }
    private val eventTypes = setOf(
        "capability.manifest", "task.snapshot", "task.activity", "task.message", "task.blocked",
        "task.completed", "artifact.summary", "artifact.chunk", "action.proposed",
        "action.approval.required", "action.running", "action.receipt", "action.invalidated",
        "verification.progress", "verification.receipt", "device.notice", "error",
    )
    private val taskStates = setOf("planning", "exploring", "awaiting_approval", "executing", "blocked", "completed", "failed", "cancelled", "review")
    private val actionStates = setOf("pending_approval", "approved", "running", "applied", "rejected", "invalidated", "failed", "cancelled", "blocked")

    fun decodeServer(raw: String, previousInstance: String? = null, previousSeq: Long? = null): CodingServerEnvelope {
        val envelope = json.decodeFromString<CodingServerEnvelope>(raw)
        require(envelope.protocolVersion == CODING_PROTOCOL_VERSION) { "Unsupported coding protocol version" }
        require(envelope.type in eventTypes) { "Unsupported coding event type" }
        require(envelope.instanceId.isNotBlank() && envelope.instanceId.length <= 128 && envelope.seq >= 0) { "Invalid coding envelope identity" }
        if (previousInstance == envelope.instanceId && previousSeq != null) {
            require(envelope.seq > previousSeq) { "Stale event sequence" }
        }
        validatePayload(envelope.type, envelope.payload, envelope.seq)
        return envelope
    }

    fun validateApproval(proposalDigest: String, approvedDigest: String) {
        require(validDigest(proposalDigest) && proposalDigest == approvedDigest) { "Approval digest does not match proposal" }
    }

    private fun validatePayload(type: String, payload: JsonObject, seq: Long) {
        rejectForbidden(payload)
        when (type) {
            "task.snapshot" -> {
                exact(payload, setOf("tasks", "lastSeq"))
                require(payload["lastSeq"]?.jsonPrimitive?.longOrNull == seq) { "Invalid task snapshot sequence" }
                payload["tasks"]?.jsonArray?.forEach(::task)
            }
            "task.activity" -> { exact(payload, setOf("taskId", "state")); identifier(payload, "taskId"); require(string(payload, "state") in taskStates) }
            "task.message" -> { exact(payload, setOf("taskId", "text")); identifier(payload, "taskId"); text(payload, "text") }
            "task.blocked" -> { exact(payload, setOf("taskId", "summary")); identifier(payload, "taskId"); text(payload, "summary") }
            "task.completed" -> { exact(payload, setOf("taskId", "summary")); identifier(payload, "taskId"); text(payload, "summary") }
            "action.proposed", "action.approval.required" -> proposal(payload)
            "action.running", "action.invalidated" -> { exact(payload, setOf("taskId", "actionId", "proposalDigest", "state", "summary")); actionBase(payload); text(payload, "summary") }
            "action.receipt" -> receipt(payload)
            "verification.progress" -> { exact(payload, setOf("taskId", "preset", "state", "summary")); identifier(payload, "taskId"); identifier(payload, "preset"); text(payload, "summary") }
            "verification.receipt" -> { exact(payload, setOf("taskId", "preset", "state", "summary")); identifier(payload, "taskId"); identifier(payload, "preset"); require(string(payload, "state") in setOf("passed", "failed", "blocked")); text(payload, "summary") }
            "error" -> { exact(payload, setOf("code", "message")); identifier(payload, "code"); text(payload, "message") }
            "capability.manifest", "task.message", "artifact.summary", "artifact.chunk", "device.notice" -> require(payload.isNotEmpty()) { "Empty coding event payload" }
        }
    }

    private fun task(value: JsonElement) {
        val item = value.jsonObject
        exact(item, setOf("taskId", "title", "state", "summary"))
        identifier(item, "taskId"); text(item, "title"); require(string(item, "state") in taskStates); text(item, "summary")
    }

    private fun proposal(payload: JsonObject) {
        exact(payload, setOf("taskId", "actionId", "capability", "summary", "proposalDigest", "expiresAt", "risk", "targets", "state"))
        actionBase(payload); identifier(payload, "capability"); text(payload, "summary"); text(payload, "expiresAt"); identifier(payload, "risk")
        val targets = payload["targets"] as? JsonArray ?: error("Invalid proposal targets")
        require(targets.isNotEmpty() && targets.all { value -> logicalPath(value.jsonPrimitive.content) }) { "Invalid proposal targets" }
    }

    private fun receipt(payload: JsonObject) {
        exact(payload, setOf("taskId", "actionId", "state", "summary", "proposalDigest", "postDigest"))
        actionBase(payload); require(string(payload, "state") in actionStates); text(payload, "summary")
        require(validDigest(string(payload, "postDigest"))) { "Invalid post digest" }
    }

    private fun actionBase(payload: JsonObject) {
        identifier(payload, "taskId"); identifier(payload, "actionId")
        require(validDigest(string(payload, "proposalDigest"))) { "Invalid proposal digest" }
        require(string(payload, "state") in actionStates) { "Invalid action state" }
    }

    private fun exact(value: JsonObject, expected: Set<String>) { require(value.keys == expected) { "Coding event contains missing or extra fields" } }
    private fun string(value: JsonObject, key: String): String = value[key]?.jsonPrimitive?.content ?: error("Missing $key")
    private fun identifier(value: JsonObject, key: String) { require(string(value, key).matches(Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"))) { "Invalid $key" } }
    private fun text(value: JsonObject, key: String) { require(string(value, key).length in 1..8_000) { "Invalid $key" } }
    private fun validDigest(value: String) = value.matches(Regex("(?:sha256:)?[0-9a-f]{64}"))
    private fun logicalPath(value: String) = value.isNotBlank() && !value.startsWith("/") && !value.contains("\\") && !value.split("/").contains("..")
    private fun rejectForbidden(value: JsonElement) {
        when (value) {
            is JsonObject -> value.forEach { (key, nested) ->
                require(key.replace(Regex("[^A-Za-z0-9]"), "").lowercase() !in setOf("apikey", "authorization", "command", "credential", "credentials", "cwd", "env", "headers", "password", "secret", "secrets", "shell", "stderr", "stdout", "token", "tokens", "url")) { "Coding event includes a forbidden field" }
                rejectForbidden(nested)
            }
            is JsonArray -> value.forEach(::rejectForbidden)
            else -> Unit
        }
    }
}
