package com.depositflow.smsprobe.parser

import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.data.local.CaptureSource
import com.depositflow.smsprobe.data.local.TransactionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionMessageParserTest {
    private val now = 1742049000000L // 2025-03-15 UTC; fixtures are synthetic.

    @Test fun parsesBankDebitWithAmountMerchantReferenceAndTransactionTime() {
        val parsed = TransactionMessageParser.parseSms(
            "VM-HDFCBK",
            "Rs. 1,250.50 has been debited from A/c XX1234 on 15-03-2025 at 14:32 via UPI to Cafe Central. UPI Ref No 123456789012. Avl Bal INR 9000.",
            now,
            setOf("HDFC"),
        )
        assertNotNull(parsed)
        assertEquals(125050L, parsed?.amountMinor)
        assertEquals(TransactionType.DEBIT, parsed?.transactionType)
        assertEquals("HDFC Bank", parsed?.bank)
        assertEquals("123456789012", parsed?.reference)
        assertTrue(parsed?.transactionTimestamp != now)
        assertEquals(CaptureSource.SMS, parsed?.source)
    }

    @Test fun parsesExactEmulatorFixtureAsSyntheticOnlyInDebugTestingMode() {
        val sample = "Rs. 250.00 debited from your account via UPI to TESTSTORE. Ref 123456789012."
        val candidate = TransactionMessageParser.parseSms(
            sender = "(650) 555-1212",
            body = sample,
            receivedAt = now,
            enabledSenderIds = setOf("SBI"),
            debugBuild = true,
            emulatorTestingEnabled = true,
        )
        assertEquals(25_000L, candidate?.amountMinor)
        assertEquals(TransactionType.DEBIT, candidate?.transactionType)
        assertEquals("TESTSTORE", candidate?.merchant)
        assertEquals("123456789012", candidate?.reference)
        assertTrue(candidate?.isSynthetic == true)
        assertNull(TransactionMessageParser.parseSms("(650) 555-1212", sample, now, setOf("SBI"), debugBuild = false, emulatorTestingEnabled = true))
    }

    @Test fun parsesCreditAndDifferentIndianTransferFormats() {
        val credited = TransactionMessageParser.parseSms(
            "AD-SBIINB", "Your account is credited with INR 5,000.00 on 15/03/2025 at 13:15. UTR 123456789012", now, setOf("SBI")
        )
        assertEquals(TransactionType.CREDIT, credited?.transactionType)
        assertEquals(500000L, credited?.amountMinor)
        assertEquals("123456789012", credited?.reference)

        val upi = TransactionMessageParser.parseSms(
            "VM-ICICIB", "UPI payment of Rs.150.00 to Fresh Mart on 15-03-2025 14:30 Ref 123456789012", now, setOf("ICICI")
        )
        assertEquals(TransactionType.DEBIT, upi?.transactionType)
        assertEquals("123456789012", upi?.reference)

        val card = TransactionMessageParser.parseSms(
            "VM-AXISBK", "Your credit card purchase of INR 899.00 at City Store on 15-03-25 10:45 was approved. Ref: 987654321012", now, setOf("AXIS")
        )
        assertEquals(TransactionType.DEBIT, card?.transactionType)
        assertEquals(89900L, card?.amountMinor)
    }

    @Test fun parsesAtmImpsNeftAndFinancialNotifications() {
        val atm = TransactionMessageParser.parseSms("VM-KOTAKB", "Cash withdrawal of Rs 2,000 from ATM on 15-03-2025. RRN 123456789012", now, setOf("KOTAK"))
        assertEquals(TransactionType.DEBIT, atm?.transactionType)
        val imps = TransactionMessageParser.parseSms("VM-PNBSMS", "IMPS amount Rs 750 debited from account on 15-03-2025. Ref 123456789012", now, setOf("PNB"))
        assertEquals(TransactionType.DEBIT, imps?.transactionType)
        val neft = TransactionMessageParser.parseSms("VM-BOBSMS", "NEFT INR 12,000 credited to your account on 15-03-2025. UTR 123456789012", now, setOf("BOB"))
        assertEquals(TransactionType.CREDIT, neft?.transactionType)

        val notification = TransactionMessageParser.parseNotification(
            CaptureSources.notificationSources.first { it.title == "PhonePe" }.packageName,
            "Payment of ₹200.00 to Local Store using UPI",
            now,
            setOf("com.phonepe.app"),
        )
        assertEquals(CaptureSource.NOTIFICATION, notification?.source)
        assertEquals(20000L, notification?.amountMinor)
        assertNull(TransactionMessageParser.parseNotification("unselected.package", "Payment Rs 10", now, emptySet()))
    }

    @Test fun rejectsOtpPromotionsBalanceChecksUnallowedSendersAndMalformedContent() {
        val enabled = setOf("HDFC")
        val rejected = listOf(
            "Your OTP 123456 for UPI payment of Rs 500. Do not share it.",
            "Verification code 123456. Your payment of Rs 500 is pending.",
            "Special offer: spend Rs 500 and win a reward today!",
            "Balance enquiry successful. Available balance INR 25,000.",
            "UPI PIN is required to debit Rs 500. Never share your PIN.",
            "Payment failed. Rs 500 was not debited from your account.",
            "debit Rs not-a-number",
        )
        rejected.forEach { body -> assertNull(body, TransactionMessageParser.parseSms("VM-HDFCBK", body, now, enabled)) }
        assertNull(TransactionMessageParser.parseSms("unknown-person", "Rs 500 debited from your account", now, enabled))
        assertNull(TransactionMessageParser.parseSms("VM-HDFCBK", "Rs 500 debited from your account", now, emptySet()))
    }
}
