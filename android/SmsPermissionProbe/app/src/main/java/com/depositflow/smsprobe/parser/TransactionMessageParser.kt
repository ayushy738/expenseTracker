package com.depositflow.smsprobe.parser

import com.depositflow.smsprobe.BuildConfig
import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.data.local.CandidateStatus
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.data.local.TransactionMode
import com.depositflow.smsprobe.data.local.TransactionType
import java.time.DateTimeException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale

enum class ParseRejection { EMPTY, SENSITIVE, NOT_TRANSACTION, AMOUNT_MISSING, INVALID_AMOUNT, UNAPPROVED_SENDER }

sealed interface TransactionParseResult {
    data class Parsed(val candidate: TransactionCandidate) : TransactionParseResult
    data class NeedsReview(val candidate: TransactionCandidate) : TransactionParseResult
    data class Rejected(val reason: ParseRejection) : TransactionParseResult

    fun candidateOrNull(): TransactionCandidate? = when (this) {
        is Parsed -> candidate
        is NeedsReview -> candidate
        is Rejected -> null
    }
}

/** Parses transient alert text only after its SMS sender/app package has passed the local allowlist. */
object TransactionMessageParser {
    private val sensitiveOrNoise = Regex(
        "\\b(otp|one[ -]?time password|verification code|verify your|login|log[ -]?in|sign[ -]?in|" +
            "promotional|promotion|offer|win a|claim your|coupon|sale|balance enquiry|balance inquiry|mini statement|" +
            "upi pin|enter pin|password|cvv|failed|unsuccessful|declined|cancelled|canceled|not debited)\\b",
        RegexOption.IGNORE_CASE,
    )

    private val transactionSignal = Regex(
        "\\b(debit(?:ed)?|credit(?:ed)?|spent|withdrawn|withdrawal|purchase|paid|payment|charged|" +
            "transferred|transfer|trf|received|refund|reversal|reversed|deposit(?:ed)?|imps|neft|rtgs|upi|atm|pos)\\b|" +
            "\\bcard\\s+(?:purchase|payment|used|transaction|spent)\\b|" +
            "cash\\s+deposit|deposit\\s+of\\s+cash",
        RegexOption.IGNORE_CASE,
    )
    private val debitSignal = Regex(
        "(?i)\\b(debited|debit|spent|withdrawn|withdrawal|purchase|paid|payment|charged|sent|" +
            "cash\\s+withdrawal|atm\\s+withdrawal|trf\\s+to|transfer\\s+to|pos\\s+purchase|card\\s+(?:purchase|payment|used|spent|transaction))\\b",
    )
    private val creditSignal = Regex(
        "(?i)\\b(credited|received|refund|reversal|reversed|cash\\s+deposit|cash\\s+deposited|" +
            "deposit\\s+of\\s+cash|deposit\\s+received|trf\\s+from|transfer\\s+from)\\b",
    )

