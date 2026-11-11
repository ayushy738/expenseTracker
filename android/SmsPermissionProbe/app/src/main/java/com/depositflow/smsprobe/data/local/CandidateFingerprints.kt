package com.depositflow.smsprobe.data.local

import java.security.MessageDigest
import java.util.Locale
import kotlin.math.abs

data class CandidateFingerprintSet(
    val reference: String?,
    val exactReference: String?,
    val coarse: String,
    val merchant: String?,
)

object CandidateFingerprints {
    fun forCandidate(candidate: TransactionCandidate): CandidateFingerprintSet {
        val bank = normalize(candidate.bank)
        val referenceValue = candidate.reference?.let(::normalize)?.takeIf(String::isNotBlank)
        val reference = referenceValue?.let { sha256("$bank|$it") }
        val exact = reference?.let { sha256("$it|${candidate.transactionType.name}|${candidate.amountMinor}") }
        return CandidateFingerprintSet(
            reference = reference,
            exactReference = exact,
            coarse = sha256("$bank|${candidate.transactionType.name}|${candidate.amountMinor}"),
            merchant = candidate.merchant?.let(::normalize)?.takeIf(String::isNotBlank)?.let(::sha256),
        )
    }

    fun isTimeAndMerchantCompatible(first: TransactionCandidate, second: TransactionCandidate): Boolean {
        if (abs(first.transactionTimestamp - second.transactionTimestamp) > AMBIGUOUS_WINDOW_MS) return false
        val a = first.merchant?.let(::normalize)?.takeIf(String::isNotBlank)
        val b = second.merchant?.let(::normalize)?.takeIf(String::isNotBlank)
        return a == null || b == null || a == b
    }

    private fun normalize(value: String): String = value.lowercase(Locale.ROOT).filter(Char::isLetterOrDigit)
    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    const val AMBIGUOUS_WINDOW_MS = 2 * 60 * 1000L
}

sealed interface CandidateDeduplicationDecision {
    data object InsertNew : CandidateDeduplicationDecision
    data class MergeExact(val existingCaptureId: String) : CandidateDeduplicationDecision
    data class KeepForReview(val existingCaptureIds: List<String>) : CandidateDeduplicationDecision
}

object CandidateDeduplicator {
    fun decide(candidate: TransactionCandidate, existing: List<TransactionCandidate>): CandidateDeduplicationDecision {
        val sameKind = existing.filter { it.isSynthetic == candidate.isSynthetic }
        val fresh = CandidateFingerprints.forCandidate(candidate)
        if (fresh.reference != null) {
            val sameReference = sameKind.filter { CandidateFingerprints.forCandidate(it).reference == fresh.reference }
            sameReference.firstOrNull { CandidateFingerprints.forCandidate(it).exactReference == fresh.exactReference }?.let {
                return CandidateDeduplicationDecision.MergeExact(it.captureId)
            }
            if (sameReference.isNotEmpty()) return CandidateDeduplicationDecision.KeepForReview(sameReference.map { it.captureId })
        }

        val similar = sameKind.filter { prior ->
            val priorFingerprint = CandidateFingerprints.forCandidate(prior)
            priorFingerprint.coarse == fresh.coarse && CandidateFingerprints.isTimeAndMerchantCompatible(candidate, prior)
        }
        return if (similar.isEmpty()) CandidateDeduplicationDecision.InsertNew
        else CandidateDeduplicationDecision.KeepForReview(similar.map { it.captureId })
    }
}
