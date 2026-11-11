package com.depositflow.smsprobe.data

import com.depositflow.smsprobe.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class E2eTestPolicyTest {
    @Test fun controlRequiresDebugLocalBackendActiveDeviceAndServerReadiness() {
        assertTrue(E2eTestPolicy.canRun(true, "http://10.0.2.2:3000", true, true))
        assertFalse(E2eTestPolicy.canRun(false, "http://10.0.2.2:3000", true, true))
        assertFalse(E2eTestPolicy.canRun(true, "https://expense-tracker-phi-gules.vercel.app", true, true))
        assertFalse(E2eTestPolicy.canRun(true, "http://10.0.2.2:3000", false, true))
        assertFalse(E2eTestPolicy.canRun(true, "http://10.0.2.2:3000", true, false))
        if (!BuildConfig.DEBUG) assertFalse(E2eTestPolicy.canRun(BuildConfig.DEBUG, E2eTestPolicy.LOCAL_EMULATOR_ORIGIN, true, true))
    }

    @Test fun eachTestRunGetsFreshStableIdentifiersAndNoUserOrCredentialFields() {
        val ids = ArrayDeque(listOf("89c2a858-ff40-4f3d-98f1-d6a2d2c10330", "89c2a858-ff40-4f3d-98f1-d6a2d2c10331"))
        val first = E2eTestPolicy.newRun("2026-11-11T10:00:00Z") { ids.removeFirst() }
        assertEquals(2.50, first.amount, 0.0)
        assertEquals("E2E-${first.testRunId}", first.reference)
        val second = E2eTestPolicy.newRun("2026-11-11T10:00:00Z")
        assertNotEquals(first.captureId, second.captureId)
        assertNotEquals(first.reference, second.reference)
    }

    @Test fun urlValidationAllowsOnlyExactDebugEmulatorOriginAndKeepsNormalUploadHttpsOnly() {
        if (BuildConfig.DEBUG) {
            assertEquals("http://10.0.2.2:3000", PairingApi.validateBaseUrl("http://10.0.2.2:3000", allowLocalE2e = true))
        } else {
            org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
                PairingApi.validateBaseUrl("http://10.0.2.2:3000", allowLocalE2e = true)
            }
        }
        listOf(
            "http://expense-tracker-phi-gules.vercel.app",
            "http://10.0.2.2:3001",
            "http://10.0.2.2:3000.evil.example",
        ).forEach { url ->
            org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
                PairingApi.validateBaseUrl(url, allowLocalE2e = true)
            }
        }
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            PairingApi.validateBaseUrl("http://10.0.2.2:3000", allowLocalE2e = false)
        }
        assertEquals("https://example.test", PairingApi.validateBaseUrl("https://example.test", allowLocalE2e = false))
    }
}