    private val amountNumber = "(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,2})?"
    private val currencyAmount = Regex("(?i)(?:₹\\s*|\\bINR\\s*|\\bRs\\.?\\s*)($amountNumber)")
    private val actionAmount = Regex(
        "(?i)\\b(?:debited|debit|credited|credit|spent|withdrawn|withdrawal|purchase|paid|payment|charged|" +
            "transferred|transfer|received|deposit(?:ed)?|trf)\\b" +
            "(?:\\s+(?:by|with|of|amount|is|was|for))?\\s*(?:(?:₹\\s*|INR\\s*|Rs\\.?\\s*)?)($amountNumber)",
    )
    private val railAmount = Regex("(?i)\\b(?:IMPS|NEFT|RTGS|UPI)\\s+(?:(?:₹\\s*|INR\\s*|Rs\\.?\\s*)?)($amountNumber)(?=\\s+(?:debited|credited|paid|received|transferred)\\b)")
    private val directionalCue = Regex(
        "(?i)\\b(debited|debit|credited|credit|spent|withdrawn|withdrawal|purchase|paid|payment|" +
            "charged|transferred|transfer|received|deposit(?:ed)?|trf|imps|neft|rtgs|upi|atm|pos)\\b",
    )
    private val balanceLabelAtEnd = Regex(
        "(?is).*(?:avl(?:ailable)?\\s+bal(?:ance)?|available\\s+balance|\\bbalance)\\s*(?:(?:INR|Rs\\.?|₹)\\s*)?$",
    )
    private val referencePattern = Regex(
        "(?i)\\b(?:UPI\\s*(?:REF(?:ERENCE)?(?:\\s*NO)?|ID|TXN(?:\\s*ID)?|NO)\\s*[:#/-]?\\s*|UPI\\s*[/#:-]\\s*|" +
            "RRN\\s*[:#/-]?\\s*|UTR\\s*[:#/-]?\\s*|REF(?:ERENCE)?(?:\\s*NO)?\\s*[:#/-]?\\s*|" +
            "IMPS\\s*(?:REF|ID|UTR)\\s*[:#/-]?\\s*|NEFT\\s*(?:REF|UTR)\\s*[:#/-]?\\s*)([A-Z0-9/-]{6,24})",
    )
    private val numericDate = Regex("\\b([0-3]?[0-9])[-/]([01]?[0-9])[-/]([0-9]{2,4})\\b(?:\\s+(?:at\\s*)?([0-2]?[0-9]):([0-5][0-9]))?", RegexOption.IGNORE_CASE)
    private val textDate = Regex("\\b([0-3]?[0-9])[-/]?([A-Za-z]{3})[-/]?([0-9]{2,4})\\b(?:\\s+(?:at\\s*)?([0-2]?[0-9]):([0-5][0-9]))?", RegexOption.IGNORE_CASE)
    private val accountPattern = Regex("(?i)\\b(?:A/C|ACCT?|ACCOUNT)(?:\\s*(?:NO\\.?|NUMBER))?\\s*[:#-]?\\s*(?:X+|\\*+)?([0-9]{4,})\\b")
    private val accountEndingPattern = Regex("(?i)\\b(?:account\\s+)?ending\\s+(?:in\\s+)?(?:X+|\\*+)?([0-9]{4,})\\b")
    private val merchantPattern = Regex("(?i)\\b(?:to|at|towards|merchant)\\s+([A-Za-z0-9][A-Za-z0-9 .&'-]{1,60})")
    private val knownTail = Regex(
        "(?i)\\b(?:on\\s+date|date|on|via|using|from|refno|ref(?:erence)?(?:\\s*no)?|upi|imps|neft|rtgs|rrn|utr|txn|transaction|" +
            "avl|available|bal|balance|a/c|acct|account|ending|xx[0-9]+|cdm|atm|pos|if\\s+not\\s+u|call|for\\s+other\\s+services)\\b.*$",
    )
    private val terminalCode = Regex("(?i)^[A-Z]{1,3}[0-9]{5,}$")
    private val months = mapOf(
        "JAN" to 1, "FEB" to 2, "MAR" to 3, "APR" to 4, "MAY" to 5, "JUN" to 6,
        "JUL" to 7, "AUG" to 8, "SEP" to 9, "OCT" to 10, "NOV" to 11, "DEC" to 12,
    )

    fun parseSms(
        sender: String,
        body: String,
        receivedAt: Long,
        enabledSenderIds: Set<String>,
        debugBuild: Boolean = BuildConfig.DEBUG,
        emulatorTestingEnabled: Boolean = false,
    ): TransactionCandidate? = parseSmsResult(sender, body, receivedAt, enabledSenderIds, debugBuild, emulatorTestingEnabled).candidateOrNull()

    fun parseSmsResult(
        sender: String,
        body: String,
        receivedAt: Long,
        enabledSenderIds: Set<String>,
        debugBuild: Boolean = BuildConfig.DEBUG,
        emulatorTestingEnabled: Boolean = false,
    ): TransactionParseResult {
        val match = CaptureSources.resolveSmsSender(sender, enabledSenderIds, debugBuild, emulatorTestingEnabled)
            ?: return TransactionParseResult.Rejected(ParseRejection.UNAPPROVED_SENDER)
        return parse(body, receivedAt, CaptureSource.SMS, match.source.id, match.source.bank, match.synthetic)
    }

    fun parseNotification(
        packageName: String,
        notificationText: String,
        postedAt: Long,
        enabledPackages: Set<String>,
    ): TransactionCandidate? {
        val source = CaptureSources.notification(packageName, enabledPackages) ?: return null
        return parse(notificationText, postedAt, CaptureSource.NOTIFICATION, packageName, source.bank, false).candidateOrNull()
    }

