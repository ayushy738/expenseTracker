package com.depositflow.smsprobe.capture

import android.content.Context

enum class SmsOutcome(val key: String, val label: String) {
    BROADCAST_RECEIVED("broadcast_received", "New SMS broadcast received"),
    PERMISSION_MISSING("permission_missing", "SMS permission missing; message not processed"),
    SENDER_REJECTED("sender_rejected", "SMS ignored because sender is not enabled"),
    PARSER_REJECTED("parser_rejected", "Sender allowed; message did not match a transaction pattern"),
    TRANSACTION_DETECTED("transaction_detected", "Transaction candidate detected"),
    REVIEW_REQUIRED("review_required", "Transaction-like alert saved for local review; it will not sync"),
    SYNTHETIC_DETECTED("synthetic_detected", "Synthetic emulator test candidate detected"),
    PROCESSING_ERROR("processing_error", "SMS processing failed; contents were discarded"),
}

data class CaptureDiagnostics(val lastOutcome: SmsOutcome?, val lastAt: Long?, val counts: Map<SmsOutcome, Int>)

class CaptureDiagnosticsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("capture_diagnostics", Context.MODE_PRIVATE)

    @Synchronized fun record(outcome: SmsOutcome) {
        preferences.edit()
            .putInt(outcome.key, preferences.getInt(outcome.key, 0) + 1)
            .putString(KEY_LAST, outcome.key)
            .putLong(KEY_LAST_AT, System.currentTimeMillis())
            .apply()
    }

    @Synchronized fun snapshot(): CaptureDiagnostics {
        val last = preferences.getString(KEY_LAST, null)
        val outcome = SmsOutcome.entries.firstOrNull { it.key == last }
        return CaptureDiagnostics(
            lastOutcome = outcome,
            lastAt = if (preferences.contains(KEY_LAST_AT)) preferences.getLong(KEY_LAST_AT, 0L) else null,
            counts = SmsOutcome.entries.associateWith { preferences.getInt(it.key, 0) },
        )
    }

    companion object {
        private const val KEY_LAST = "last_outcome"
        private const val KEY_LAST_AT = "last_at"
    }
}
