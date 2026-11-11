package com.depositflow.smsprobe.parser

import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.data.local.TransactionType
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale

/** Parses transient text into normalized fields. Call only after the source was explicitly enabled. */
object TransactionMessageParser {
    private val sensitiveOrNoise = Regex(
        "\\b(otp|one[ -]?time password|verification code|verify your|promotional|promotion|offer|" +
            "win a|claim your|coupon|sale|balance enquiry|balance inquiry|mini statement|" +
            "upi pin|enter pin|password|cvv|failed|unsuccessful|declined|cancelled|canceled|not debited)\\b", RegexOption.IGNORE_CASE
    )
    private val transactionSignal = Regex(
        "\\b(debited|debit|credited|credit|spent|withdrawn|withdrawal|purchase|paid|payment|charged|" +
            "transferred|transfer|received|refund|reversal|reversed|deposit|imps|neft|rtgs|upi|atm|pos)\\b",
        RegexOption.IGNORE_CASE
    )
    private val debitSignal = Regex("\\b(debited|debit|spent|withdrawn|withdrawal|purchase|paid|payment|charged|sent|atm|pos)\\b", RegexOption.IGNORE_CASE)
    private val creditSignal = Regex("\\b(credited|received|refund|reversal|reversed|deposited)\\b", RegexOption.IGNORE_CASE)
    private val currencyAmount = Regex("(?i)(?:₹|INR\\s*|Rs\\.?\\s*)([0-9][0-9,]*(?:\\.[0-9]{1,2})?)")
    private val keywordAmount = Regex("(?i)\\b(?:debited|credited|spent|withdrawn|purchase|payment|transfer|received)\\b[^0-9]{0,24}([0-9][0-9,]*(?:\\.[0-9]{1,2})?)")
    private val referencePattern = Regex(
        "(?i)\\b(?:UPI\\s*(?:REF(?:ERENCE)?(?:\\s*NO)?|ID|TXN(?:\\s*ID)?|NO)\\s*[:#/-]?\\s*|UPI\\s*[/#:-]\\s*|" +
            "RRN\\s*[:#/-]?\\s*|UTR\\s*[:#/-]?\\s*|REF(?:ERENCE)?(?:\\s*NO)?\\s*[:#/-]?\\s*|" +
            "IMPS\\s*(?:REF|ID|UTR)\\s*[:#/-]?\\s*|NEFT\\s*(?:REF|UTR)\\s*[:#/-]?\\s*)([A-Z0-9/-]{6,24})"
    )
    private val datePattern = Regex("\\b([0-3]?[0-9])[-/]([01]?[0-9])[-/]([0-9]{2,4})\\b(?:\\s+(?:at\\s*)?([0-2]?[0-9]):([0-5][0-9]))?", RegexOption.IGNORE_CASE)
    private val merchantPattern = Regex("(?i)\\b(?:to|at|towards|merchant)\\s+([A-Za-z0-9][A-Za-z0-9 .&'-]{1,40})")
    private val knownTail = Regex("(?i)\\b(?:on|via|using|from|ref|reference|upi|imps|neft|rrn|utr|txn|transaction|avl|available|bal|balance|a/c|acct|account|ending|xx[0-9]+)\\b.*$")

    fun parseSms(
        sender: String,
        body: String,
        receivedAt: Long,
        enabledSenderIds: Set<String>,
    ): TransactionCandidate? {
        val source = CaptureSources.matchEnabledSmsSender(sender, enabledSenderIds) ?: return null
        return parse(body, receivedAt, CaptureSource.SMS, source.id, source.bank)
    }

    fun parseNotification(
        packageName: String,
        notificationText: String,
        postedAt: Long,
        enabledPackages: Set<String>,
    ): TransactionCandidate? {
        val source = CaptureSources.notification(packageName, enabledPackages) ?: return null
        return parse(notificationText, postedAt, CaptureSource.NOTIFICATION, packageName, source.bank)
    }

