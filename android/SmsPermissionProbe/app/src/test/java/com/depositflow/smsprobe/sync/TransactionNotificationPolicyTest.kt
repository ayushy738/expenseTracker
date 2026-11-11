package com.depositflow.smsprobe.sync

import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.data.local.TransactionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionNotificationPolicyTest {
    private val validCandidate = TransactionCandidate(
        captureId = "capture-1",
        amountMinor = 25_000,
        transactionType = TransactionType.DEBIT,
        transactionTimestamp = 1_700_000_000_000,
        capturedAt = 1_700_000_001_000,
        bank = "SBI",
        merchant = "Private Merchant",
        reference = "PRIVATE-REFERENCE",
        source = CaptureSource.SMS,
        sourceIdentifier = "private-sender",
        accountSuffix = "1234",
    )

    @Test fun onlyNewProductionInsertWithPermissionAndEnabledPreferenceNotifies() {
        assertTrue(allowed())
        assertFalse(allowed(newlyInserted = false)) // failed upload or 200 duplicate
        assertFalse(allowed(productionOrigin = false))
        assertFalse(allowed(enabled = false))
        assertFalse(allowed(permissionGranted = false))
        assertFalse(allowed(isSynthetic = true))
        assertFalse(allowed(type = TransactionType.UNKNOWN))
    }

    @Test fun productionOriginMustMatchExactHttpsOrigin() {
        assertTrue(TransactionNotificationPolicy.isProductionOrigin(TransactionNotificationPolicy.PRODUCTION_ORIGIN))
        assertTrue(TransactionNotificationPolicy.isProductionOrigin("${TransactionNotificationPolicy.PRODUCTION_ORIGIN}/"))
        assertFalse(TransactionNotificationPolicy.isProductionOrigin("http://expense-tracker-phi-gules.vercel.app"))
        assertFalse(TransactionNotificationPolicy.isProductionOrigin("https://expense-tracker-phi-gules.vercel.app.evil.example"))
        assertFalse(TransactionNotificationPolicy.isProductionOrigin("https://expense-tracker-phi-gules.vercel.app:444"))
        assertFalse(TransactionNotificationPolicy.isProductionOrigin("https://other.example"))
    }

    @Test fun notificationTextAndNavigationContainOnlySafeInboxDetails() {
        val title = TransactionNotificationPolicy.title(validCandidate)
        val body = TransactionNotificationPolicy.body(validCandidate)
        assertNotNull(title)
        assertTrue(title!!.contains("₹250"))
        assertTrue(title.contains("debit detected"))
        assertEquals("SBI · Tap to open Deposit Flow Finance inbox", body)
        listOf("Private Merchant", "PRIVATE-REFERENCE", "1234").forEach {
            assertFalse(title.contains(it))
            assertFalse(body.contains(it))
        }
        assertEquals("android.intent.action.VIEW", TransactionNotificationPolicy.BROWSER_ACTION)
        assertEquals("https://expense-tracker-phi-gules.vercel.app/expenses#inbox", TransactionNotificationPolicy.INBOX_URL)
    }

    @Test fun creditUsesCreditLabelAndInvalidAmountHasNoNotificationTitle() {
        assertTrue(TransactionNotificationPolicy.title(validCandidate.copy(transactionType = TransactionType.CREDIT))!!.contains("credit detected"))
        assertEquals(null, TransactionNotificationPolicy.title(validCandidate.copy(amountMinor = 0)))
    }

    private fun allowed(
        newlyInserted: Boolean = true,
        productionOrigin: Boolean = true,
        enabled: Boolean = true,
        permissionGranted: Boolean = true,
        isSynthetic: Boolean = false,
        type: TransactionType = TransactionType.DEBIT,
    ) = TransactionNotificationPolicy.shouldNotify(newlyInserted, productionOrigin, enabled, permissionGranted, isSynthetic, type)
}
