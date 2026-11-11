package com.depositflow.smsprobe.capture

import android.content.Context
import com.depositflow.smsprobe.BuildConfig

data class BankSmsSource(
    val id: String,
    val title: String,
    val bank: String,
    val senderIds: Set<String>,
    val exactSenderIds: Set<String> = emptySet(),
)
data class FinancialNotificationSource(val packageName: String, val title: String, val bank: String)
data class MatchedSmsSource(val source: BankSmsSource, val synthetic: Boolean)

object CaptureSources {
    const val EMULATOR_SMS_SENDER = "6505551212"
    private val emulatorSource = BankSmsSource("EMULATOR_TEST", "Emulator SMS test", "Synthetic test", setOf(EMULATOR_SMS_SENDER))
    // Preserve the exact bank header token between telecom routing fields. Unknown/arbitrary
    // prefixes and extra suffix segments are rejected instead of matched by substring.
    private val approvedTelecomPrefixes = setOf(
        "AD", "AX", "BZ", "CP", "DM", "IM", "JD", "JM", "LM", "OP", "QP", "TM", "TX", "UK", "VK", "VM", "WB", "YB", "ZB",
    )
    private val approvedHeaderSuffixes = setOf("S", "T")
    val smsSources = listOf(
        BankSmsSource("HDFC", "HDFC Bank", "HDFC Bank", setOf("HDFCBK", "HDFCBANK", "HDFCBN")),
        BankSmsSource("SBI", "State Bank of India", "SBI", setOf("SBIINB", "SBIBNK", "SBISMS", "CBSSBI", "SBIUPI", "SBICARD", "SBICRD"), setOf("AD-CBSSBI-S", "VM-SBIUPI-S")),
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
        val header = sender.trim().uppercase()
        return smsSources.firstOrNull { source -> source.id in enabledIds && matchesBankHeader(header, source) }
    }

    private fun matchesBankHeader(header: String, source: BankSmsSource): Boolean {
        if (header in source.exactSenderIds) return true
        val parts = header.split('-')
        return when (parts.size) {
            1 -> parts[0] in source.senderIds
            2 -> parts[0] in approvedTelecomPrefixes && parts[1] in source.senderIds
            3 -> parts[0] in approvedTelecomPrefixes && parts[1] in source.senderIds && parts[2] in approvedHeaderSuffixes
            else -> false
        }
    }

    fun resolveSmsSender(
        sender: String,
        enabledIds: Set<String>,
        debugBuild: Boolean = BuildConfig.DEBUG,
        emulatorTestingEnabled: Boolean = false,
    ): MatchedSmsSource? {
        matchEnabledSmsSender(sender, enabledIds)?.let { return MatchedSmsSource(it, synthetic = false) }
        if (debugBuild && emulatorTestingEnabled && normalizeSender(sender) == EMULATOR_SMS_SENDER) {
            return MatchedSmsSource(emulatorSource, synthetic = true)
        }
        return null
    }

    fun notification(packageName: String, enabledPackages: Set<String>): FinancialNotificationSource? =
        notificationSources.firstOrNull { it.packageName == packageName && packageName in enabledPackages }
}

class CaptureSettingsStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("capture_sources", Context.MODE_PRIVATE)

    @Synchronized fun enabledSmsIds(): Set<String> = preferences.getStringSet(KEY_SMS, emptySet())?.toSet().orEmpty()
    @Synchronized fun enabledNotificationPackages(): Set<String> = preferences.getStringSet(KEY_NOTIFICATIONS, emptySet())?.toSet().orEmpty()
    @Synchronized fun emulatorSmsTestingEnabled(): Boolean = BuildConfig.DEBUG && preferences.getBoolean(KEY_EMULATOR_SMS_TEST, false)

    @Synchronized fun setEmulatorSmsTestingEnabled(enabled: Boolean) {
        if (BuildConfig.DEBUG) preferences.edit().putBoolean(KEY_EMULATOR_SMS_TEST, enabled).apply()
    }

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
        private const val KEY_EMULATOR_SMS_TEST = "emulator_sms_testing"
    }
}
