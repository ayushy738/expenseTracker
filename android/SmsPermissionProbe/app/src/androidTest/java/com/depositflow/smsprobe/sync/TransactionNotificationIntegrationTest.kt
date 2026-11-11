package com.depositflow.smsprobe.sync

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.depositflow.smsprobe.data.local.CandidatePayloadCipher
import com.depositflow.smsprobe.data.local.CandidateRepository
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.data.local.NotificationState
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.data.local.TransactionType
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TransactionNotificationIntegrationTest {
    private lateinit var context: Context
    private lateinit var database: com.depositflow.smsprobe.data.local.CandidateDatabase
    private lateinit var repository: CandidateRepository
    private lateinit var notificationManager: NotificationManager

    @Before fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().uiAutomation.grantRuntimePermission(
                context.packageName, Manifest.permission.POST_NOTIFICATIONS,
            )
        }
        database = Room.inMemoryDatabaseBuilder(context, com.depositflow.smsprobe.data.local.CandidateDatabase::class.java).build()
        repository = CandidateRepository(database, CandidatePayloadCipher())
        notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        TransactionNotificationPreferences(context).setEnabled(true)
    }

    @After fun tearDown() {
        notificationManager.cancel("transaction-notification-test", 0)
        database.close()
    }

    @Test fun newlyInsertedProductionTransactionPostsOnceWithSafeText() = runBlocking {
        assumeTrue(Build.VERSION.SDK_INT >= 26)
        assumeTrue(TransactionNotificationPublisher.hasPermission(context))
        val browserIntent = TransactionNotificationPublisher.browserIntent()
        assertEquals("android.intent.action.VIEW", browserIntent.action)
        assertEquals("https://expense-tracker-phi-gules.vercel.app/expenses#inbox", browserIntent.dataString)
        repository.insert(TransactionCandidate(
            captureId = "notification-test",
            amountMinor = 25_000,
            transactionType = TransactionType.DEBIT,
            transactionTimestamp = 1_700_000_000_000,
            capturedAt = 1_700_000_001_000,
            bank = "SBI",
            merchant = "PRIVATE MERCHANT",
            reference = "PRIVATE-REFERENCE",
            source = CaptureSource.SMS,
            sourceIdentifier = "synthetic-fixture",
            accountSuffix = "9876",
        ))
        repository.claimNext(now = 1_800_000_000_000)
        repository.complete("notification-test", newlyInsertedOnServer = true)

        TransactionNotificationDispatcher.deliverNewProductionSync(
            context, repository, "notification-test", TransactionNotificationPolicy.PRODUCTION_ORIGIN,
        )
        val posted = notificationManager.activeNotifications.single { it.tag == "transaction-notification-test" }
        assertEquals("₹250 debit detected", posted.notification.extras.getCharSequence("android.title").toString())
        val body = posted.notification.extras.getCharSequence("android.text").toString()
        assertEquals("SBI · Tap to open Deposit Flow Finance inbox", body)
        listOf("PRIVATE MERCHANT", "PRIVATE-REFERENCE", "9876").forEach { assertFalse(body.contains(it)) }
        assertNotNull(posted.notification.contentIntent)

        TransactionNotificationDispatcher.deliverNewProductionSync(
            context, repository, "notification-test", TransactionNotificationPolicy.PRODUCTION_ORIGIN,
        )
        assertEquals(1, notificationManager.activeNotifications.count { it.tag == "transaction-notification-test" })
        assertEquals(NotificationState.POSTED.name, database.candidateDao().getAll().single().notificationState)
    }
}
