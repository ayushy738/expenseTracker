package com.depositflow.smsprobe.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceTokenFactoryTest {
    @Test fun createsUniqueOpaqueBearerTokensOfBackendAcceptedLength() {
        val first = DeviceTokenFactory.create()
        val second = DeviceTokenFactory.create()
        assertEquals(43, first.length)
        assertTrue(first.matches(Regex("^[A-Za-z0-9_-]{43}$")))
        assertNotEquals(first, second)
    }
}