    private fun parse(text: String, capturedAt: Long, source: CaptureSource, sourceId: String, defaultBank: String, synthetic: Boolean): TransactionParseResult {
        if (text.isBlank() || text.length > 4_000) return TransactionParseResult.Rejected(ParseRejection.EMPTY)
        if (sensitiveOrNoise.containsMatchIn(text)) return TransactionParseResult.Rejected(ParseRejection.SENSITIVE)
        if (!transactionSignal.containsMatchIn(text)) return TransactionParseResult.Rejected(ParseRejection.NOT_TRANSACTION)

        val amountResult = extractAmount(text)
        if (amountResult is AmountResult.Missing) return TransactionParseResult.Rejected(ParseRejection.AMOUNT_MISSING)
        val amountUncertain = amountResult is AmountResult.Ambiguous
        val amountText = when (amountResult) {
            is AmountResult.Found -> amountResult.value
            is AmountResult.Ambiguous -> amountResult.suggested
            AmountResult.Missing -> return TransactionParseResult.Rejected(ParseRejection.AMOUNT_MISSING)
        }
        val amountMinor = parseMinorUnits(amountText) ?: return TransactionParseResult.Rejected(ParseRejection.INVALID_AMOUNT)
        if (amountMinor <= 0L) return TransactionParseResult.Rejected(ParseRejection.INVALID_AMOUNT)

        val paymentReceived = Regex("(?i)\\b(payment|transfer|trf)\\s+received\\b").containsMatchIn(text)
        val debit = debitSignal.containsMatchIn(text) && !paymentReceived
        val credit = creditSignal.containsMatchIn(text)
        val type = when {
            debit.xor(credit) -> if (debit) TransactionType.DEBIT else TransactionType.CREDIT
            else -> TransactionType.UNKNOWN
        }
        val needsReview = type == TransactionType.UNKNOWN || amountUncertain
        val candidate = TransactionCandidate(
            amountMinor = amountMinor,
            transactionType = type,
            transactionMode = extractMode(text),
            transactionTimestamp = extractTimestamp(text, capturedAt),
            capturedAt = capturedAt,
            bank = extractBank(text) ?: defaultBank,
            merchant = extractMerchant(text),
            reference = referencePattern.find(text)?.groupValues?.getOrNull(1)
                ?.trim('-', '/', ' ', '.')?.takeIf { it.length >= 6 }?.uppercase(Locale.ROOT),
            accountSuffix = extractAccountSuffix(text),
            source = source,
            sourceIdentifier = sourceId,
            isSynthetic = synthetic,
            status = if (needsReview) CandidateStatus.NEEDS_REVIEW else CandidateStatus.PENDING,
        )
        return if (needsReview) TransactionParseResult.NeedsReview(candidate) else TransactionParseResult.Parsed(candidate)
    }

    private sealed interface AmountResult {
        data class Found(val value: String) : AmountResult
        data object Missing : AmountResult
        data class Ambiguous(val suggested: String) : AmountResult
    }

    private data class AmountMatch(val value: String, val start: Int, val end: Int, val actionMatched: Boolean)

    private fun extractAmount(text: String): AmountResult {
        val matches = mutableListOf<AmountMatch>()
        currencyAmount.findAll(text).forEach { match ->
            val value = match.groupValues[1]
            val range = match.groups[1]?.range ?: return@forEach
            if (!isBalanceAmount(text, range.first)) matches.add(AmountMatch(value, range.first, range.last + 1, actionMatched = false))
        }
        actionAmount.findAll(text).forEach { match ->
            val value = match.groupValues[1]
            val range = match.groups[1]?.range ?: return@forEach
            if (!isBalanceAmount(text, range.first)) matches.add(AmountMatch(value, range.first, range.last + 1, actionMatched = true))
        }
        railAmount.findAll(text).forEach { match ->
            val value = match.groupValues[1]
            val range = match.groups[1]?.range ?: return@forEach
            if (!isBalanceAmount(text, range.first)) matches.add(AmountMatch(value, range.first, range.last + 1, actionMatched = true))
        }
        val distinct = matches.distinctBy { "${it.start}:${it.end}" }
        if (distinct.isEmpty()) return AmountResult.Missing
        if (distinct.size == 1) return AmountResult.Found(distinct.single().value)

        val actionMatches = distinct.filter(AmountMatch::actionMatched)
        if (actionMatches.map(AmountMatch::value).distinct().size == 1) return AmountResult.Found(actionMatches.first().value)
        val ranked = distinct.map { it to nearestTransactionCue(text, it) }.sortedBy { it.second }
        val first = ranked.first()
        val second = ranked.getOrNull(1)
        return if (first.second <= 32 && (second == null || second.second - first.second >= 8)) {
            AmountResult.Found(first.first.value)
        } else AmountResult.Ambiguous(first.first.value)
    }

    private fun isBalanceAmount(text: String, amountStart: Int): Boolean {
        val prefix = text.substring((amountStart - 70).coerceAtLeast(0), amountStart)
        return balanceLabelAtEnd.matches(prefix)
    }

    private fun nearestTransactionCue(text: String, amount: AmountMatch): Int = directionalCue.findAll(text).minOfOrNull { cue ->
        when {
            cue.range.last < amount.start -> amount.start - cue.range.last - 1
            cue.range.first > amount.end -> cue.range.first - amount.end
            else -> 0
        }
    } ?: Int.MAX_VALUE

