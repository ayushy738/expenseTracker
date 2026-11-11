package com.depositflow.smsprobe.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EmulatorSmsTestingTest {
    @Test fun debugBuildAcceptsOnlyTheExplicitEmulatorNumberWhenTestingIsEnabled() {
        val match = CaptureSources.resolveSmsSender("(650) 555-1212", setOf("SBI"), debugBuild = true, emulatorTestingEnabled = true)
        assertEquals("EMULATOR_TEST", match?.source?.id)
        assertTrue(match?.synthetic == true)
        assertNull(CaptureSources.resolveSmsSender("(650) 555-1213", setOf("SBI"), debugBuild = true, emulatorTestingEnabled = true))
        assertNull(CaptureSources.resolveSmsSender("(650) 555-1212", setOf("SBI"), debugBuild = true, emulatorTestingEnabled = false))
    }

    @Test fun releaseBuildRejectsEmulatorNumberEvenIfDebugToggleWasPreviouslySet() {
        assertNull(CaptureSources.resolveSmsSender("(650) 555-1212", setOf("SBI"), debugBuild = false, emulatorTestingEnabled = true))
        val normal = CaptureSources.resolveSmsSender("VM-SBIINB", setOf("SBI"), debugBuild = false, emulatorTestingEnabled = true)
        assertEquals("SBI", normal?.source?.id)
        assertFalse(normal?.synthetic == true)
    }
}
