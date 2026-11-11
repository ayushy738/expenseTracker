package com.depositflow.smsprobe

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.depositflow.smsprobe.capture.CaptureGraph
import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.parser.TransactionMessageParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Processes only newly delivered SMS broadcasts from explicitly enabled bank sender IDs. */
class SmsReceivedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) return

        val enabledSenders = CaptureGraph.settings(context).enabledSmsIds()
        if (enabledSenders.isEmpty()) return
        val messages = runCatching { Telephony.Sms.Intents.getMessagesFromIntent(intent).orEmpty() }.getOrNull().orEmpty()
        if (messages.isEmpty()) return

        // Check sender IDs before touching message bodies; multipart PDUs from one sender are joined in memory.
        val allowed = messages.filter { message ->
            CaptureSources.matchEnabledSmsSender(message.originatingAddress.orEmpty(), enabledSenders) != null
        }
        if (allowed.isEmpty()) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                allowed.groupBy { it.originatingAddress.orEmpty() }.forEach { (sender, parts) ->
                    val body = parts.sortedBy { it.timestampMillis }.joinToString(separator = "") { it.messageBody.orEmpty() }
                    if (body.isBlank()) return@forEach
                    val candidate = TransactionMessageParser.parseSms(
                        sender = sender,
                        body = body,
                        receivedAt = parts.minOf { it.timestampMillis },
                        enabledSenderIds = enabledSenders,
                    )
                    if (candidate != null && candidate.source == CaptureSource.SMS) CaptureGraph.repository(context).insert(candidate)
                }
            } catch (_: Exception) {
                // Never log SMS data or exception messages from parsing/storage.
            } finally {
                pending.finish()
            }
        }
    }
}
