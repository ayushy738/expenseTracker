package com.depositflow.smsprobe.parser

import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.data.local.TransactionMode
import com.depositflow.smsprobe.data.local.TransactionType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Sanitized templates: no real account, recipient, or reference values are committed. */
@RunWith(Parameterized::class)
class IndianSmsTemplateTest(
    private val sender: String,
    private val body: String,
    private val amount: Long,
    private val type: TransactionType,
    private val mode: TransactionMode,
    private val date: String,
    private val accountSuffix: String?,
    private val merchant: String?,
) {
    @Test fun parsesSupportedSbiTemplates() {
        val parsed = TransactionMessageParser.parseSmsResult(
            sender, body, nowForFixtures, setOf("SBI"), debugBuild = false,
        )
        assertTrue("Expected parsed SBI transaction, got $parsed", parsed is TransactionParseResult.Parsed)
        val candidate = (parsed as TransactionParseResult.Parsed).candidate
        assertEquals(amount, candidate.amountMinor)
        assertEquals(type, candidate.transactionType)
        assertEquals(mode, candidate.transactionMode)
        assertEquals(date, java.time.Instant.ofEpochMilli(candidate.transactionTimestamp)
            .atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString())
        assertEquals(accountSuffix, candidate.accountSuffix)
        assertEquals(merchant, candidate.merchant)
    }

    companion object {
        // Keep fixture dates recent relative to the fixed capture time.
        private const val nowForFixtures = 1_794_398_400_000L // 2026-11-11 UTC

        @JvmStatic @Parameterized.Parameters(name = "{index}: {0}")
        fun cases(): Collection<Array<Any?>> = listOf(
            arrayOf(
                "AD-CBSSBI-S",
                "Your A/C XXXXX1234 Credited INR 30,000.00 on 10/11/26 -Deposit of Cash at S5NW017466621 CDM. Avl Bal INR 39,964.55-SBI",
                3_000_000L, TransactionType.CREDIT, TransactionMode.CASH_DEPOSIT, "2026-11-10", "1234", null,
            ),
            arrayOf(
                "VM-SBIUPI-S",
                "Dear UPI user A/C X1234 debited by 40.00 on date 27Apr26 trf to TEST RECIPIENT Refno 111222333444 If not u? call-1800111109 for other services-SBI",
                4_000L, TransactionType.DEBIT, TransactionMode.UPI, "2026-04-27", "1234", "TEST RECIPIENT",
            ),
            arrayOf(
                "VM-SBIUPI-S",
                "Dear UPI user A/C X1234 debited by 50.00 on date 26Aug26 trf to TEST RECIPIENT Refno 555666777888 If not u? call-1800111109 for other services-SBI",
                5_000L, TransactionType.DEBIT, TransactionMode.UPI, "2026-08-26", "1234", "TEST RECIPIENT",
            ),
        )
    }
}

class IndianSmsSecurityAndClassificationTest {
    private val now = 1_794_398_400_000L

    @Test fun exactBankIdsAndApprovedTelecomEnvelopesMatchButSbiLikeSpoofsDoNot() {
        listOf("AD-CBSSBI-S", "VM-SBIUPI-S", "AD-SBIINB", "VM-SBICARD-T", "SBIUPI", "AD-CBSSBI").forEach { sender ->
            assertNotNull(sender, CaptureSources.matchEnabledSmsSender(sender, setOf("SBI")))
        }
        listOf("ZZ-CBSSBI-S", "AD-MYCBSSBI-S", "AD-CBSSBI-Z", "AD-CBSSBI-S-EXTRA", "randomSBIUPI").forEach { sender ->
            assertNull(sender, CaptureSources.matchEnabledSmsSender(sender, setOf("SBI")))
        }
    }

    @Test fun parsesModesAndCurrencyVariantsWithoutChoosingAvailableBalance() {
        val fixtures = listOf(
            Triple("INR 1,250.00 debited via card", 125_000L, TransactionMode.CARD),
            Triple("Rs. 2,000 withdrawn from ATM", 200_000L, TransactionMode.ATM),
            Triple("Card used for INR 850", 85_000L, TransactionMode.CARD),
            Triple("IMPS 750 debited", 75_000L, TransactionMode.IMPS),
            Triple("NEFT 12,000 credited", 1_200_000L, TransactionMode.NEFT),
            Triple("₹ 45.50 debited using UPI", 4_550L, TransactionMode.UPI),
        )
        fixtures.forEach { (fragment, expectedAmount, expectedMode) ->
            val result = TransactionMessageParser.parseSmsResult("AD-SBIINB", "$fragment. Avl Bal INR 99,999.00", now, setOf("SBI"))
            assertTrue("$fragment: $result", result is TransactionParseResult.Parsed)
            val candidate = (result as TransactionParseResult.Parsed).candidate
            assertEquals(expectedAmount, candidate.amountMinor)
            assertEquals(expectedMode, candidate.transactionMode)
        }
        val actionWithoutCurrency = TransactionMessageParser.parseSms("AD-SBIINB", "Your account debited 45.50. Available balance INR 8,000", now, setOf("SBI"))
        assertEquals(4_550L, actionWithoutCurrency?.amountMinor)
    }

    @Test fun validFraudHelpDoesNotRejectButNoiseAndAmbiguousCandidatesAreSafe() {
        val valid = TransactionMessageParser.parseSms("VM-SBIUPI-S", "UPI debited Rs 40 to TEST STORE. If not u? call bank support.", now, setOf("SBI"))
        assertEquals(TransactionType.DEBIT, valid?.transactionType)
        listOf(
            "OTP 123456 for debit of INR 500", "Login alert: debit INR 500", "Promotional offer Rs 500",
            "UPI PIN required for payment Rs 500", "Payment failed, amount INR 500 not debited",
            "Balance enquiry successful Avl Bal INR 500",
        ).forEach { body -> assertNull(body, TransactionMessageParser.parseSms("AD-SBIINB", body, now, setOf("SBI"))) }

        val unclear = TransactionMessageParser.parseSmsResult("AD-SBIINB", "Transfer of INR 500 completed", now, setOf("SBI"))
        assertTrue(unclear is TransactionParseResult.NeedsReview)
        assertEquals(TransactionType.UNKNOWN, (unclear as TransactionParseResult.NeedsReview).candidate.transactionType)
        assertFalse("unknown transaction type must not be considered a ready candidate", unclear.candidate.status.name == "QUEUED")

        val competingAmounts = TransactionMessageParser.parseSmsResult(
            "AD-SBIINB", "debited INR 500 and debited INR 600", now, setOf("SBI"),
        )
        assertTrue("uncertain amount candidate must remain reviewable", competingAmounts is TransactionParseResult.NeedsReview)
    }
}

