package com.depositflow.smsprobe.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.depositflow.smsprobe.parser.TransactionMessageParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Reads only newly posted notifications from explicitly selected financial app packages. */
class FinancialNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val source = CaptureSources.notification(sbn.packageName, CaptureGraph.settings(this).enabledNotificationPackages())
            ?: return

        // Do not inspect extras until the package passes the user's local allowlist.
        val extras = sbn.notification.extras ?: return
        val transientText = buildList {
            add(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty())
            add(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty())
            add(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty())
            extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { add(it?.toString().orEmpty()) }
        }.filter(String::isNotBlank).joinToString("\n")
        if (transientText.isBlank()) return

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val candidate = TransactionMessageParser.parseNotification(
                    packageName = source.packageName,
                    notificationText = transientText,
                    postedAt = sbn.postTime,
                    enabledPackages = setOf(source.packageName),
                )
                if (candidate != null) CaptureGraph.repository(this@FinancialNotificationListenerService).insert(candidate)
            } catch (_: Exception) {
                // Notification contents and parsing exceptions are never logged or persisted.
            }
        }
    }
}
