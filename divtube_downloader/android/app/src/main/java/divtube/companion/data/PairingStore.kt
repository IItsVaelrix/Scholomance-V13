package divtube.companion.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.Base64

data class PairingRecord(val host: String, val port: Int, val deviceId: String, val bearerToken: String, val fingerprint: String)

class PairingStore(context: Context) {
    private val preferences = context.getSharedPreferences("paired_cockpit", Context.MODE_PRIVATE)
    private val alias = "divtube_companion_pairing"

    fun save(record: PairingRecord) {
        val plain = listOf(record.host, record.port.toString(), record.deviceId, record.bearerToken, record.fingerprint).joinToString("\u0000").toByteArray()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        preferences.edit().putString("record", Base64.getEncoder().encodeToString(cipher.iv + cipher.doFinal(plain))).apply()
    }

    fun load(): PairingRecord? {
        val encoded = preferences.getString("record", null) ?: return null
        return runCatching {
            val bytes = Base64.getDecoder().decode(encoded)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            val fields = cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8).split("\u0000")
            require(fields.size == 5)
            PairingRecord(fields[0], fields[1].toInt(), fields[2], fields[3], fields[4])
        }.getOrNull()
    }

    fun clear() = preferences.edit().clear().apply()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        return generator.generateKey()
    }
}
