package com.depositflow.smsprobe.sync

import android.content.Context

data class SyncUiState(val paused: Boolean, val warning: String?, val lastSuccessAt: Long?)

class SyncPreferences(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("transaction_sync", Context.MODE_PRIVATE)

    fun isPaused(): Boolean = prefs.getBoolean(KEY_PAUSED, false)
    fun setPaused(value: Boolean) { prefs.edit().putBoolean(KEY_PAUSED, value).apply() }
    fun warning(): String? = prefs.getString(KEY_WARNING, null)
    fun setWarning(value: String?) { prefs.edit().putString(KEY_WARNING, value).apply() }
    fun lastSuccessAt(): Long? = if (prefs.contains(KEY_LAST_SUCCESS)) prefs.getLong(KEY_LAST_SUCCESS, 0L) else null
    fun markSuccess(at: Long = System.currentTimeMillis()) { prefs.edit().putLong(KEY_LAST_SUCCESS, at).apply() }
    fun clear() { prefs.edit().clear().apply() }

    fun state() = SyncUiState(isPaused(), warning(), lastSuccessAt())

    companion object {
        private const val KEY_PAUSED = "paused"
        private const val KEY_WARNING = "warning"
        private const val KEY_LAST_SUCCESS = "last_success_at"
    }
}