    private fun parse(text: String, capturedAt: Long, source: CaptureSource, sourceId: String, defaultBank: String): TransactionCandidate? {
        if (text.isBlank() || text.length > 4_000 || sensitiveOrNoise.containsMatchIn(text)) return null
        if (!transactionSignal.containsMatchIn(text)) return null

        val credit = creditSignal.containsMatchIn(text)
        val paymentReceived = Regex("(?i)\\b(payment|transfer)\\s+received\\b").containsMatchIn(text)
        val debit = debitSignal.containsMatchIn(text) && !paymentReceived
        if (debit == credit) return null

        val amountText = currencyAmount.find(text)?.groupValues?.getOrNull(1)
            ?: keywordAmount.find(text)?.groupValues?.getOrNull(1)
            ?: return null
        val amountMinor = parseMinorUnits(amountText) ?: return null
        if (amountMinor <= 0L) return null

        val type = if (debit) TransactionType.DEBIT else TransactionType.CREDIT
        val bank = extractBank(text) ?: defaultBank
        val merchant = extractMerchant(text)
        val reference = referencePattern.find(text)?.groupValues?.getOrNull(1)
            ?.trim('-', '/', ' ', '.')?.takeIf { it.length >= 6 }?.uppercase(Locale.ROOT)
        return TransactionCandidate(
            amountMinor = amountMinor,
            transactionType = type,
            transactionTimestamp = extractTimestamp(text, capturedAt),
            capturedAt = capturedAt,
            bank = bank,
            merchant = merchant,
            reference = reference,
            source = source,
            sourceIdentifier = sourceId,
        )
    }

    private fun parseMinorUnits(value: String): Long? {
        val normalized = value.replace(",", "")
        val parts = normalized.split('.')
        if (parts.size > 2 || parts.firstOrNull().isNullOrEmpty()) return null
        val whole = parts[0].toLongOrNull() ?: return null
        val fraction = (parts.getOrNull(1).orEmpty() + "00").take(2).toLongOrNull() ?: return null
        return runCatching { Math.addExact(Math.multiplyExact(whole, 100L), fraction) }.getOrNull()
    }

    private fun extractBank(text: String): String? {
        val known = listOf("HDFC Bank", "ICICI Bank", "Axis Bank", "State Bank of India", "SBI", "Kotak", "IDFC FIRST", "Punjab National Bank", "Canara Bank", "Bank of Baroda")
        return known.firstOrNull { text.contains(it, ignoreCase = true) }
    }

    private fun extractMerchant(text: String): String? {
        val raw = merchantPattern.find(text)?.groupValues?.getOrNull(1) ?: return null
        val cleaned = knownTail.replace(raw, "").trim().trimEnd('.', ',', ';', ':', '-', '/')
            .replace(Regex("\\s+"), " ")
        if (cleaned.length !in 2..40 || cleaned.count { it.isLetter() } < 2) return null
        if (cleaned.contains('@') || cleaned.any(Char::isDigit)) return null
        return cleaned
    }

    private fun extractTimestamp(text: String, fallback: Long): Long {
        val match = datePattern.find(text) ?: return fallback
        val day = match.groupValues[1].toIntOrNull() ?: return fallback
        val month = match.groupValues[2].toIntOrNull() ?: return fallback
        var year = match.groupValues[3].toIntOrNull() ?: return fallback
        if (year < 100) year += 2000
        val hour = match.groupValues[4].toIntOrNull() ?: 0
        val minute = match.groupValues[5].toIntOrNull() ?: 0
        return try {
            val date = LocalDate.of(year, month, day)
            val time = LocalTime.of(hour, minute)
            val parsed = LocalDateTime.of(date, time).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            if (parsed > fallback + 24L * 60 * 60 * 1000 || parsed < fallback - 366L * 24 * 60 * 60 * 1000) fallback else parsed
        } catch (_: DateTimeParseException) { fallback }
        catch (_: java.time.DateTimeException) { fallback }
    }
}
