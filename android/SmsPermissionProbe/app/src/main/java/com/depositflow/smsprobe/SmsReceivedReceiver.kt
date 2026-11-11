package com.depositflow.smsprobe

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.depositflow.smsprobe.capture.CaptureGraph
import com.depositflow.smsprobe.capture.CaptureDiagnosticsStore
import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.capture.SmsOutcome
import com.depositflow.smsprobe.BuildConfig
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.parser.TransactionParseResult
import com.depositflow.smsprobe.parser.TransactionMessageParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Processes only newly delivered SMS broadcasts from explicitly enabled bank sender IDs. */
class SmsReceivedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val diagnostics = CaptureDiagnosticsStore(context)
        diagnostics.record(SmsOutcome.BROADCAST_RECEIVED)
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            diagnostics.record(SmsOutcome.PERMISSION_MISSING)
            return
        }

        val settings = CaptureGraph.settings(context)
        val enabledSenders = settings.enabledSmsIds()
        val emulatorTestingEnabled = settings.emulatorSmsTestingEnabled()
        val messages = runCatching { Telephony.Sms.Intents.getMessagesFromIntent(intent).orEmpty() }.getOrNull().orEmpty()
        if (messages.isEmpty()) {
            diagnostics.record(SmsOutcome.PROCESSING_ERROR)
            return
        }

        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                messages.groupBy { it.originatingAddress.orEmpty() }.forEach { (sender, parts) ->
                    val match = CaptureSources.resolveSmsSender(
                        sender = sender,
                        enabledIds = enabledSenders,
                        debugBuild = BuildConfig.DEBUG,
                        emulatorTestingEnabled = emulatorTestingEnabled,
                    )
                    if (match == null) {
                        diagnostics.record(SmsOutcome.SENDER_REJECTED)
                        return@forEach
                    }
                    // Do not access message bodies until the sender has passed the explicit allowlist.
                    val body = parts.sortedBy { it.timestampMillis }.joinToString(separator = "") { it.messageBody.orEmpty() }
                    if (body.isBlank()) {
                        diagnostics.record(SmsOutcome.PARSER_REJECTED)
                        return@forEach
                    }
                    val parsed = TransactionMessageParser.parseSmsResult(
                        sender = sender,
                        body = body,
                        receivedAt = parts.minOf { it.timestampMillis },
                        enabledSenderIds = enabledSenders,
                        debugBuild = BuildConfig.DEBUG,
                        emulatorTestingEnabled = emulatorTestingEnabled,
                    )
                    when (parsed) {
                        is TransactionParseResult.Rejected -> diagnostics.record(SmsOutcome.PARSER_REJECTED)
                        is TransactionParseResult.Parsed -> if (parsed.candidate.source == CaptureSource.SMS) {
                            CaptureGraph.repository(context).insert(parsed.candidate)
                            diagnostics.record(if (parsed.candidate.isSynthetic) SmsOutcome.SYNTHETIC_DETECTED else SmsOutcome.TRANSACTION_DETECTED)
                        }
                        is TransactionParseResult.NeedsReview -> if (parsed.candidate.source == CaptureSource.SMS) {
                            CaptureGraph.repository(context).insert(parsed.candidate)
                            diagnostics.record(SmsOutcome.REVIEW_REQUIRED)
                        }
                    }
                }
            } catch (_: Exception) {
                // Never log SMS data or exception messages from parsing/storage.
                diagnostics.record(SmsOutcome.PROCESSING_ERROR)
            } finally {
                pending.finish()
            }
        }
    }
}