    private fun parseMinorUnits(value: String): Long? {
        val normalized = value.replace(",", "")
        val parts = normalized.split('.')
        if (parts.size > 2 || parts.firstOrNull().isNullOrEmpty()) return null
        val whole = parts[0].toLongOrNull() ?: return null
        val fraction = (parts.getOrNull(1).orEmpty() + "00").take(2).toLongOrNull() ?: return null
        return runCatching { Math.addExact(Math.multiplyExact(whole, 100L), fraction) }.getOrNull()
    }

    private fun extractMode(text: String): TransactionMode = when {
        Regex("(?i)cash\\s+deposit|deposit\\s+of\\s+cash|cash\\s+deposited").containsMatchIn(text) -> TransactionMode.CASH_DEPOSIT
        Regex("(?i)\\b(?:atm|cash\\s+withdrawal)\\b").containsMatchIn(text) -> TransactionMode.ATM
        Regex("(?i)\\bimps\\b").containsMatchIn(text) -> TransactionMode.IMPS
        Regex("(?i)\\bneft\\b").containsMatchIn(text) -> TransactionMode.NEFT
        Regex("(?i)\\brtgs\\b").containsMatchIn(text) -> TransactionMode.RTGS
        Regex("(?i)\\bupi\\b").containsMatchIn(text) -> TransactionMode.UPI
        Regex("(?i)\\b(?:credit|debit)?\\s*card\\b|\\bpos\\b").containsMatchIn(text) -> TransactionMode.CARD
        Regex("(?i)\\b(?:trf|transfer|transferred)\\b").containsMatchIn(text) -> TransactionMode.BANK_TRANSFER
        else -> TransactionMode.OTHER
    }

    private fun extractBank(text: String): String? {
        val known = listOf("HDFC Bank", "ICICI Bank", "Axis Bank", "State Bank of India", "SBI", "Kotak", "IDFC FIRST", "Punjab National Bank", "Canara Bank", "Bank of Baroda")
        return known.firstOrNull { text.contains(it, ignoreCase = true) }
    }

    private fun extractMerchant(text: String): String? {
        // CDM/ATM terminal locations are not merchants or counterparties.
        if (Regex("(?i)\\b(?:cash\\s+deposit|deposit\\s+of\\s+cash|cash\\s+deposited)\\b").containsMatchIn(text)) return null
        val raw = merchantPattern.find(text)?.groupValues?.getOrNull(1) ?: return null
        val cleaned = knownTail.replace(raw, "").trim().trimEnd('.', ',', ';', ':', '-', '/')
            .replace(Regex("\\s+"), " ")
        if (cleaned.length !in 2..60 || cleaned.count { it.isLetter() } < 2 || terminalCode.matches(cleaned) ||
            Regex("(?i)^(?:ATM|CDM)(?:\\b|$).*").matches(cleaned) || Regex("\\d{5,}").containsMatchIn(cleaned)
        ) return null
        if (cleaned.contains('@')) return null
        return cleaned
    }

    private fun extractAccountSuffix(text: String): String? {
        val value = accountPattern.find(text)?.groupValues?.getOrNull(1)
            ?: accountEndingPattern.find(text)?.groupValues?.getOrNull(1)
            ?: return null
        return value.takeLast(4).takeIf { it.matches(Regex("[0-9]{4}")) }
    }

    private fun extractTimestamp(text: String, fallback: Long): Long {
        val numeric = numericDate.find(text)
        val textual = textDate.find(text)
        val day: Int
        val month: Int
        val rawYear: Int
        val hour: Int
        val minute: Int
        if (numeric != null) {
            day = numeric.groupValues[1].toIntOrNull() ?: return fallback
            month = numeric.groupValues[2].toIntOrNull() ?: return fallback
            rawYear = numeric.groupValues[3].toIntOrNull() ?: return fallback
            hour = numeric.groupValues[4].toIntOrNull() ?: 0
            minute = numeric.groupValues[5].toIntOrNull() ?: 0
        } else if (textual != null) {
            day = textual.groupValues[1].toIntOrNull() ?: return fallback
            month = months[textual.groupValues[2].uppercase(Locale.ROOT)] ?: return fallback
            rawYear = textual.groupValues[3].toIntOrNull() ?: return fallback
            hour = textual.groupValues[4].toIntOrNull() ?: 0
            minute = textual.groupValues[5].toIntOrNull() ?: 0
        } else return fallback
        val year = if (rawYear < 100) rawYear + 2000 else rawYear
        return try {
            val parsed = LocalDateTime.of(LocalDate.of(year, month, day), LocalTime.of(hour, minute))
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            if (parsed > fallback + 24L * 60 * 60 * 1000 || parsed < fallback - 366L * 24 * 60 * 60 * 1000) fallback else parsed
        } catch (_: DateTimeException) {
            fallback
        }
    }
}
