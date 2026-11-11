package com.depositflow.smsprobe.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CandidateRepositoryTest {
    private lateinit var database: CandidateDatabase
    private lateinit var repository: CandidateRepository

    @Before fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, CandidateDatabase::class.java).build()
        repository = CandidateRepository(database, CandidatePayloadCipher())
    }

    @After fun tearDown() {
        database.close()
    }

    @Test fun exactReferenceMergesSourceMetadataAndEncryptsNormalizedFields() = kotlinx.coroutines.runBlocking {
        repository.insert(candidate("sms-1", CaptureSource.SMS))
        val duplicate = repository.insert(candidate("notification-1", CaptureSource.NOTIFICATION))
        val rows = database.candidateDao().getAll()

        assertTrue(duplicate.mergedExactDuplicate)
        assertEquals(1, rows.size)
        assertFalse(rows.single().encryptedPayload.contains("12500"))
        assertFalse(rows.single().encryptedPayload.contains("UPI123456789"))
        val decoded = CandidatePayloadCodec.decode(
            CandidatePayloadCipher().decrypt(EncryptedPayload(rows.single().encryptedPayload, rows.single().payloadIv), rows.single().captureId),
            rows.single(),
        )
        assertEquals(setOf("SMS:bank", "NOTIFICATION:app"), decoded.sources)
    }

    @Test fun uncertainReferenceFreeMatchRetainsBothRowsForReview() = kotlinx.coroutines.runBlocking {
        repository.insert(candidate("sms-2", CaptureSource.SMS, reference = null))
        val incoming = repository.insert(candidate("notification-2", CaptureSource.NOTIFICATION, reference = null))
        val rows = database.candidateDao().getAll()

        assertEquals(CandidateStatus.POSSIBLE_DUPLICATE, incoming.status)
        assertEquals(2, rows.size)
        assertTrue(rows.all { it.status == CandidateStatus.POSSIBLE_DUPLICATE.name })
    }

    @Test fun queueClaimIsExclusiveAndCompletionSurvivesRepositoryReload() = kotlinx.coroutines.runBlocking {
        repository.insert(candidate("queued-item", CaptureSource.SMS))
        val first = repository.claimNext(now = 1_800_000_000_000)
        val simultaneous = repository.claimNext(now = 1_800_000_000_001)
        assertEquals("queued-item", first?.candidate?.captureId)
        assertEquals(null, simultaneous)
        repository.complete("queued-item")
        assertEquals(CandidateSyncState.SYNCED.name, database.candidateDao().getAll().single().syncState)
    }

    @Test fun interruptedUploadCanBeReclaimedAfterLeaseExpires() = kotlinx.coroutines.runBlocking {
        repository.insert(candidate("interrupted-item", CaptureSource.SMS))
        assertEquals("interrupted-item", repository.claimNext(now = 1_800_000_000_000)?.candidate?.captureId)
        val recovered = repository.claimNext(now = 1_800_000_000_000 + 10 * 60 * 1000 + 1)
        assertEquals("interrupted-item", recovered?.candidate?.captureId)
    }

    private fun candidate(id: String, source: CaptureSource, reference: String? = "UPI123456789") = TransactionCandidate(
        captureId = id,
        amountMinor = 12_500,
        transactionType = TransactionType.DEBIT,
        transactionTimestamp = 1_750_000_000_000,
        capturedAt = 1_750_000_000_000,
        bank = "Example Bank",
        merchant = "Corner Shop",
        reference = reference,
        source = source,
        sourceIdentifier = if (source == CaptureSource.SMS) "bank" else "app",
    )
}
