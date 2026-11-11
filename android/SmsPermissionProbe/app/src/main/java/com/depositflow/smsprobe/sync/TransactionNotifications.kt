package com.depositflow.smsprobe.sync

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.depositflow.smsprobe.data.local.CandidateRepository
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.data.local.TransactionType
import java.net.URI
import java.text.NumberFormat
import java.util.Locale

object TransactionNotificationPolicy {
    const val PRODUCTION_ORIGIN = "https://expense-tracker-phi-gules.vercel.app"
    const val INBOX_URL = "$PRODUCTION_ORIGIN/expenses#inbox"
    const val BROWSER_ACTION = "android.intent.action.VIEW"
    const val CHANNEL_ID = "synced_transactions"

    fun isProductionOrigin(baseUrl: String): Boolean = runCatching {
        val uri = URI(baseUrl.trim().trimEnd('/'))
        uri.scheme.equals("https", true) && uri.host.equals("expense-tracker-phi-gules.vercel.app", true) &&
            uri.port == -1 && (uri.path.isNullOrEmpty() || uri.path == "/") && uri.userInfo == null && uri.query == null && uri.fragment == null
    }.getOrDefault(false)

    fun shouldNotify(
        newlyInserted: Boolean,
        productionOrigin: Boolean,
        enabled: Boolean,
        permissionGranted: Boolean,
        isSynthetic: Boolean,
        transactionType: TransactionType,
    ): Boolean = newlyInserted && productionOrigin && enabled && permissionGranted && !isSynthetic &&
        (transactionType == TransactionType.DEBIT || transactionType == TransactionType.CREDIT)

    fun title(candidate: TransactionCandidate): String? {
        if (candidate.amountMinor <= 0 || (candidate.transactionType != TransactionType.DEBIT && candidate.transactionType != TransactionType.CREDIT)) return null
        val amount = NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply { maximumFractionDigits = 2; minimumFractionDigits = 0 }
            .format(candidate.amountMinor / 100.0)
        return "$amount ${candidate.transactionType.name.lowercase(Locale.ROOT)} detected"
    }

    fun body(candidate: TransactionCandidate): String {
        val safeBank = candidate.bank.filter { it.isLetterOrDigit() || it.isWhitespace() || it in "-·" }
            .replace(Regex("\\s+"), " ").trim().take(32).ifBlank { "Bank" }
        return "$safeBank · Tap to open Deposit Flow Finance inbox"
    }
}

class TransactionNotificationPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("transaction_notifications", Context.MODE_PRIVATE)
    fun isEnabled(): Boolean = preferences.getBoolean("enabled", true)
    fun setEnabled(enabled: Boolean) { preferences.edit().putBoolean("enabled", enabled).apply() }
}

object TransactionNotificationPublisher {
    fun hasPermission(context: Context): Boolean {
        val runtimeGranted = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!runtimeGranted || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = manager.getNotificationChannel(TransactionNotificationPolicy.CHANNEL_ID)
        if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return false
        return true
    }

    fun post(context: Context, candidate: TransactionCandidate) {
        if (!hasPermission(context)) throw SecurityException("Notification permission is unavailable.")
        val title = TransactionNotificationPolicy.title(candidate) ?: return
        createChannel(context)
        val pendingIntent = PendingIntent.getActivity(
            context,
            candidate.captureId.hashCode(),
            browserIntent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, TransactionNotificationPolicy.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_more)
            .setContentTitle(title)
            .setContentText(TransactionNotificationPolicy.body(candidate))
            .setStyle(NotificationCompat.BigTextStyle().bigText(TransactionNotificationPolicy.body(candidate)))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        // A user can revoke permission after the check above. Dispatcher catches this race and releases the claim.
        @SuppressLint("MissingPermission")
        NotificationManagerCompat.from(context).notify("transaction-${candidate.captureId}", 0, notification)
    }

    internal fun browserIntent(): Intent = Intent(Intent.ACTION_VIEW, Uri.parse(TransactionNotificationPolicy.INBOX_URL)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun createChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(TransactionNotificationPolicy.CHANNEL_ID) == null) {
            manager.createNotificationChannel(NotificationChannel(
                TransactionNotificationPolicy.CHANNEL_ID,
                "Newly synchronized transactions",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "Alerts after a new transaction appears in the finance inbox." })
        }
    }
}

object TransactionNotificationDispatcher {
    suspend fun deliverNewProductionSync(context: Context, repository: CandidateRepository, captureId: String, baseUrl: String) {
        if (!TransactionNotificationPolicy.isProductionOrigin(baseUrl)) return
        deliver(context, repository, captureId, newlyInserted = true, productionOrigin = true)
    }

    suspend fun deliverPending(context: Context, repository: CandidateRepository, baseUrl: String) {
        if (!TransactionNotificationPolicy.isProductionOrigin(baseUrl)) return
        val preferences = TransactionNotificationPreferences(context)
        if (!preferences.isEnabled()) {
            repository.suppressPendingNotifications()
            return
        }
        if (!TransactionNotificationPublisher.hasPermission(context)) return
        repository.pendingNotificationCandidates().forEach { candidate ->
            deliver(context, repository, candidate.captureId, newlyInserted = true, productionOrigin = true)
        }
    }

    private suspend fun deliver(
        context: Context,
        repository: CandidateRepository,
        captureId: String,
        newlyInserted: Boolean,
        productionOrigin: Boolean,
    ) {
        val preferences = TransactionNotificationPreferences(context)
        val candidate = repository.syncedCandidate(captureId) ?: return
        val allowed = TransactionNotificationPolicy.shouldNotify(
            newlyInserted = newlyInserted,
            productionOrigin = productionOrigin,
            enabled = preferences.isEnabled(),
            permissionGranted = TransactionNotificationPublisher.hasPermission(context),
            isSynthetic = candidate.isSynthetic,
            transactionType = candidate.transactionType,
        )
        if (!allowed) {
            if (!preferences.isEnabled()) repository.suppressNotification(captureId)
            return
        }
        if (!repository.claimNotification(captureId)) return
        try {
            TransactionNotificationPublisher.post(context, candidate)
            repository.markNotificationPosted(captureId)
        } catch (_: SecurityException) {
            // Permission may be revoked between checking and posting. Keep it eligible for a later grant.
            repository.releaseNotificationClaim(captureId)
        } catch (_: Exception) {
            // Keep the durable claim to guarantee at-most-once behavior after an uncertain post result.
        }
    }
}
