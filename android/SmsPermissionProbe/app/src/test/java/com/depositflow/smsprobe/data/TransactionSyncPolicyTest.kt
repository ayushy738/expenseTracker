package com.depositflow.smsprobe.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionSyncPolicyTest {
    @Test fun payloadContainsOnlyNormalizedTransactionFieldsAndStableCaptureId() {
        val fields = UploadPayloadMapper.toFields(UploadTransaction(
            captureId = "89c2a858-ff40-4f3d-98f1-d6a2d2c10330",
            amount = 123.45,
            transactionType = "DEBIT",
            timestamp = "2026-11-11T10:00:00Z",
            bank = "Example Bank",
            merchant = null,
            reference = "R-1",
        ))
        assertEquals(setOf("captureId", "amount", "transactionType", "timestamp", "bank", "reference"), fields.keys)
        assertEquals("89c2a858-ff40-4f3d-98f1-d6a2d2c10330", fields["captureId"])
        assertFalse(fields.containsKey("smsBody"))
        assertFalse(fields.containsKey("notificationText"))
        assertFalse(fields.containsKey("userId"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun syntheticCandidateCannotBeMappedIntoAnUploadPayload() {
        UploadPayloadMapper.toFields(UploadTransaction(
            captureId = "89c2a858-ff40-4f3d-98f1-d6a2d2c10330",
            amount = 250.0,
            transactionType = "DEBIT",
            timestamp = "2026-11-11T10:00:00Z",
            bank = "Synthetic test",
            merchant = "TESTSTORE",
            reference = "123456789012",
            isSynthetic = true,
        ))
    }

    @Test fun responseClassificationHandlesDuplicatesCredentialsClockSkewAndRetryableErrors() {
        assertEquals(UploadDisposition.SYNCED, UploadPolicy.classify(UploadResponse(201, false)))
        assertEquals(UploadDisposition.SYNCED, UploadPolicy.classify(UploadResponse(200, true)))
        assertEquals(UploadDisposition.AUTH_REQUIRED, UploadPolicy.classify(UploadResponse(401, false, "DEVICE_AUTH_REQUIRED")))
        assertEquals(UploadDisposition.CLOCK_SKEW, UploadPolicy.classify(UploadResponse(401, false, "CLOCK_SKEW")))
        assertEquals(UploadDisposition.RETRY, UploadPolicy.classify(UploadResponse(429, false)))
        assertEquals(UploadDisposition.RETRY, UploadPolicy.classify(UploadResponse(503, false)))
        assertEquals(UploadDisposition.FAILED, UploadPolicy.classify(UploadResponse(400, false)))
    }

    @Test fun onlyFresh201InsertIsEligibleForNewTransactionNotification() {
        assertTrue(UploadPolicy.isNewInsertion(UploadResponse(201, false)))
        assertFalse(UploadPolicy.isNewInsertion(UploadResponse(200, true)))
        assertFalse(UploadPolicy.isNewInsertion(UploadResponse(201, true)))
        assertFalse(UploadPolicy.isNewInsertion(UploadResponse(503, false)))
    }

    @Test fun retryBackoffGrowsAndCaps() {
        assertEquals(30_000L, UploadPolicy.retryDelayMillis(1))
        assertTrue(UploadPolicy.retryDelayMillis(4) > UploadPolicy.retryDelayMillis(3))
        assertEquals(6 * 60 * 60 * 1000L, UploadPolicy.retryDelayMillis(100))
    }

    @Test fun queueTransitionsRetainItemsUntilSuccessAndAllowManualRetry() {
        assertEquals("UPLOADING", SyncStateTransitions.target("QUEUED", "CLAIM"))
        assertEquals("QUEUED", SyncStateTransitions.target("UPLOADING", "RETRY"))
        assertEquals("SYNCED", SyncStateTransitions.target("UPLOADING", "SUCCESS"))
        assertEquals("FAILED", SyncStateTransitions.target("UPLOADING", "PERMANENT_FAILURE"))
        assertEquals("QUEUED", SyncStateTransitions.target("FAILED", "MANUAL_RETRY"))
        assertEquals(null, SyncStateTransitions.target("SYNCED", "CLAIM"))
    }
}
