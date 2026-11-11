package com.depositflow.smsprobe.capture

import android.content.Context

data class BankSmsSource(val id: String, val title: String, val bank: String, val senderSuffixes: Set<String>)
data class FinancialNotificationSource(val packageName: String, val title: String, val bank: String)

object CaptureSources {
    val smsSources = listOf(
        BankSmsSource("HDFC", "HDFC Bank", "HDFC Bank", setOf("HDFCBK", "HDFCBANK", "HDFCBN")),
        BankSmsSource("SBI", "State Bank of India", "SBI", setOf("SBIINB", "SBIBNK", "SBISMS")),
        BankSmsSource("ICICI", "ICICI Bank", "ICICI Bank", setOf("ICICIB", "ICICIBANK", "ICICIS")),
        BankSmsSource("AXIS", "Axis Bank", "Axis Bank", setOf("AXISBK", "AXISBANK")),
        BankSmsSource("KOTAK", "Kotak Mahindra Bank", "Kotak Bank", setOf("KOTAKB", "KOTAKBK")),
        BankSmsSource("PNB", "Punjab National Bank", "PNB", setOf("PNBSMS", "PNBBNK")),
        BankSmsSource("BOB", "Bank of Baroda", "Bank of Baroda", setOf("BOBSMS", "BARODAB")),
        BankSmsSource("CANARA", "Canara Bank", "Canara Bank", setOf("CANBNK", "CANARA")),
        BankSmsSource("IDFC", "IDFC FIRST Bank", "IDFC FIRST Bank", setOf("IDFCFB", "IDFCBK")),
        BankSmsSource("UNION", "Union Bank of India", "Union Bank", setOf("UNIONB", "UBIIND")),
    )

    val notificationSources = listOf(
        FinancialNotificationSource("com.google.android.apps.nbu.paisa.user", "Google Pay", "Google Pay"),
        FinancialNotificationSource("com.phonepe.app", "PhonePe", "PhonePe"),
        FinancialNotificationSource("net.one97.paytm", "Paytm", "Paytm"),
        FinancialNotificationSource("com.sbi.lotusintouch", "YONO SBI", "SBI"),
        FinancialNotificationSource("com.axis.mobile", "Axis Mobile", "Axis Bank"),
        FinancialNotificationSource("com.csam.icici.bank.imobile", "iMobile Pay", "ICICI Bank"),
        FinancialNotificationSource("com.kotak.bank.mobile", "Kotak Bank", "Kotak Bank"),
    )

    fun normalizeSender(sender: String): String = sender.uppercase().filter(Char::isLetterOrDigit)

    fun matchEnabledSmsSender(sender: String, enabledIds: Set<String>): BankSmsSource? {
        val normalized = normalizeSender(sender)
        return smsSources.firstOrNull { source ->
            source.id in enabledIds && source.senderSuffixes.any { suffix -> normalized.endsWith(suffix) }
        }
    }

    fun notification(packageName: String, enabledPackages: Set<String>): FinancialNotificationSource? =
        notificationSources.firstOrNull { it.packageName == packageName && packageName in enabledPackages }
}

class CaptureSettingsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("capture_sources", Context.MODE_PRIVATE)

    @Synchronized fun enabledSmsIds(): Set<String> = preferences.getStringSet(KEY_SMS, emptySet())?.toSet().orEmpty()
    @Synchronized fun enabledNotificationPackages(): Set<String> = preferences.getStringSet(KEY_NOTIFICATIONS, emptySet())?.toSet().orEmpty()

    @Synchronized fun setSmsEnabled(id: String, enabled: Boolean) {
        val values = enabledSmsIds().toMutableSet()
        if (enabled) values.add(id) else values.remove(id)
        preferences.edit().putStringSet(KEY_SMS, values).apply()
    }

    @Synchronized fun setNotificationEnabled(packageName: String, enabled: Boolean) {
        val values = enabledNotificationPackages().toMutableSet()
        if (enabled) values.add(packageName) else values.remove(packageName)
        preferences.edit().putStringSet(KEY_NOTIFICATIONS, values).apply()
    }

    companion object {
        private const val KEY_SMS = "enabled_sms_senders"
        private const val KEY_NOTIFICATIONS = "enabled_notification_packages"
    }
}
