package com.depositflow.smsprobe.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class StoredDeviceCredential(val baseUrl: String, val deviceName: String, val token: String)

/** Stores the bearer token encrypted with an AES key held by Android Keystore. */
class DeviceCredentialStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun save(baseUrl: String, deviceName: String, token: String) {
        require(TOKEN_PATTERN.matches(token)) { "Invalid device credential." }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val saved = preferences.edit()
            .putString(KEY_BASE_URL, baseUrl)
            .putString(KEY_DEVICE_NAME, deviceName)
            .putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(KEY_TOKEN, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .commit()
        check(saved) { "Could not save the device credential." }
    }

    @Synchronized
    fun load(): StoredDeviceCredential? {
        val baseUrl = preferences.getString(KEY_BASE_URL, null) ?: return null
        val deviceName = preferences.getString(KEY_DEVICE_NAME, null) ?: return null
        val iv = preferences.getString(KEY_IV, null) ?: return null
        val encrypted = preferences.getString(KEY_TOKEN, null) ?: return null
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getExistingKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            val token = String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
            if (!TOKEN_PATTERN.matches(token)) throw IllegalStateException("Invalid saved credential.")
            StoredDeviceCredential(baseUrl, deviceName, token)
        } catch (_: Exception) {
            clear()
            null
        }
    }

    @Synchronized
    fun clear() {
        preferences.edit().clear().commit()
        runCatching {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            keyStore.deleteEntry(KEY_ALIAS)
        }
    }

    private fun getExistingKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
            ?: throw IllegalStateException("Device credential key is missing.")
    }

    private fun getOrCreateKey(): SecretKey {
        runCatching { return getExistingKey() }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFERENCES = "device_credentials"
        private const val KEY_ALIAS = "deposit_flow_device_token_v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_IV = "token_iv"
        private const val KEY_TOKEN = "token_ciphertext"
        private val TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]{43}$")
    }
}
