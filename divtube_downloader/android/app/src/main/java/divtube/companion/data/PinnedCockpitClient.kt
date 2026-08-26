package divtube.companion.data

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PinnedCockpitClient(private val record: PairingRecord) {
    private val trustManager = FingerprintTrustManager(record.fingerprint)
    val client: OkHttpClient = OkHttpClient.Builder()
        .sslSocketFactory(SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), null) }.socketFactory, trustManager)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    fun status(): Response = client.newCall(request("/v1/status")).execute()

    fun events(listener: WebSocketListener): WebSocket = client.newWebSocket(request("/v1/events"), listener)

    fun send(socket: WebSocket, envelope: ClientEnvelope): Boolean =
        socket.send(RemoteProtocol.json.encodeToString(ClientEnvelope.serializer(), envelope))

    private fun request(path: String) = Request.Builder()
        .url("https://${record.host}:${record.port}$path")
        .header("Authorization", "Bearer ${record.bearerToken}")
        .build()

    companion object {
        fun fingerprintBytes(fingerprint: String): ByteArray {
            val hex = fingerprint.replace(":", "")
            require(hex.length == 64 && hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' })
            return ByteArray(32) { index -> hex.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
        }

        fun pair(offer: PairingOffer, label: String): PairingRecord {
            val provisional = PairingRecord(offer.host, offer.port, "pending", "pending", offer.fingerprint)
            val client = PinnedCockpitClient(provisional).client
            val body = buildJsonObject { put("offerToken", offer.token); put("deviceLabel", label) }.toString()
                .toRequestBody("application/json".toMediaType())
            val request = Request.Builder().url("https://${offer.host}:${offer.port}/v1/pair").post(body).build()
            client.newCall(request).execute().use { response ->
                require(response.isSuccessful) { "Pairing rejected" }
                val value = RemoteProtocol.json.parseToJsonElement(requireNotNull(response.body).string()).jsonObject
                return PairingRecord(
                    offer.host, offer.port,
                    requireNotNull(value["deviceId"]).jsonPrimitive.content,
                    requireNotNull(value["bearerToken"]).jsonPrimitive.content,
                    offer.fingerprint,
                )
            }
        }
    }
}

class FingerprintTrustManager(fingerprint: String) : X509TrustManager {
    private val expected = PinnedCockpitClient.fingerprintBytes(fingerprint)
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) = throw CertificateException("client certificates unsupported")
    override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {
        val certificate = chain?.firstOrNull() ?: throw CertificateException("missing server certificate")
        val actual = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        if (!MessageDigest.isEqual(expected, actual)) throw CertificateException("server certificate pin mismatch")
    }
}
