package com.depositflow.smsprobe.data.local

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class EncryptedPayload(val ciphertext: String, val iv: String)

/** Encrypts the candidate's amount, bank, merchant, reference and transaction date at rest. */
class CandidatePayloadCipher {
    fun encrypt(plainText: String, captureId: String): EncryptedPayload {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(captureId.toByteArray(Charsets.UTF_8))
        val bytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return EncryptedPayload(
            Base64.encodeToString(bytes, Base64.NO_WRAP),
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    fun decrypt(payload: EncryptedPayload, captureId: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getExistingKey(),
            GCMParameterSpec(128, Base64.decode(payload.iv, Base64.NO_WRAP)),
        )
        cipher.updateAAD(captureId.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(Base64.decode(payload.ciphertext, Base64.NO_WRAP)), Charsets.UTF_8)
    }

    private fun getExistingKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
            ?: throw IllegalStateException("Local candidate encryption key is missing.")
    }

    @Synchronized
    private fun getOrCreateKey(): SecretKey = runCatching { getExistingKey() }.getOrElse {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        generator.generateKey()
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "deposit_flow_candidates_v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
