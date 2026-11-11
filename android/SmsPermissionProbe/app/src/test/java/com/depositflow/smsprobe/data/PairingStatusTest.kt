package com.depositflow.smsprobe.data

import org.junit.Assert.assertEquals
import org.junit.Test

class PairingStatusTest {
    @Test fun mapsBackendStatesWithoutTreatingUnknownAsApproved() {
        assertEquals(PairingStatus.PENDING, PairingStatus.fromApi("PENDING"))
        assertEquals(PairingStatus.ACTIVE, PairingStatus.fromApi("active"))
        assertEquals(PairingStatus.REVOKED, PairingStatus.fromApi("REVOKED"))
        assertEquals(PairingStatus.UNKNOWN, PairingStatus.fromApi("unexpected"))
        assertEquals(PairingStatus.UNKNOWN, PairingStatus.fromApi(null))
    }
}
