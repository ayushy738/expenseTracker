package com.depositflow.smsprobe.data.local

import org.junit.Assert.assertEquals
import org.junit.Test

class CandidateDeduplicatorTest {
    private fun candidate(
        id: String,
        reference: String? = "UPI123456789",
        amount: Long = 12_500,
        timestamp: Long = 1_000_000,
        source: CaptureSource = CaptureSource.SMS,
        merchant: String? = "Corner Shop",
    ) = TransactionCandidate(
        captureId = id,
        amountMinor = amount,
        transactionType = TransactionType.DEBIT,
        transactionTimestamp = timestamp,
        capturedAt = timestamp,
        bank = "Example Bank",
        merchant = merchant,
        reference = reference,
        source = source,
        sourceIdentifier = source.name,
    )

    @Test fun exactReferenceAcrossSourcesMergesIntoStableExistingCapture() {
        val existing = candidate("existing")
        val incoming = candidate("incoming", source = CaptureSource.NOTIFICATION, timestamp = 1_020_000)
        assertEquals(CandidateDeduplicationDecision.MergeExact("existing"), CandidateDeduplicator.decide(incoming, listOf(existing)))
    }

    @Test fun referenceConflictAndReferenceFreeNearMatchAreKeptForReview() {
        val existing = candidate("existing")
        val wrongAmount = candidate("wrong", amount = 12_600)
        assertEquals(CandidateDeduplicationDecision.KeepForReview(listOf("existing")), CandidateDeduplicator.decide(wrongAmount, listOf(existing)))

        val noReference = candidate("no-ref", reference = null, source = CaptureSource.NOTIFICATION, timestamp = 1_030_000)
        assertEquals(CandidateDeduplicationDecision.KeepForReview(listOf("existing")), CandidateDeduplicator.decide(noReference, listOf(existing)))
    }

    @Test fun distantCandidatesAreNotTreatedAsDuplicates() {
        val existing = candidate("existing", reference = null)
        val later = candidate("later", reference = null, timestamp = 1_500_000)
        assertEquals(CandidateDeduplicationDecision.InsertNew, CandidateDeduplicator.decide(later, listOf(existing)))
    }

    @Test fun syntheticAndRealEventsNeverMergeAcrossTheUploadBoundary() {
        val synthetic = candidate("synthetic", reference = "UPI123456789").copy(isSynthetic = true)
        val real = candidate("real", reference = "UPI123456789")
        assertEquals(CandidateDeduplicationDecision.InsertNew, CandidateDeduplicator.decide(real, listOf(synthetic)))
    }
}
